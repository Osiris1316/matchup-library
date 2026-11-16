// Phase 2 data step: split each game plan (what the first version called a
// play) into one play per age, as decided in handoffs M2 and M4.
//
//   pnpm phase2-plays <download.json> [out.sql]
//
// Take the download (Upkeep, then Download a copy) after phase 1 and before
// migration 0003, and don't edit the live library until the SQL has run. Run
// it after migration 0003, which already turned every strategy into a game
// plan with the same id and moved tags, games and moments across.
//
// What it does, for every game plan that isn't merged:
//   1. Gives every step an age. A step with no age takes the age of the step
//      before it, or the first age after it if it's first. A step after an
//      age-up (Fast castle, Naked castle, Age up) is in the next age. If the
//      element can't happen in that age, the next age it can.
//   2. Splits the steps by age. Each age's steps become a play, shared by
//      every game plan with the same steps in that age. The play is named
//      from its steps and given a family from them; both can be edited.
//   3. A plan that starts in Feudal gets "Straight tech" as its Dark Age play.
//   4. Each step's notes move to the game plan's stage for that age.
//   5. Game plans that end up with the same plays in every age are merged:
//      the one with the most tags, games and moments stays.
// Everything it decided is printed, and written as comments at the top of the SQL.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  AGES, AGE_NAME, Library, emptyDefs, slug, sortedSteps, type Age, type GamePlan, type LibraryData, type Play, type Step, type Subject, type SubjectKind, type Tag
} from '@matchup-library/core';

type Strategy = { id: string; name: string; description: string; notes: string; steps: Step[]; where: unknown[]; whereNote: string; active: boolean; mergedInto: string | null };
const [, , input, output = 'data/phase2-plays.sql'] = process.argv;
if (!input) { console.error('Usage: pnpm phase2-plays <download.json> [out.sql]'); process.exit(1); }
const ex = JSON.parse(readFileSync(input, 'utf8')) as LibraryData & { exportedAt?: string; defs: { strategies?: Strategy[] } };
const strategies = ex.defs.strategies;
if (!Array.isArray(strategies)) { console.error('That download has no plays in the old shape. Take it before migration 0003.'); process.exit(1); }

// Subjects decide which steps are age-ups and name the landmarks. A download
// from Upkeep doesn't carry them, so they come from data/subjects.sql
// (written by pnpm subjects sql) when the download has none.
function subjectsFromSql(path: string): Record<string, Subject> {
  const out: Record<string, Subject> = {};
  // A few names run over two lines, so match across the whole file.
  const row = /^\s*\('((?:[^']|'')*)', '((?:[^']|'')*)', '(unit|building|landmark|technology)', (\d+|NULL)/gm;
  for (const m of readFileSync(path, 'utf8').matchAll(row)) {
    const [, id = '', name = '', kind = 'unit', age = 'NULL'] = m;
    out[id.replace(/''/g, "'")] = { id: id.replace(/''/g, "'"), name: name.replace(/''/g, "'"), kind: kind as SubjectKind, age: age === 'NULL' ? null : Number(age),
      civs: null, icon: null, defaultIntent: null, active: true };
  }
  return out;
}
let subjects = ex.subjects && Object.keys(ex.subjects).length ? ex.subjects : null;
if (!subjects) {
  const sqlPath = 'data/subjects.sql';
  if (!existsSync(sqlPath)) { console.error('That download has no subjects, and data/subjects.sql is missing. Run pnpm subjects sql first.'); process.exit(1); }
  subjects = subjectsFromSql(sqlPath);
  console.log('Subjects from ' + sqlPath + ': ' + Object.keys(subjects).length + '.\n');
}
const used = new Set(strategies.flatMap((s) => s.steps.map((st) => st.subject)).concat(ex.defs.elements.map((e) => e.subject)).filter((x): x is string => !!x));
const missing = [...used].filter((id) => !subjects?.[id]);
if (missing.length) { console.error('These subjects are used but not loaded: ' + missing.join(', ') + '. Run pnpm subjects sql, then try again.'); process.exit(1); }

// A Library over the download's elements and subjects, for looks, families and signatures.
const data: LibraryData = { ...ex, subjects, defs: { ...emptyDefs(), ...ex.defs, plays: [], gamePlans: [] } };
const L = new Library(data);
const plan: string[] = [], needs: string[] = [], sql: string[] = [];
const q = (v: string | number | null | undefined): string => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const now = new Date().toISOString();
const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const next = (a: Age): Age => AGES[Math.min(AGES.indexOf(a) + 1, AGES.length - 1)] as Age;
// The first age at or after a that the element allows.
const allowedFrom = (el: string, a: Age): Age => AGES.slice(AGES.indexOf(a)).find((x) => L.elAges(el).includes(x)) || a;

// ---------------------------------------------------------------- 1. ages
function withAges(s: Strategy): { st: Step; age: Age; inferred: boolean }[] {
  const steps = sortedSteps(s.steps);
  const out: { st: Step; age: Age; inferred: boolean }[] = [];
  let cur: Age | null = null;
  steps.forEach((st, i) => {
    let a: Age;
    let inferred = false;
    if (st.age) a = st.age;
    else {
      inferred = true;
      const ahead = steps.slice(i + 1).find((x) => x.age);
      const guess: Age = cur || (ahead && ahead.age) || (L.elAges(st.el)[0] as Age);
      a = allowedFrom(st.el, guess);
    }
    out.push({ st, age: a, inferred });
    // Whatever comes after an age-up happens in the next age.
    cur = L.isAgeUp(st.el) ? next(a) : a;
  });
  return out;
}

// ---------------------------------------------------------------- 2. plays
const plays: Play[] = [];
const bySig = new Map<string, Play>();
const ids = new Set<string>();
function playFor(age: Age, steps: Step[], fixed?: { id: string; name: string; family: string }): Play {
  // Renumber within the age, keeping steps that happened together together.
  const sorted = sortedSteps(steps);
  let n = 0, prev: number | null = null;
  const own: Step[] = sorted.map((st) => { if (st.step !== prev) n += 1; prev = st.step; const o: Step = { el: st.el, age, step: n, notes: '' };
    if (st.intent) o.intent = st.intent; if (st.subject) o.subject = st.subject; return o; });
  const sig = L.signature(own, age);
  const hit = bySig.get(sig);
  if (hit) return hit;
  const name = fixed ? fixed.name : L.sequence(own);
  // Ids start with the age, so the same steps in two ages don't clash: feudal_men_at_arms.
  const base = fixed ? fixed.id : age + '_' + (slug(name) || 'play');
  let id = base, k = 2;
  while (ids.has(id)) { id = base + '_' + k; k += 1; }
  ids.add(id);
  const p: Play = { id, name, age, family: fixed ? fixed.family : L.suggestFamily(own, age), description: '', tells: '', notes: '', steps: own, where: [], whereNote: '', active: true, mergedInto: null };
  plays.push(p);
  bySig.set(sig, p);
  return p;
}
const ecoOnly = L.el('eco_only');
let straightTech: Play | null = null;

const plans: (GamePlan & { from: Strategy })[] = [];
strategies.filter((s) => !s.mergedInto).forEach((s) => {
  const aged = withAges(s);
  const stages: GamePlan['stages'] = {};
  const lines: string[] = [];
  AGES.forEach((age) => {
    const here = aged.filter((x) => x.age === age);
    if (!here.length) return;
    const p = playFor(age, here.map((x) => x.st));
    const notes = here.map((x) => (x.st.notes || '').trim()).filter(Boolean).join(' ');
    stages[age] = { play: p.id, notes };
    lines.push(AGE_NAME[age] + ': ' + p.name + (here.some((x) => x.inferred) ? ' (age set by rule: ' + here.filter((x) => x.inferred).map((x) => L.elName(x.st.el)).join(', ') + ')' : ''));
  });
  const first = AGES.find((a) => stages[a]);
  if (first === 'feudal') {
    if (!straightTech && ecoOnly) straightTech = playFor('dark', [{ el: 'eco_only', age: 'dark', step: 1, notes: '' }], { id: 'straight_tech', name: 'Straight tech', family: 'Tech' });
    if (straightTech) {
      stages.dark = { play: straightTech.id, notes: '' };
      lines.unshift('Dark: Straight tech (it starts in Feudal)');
    }
  }
  if (!first) needs.push('"' + s.name + '" has no steps, so it has no stages yet.');
  aged.forEach((x) => { const e = L.el(x.st.el); if (e && e.active === false) needs.push('"' + s.name + '" uses ' + e.name + ', which is retired. Restore the element or retire the game plan.'); });
  plans.push({ id: s.id, name: s.name, description: s.description, notes: s.notes, status: null, stages, where: [], whereNote: '', active: s.active !== false, mergedInto: null, from: s });
  plan.push('"' + s.name + '"' + (s.active === false ? ' (retired)' : '') + ':');
  lines.forEach((l) => plan.push('  ' + l));
});
if (!ecoOnly && plans.some((g) => AGES.find((a) => g.stages[a]) === 'feudal')) needs.push('No Eco only element, so plans that start in Feudal have no Dark Age play. Run the phase 1 step first.');

// ---------------------------------------------------------------- 3. twins
type TagRow = Tag & { id: string };
const tags: TagRow[] = Object.entries(ex.tags || {}).map(([id, t]) => ({ id, ...t }));
const refs = (gid: string) => tags.filter((t) => t.play === gid).length
  + Object.values(ex.games || {}).reduce((n, g) => n + (g.plays || []).filter((p) => (p as { strategyId?: string }).strategyId === gid).length, 0)
  + Object.values(ex.links || {}).reduce((n, l) => n + (l.marks || []).filter((m) => (m as { strategyId?: string }).strategyId === gid).length, 0);
const sigOf = (g: GamePlan) => AGES.filter((a) => g.stages[a]).map((a) => a + '=' + g.stages[a]?.play).join('|');
const groups = new Map<string, (GamePlan & { from: Strategy })[]>();
plans.filter((g) => g.active && sigOf(g)).forEach((g) => { const k = sigOf(g); groups.set(k, [...(groups.get(k) || []), g]); });
const merges: { from: GamePlan; into: GamePlan }[] = [];
groups.forEach((g) => {
  if (g.length < 2) return;
  const keep = g.slice().sort((a, b) => refs(b.id) - refs(a.id))[0] as GamePlan;
  g.filter((x) => x !== keep).forEach((x) => { merges.push({ from: x, into: keep }); x.active = false; x.mergedInto = keep.id; });
});

// ---------------------------------------------------------------- SQL
plays.forEach((p) => {
  sql.push(`INSERT INTO plays (id, name, age, family, description, tells, notes, where_note, is_active, created_at, updated_at) VALUES (${[
    q(p.id), q(p.name), q(p.age), q(p.family), q(''), q(''), q(''), q(''), 1, q(now), q(now)].join(', ')});`);
  p.steps.forEach((st) => sql.push(`INSERT INTO play_elements (play_id, step_no, element_id, intent, subject_id, notes) VALUES (${[
    q(p.id), st.step, q(st.el), q(st.intent || null), q(st.subject || null), q('')].join(', ')});`));
});
plans.forEach((g) => AGES.forEach((a) => {
  const stg = g.stages[a];
  if (stg) sql.push(`INSERT INTO game_plan_stages (game_plan_id, age, play_id, notes) VALUES (${[q(g.id), q(a), q(stg.play), q(stg.notes)].join(', ')});`);
}));
const tagKey = (t: TagRow, gid: string) => [t.civ, gid, t.age || '', t.place && t.place.kind !== 'any' ? t.place.kind + ':' + t.place.id : 'any:'].join('|');
merges.forEach(({ from, into }) => {
  const taken = new Map(tags.filter((t) => t.play === into.id).map((t) => [tagKey(t, into.id), t]));
  tags.filter((t) => t.play === from.id).forEach((t) => {
    const twin = taken.get(tagKey(t, into.id));
    if (twin) {
      const merged = (a: string, b: string) => [a, b].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(' ');
      sql.push(`UPDATE civ_element_tags SET timing_note = ${q(merged(twin.timing, t.timing))}, tells = ${q(merged(twin.tells, t.tells))}, notes = ${q(merged(twin.notes, t.notes))}, updated_at = ${q(now)} WHERE id = ${q(twin.id)};`);
      sql.push(`DELETE FROM civ_element_tags WHERE id = ${q(t.id)};`);
    } else sql.push(`UPDATE civ_element_tags SET game_plan_id = ${q(into.id)}, updated_at = ${q(now)} WHERE id = ${q(t.id)};`);
  });
  sql.push(`UPDATE game_plays SET game_plan_id = ${q(into.id)} WHERE game_plan_id = ${q(from.id)};`);
  sql.push(`UPDATE link_marks SET game_plan_id = ${q(into.id)} WHERE game_plan_id = ${q(from.id)};`);
  sql.push(`UPDATE comes_up_on SET game_plan_id = ${q(into.id)} WHERE game_plan_id = ${q(from.id)};`);
  sql.push(`UPDATE game_plans SET is_active = 0, merged_into_id = ${q(into.id)}, updated_at = ${q(now)} WHERE id = ${q(from.id)};`);
  plan.push('"' + from.name + '" merges into "' + into.name + '": same play in every age. ' + count(refs(from.id), 'tag, game or moment moves', 'tags, games and moments move') + ' across.');
});

// ---------------------------------------------------------------- the plays, by age and family
const listing: string[] = [];
AGES.forEach((a) => {
  const here = plays.filter((p) => p.age === a);
  if (!here.length) return;
  listing.push(AGE_NAME[a] + ' (' + count(here.length, 'play', 'plays') + ')');
  [...new Set(here.map((p) => p.family))].forEach((f) => {
    listing.push('  ' + f);
    here.filter((p) => p.family === f).forEach((p) => {
      const n = plans.filter((g) => g.active && AGES.some((x) => g.stages[x]?.play === p.id)).length;
      listing.push('    ' + p.name + ' (' + p.id + '), in ' + count(n, 'game plan', 'game plans'));
    });
  });
});

const header = [
  '-- Matchup Library, phase 2 data step: game plans split into plays per age.',
  '-- Generated by scripts/phase2-plays.ts from ' + input + (ex.exportedAt ? ' (downloaded ' + ex.exportedAt + ')' : '') + '.',
  '-- Needs migration 0003 first. Review the plan, then run it locally before remote.',
  '--',
  '-- Game plans',
  ...plan.map((l) => '--   ' + l),
  '--',
  '-- Plays',
  ...listing.map((l) => '--   ' + l),
  '--',
  '-- Needs you',
  ...(needs.length ? [...new Set(needs)].map((l) => '--   ' + l) : ['--   Nothing.']),
  ''
];
writeFileSync(output, header.join('\n') + '\n' + sql.join('\n') + '\n');
console.log(['Game plans', ...plan.map((l) => '  ' + l), '', 'Plays', ...listing.map((l) => '  ' + l), '', 'Needs you',
  ...(needs.length ? [...new Set(needs)].map((l) => '  ' + l) : ['  Nothing.']), '', 'Wrote ' + output + ': ' + sql.length + ' statements.'].join('\n'));
