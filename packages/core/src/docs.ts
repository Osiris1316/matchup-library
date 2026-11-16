// The page works with records (one per definition list, tag, game, link and
// answer). This module maps those records to D1 rows and back. The Worker uses
// it to save and load; the import script uses it to turn a preview download
// into SQL.
import {
  AGES, DEF_TYPES, INTENTS, type Age, type Answer, type Intent, type Subject, type SubjectKind, type ChangeEntry, type CommitBody, type DefType, type Defs, type DocWrite,
  type Game, type Link, type Place, type Settings, type StateResponse, type Tag
} from './types';

export interface Stmt { sql: string; params: (string | number | null)[] }
export interface Statements { A: Stmt[]; B: Stmt[] }
type Row = Record<string, unknown>;

const COLLECTIONS = ['defs', 'meta', 'tags', 'games', 'links', 'answers', 'subjects'] as const;
type Collection = (typeof COLLECTIONS)[number];
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const SOURCES = ['youtube', 'twitch_vod', 'twitch_highlight', 'twitch_clip', 'aoe4world', 'own_site', 'other'];

// A request the page should never send. The Worker answers these with 400.
export class BadRequest extends Error {}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const stmt = (sql: string, ...params: (string | number | null)[]): Stmt => ({ sql, params });
const now = (): string => new Date().toISOString();
const str = (v: unknown): string => (v == null ? '' : String(v));                       // text column, never null
const opt = (v: unknown): string | null => (v == null || v === '' ? null : String(v));  // optional text or reference
const bit = (v: unknown): number => (v ? 1 : 0);
const age = (v: unknown): Age | null => (AGES.includes(v as Age) ? (v as Age) : null);
const int = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null);
const intent = (v: unknown): Intent | null => oneOf(v, INTENTS);
const subj = (v: unknown): string | null => (v == null || v === '' ? null : checkId(v, 'subject'));
function checkId(id: unknown, what: string): string {
  if (!ID_RE.test(String(id || ''))) throw new BadRequest('Bad id for ' + what + ': ' + String(id));
  return String(id);
}
interface PlaceCols { map_type_id: string | null; feature_id: string | null; map_id: string | null }
function placeCols(p: Place | null | undefined): PlaceCols {
  const k = p && p.kind;
  return {
    map_type_id: k === 'type' ? opt(p?.id) : null,
    feature_id: k === 'feature' ? opt(p?.id) : null,
    map_id: k === 'map' ? opt(p?.id) : null
  };
}
function placeOf(r: Row): Place {
  if (r.map_type_id) return { kind: 'type', id: String(r.map_type_id) };
  if (r.feature_id) return { kind: 'feature', id: String(r.feature_id) };
  if (r.map_id) return { kind: 'map', id: String(r.map_id) };
  return { kind: 'any' };
}
// Key order does not matter when deciding whether an item changed.
export function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}
function upsert(table: string, cols: string[], values: (string | number | null)[], keep: string[] = []): Stmt {
  const updates = cols.filter((c) => c !== 'id' && !keep.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
  return stmt(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates}`, ...values);
}
export function parsePath(path: unknown): { col: Collection; id: string } {
  const parts = String(path || '').split('/');
  const [col, id] = parts;
  if (parts.length !== 2 || !COLLECTIONS.includes(col as Collection)) throw new BadRequest('Bad path: ' + String(path));
  checkId(id, String(col));
  if (col === 'defs' && !DEF_TYPES.includes(id as DefType)) throw new BadRequest('Bad path: ' + String(path));
  if (col === 'meta' && id !== 'settings') throw new BadRequest('Bad path: ' + String(path));
  return { col: col as Collection, id: id as string };
}

// ---------------------------------------------------------------------------
// Definition lists. A list is saved item by item: only items that differ
// from what the page saw before are written, and items that left the list
// (an undone "add") are deleted.
// ---------------------------------------------------------------------------
function placeRows(field: 'element_id' | 'strategy_id', id: string, where: Place[] | undefined): Stmt[] {
  const out = [stmt(`DELETE FROM comes_up_on WHERE ${field} = ?`, id)];
  const seen = new Set<string>();
  (where || []).forEach((p) => {
    const c = placeCols(p);
    const key = (p && p.kind) + ':' + (p && p.id);
    if (seen.has(key) || (!c.map_type_id && !c.feature_id && !c.map_id)) return;
    seen.add(key);
    out.push(stmt(`INSERT INTO comes_up_on (${field}, map_type_id, feature_id, map_id) VALUES (?, ?, ?, ?)`, id, c.map_type_id, c.feature_id, c.map_id));
  });
  return out;
}
// Each list item arrives from the page as plain JSON, so the handlers read it loosely.
type Item = Record<string, any> & { id: string };
interface DefHandler { table: string; order?: (items: Item[]) => Item[]; upsert: (x: Item, i: number) => Stmt[] }
const DEFS: Record<DefType, DefHandler> = {
  civs: {
    table: 'civs',
    order: (items) => [...items.filter((c) => !c.parent), ...items.filter((c) => c.parent)],
    upsert: (c) => [upsert('civs', ['id', 'name', 'short_name', 'flag_slug', 'parent_civ_id', 'is_active'],
      [c.id, str(c.name), opt(c.short), opt(c.flag), opt(c.parent), bit(c.active !== false)])]
  },
  mapTypes: {
    table: 'map_types',
    upsert: (x, i) => [upsert('map_types', ['id', 'name', 'description', 'sort_order', 'is_active'], [x.id, str(x.name), str(x.description), i, bit(x.active !== false)])]
  },
  features: {
    table: 'map_features',
    upsert: (x, i) => [upsert('map_features', ['id', 'name', 'description', 'sort_order', 'is_active'], [x.id, str(x.name), str(x.description), i, bit(x.active !== false)])]
  },
  kinds: {
    table: 'element_kinds',
    upsert: (x, i) => [upsert('element_kinds', ['id', 'name', 'description', 'sort_order', 'is_active'], [x.id, str(x.name), str(x.description), i, bit(x.active !== false)])]
  },
  maps: {
    table: 'maps',
    upsert: (m) => [
      upsert('maps', ['id', 'name', 'aoe4world_name', 'map_type_id', 'in_pool', 'is_active', 'notes'],
        [m.id, str(m.name), opt(m.aoe4worldName), str(m.type), bit(m.inPool !== false), bit(m.active !== false), str(m.notes)]),
      stmt('DELETE FROM map_has_feature WHERE map_id = ?', m.id),
      ...[...new Set<string>(m.features || [])].map((f) => stmt('INSERT INTO map_has_feature (map_id, feature_id) VALUES (?, ?)', m.id, checkId(f, 'feature')))
    ]
  },
  elements: {
    table: 'elements',
    upsert: (e) => {
      const ages: unknown[] = Array.isArray(e.ages) ? e.ages : [];
      const has = (a: Age) => bit(!ages.length || ages.includes(a));
      const merged = opt(e.mergedInto);
      const cannot: unknown[] = Array.isArray(e.cannot) ? e.cannot : [];
      return [
        upsert('elements', ['id', 'name', 'kind_id', 'age_dark', 'age_feudal', 'age_castle', 'age_imperial', 'tells', 'description', 'where_note', 'is_active', 'merged_into_id',
          'subject_id', 'intent', 'is_universal', 'updated_at'],
          [e.id, str(e.name), str(e.kind), has('dark'), has('feudal'), has('castle'), has('imperial'), str(e.tells), str(e.description), str(e.whereNote), bit(e.active !== false && !merged), merged,
            subj(e.subject), intent(e.intent), bit(e.universal), now()]),
        ...placeRows('element_id', e.id, e.where),
        stmt('DELETE FROM civ_cannot WHERE element_id = ?', e.id),
        ...[...new Set(cannot.map(String))].map((c) => stmt('INSERT INTO civ_cannot (civ_id, element_id) VALUES (?, ?)', checkId(c, 'civ'), e.id))
      ];
    }
  },
  strategies: {
    table: 'strategies',
    upsert: (s) => {
      const merged = opt(s.mergedInto);
      const steps: Record<string, unknown>[] = Array.isArray(s.steps) ? s.steps : [];
      return [
        upsert('strategies', ['id', 'name', 'description', 'notes', 'where_note', 'is_active', 'merged_into_id', 'updated_at'],
          [s.id, str(s.name), str(s.description), str(s.notes), str(s.whereNote), bit(s.active !== false && !merged), merged, now()]),
        stmt('DELETE FROM strategy_elements WHERE strategy_id = ?', s.id),
        ...steps.map((st) => stmt('INSERT INTO strategy_elements (strategy_id, step_no, element_id, age, notes, intent, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          s.id, Math.max(1, int(st.step) || 1), checkId(st.el, 'element'), age(st.age), str(st.notes), intent(st.intent), subj(st.subject))),
        ...placeRows('strategy_id', s.id, s.where)
      ];
    }
  }
};
function itemsOf(v: unknown): Item[] | null {
  const items = v && typeof v === 'object' ? (v as { items?: unknown }).items : null;
  return Array.isArray(items) ? (items as Item[]) : null;
}
function defsStatements(type: DefType, data: unknown, before: unknown): Statements {
  const items = itemsOf(data);
  if (!items) throw new BadRequest('Bad list for ' + type);
  const h = DEFS[type];
  const prevItems = itemsOf(before);
  const prev = prevItems ? new Map(prevItems.map((x) => [x.id, x])) : null;
  const A: Stmt[] = [], B: Stmt[] = [];
  (h.order ? h.order(items) : items).forEach((x) => {
    checkId(x && x.id, type);
    if (prev && prev.has(x.id) && stable(prev.get(x.id)) === stable(x)) return;
    A.push(...h.upsert(x, items.indexOf(x)));
  });
  if (prev) {
    const keep = new Set(items.map((x) => x.id));
    [...prev.keys()].filter((id) => !keep.has(id)).reverse().forEach((id) => B.push(stmt(`DELETE FROM ${h.table} WHERE id = ?`, id)));
  }
  return { A, B };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
function settingsStatements(data: unknown): Statements {
  const o = (data && typeof data === 'object' ? data : {}) as Settings;
  return { A: Object.entries(o).map(([k, v]) => stmt('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v == null ? null : v))), B: [] };
}
function tagStatements(id: string, t: Tag | null): Statements {
  if (!t) return { A: [], B: [stmt('DELETE FROM civ_element_tags WHERE id = ?', id)] };
  const p = placeCols(t.place);
  const isPlay = !!t.play;
  return {
    A: [upsert('civ_element_tags',
      ['id', 'civ_id', 'element_id', 'strategy_id', 'age', 'map_type_id', 'feature_id', 'map_id', 'timing_note', 'tells', 'notes', 'last_confirmed_on', 'is_active',
        'intent', 'subject_id', 'created_at', 'updated_at'],
      [id, str(t.civ), isPlay ? null : opt(t.el), isPlay ? opt(t.play) : null, isPlay ? null : age(t.age), p.map_type_id, p.feature_id, p.map_id,
        str(t.timing), str(t.tells), str(t.notes), opt(t.confirmed), bit(t.active !== false),
        isPlay ? null : intent(t.intent), isPlay ? null : subj(t.subject), opt(t.createdAt) || now(), now()],
      ['created_at'])],
    B: []
  };
}
function gameStatements(id: string, g: Game | null, before: Game | null | undefined): Statements {
  if (!g) return { A: [], B: [stmt('DELETE FROM games WHERE id = ?', id)] };
  const A: Stmt[] = [upsert('games',
    ['id', 'is_mine', 'title', 'played_on', 'player_name', 'player_civ_id', 'opponent_name', 'opponent_civ_id', 'map_id', 'result', 'aoe4world_game_id', 'notes', 'created_at'],
    [id, bit(g.mine), str(g.title), opt(g.date), str(g.playerName), opt(g.playerCiv), str(g.oppName), opt(g.oppCiv), opt(g.map),
      oneOf(g.result, ['win', 'loss'] as const), int(g.aoe4worldGameId), str(g.notes), opt(g.createdAt) || now()],
    ['created_at'])];
  const plays = g.plays || [];
  plays.forEach((p, i) => {
    const isPlay = !!p.strategyId;
    const runBy = p.runBy === 'player' ? 'player' : 'opponent';
    A.push(upsert('game_plays',
      ['id', 'game_id', 'position', 'run_by', 'strategy_id', 'element_id', 'age', 'intent', 'subject_id', 'outcome', 'preparedness', 'response_id', 'response_notes', 'notes', 'created_at'],
      [checkId(p.pid, 'game play'), id, i + 1, runBy, isPlay ? opt(p.strategyId) : null, isPlay ? null : opt(p.elementId), isPlay ? null : age(p.age),
        isPlay ? null : intent(p.intent), isPlay ? null : subj(p.subject),
        oneOf(p.outcome, ['worked', 'failed', 'mixed'] as const),
        runBy === 'opponent' ? oneOf(p.prep, ['did_not_see', 'saw_no_plan', 'plan_misexecuted', 'handled'] as const) : null,
        opt(p.answerId), str(p.did), str(p.notes), now()],
      ['created_at']));
  });
  const B: Stmt[] = [];
  const keep = new Set(plays.map((p) => p.pid));
  ((before && before.plays) || []).forEach((p) => { if (!keep.has(p.pid)) B.push(stmt('DELETE FROM game_plays WHERE id = ?', p.pid)); });
  return { A, B };
}
function linkStatements(id: string, l: Link | null, before: Link | null | undefined): Statements {
  if (!l) return { A: [], B: [stmt('DELETE FROM links WHERE id = ?', id)] };
  const kind = l.kind === 'guide' || l.kind === 'game' ? l.kind : l.gameId ? 'game' : 'guide';
  const A: Stmt[] = [upsert('links',
    ['id', 'kind', 'url', 'source', 'title', 'game_id', 'civ_id', 'map_id', 'start_offset_seconds', 'link_status', 'last_checked_on', 'notes', 'created_at'],
    [id, kind, str(l.url), SOURCES.includes(l.source) ? l.source : 'other', str(l.title), opt(l.gameId), opt(l.civ), opt(l.map), int(l.openAt),
      l.status === 'dead' ? 'dead' : 'live', opt(l.checked), str(l.notes), opt(l.createdAt) || now()],
    ['created_at'])];
  const marks = l.marks || [];
  const keep = new Set(marks.map((m) => m.mid));
  ((before && before.marks) || []).forEach((m) => { if (!keep.has(m.mid)) A.push(stmt('DELETE FROM link_marks WHERE id = ?', m.mid)); });
  marks.forEach((m) => {
    const isPlay = !!m.strategyId;
    A.push(upsert('link_marks',
      ['id', 'link_id', 'start_seconds', 'game_play_id', 'civ_id', 'strategy_id', 'element_id', 'age', 'intent', 'subject_id', 'shows', 'notes', 'created_at'],
      [checkId(m.mid, 'moment'), id, int(m.at), opt(m.playId), opt(m.civ), isPlay ? opt(m.strategyId) : null, isPlay ? null : opt(m.elementId), age(m.age),
        isPlay ? null : intent(m.intent), isPlay ? null : subj(m.subject),
        oneOf(m.shows, ['threat', 'response', 'both'] as const), str(m.note), now()],
      ['created_at']));
  });
  return { A, B: [] };
}
function answerStatements(id: string, a: Answer | null): Statements {
  if (!a) return { A: [], B: [stmt('DELETE FROM responses WHERE id = ?', id)] };
  const isPlay = a.target === 'play';
  const p = placeCols(a.place);
  const A: Stmt[] = [upsert('responses',
    ['id', 'strategy_id', 'element_id', 'age', 'my_civ_id', 'opponent_civ_id', 'map_type_id', 'feature_id', 'map_id', 'title', 'plan', 'status', 'notes', 'last_confirmed_on', 'is_active', 'created_at', 'updated_at'],
    [id, isPlay ? opt(a.strategyId) : null, isPlay ? null : opt(a.elementId), isPlay ? null : age(a.age), opt(a.myCiv), opt(a.oppCiv), p.map_type_id, p.feature_id, p.map_id,
      str(a.title) || 'Answer', str(a.plan), oneOf(a.status, ['idea', 'studying', 'practiced', 'proven'] as const) || 'idea', str(a.notes), opt(a.confirmed),
      bit(a.active !== false), opt(a.createdAt) || now(), now()],
    ['created_at']),
  stmt('DELETE FROM response_steps WHERE response_id = ?', id)];
  (a.steps || []).filter((st) => st.answerId || st.note).forEach((st, i) => A.push(stmt('INSERT INTO response_steps (response_id, step_no, element_response_id, note) VALUES (?, ?, ?, ?)', id, i + 1, opt(st.answerId), opt(st.note))));
  return { A, B: [] };
}

// A subject comes from the game data; the page only sets its default intent.
function subjectStatements(id: string, x: Subject | null): Statements {
  if (!x || typeof x !== 'object') throw new BadRequest('Subjects cannot be removed: ' + id);
  return { A: [stmt('UPDATE subjects SET default_intent = ?, updated_at = ? WHERE id = ?', intent(x.defaultIntent), now(), id)], B: [] };
}

// One record write as statements: A runs in write order, B (removals that
// other rows may point at) runs after every A, in reverse write order.
export function docStatements(path: string, data: unknown, before: unknown): Statements {
  const { col, id } = parsePath(path);
  if (col === 'defs') return defsStatements(id as DefType, data, before);
  if (col === 'meta') return settingsStatements(data);
  if (col === 'tags') return tagStatements(id, data as Tag | null);
  if (col === 'games') return gameStatements(id, data as Game | null, before as Game | null);
  if (col === 'links') return linkStatements(id, data as Link | null, before as Link | null);
  if (col === 'subjects') return subjectStatements(id, data as Subject | null);
  return answerStatements(id, data as Answer | null);
}

export function newChangeId(): string {
  return new Date().toISOString().replace(/[^0-9]/g, '') + Math.random().toString(36).slice(2, 6);
}

// A save from the page: the writes, what the page saw before them, and either
// a label (logged for undo) or undoOf (an undo, which removes that log entry).
export function planCommit(body: CommitBody): { statements: Stmt[]; change: { id: string; label: string; at: string } | null } {
  const writes: DocWrite[] | null = body && Array.isArray(body.writes) ? body.writes : null;
  if (!writes || !writes.length || writes.length > 400) throw new BadRequest('Bad request: no writes');
  const beforeList: DocWrite[] = body && Array.isArray(body.before) ? body.before : [];
  const before = new Map(beforeList.map((b) => [b.path, b.data]));
  const A: Stmt[] = [], B: Stmt[] = [];
  writes.forEach((w) => {
    if (String(w.path).startsWith('changes/')) return;
    const r = docStatements(w.path, w.data, before.get(w.path));
    A.push(...r.A);
    B.unshift(...r.B);
  });
  let change: { id: string; label: string; at: string } | null = null;
  const log: Stmt[] = [];
  if (body.undoOf) {
    log.push(stmt('DELETE FROM change_log WHERE id = ?', checkId(body.undoOf, 'change')));
  } else {
    const label = str(body.label).slice(0, 300) || 'Change';
    change = { id: newChangeId(), label, at: now() };
    log.push(stmt('INSERT INTO change_log (id, changed_at, label, before_json, paths) VALUES (?, ?, ?, ?, ?)',
      change.id, change.at, label, JSON.stringify(beforeList.filter((b) => !String(b.path).startsWith('changes/'))), writes.map((w) => w.path).join(' ')));
    log.push(stmt('DELETE FROM change_log WHERE id NOT IN (SELECT id FROM change_log ORDER BY id DESC LIMIT 200)'));
  }
  return { statements: [...A, ...B, ...log], change };
}

// ---------------------------------------------------------------------------
// Loading: every table in one batch, rebuilt into the page's records
// ---------------------------------------------------------------------------
export const STATE_QUERIES = [
  ['civs', 'SELECT * FROM civs ORDER BY rowid'],
  ['mapTypes', 'SELECT * FROM map_types ORDER BY sort_order, rowid'],
  ['features', 'SELECT * FROM map_features ORDER BY sort_order, rowid'],
  ['maps', 'SELECT * FROM maps ORDER BY rowid'],
  ['mapFeatures', 'SELECT map_id, feature_id FROM map_has_feature ORDER BY rowid'],
  ['kinds', 'SELECT * FROM element_kinds ORDER BY sort_order, rowid'],
  ['elements', 'SELECT * FROM elements ORDER BY rowid'],
  ['cannot', 'SELECT civ_id, element_id FROM civ_cannot ORDER BY element_id, civ_id'],
  ['subjects', 'SELECT id, name, kind, min_age, civs, icon, default_intent, is_active FROM subjects ORDER BY kind, name'],
  ['strategies', 'SELECT * FROM strategies ORDER BY rowid'],
  ['steps', 'SELECT * FROM strategy_elements ORDER BY strategy_id, step_no, element_id'],
  ['comesUpOn', 'SELECT * FROM comes_up_on ORDER BY id'],
  ['tags', 'SELECT * FROM civ_element_tags ORDER BY rowid'],
  ['games', 'SELECT * FROM games ORDER BY rowid'],
  ['plays', 'SELECT * FROM game_plays ORDER BY game_id, position'],
  ['links', 'SELECT * FROM links ORDER BY rowid'],
  ['marks', 'SELECT * FROM link_marks ORDER BY rowid'],
  ['answers', 'SELECT * FROM responses ORDER BY rowid'],
  ['answerSteps', 'SELECT * FROM response_steps ORDER BY response_id, step_no'],
  ['settings', 'SELECT * FROM app_settings'],
  ['changes', 'SELECT * FROM change_log ORDER BY id DESC LIMIT 30']
] as const;
export type StateKey = (typeof STATE_QUERIES)[number][0];
export type StateRows = Record<StateKey, Row[]>;

function group(rows: Row[], key: string): Map<unknown, Row[]> {
  const m = new Map<unknown, Row[]>();
  rows.forEach((r) => { const k = r[key]; const list = m.get(k); if (list) list.push(r); else m.set(k, [r]); });
  return m;
}
const s = (v: unknown): string => (v == null ? '' : String(v));
const sn = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const nn = (v: unknown): number | null => (v == null ? null : Number(v));

export function buildState(r: StateRows): StateResponse {
  const where = (rows: Row[]) => rows.map(placeOf);
  const cuoEl = group(r.comesUpOn.filter((x) => x.element_id), 'element_id');
  const cuoSt = group(r.comesUpOn.filter((x) => x.strategy_id), 'strategy_id');
  const feats = group(r.mapFeatures, 'map_id');
  const steps = group(r.steps, 'strategy_id');
  const cannot = group(r.cannot, 'element_id');
  const look = (x: Row): { intent?: Intent; subject?: string } => {
    const o: { intent?: Intent; subject?: string } = {};
    const i = intent(x.intent), sj = sn(x.subject_id);
    if (i) o.intent = i;
    if (sj) o.subject = sj;
    return o;
  };
  const defs: Defs = {
    civs: r.civs.map((c) => ({ id: s(c.id), name: s(c.name), short: s(c.short_name), flag: sn(c.flag_slug), parent: sn(c.parent_civ_id), active: !!c.is_active })),
    mapTypes: r.mapTypes.map((x) => ({ id: s(x.id), name: s(x.name), description: s(x.description), active: !!x.is_active })),
    features: r.features.map((x) => ({ id: s(x.id), name: s(x.name), description: s(x.description), active: !!x.is_active })),
    maps: r.maps.map((m) => ({ id: s(m.id), name: s(m.name), aoe4worldName: sn(m.aoe4world_name), type: s(m.map_type_id), notes: s(m.notes),
      features: (feats.get(m.id) || []).map((f) => s(f.feature_id)), inPool: !!m.in_pool, active: !!m.is_active })),
    kinds: r.kinds.map((x) => ({ id: s(x.id), name: s(x.name), description: s(x.description), active: !!x.is_active })),
    elements: r.elements.map((e) => ({ id: s(e.id), name: s(e.name), kind: s(e.kind_id), ages: AGES.filter((a) => e['age_' + a]), tells: s(e.tells), description: s(e.description),
      where: where(cuoEl.get(e.id) || []), whereNote: s(e.where_note), active: !!e.is_active, mergedInto: sn(e.merged_into_id),
      subject: sn(e.subject_id), intent: intent(e.intent), universal: !!e.is_universal, cannot: (cannot.get(e.id) || []).map((c) => s(c.civ_id)) })),
    strategies: r.strategies.map((st) => ({ id: s(st.id), name: s(st.name), description: s(st.description), notes: s(st.notes),
      steps: (steps.get(st.id) || []).map((x) => ({ el: s(x.element_id), age: age(x.age), step: Number(x.step_no), notes: s(x.notes), ...look(x) })),
      where: where(cuoSt.get(st.id) || []), whereNote: s(st.where_note), active: !!st.is_active, mergedInto: sn(st.merged_into_id) }))
  };
  const tags: StateResponse['tags'] = {};
  r.tags.forEach((t) => {
    tags[s(t.id)] = { civ: s(t.civ_id), el: sn(t.element_id), play: sn(t.strategy_id), age: age(t.age), place: placeOf(t),
      timing: s(t.timing_note), tells: s(t.tells), notes: s(t.notes), confirmed: sn(t.last_confirmed_on), active: !!t.is_active, createdAt: sn(t.created_at), ...look(t) };
  });
  const plays = group(r.plays, 'game_id');
  const games: StateResponse['games'] = {};
  r.games.forEach((g) => {
    games[s(g.id)] = { mine: !!g.is_mine, title: s(g.title), date: sn(g.played_on), playerName: s(g.player_name), playerCiv: sn(g.player_civ_id),
      oppName: s(g.opponent_name), oppCiv: sn(g.opponent_civ_id), map: sn(g.map_id), result: oneOf(g.result, ['win', 'loss'] as const), notes: s(g.notes),
      aoe4worldGameId: nn(g.aoe4world_game_id), createdAt: sn(g.created_at),
      plays: (plays.get(g.id) || []).map((p) => ({ pid: s(p.id), runBy: p.run_by === 'player' ? 'player' : 'opponent', strategyId: sn(p.strategy_id), elementId: sn(p.element_id), age: age(p.age),
        outcome: oneOf(p.outcome, ['worked', 'failed', 'mixed'] as const), prep: oneOf(p.preparedness, ['did_not_see', 'saw_no_plan', 'plan_misexecuted', 'handled'] as const),
        answerId: sn(p.response_id), did: s(p.response_notes), notes: s(p.notes), ...look(p) })) };
  });
  const marks = group(r.marks, 'link_id');
  const links: StateResponse['links'] = {};
  r.links.forEach((l) => {
    links[s(l.id)] = { url: s(l.url), source: (SOURCES.includes(s(l.source)) ? s(l.source) : 'other') as Link['source'], title: s(l.title), gameId: sn(l.game_id),
      kind: l.kind === 'game' ? 'game' : 'guide', civ: sn(l.civ_id), map: sn(l.map_id),
      openAt: nn(l.start_offset_seconds), status: l.link_status === 'dead' ? 'dead' : 'live', checked: sn(l.last_checked_on), notes: s(l.notes), createdAt: sn(l.created_at),
      marks: (marks.get(l.id) || []).map((m) => ({ mid: s(m.id), at: nn(m.start_seconds), playId: sn(m.game_play_id), civ: sn(m.civ_id),
        elementId: sn(m.element_id), strategyId: sn(m.strategy_id), age: age(m.age), shows: oneOf(m.shows, ['threat', 'response', 'both'] as const), note: s(m.notes), ...look(m) })) };
  });
  const asteps = group(r.answerSteps, 'response_id');
  const answers: StateResponse['answers'] = {};
  r.answers.forEach((a) => {
    answers[s(a.id)] = { target: a.strategy_id ? 'play' : 'element', strategyId: sn(a.strategy_id), elementId: sn(a.element_id), age: age(a.age),
      myCiv: sn(a.my_civ_id), oppCiv: sn(a.opponent_civ_id), place: placeOf(a), title: s(a.title), plan: s(a.plan),
      status: oneOf(a.status, ['idea', 'studying', 'practiced', 'proven'] as const) || 'idea', notes: s(a.notes),
      confirmed: sn(a.last_confirmed_on), active: !!a.is_active, createdAt: sn(a.created_at),
      steps: (asteps.get(a.id) || []).map((st) => ({ answerId: sn(st.element_response_id), note: s(st.note) })) };
  });
  const subjects: Record<string, Subject> = {};
  r.subjects.forEach((x) => {
    let civs: string[] | null = null;
    try { civs = x.civs ? (JSON.parse(s(x.civs)) as string[]) : null; } catch { civs = null; }
    subjects[s(x.id)] = { id: s(x.id), name: s(x.name), kind: (oneOf(x.kind, ['unit', 'building', 'landmark', 'technology'] as const) || 'unit') as SubjectKind,
      age: nn(x.min_age), civs, icon: sn(x.icon), defaultIntent: intent(x.default_intent), active: !!x.is_active };
  });
  const settings: Settings = {};
  r.settings.forEach((x) => { try { settings[s(x.key)] = JSON.parse(s(x.value)); } catch { settings[s(x.key)] = x.value; } });
  const changes: Record<string, ChangeEntry> = {};
  r.changes.forEach((c) => {
    let before: DocWrite[] = [];
    try { before = JSON.parse(s(c.before_json)) as DocWrite[]; } catch { before = []; }
    changes[s(c.id)] = { label: s(c.label), at: s(c.changed_at), before };
  });
  return { defs, subjects, tags, games, links, answers, settings, changes };
}

// SQL text with the values written in, for files run by wrangler d1 execute.
export function inlineSql(st: Stmt): string {
  let i = 0;
  return st.sql.replace(/\?/g, () => {
    const v = st.params[i++];
    if (v == null) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  });
}
