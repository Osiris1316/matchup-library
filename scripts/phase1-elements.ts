// Phase 1 data step: move the existing elements onto the new vocabulary
// (types, subjects, intent, universal), as decided in handoff M2.
//
//   pnpm phase1-elements <download.json> [out.sql]
//
// Take the download (Upkeep, then Download a copy) right before running it,
// because the SQL works from the ids in that file. It prints the plan and
// writes the same plan as comments at the top of the SQL, so you can read
// exactly what will change before running anything. Load the subjects first
// (pnpm subjects sql): the elements point at them.
//
// What it does, in order:
//   1. Adds the new elements: Tower, Eco only, Age up, Official, Archers, Crossbows.
//   2. Renames and retypes the existing elements, with subject and intent.
//   3. Merges Tower rush and Defensive tower into Tower (Tower rush uses become
//      Tower used offensively), and the second men-at-arms element into the first.
//   4. Retires Reignitz: its play steps become the landmark on that play's
//      age-up step, and its tags, game plays and moments become Age up with
//      Regnitz Cathedral.
//   5. Marks Tower and 2nd TC universal, and retires their plain all-civ tags.
//   6. Retires the old element kinds.
// Anything it can't do safely is listed under "Needs you".
import { readFileSync, writeFileSync } from 'node:fs';
import { AGES, type Age, type ElType, type Element, type Intent, type LibraryData, type Place, type Step, type Tag } from '@matchup-library/core';

const [, , input, output = 'data/phase1-elements.sql'] = process.argv;
if (!input) { console.error('Usage: pnpm phase1-elements <download.json> [out.sql]'); process.exit(1); }
const ex = JSON.parse(readFileSync(input, 'utf8')) as LibraryData & { exportedAt?: string };
if (!ex.defs || !Array.isArray(ex.defs.elements)) { console.error('That file does not look like a Matchup Library download.'); process.exit(1); }

interface Target { key: string; match: string[]; name: string; type: ElType; intent: Intent | null; subject: string | null; universal?: boolean; ages?: Age[] }
interface NewEl { id: string; name: string; type: ElType; intent: Intent | null; subject: string | null; universal?: boolean; ages: Age[]; description: string }

// Existing elements, matched by id or by name (case and spacing ignored).
const KEEP: Target[] = [
  { key: 'barracks', match: ['dark_barracks', 'dark age barracks', 'barracks'], name: 'Barracks', type: 'structure', intent: 'offensive', subject: 'barracks', ages: AGES },
  { key: 'stables', match: ['double_stable', 'double stable', 'stables'], name: 'Stables', type: 'structure', intent: 'offensive', subject: 'stable' },
  { key: 'maa', match: ['maa_spam', 'maa spam'], name: 'Men-at-arms', type: 'unit', intent: 'offensive', subject: 'man-at-arms' },
  { key: 'spears', match: ['spear_rush', 'spear rush'], name: 'Spears', type: 'unit', intent: 'offensive', subject: 'spearman' },
  { key: 'caterans', match: ['catered_rush', 'catered rush', 'cateran rush'], name: 'Caterans', type: 'unit', intent: 'offensive', subject: 'cateran' },
  { key: 'reivers', match: ['border_reivers', 'border_reaver_muster', 'border reivers', 'border reiver', 'border reaver muster'], name: 'Border reivers', type: 'unit', intent: 'offensive', subject: 'border-reiver' },
  { key: 'horsemen', match: ['horsemen', 'horseman'], name: 'Horsemen', type: 'unit', intent: 'offensive', subject: 'horseman' },
  { key: 'walls', match: ['offensive_walls', 'offensive walls'], name: 'Walls', type: 'structure', intent: 'offensive', subject: 'palisade' },
  { key: 'keep', match: ['fortress_boom', 'fortress boom'], name: 'Keep', type: 'structure', intent: 'defensive', subject: 'keep' },
  { key: 'tc2', match: ['second_tc', '2nd tc', 'second tc', '2tc'], name: '2nd TC', type: 'economy', intent: 'economic', subject: 'town-center', universal: true },
  { key: 'cows', match: ['dark_cows', '3+ dark cows'], name: 'Cows', type: 'economy', intent: 'economic', subject: 'highland-cattle' },
  { key: 'scouts', match: ['pro_scouts', 'pro scouts', 'professional scouts'], name: 'Pro scouts', type: 'age_tech', intent: 'economic', subject: 'professional-scouts' },
  { key: 'fc', match: ['fast_castle', 'fast castle'], name: 'Fast castle', type: 'age_tech', intent: null, subject: null },
  { key: 'nfc', match: ['naked_castle', 'naked castle', 'naked fast castle'], name: 'Naked castle', type: 'age_tech', intent: null, subject: null }
];
const keyId = new Map<string, string>();
const NEW: NewEl[] = [
  { id: 'tower', name: 'Tower', type: 'structure', intent: 'defensive', subject: 'outpost', universal: true, ages: AGES, description: 'An outpost, at home or pushed forward.' },
  { id: 'eco_only', name: 'Eco only', type: 'economy', intent: 'economic', subject: 'villager', ages: AGES, description: 'Straight economy, no military.' },
  { id: 'age_up', name: 'Age up', type: 'age_tech', intent: null, subject: null, ages: ['dark', 'feudal', 'castle'], description: 'Ageing up; each use names the landmark.' },
  { id: 'official', name: 'Official', type: 'economy', intent: 'economic', subject: 'imperial-official', ages: AGES, description: '' },
  { id: 'archers', name: 'Archers', type: 'unit', intent: null, subject: 'archer', ages: ['feudal', 'castle', 'imperial'], description: '' },
  { id: 'crossbows', name: 'Crossbows', type: 'unit', intent: null, subject: 'crossbowman', ages: ['castle', 'imperial'], description: '' }
];
// Elements folded into another. intent is what their uses carry afterwards.
const MERGES: { match: string[]; into: string; intent: Intent | null }[] = [
  { match: ['defensive_tower', 'defensive tower'], into: 'tower', intent: null },
  { match: ['tower_rush', 'tower rush'], into: 'tower', intent: 'offensive' },
  { match: ['maa_spam_2', 'men-at-arms spam', 'maa spam 2'], into: 'key:maa', intent: null }
];
// Elements that were really a landmark.
const LANDMARKS: { match: string[]; subject: string; label: string }[] = [
  { match: ['reignitz', 'regnitz', 'regnitz cathedral'], subject: 'regnitz-cathedral', label: 'Regnitz Cathedral' }
];
const TYPES: ElType[] = ['unit', 'structure', 'economy', 'age_tech'];

// ---------------------------------------------------------------- helpers
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const els = ex.defs.elements;
const byId = new Map(els.map((e) => [e.id, e]));
const plan: string[] = [], needs: string[] = [], sql: string[] = [];
const q = (v: string | number | null | undefined): string => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const now = new Date().toISOString();
// An id match wins over a name match, so maa_spam finds maa_spam even when
// another element is named "MaA Spam".
function find(match: string[]): Element[] {
  const ids = new Set(match.map(norm));
  const byIdHits = els.filter((e) => ids.has(norm(e.id)));
  return byIdHits.length ? byIdHits : els.filter((e) => ids.has(norm(e.name)));
}
function one(match: string[], what: string): Element | null {
  const hits = find(match).filter((e) => !e.mergedInto);
  if (hits.length > 1) { needs.push(what + ': more than one element matches (' + hits.map((e) => e.id).join(', ') + '), so it was left alone.'); return null; }
  return hits[0] || null;
}
const ageCols = (ages: Age[]) => AGES.map((a) => (ages.includes(a) ? 1 : 0));
const used = new Set<string>();
const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const nameOf = (id: string) => NEW.find((n) => n.id === id)?.name || KEEP.find((k) => keyId.get(k.key) === id)?.name || byId.get(id)?.name || id;

// ---------------------------------------------------------------- 1. new elements
NEW.forEach((n) => {
  if (byId.has(n.id)) { needs.push('New element ' + n.name + ': the id ' + n.id + ' is already taken, so it was not added.'); return; }
  if (els.some((e) => norm(e.name) === norm(n.name) && !find(MERGES.flatMap((m) => m.match)).includes(e))) { needs.push('New element ' + n.name + ': an element already has that name; check it.'); }
  sql.push(`INSERT INTO elements (id, name, kind_id, age_dark, age_feudal, age_castle, age_imperial, tells, description, where_note, is_active, subject_id, intent, is_universal, created_at, updated_at) VALUES (${[
    q(n.id), q(n.name), q(n.type), ...ageCols(n.ages), q(''), q(n.description), q(''), 1, q(n.subject), q(n.intent), n.universal ? 1 : 0, q(now), q(now)].join(', ')});`);
  plan.push('Add ' + n.name + ' (' + n.type + (n.intent ? ', ' + n.intent : '') + (n.subject ? ', icon ' + n.subject : '') + (n.universal ? ', every civ' : '') + ').');
});

// ---------------------------------------------------------------- 2. renames and types
KEEP.forEach((t) => {
  const e = one(t.match, t.name);
  if (!e) { plan.push('No element found for ' + t.name + '; skipped.'); return; }
  used.add(e.id);
  keyId.set(t.key, e.id);
  const sets = [`name = ${q(t.name)}`, `kind_id = ${q(t.type)}`, `subject_id = ${q(t.subject)}`, `intent = ${q(t.intent)}`, `is_universal = ${t.universal ? 1 : 0}`];
  if (t.ages) AGES.forEach((a, i) => sets.push(`age_${a} = ${ageCols(t.ages as Age[])[i]}`));
  sql.push(`UPDATE elements SET ${sets.join(', ')}, updated_at = ${q(now)} WHERE id = ${q(e.id)};`);
  plan.push((e.name === t.name ? t.name : e.name + ' becomes ' + t.name) + ': ' + t.type + (t.intent ? ', ' + t.intent : '') + (t.subject ? ', icon ' + t.subject : '') + (t.universal ? ', every civ' : '') + (t.ages ? ', any age' : '') + '.');
});

// Tag keys after the change, to keep the unique index happy.
type TagRow = Tag & { id: string };
const tags: TagRow[] = Object.entries(ex.tags || {}).map(([id, t]) => ({ id, ...t }));
const placeKey = (p: Place | undefined) => (p && p.kind !== 'any' ? p.kind + ':' + p.id : 'any:');
const tagKey = (t: TagRow) => [t.civ, t.el || '', t.play || '', t.age || '', placeKey(t.place), t.intent || ''].join('|');
const taken = new Map(tags.map((t) => [tagKey(t), t]));
function moveTag(t: TagRow, el: string, intent: Intent | null, subject: string | null, why: string): void {
  const next: TagRow = { ...t, el, intent, subject };
  const k = tagKey(next);
  const twin = taken.get(k);
  taken.delete(tagKey(t));
  if (twin && twin.id !== t.id) {
    // Fold the moving tag's words into the one already there, then remove it.
    const merged = (a: string, b: string) => [a, b].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(' ');
    const words = { timing: merged(twin.timing, t.timing), tells: merged(twin.tells, t.tells), notes: merged(twin.notes, t.notes) };
    sql.push(`UPDATE civ_element_tags SET timing_note = ${q(words.timing)}, tells = ${q(words.tells)}, notes = ${q(words.notes)}, is_active = ${twin.active !== false || t.active !== false ? 1 : 0}, updated_at = ${q(now)} WHERE id = ${q(twin.id)};`);
    sql.push(`DELETE FROM civ_element_tags WHERE id = ${q(t.id)};`);
    Object.assign(twin, words, { active: twin.active !== false || t.active !== false });
    Object.assign(t, { el: null, active: false });
    plan.push('  ' + t.civ + ': its ' + why + ' tag was the same as an existing one, so the two were combined.');
    return;
  }
  sql.push(`UPDATE civ_element_tags SET element_id = ${q(el)}, intent = ${q(intent)}, subject_id = ${q(subject)}, updated_at = ${q(now)} WHERE id = ${q(t.id)};`);
  Object.assign(t, { el, intent, subject });
  taken.set(k, t);
}
const strategies = ex.defs.strategies || [];
function moveSteps(fromId: string, into: string, intent: Intent | null): void {
  strategies.forEach((s) => {
    s.steps.filter((st) => st.el === fromId).forEach((st) => {
      if (s.steps.some((o) => o !== st && o.el === into && o.step === st.step)) {
        sql.push(`DELETE FROM strategy_elements WHERE strategy_id = ${q(s.id)} AND step_no = ${st.step} AND element_id = ${q(fromId)};`);
        needs.push('Play "' + s.name + '" had ' + nameOf(fromId) + ' and ' + nameOf(into) + ' at the same step. A play step can hold an element once, so the ' + nameOf(fromId) + ' step was dropped. Re-add it as the next step if you want both.');
        s.steps = s.steps.filter((o) => o !== st);
        return;
      }
      sql.push(`UPDATE strategy_elements SET element_id = ${q(into)}, intent = ${q(intent)} WHERE strategy_id = ${q(s.id)} AND step_no = ${st.step} AND element_id = ${q(fromId)};`);
      Object.assign(st, { el: into, intent });
    });
  });
}
function moveRefs(fromId: string, into: string, intent: Intent | null, subject: string | null): number {
  let n = 0;
  Object.values(ex.games || {}).forEach((g) => (g.plays || []).forEach((p) => { if (p.elementId === fromId) n += 1; }));
  Object.values(ex.links || {}).forEach((l) => (l.marks || []).forEach((m) => { if (m.elementId === fromId) n += 1; }));
  if (n) {
    sql.push(`UPDATE game_plays SET element_id = ${q(into)}, intent = ${q(intent)}, subject_id = ${q(subject)} WHERE element_id = ${q(fromId)};`);
    sql.push(`UPDATE link_marks SET element_id = ${q(into)}, intent = ${q(intent)}, subject_id = ${q(subject)} WHERE element_id = ${q(fromId)};`);
  }
  return n;
}

// ---------------------------------------------------------------- 3. merges
const newIds = new Set(NEW.filter((n) => !byId.has(n.id)).map((n) => n.id));
MERGES.forEach((m) => {
  const e = one(m.match, m.match[1] || m.match[0] || '');
  if (!e) return;
  const into = m.into.startsWith('key:') ? keyId.get(m.into.slice(4)) : newIds.has(m.into) ? m.into : null;
  if (!into) { needs.push(e.name + ': nothing to merge it into, so it was left alone.'); return; }
  used.add(e.id);
  const intoName = nameOf(into);
  plan.push(e.name + ' merges into ' + intoName + (m.intent ? ', its uses marked ' + m.intent : '') + ':');
  moveSteps(e.id, into, m.intent);
  const steps = strategies.filter((s) => s.steps.some((st) => st.el === into && (st.intent || null) === m.intent)).length;
  const ts = tags.filter((t) => t.el === e.id);
  ts.forEach((t) => moveTag(t, into, m.intent, t.subject || null, e.name));
  const refs = moveRefs(e.id, into, m.intent, null);
  plan.push('  ' + [steps ? count(steps, 'play', 'plays') : '', ts.length ? count(ts.length, 'tag', 'tags') : '', refs ? count(refs, 'game play or moment', 'game plays and moments') : ''].filter(Boolean).join(', ') + (steps || ts.length || refs ? ' now point at ' + intoName + '.' : 'Nothing pointed at it.'));
  // "Comes up on" notes and their reason move with it.
  if ((e.where || []).length) {
    sql.push(`DELETE FROM comes_up_on WHERE element_id = ${q(e.id)};`);
    e.where.forEach((p) => {
      const col = p.kind === 'type' ? 'map_type_id' : p.kind === 'feature' ? 'feature_id' : p.kind === 'map' ? 'map_id' : null;
      if (col) sql.push(`INSERT INTO comes_up_on (element_id, ${col}) SELECT ${q(into)}, ${q(p.id)} WHERE NOT EXISTS (SELECT 1 FROM comes_up_on WHERE element_id = ${q(into)} AND ${col} = ${q(p.id)});`);
    });
    if (e.whereNote) sql.push(`UPDATE elements SET where_note = TRIM(COALESCE(where_note, '') || ' ' || ${q(e.whereNote)}) WHERE id = ${q(into)};`);
    plan.push('  Its "comes up on" maps move too.');
  }
  if (e.tells || e.description) {
    const words = [e.tells ? (m.intent ? m.intent[0]?.toUpperCase() + m.intent.slice(1) + ': ' : '') + e.tells : ''].filter(Boolean).join(' ');
    if (words) sql.push(`UPDATE elements SET tells = TRIM(COALESCE(tells, '') || ' ' || ${q(words)}) WHERE id = ${q(into)};`);
  }
  sql.push(`UPDATE elements SET is_active = 0, merged_into_id = ${q(into)}, updated_at = ${q(now)} WHERE id = ${q(e.id)};`);
});

// ---------------------------------------------------------------- 4. landmark elements
LANDMARKS.forEach((lm) => {
  const e = one(lm.match, lm.label);
  if (!e) return;
  used.add(e.id);
  if (!newIds.has('age_up')) { needs.push(e.name + ': the Age up element was not added, so it was left alone.'); return; }
  plan.push(e.name + ' retires; ' + lm.label + ' becomes the landmark on age-ups:');
  const ageTech = new Set([...KEEP.filter((k) => k.type === 'age_tech').map((k) => keyId.get(k.key)), 'age_up'].filter(Boolean) as string[]);
  strategies.forEach((s) => {
    s.steps.filter((st) => st.el === e.id).forEach((st) => {
      const host = s.steps.filter((o) => ageTech.has(o.el) && o !== st).sort((a, b) => Number(b.age === st.age) - Number(a.age === st.age) || b.step - a.step)[0];
      if (host) {
        sql.push(`UPDATE strategy_elements SET subject_id = ${q(lm.subject)} WHERE strategy_id = ${q(s.id)} AND step_no = ${host.step} AND element_id = ${q(host.el)};`);
        sql.push(`DELETE FROM strategy_elements WHERE strategy_id = ${q(s.id)} AND step_no = ${st.step} AND element_id = ${q(e.id)};`);
        if (host.subject && host.subject !== lm.subject) needs.push('Play "' + s.name + '": its age-up already named a landmark; it now names ' + lm.label + '.');
        host.subject = lm.subject;
        s.steps = s.steps.filter((o) => o !== st);
        plan.push('  "' + s.name + '": the ' + (byId.get(host.el)?.name || host.el) + ' step now names ' + lm.label + ', and the ' + e.name + ' step is gone.');
      } else {
        sql.push(`UPDATE strategy_elements SET element_id = 'age_up', subject_id = ${q(lm.subject)} WHERE strategy_id = ${q(s.id)} AND step_no = ${st.step} AND element_id = ${q(e.id)};`);
        Object.assign(st, { el: 'age_up', subject: lm.subject } as Partial<Step>);
        plan.push('  "' + s.name + '": the ' + e.name + ' step becomes Age up with ' + lm.label + '.');
      }
    });
  });
  const ts = tags.filter((t) => t.el === e.id);
  ts.forEach((t) => moveTag(t, 'age_up', t.intent || null, lm.subject, e.name));
  if (ts.length) plan.push('  ' + count(ts.length, 'tag becomes', 'tags become') + ' Age up with ' + lm.label + '.');
  const refs = moveRefs(e.id, 'age_up', null, lm.subject);
  if (refs) plan.push('  ' + count(refs, 'game play or moment becomes', 'game plays and moments become') + ' Age up with ' + lm.label + '.');
  if ((e.where || []).length) needs.push(e.name + ' had "comes up on" maps; they were not moved. Add them to Age up or a play if they matter.');
  sql.push(`DELETE FROM comes_up_on WHERE element_id = ${q(e.id)};`);
  sql.push(`UPDATE elements SET is_active = 0, merged_into_id = 'age_up', updated_at = ${q(now)} WHERE id = ${q(e.id)};`);
});

// ---------------------------------------------------------------- 5. universal elements
const universal = [...NEW.filter((n) => n.universal && newIds.has(n.id)).map((n) => ({ id: n.id, name: n.name })),
  ...KEEP.filter((k) => k.universal && keyId.get(k.key)).map((k) => ({ id: keyId.get(k.key) as string, name: k.name }))];
universal.forEach((u) => {
  const plain = tags.filter((t) => t.el === u.id && t.active !== false && placeKey(t.place) === 'any:' && !t.age && !t.intent && !t.subject && !t.timing && !t.tells && !t.notes);
  const kept = tags.filter((t) => t.el === u.id && t.active !== false && !plain.includes(t));
  plain.forEach((t) => { sql.push(`UPDATE civ_element_tags SET is_active = 0, updated_at = ${q(now)} WHERE id = ${q(t.id)};`); t.active = false; });
  plan.push(u.name + ' counts for every civ now. ' + count(plain.length, 'plain all-civ tag', 'plain all-civ tags') + ' retired' + (kept.length ? '; ' + kept.length + ' kept because they say something (' + kept.map((t) => t.civ + (t.intent ? ' ' + t.intent : '') + (placeKey(t.place) !== 'any:' ? ' on ' + placeKey(t.place) : '')).join(', ') + ').' : '.'));
});

// ---------------------------------------------------------------- 6. old kinds
sql.push(`UPDATE element_kinds SET is_active = 0 WHERE id NOT IN (${TYPES.map(q).join(', ')});`);
plan.push('Old element kinds retired: ' + (ex.defs.kinds || []).filter((k) => !TYPES.includes(k.id as ElType)).map((k) => k.name).join(', ') + '.');
els.filter((e) => e.active !== false && !e.mergedInto && !used.has(e.id) && !TYPES.includes(e.kind as ElType)).forEach((e) => {
  needs.push(e.name + ' (' + e.id + ', kind ' + e.kind + ') has no mapping. Give it a type, icon and intent in the Library.');
});

// ---------------------------------------------------------------- every element, after
// Replays the plan's effect on the download, so the list shows each element
// as it will be: name, type, intent, icon, and what points at it.
const after = new Map<string, { name: string; type: string; intent: string; subject: string; active: boolean; merged: string }>();
els.forEach((e) => after.set(e.id, { name: e.name, type: e.kind, intent: e.intent || '', subject: e.subject || '', active: e.active !== false && !e.mergedInto, merged: e.mergedInto || '' }));
NEW.filter((n) => newIds.has(n.id)).forEach((n) => after.set(n.id, { name: n.name, type: n.type, intent: n.intent || '', subject: n.subject || '', active: true, merged: '' }));
KEEP.forEach((t) => { const id = keyId.get(t.key); if (id) after.set(id, { name: t.name, type: t.type, intent: t.intent || '', subject: t.subject || '', active: true, merged: '' }); });
sql.filter((x) => x.startsWith('UPDATE elements SET is_active = 0, merged_into_id')).forEach((x) => {
  const m = /merged_into_id = '([^']+)'.*WHERE id = '([^']+)'/.exec(x);
  const a = m && after.get(m[2] as string);
  if (m && a) Object.assign(a, { active: false, merged: m[1] as string });
});
const listing: string[] = [];
[...after.entries()].filter(([, a]) => a.active).sort((x, y) => x[1].type.localeCompare(y[1].type) || x[1].name.localeCompare(y[1].name)).forEach(([id, a]) => {
  const activeTags = tags.filter((t) => t.el === id && t.active !== false).length;
  const plays = strategies.filter((s) => s.active !== false && s.steps.some((st) => st.el === id)).length;
  listing.push(a.name + ' (' + id + '): ' + (TYPES.includes(a.type as ElType) ? a.type : 'NO TYPE, was ' + a.type) + (a.intent ? ', ' + a.intent : '') + (a.subject ? ', icon ' + a.subject : ', no icon') +
    '; ' + count(activeTags, 'active tag', 'active tags') + ', ' + count(plays, 'play', 'plays') + (used.has(id) || newIds.has(id) ? '' : '. Not in the mapping, left as it was.'));
});

// ---------------------------------------------------------------- write
const header = [
  '-- Matchup Library, phase 1 data step: elements onto the new vocabulary.',
  '-- Generated by scripts/phase1-elements.ts from ' + input + (ex.exportedAt ? ' (downloaded ' + ex.exportedAt + ')' : '') + '.',
  '-- Needs migration 0002 and the subjects loaded first. Review the plan, then run it locally before remote.',
  '--',
  '-- The plan',
  ...plan.map((l) => '--   ' + l),
  '--',
  '-- Needs you',
  ...(needs.length ? needs.map((l) => '--   ' + l) : ['--   Nothing.']),
  '--',
  '-- Every active element afterwards',
  ...listing.map((l) => '--   ' + l),
  ''
];
writeFileSync(output, header.join('\n') + '\n' + sql.join('\n') + '\n');
console.log(['The plan', ...plan.map((l) => '  ' + l), '', 'Needs you', ...(needs.length ? needs.map((l) => '  ' + l) : ['  Nothing.']), '',
  'Every active element afterwards', ...listing.map((l) => '  ' + l), '', 'Wrote ' + output + ': ' + sql.length + ' statements.'].join('\n'));
