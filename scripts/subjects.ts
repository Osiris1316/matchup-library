// Subjects and icons from the aoe4world data repo (github.com/aoe4world/data).
//
//   pnpm subjects sql   [--data <folder>] [--out data/subjects.sql]
//   pnpm subjects icons [--data <folder>] [--from <download.json>] [subject ids...]
//
// sql   writes insert-or-update SQL for the subjects table: every unit and
//       building (landmarks marked as landmarks), and every technology up to
//       the Castle Age. Run it with wrangler d1 execute --file. It never
//       touches a landmark's default intent, which you set in the Library.
//       Subjects that left the game data are marked inactive, not deleted.
//
// icons copies the icons for the subjects in use into
//       packages/web/public/icons, and rewrites the list of bundled icons in
//       packages/web/src/icons.generated.ts. "In use" means every subject a
//       download (Upkeep, then Download a copy) points at, plus any ids you
//       name. Icons not bundled are shown from data.aoe4world.com until the
//       next run.
//
// --data reads a local clone of the data repo. Without it, the files come
// straight from GitHub.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/aoe4world/data/main/';
const ICON_DIR = 'packages/web/public/icons';
const MANIFEST = 'packages/web/src/icons.generated.ts';
const MAX_AGE_FOR_TECH = 3;

type Kind = 'unit' | 'building' | 'landmark' | 'technology';
interface Raw { id: string; name: string; civs?: string[]; classes?: string[]; minAge?: number; icon?: string }
// One civ's version of a subject, from the full (not optimized) files, which carry each version's age.
interface RawVersion { baseId?: string; age?: number; civs?: string[] }
export interface SubjectRow { id: string; name: string; kind: Kind; minAge: number | null; civs: string[] | null; icon: string | null; early: Record<string, number> | null }

function args(argv: string[]): { cmd: string; data: string | null; out: string | null; from: string | null; ids: string[] } {
  const [cmd = '', ...rest] = argv;
  const o = { cmd, data: null as string | null, out: null as string | null, from: null as string | null, ids: [] as string[] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '--data') o.data = rest[++i] ?? null;
    else if (a === '--out') o.out = rest[++i] ?? null;
    else if (a === '--from') o.from = rest[++i] ?? null;
    else o.ids.push(a);
  }
  return o;
}

async function readText(data: string | null, path: string): Promise<string> {
  if (data) return readFileSync(join(data, path), 'utf8');
  const res = await fetch(RAW + path);
  if (!res.ok) throw new Error('Could not fetch ' + RAW + path + ': ' + res.status);
  return res.text();
}
async function readBytes(data: string | null, path: string): Promise<Uint8Array> {
  if (data) return readFileSync(join(data, path));
  const res = await fetch(RAW + path);
  if (!res.ok) throw new Error('Could not fetch ' + RAW + path + ': ' + res.status);
  return new Uint8Array(await res.arrayBuffer());
}
const list = (text: string): Raw[] => (JSON.parse(text) as { data: Raw[] }).data;
const iconPath = (url: string | undefined): string | null => (url && url.includes('/images/') ? (url.split('/images/')[1] as string) : null);

export async function loadSubjects(data: string | null): Promise<SubjectRow[]> {
  const [units, buildings, techs, civIndex, versions] = await Promise.all([
    readText(data, 'units/all-optimized.json').then(list),
    readText(data, 'buildings/all-optimized.json').then(list),
    readText(data, 'technologies/all-optimized.json').then(list),
    readText(data, 'civilizations/civs-index.json').then((t) => JSON.parse(t) as Record<string, { id: string }>),
    Promise.all(['units/all.json', 'buildings/all.json', 'technologies/all.json'].map((p) => readText(data, p).then((t) => (JSON.parse(t) as { data: RawVersion[] }).data)))
  ]);
  const allAbbr = Object.keys(civIndex);
  const civId = (x: string): string => (civIndex[x] ? civIndex[x].id : x);
  const civIds = (abbrs: string[] | undefined): string[] | null => {
    const a = abbrs || [];
    if (allAbbr.every((x) => a.includes(x))) return null;
    return a.map(civId);
  };
  const early = earlyAges(versions.flat(), civId);
  const out = new Map<string, SubjectRow>();
  const add = (x: Raw, kind: Kind) => {
    if (out.has(x.id)) return;   // a few technologies share an id with a unit or building; the first wins
    out.set(x.id, { id: x.id, name: x.name, kind, minAge: x.minAge ?? null, civs: civIds(x.civs), icon: iconPath(x.icon), early: kind === 'landmark' ? null : early.get(x.id) || null });
  };
  units.forEach((x) => add(x, 'unit'));
  buildings.forEach((x) => add(x, (x.classes || []).includes('landmark') && x.id !== 'capital-town-center' ? 'landmark' : 'building'));
  techs.filter((x) => (x.minAge ?? 0) <= MAX_AGE_FOR_TECH).forEach((x) => add(x, 'technology'));
  return [...out.values()];
}

// The civs that get a subject earlier than most civs that have it. Each civ's
// earliest version is its start; the most common start (the later one on a
// tie) is the usual start. The data's later versions are upgrade tiers, not
// when a civ can first make it, so only earlier starts are kept.
export function earlyAges(rows: RawVersion[], civId: (abbr: string) => string): Map<string, Record<string, number>> {
  const starts = new Map<string, Map<string, number>>();
  rows.forEach((v) => {
    if (!v.baseId || !v.age) return;
    const m = starts.get(v.baseId) || new Map<string, number>();
    (v.civs || []).forEach((c) => { const id = civId(c); m.set(id, Math.min(m.get(id) ?? 9, v.age as number)); });
    starts.set(v.baseId, m);
  });
  const out = new Map<string, Record<string, number>>();
  starts.forEach((m, base) => {
    const count = new Map<number, number>();
    m.forEach((a) => count.set(a, (count.get(a) || 0) + 1));
    let usual = 0, best = -1;
    [...count.entries()].sort((x, y) => x[0] - y[0]).forEach(([a, n]) => { if (n >= best) { best = n; usual = a; } });
    const early: Record<string, number> = {};
    [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).forEach(([c, a]) => { if (a < usual) early[c] = a; });
    if (Object.keys(early).length) out.set(base, early);
  });
  return out;
}

const q = (v: string | number | null): string =>(v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + v.replace(/'/g, "''") + "'");

async function writeSql(data: string | null, outPath: string): Promise<void> {
  const rows = await loadSubjects(data);
  const now = new Date().toISOString();
  const lines = [
    '-- Subjects from the aoe4world data repo, generated by scripts/subjects.ts on ' + now.slice(0, 10) + '.',
    '-- ' + rows.length + ' subjects: ' + ([['unit', 'units'], ['building', 'buildings'], ['landmark', 'landmarks'], ['technology', 'technologies']] as [Kind, string][]).map(([k, w]) => rows.filter((r) => r.kind === k).length + ' ' + w).join(', ') + '.',
    '-- ' + rows.filter((r) => r.early).length + ' of them have civs that get them earlier than most (early_ages; needs migration 0004).',
    '-- Inserts or updates. Default intents are left as they are. Safe to run again.',
    '',
    'UPDATE subjects SET is_active = 0;'
  ];
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    lines.push('INSERT INTO subjects (id, name, kind, min_age, civs, icon, early_ages, is_active, updated_at) VALUES\n' +
      chunk.map((r) => '  (' + [q(r.id), q(r.name), q(r.kind), q(r.minAge), q(r.civs ? JSON.stringify(r.civs) : null), q(r.icon), q(r.early ? JSON.stringify(r.early) : null), '1', q(now)].join(', ') + ')').join(',\n') +
      '\nON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, min_age = excluded.min_age, civs = excluded.civs, icon = excluded.icon, early_ages = excluded.early_ages, is_active = 1, updated_at = excluded.updated_at;');
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log('Wrote ' + outPath + ': ' + rows.length + ' subjects.');
}

// Every subject id a download points at.
function idsInDownload(path: string): string[] {
  const d = JSON.parse(readFileSync(path, 'utf8')) as {
    defs?: { elements?: { subject?: string | null }[]; plays?: { steps?: { subject?: string | null }[] }[] };
    tags?: Record<string, { subject?: string | null }>; games?: Record<string, { plays?: { subject?: string | null }[] }>;
    links?: Record<string, { marks?: { subject?: string | null }[] }>;
  };
  const ids = new Set<string>();
  const add = (v: string | null | undefined) => { if (v) ids.add(v); };
  (d.defs?.elements || []).forEach((e) => add(e.subject));
  (d.defs?.plays || []).forEach((p) => (p.steps || []).forEach((st) => add(st.subject)));
  Object.values(d.tags || {}).forEach((t) => add(t.subject));
  Object.values(d.games || {}).forEach((g) => (g.plays || []).forEach((p) => add(p.subject)));
  Object.values(d.links || {}).forEach((l) => (l.marks || []).forEach((m) => add(m.subject)));
  return [...ids];
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

async function copyIcons(data: string | null, from: string | null, extra: string[]): Promise<void> {
  const want = new Set([...(from ? idsInDownload(from) : []), ...extra]);
  if (!want.size) { console.error('Name some subject ids, or pass --from <download.json>.'); process.exit(1); }
  const rows = new Map((await loadSubjects(data)).map((r) => [r.id, r]));
  let copied = 0;
  for (const id of want) {
    const r = rows.get(id);
    if (!r || !r.icon) { console.warn('No icon for ' + id + ', skipped.'); continue; }
    const dest = join(ICON_DIR, r.icon);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, await readBytes(data, 'images/' + r.icon));
    copied += 1;
  }
  const bundled = filesUnder(ICON_DIR).filter((p) => p.endsWith('.png')).map((p) => relative(ICON_DIR, p).split('\\').join('/')).sort();
  writeFileSync(MANIFEST, [
    '// Generated by scripts/subjects.ts icons. The aoe4world icons copied into public/icons.',
    '// Any other icon is shown from data.aoe4world.com until the script copies it.',
    'export const BUNDLED_ICONS: ReadonlySet<string> = new Set([',
    ...bundled.map((b) => "  '" + b + "',"),
    ']);',
    ''
  ].join('\n'));
  console.log('Copied ' + copied + ' new icons. ' + bundled.length + ' bundled in all; ' + MANIFEST + ' updated.');
}

const o = args(process.argv.slice(2));
if (o.cmd === 'sql') await writeSql(o.data, o.out || 'data/subjects.sql');
else if (o.cmd === 'icons') await copyIcons(o.data, o.from, o.ids);
else {
  console.error('Usage:\n  pnpm subjects sql [--data <folder>] [--out data/subjects.sql]\n  pnpm subjects icons [--data <folder>] [--from <download.json>] [subject ids...]');
  process.exit(1);
}
