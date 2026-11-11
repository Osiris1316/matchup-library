// The page works with documents (one per definition list, tag, game, link and
// answer), the same shapes the preview used. This module maps those documents
// to D1 rows and back. The Worker uses it to save and load; the import script
// uses it to turn a preview download into SQL.

export const DEF_TYPES = ['civs', 'mapTypes', 'features', 'maps', 'kinds', 'elements', 'strategies'];
const COLLECTIONS = ['defs', 'meta', 'tags', 'games', 'links', 'answers'];
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const AGES = ['dark', 'feudal', 'castle', 'imperial'];
const SOURCES = ['youtube', 'twitch_vod', 'twitch_highlight', 'twitch_clip', 'aoe4world', 'own_site', 'other'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const stmt = (sql, ...params) => ({ sql, params });
const now = () => new Date().toISOString();
const str = (v) => (v == null ? '' : String(v));                       // text column, never null
const opt = (v) => (v == null || v === '' ? null : String(v));          // optional text or reference
const bit = (v) => (v ? 1 : 0);
const age = (v) => (AGES.includes(v) ? v : null);
const int = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
function checkId(id, what) {
  if (!ID_RE.test(String(id || ''))) throw new Error('Bad id for ' + what + ': ' + id);
  return String(id);
}
function placeCols(p) {
  const k = p && p.kind;
  return {
    map_type_id: k === 'type' ? opt(p.id) : null,
    feature_id: k === 'feature' ? opt(p.id) : null,
    map_id: k === 'map' ? opt(p.id) : null
  };
}
function placeOf(r) {
  if (r.map_type_id) return { kind: 'type', id: r.map_type_id };
  if (r.feature_id) return { kind: 'feature', id: r.feature_id };
  if (r.map_id) return { kind: 'map', id: r.map_id };
  return { kind: 'any' };
}
// Key order does not matter when deciding whether an item changed.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function upsert(table, cols, values, keep) {
  const updates = cols.filter((c) => c !== 'id' && !(keep || []).includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
  return stmt(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates}`, ...values);
}
export function parsePath(path) {
  const parts = String(path || '').split('/');
  const [col, id] = parts;
  if (parts.length !== 2 || !COLLECTIONS.includes(col)) throw new Error('Bad path: ' + path);
  checkId(id, col);
  if (col === 'defs' && !DEF_TYPES.includes(id)) throw new Error('Bad path: ' + path);
  if (col === 'meta' && id !== 'settings') throw new Error('Bad path: ' + path);
  return { col, id };
}

// ---------------------------------------------------------------------------
// Definition lists. A list is saved item by item: only items that differ
// from what the page saw before are written, and items that left the list
// (an undone "add") are deleted.
// ---------------------------------------------------------------------------
function placeRows(field, id, where) {
  const out = [stmt(`DELETE FROM comes_up_on WHERE ${field} = ?`, id)];
  const seen = new Set();
  (where || []).forEach((p) => {
    const c = placeCols(p);
    const key = (p && p.kind) + ':' + (p && p.id);
    if (seen.has(key) || (!c.map_type_id && !c.feature_id && !c.map_id)) return;
    seen.add(key);
    out.push(stmt(`INSERT INTO comes_up_on (${field}, map_type_id, feature_id, map_id) VALUES (?, ?, ?, ?)`, id, c.map_type_id, c.feature_id, c.map_id));
  });
  return out;
}
const DEFS = {
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
      ...[...new Set(m.features || [])].map((f) => stmt('INSERT INTO map_has_feature (map_id, feature_id) VALUES (?, ?)', m.id, checkId(f, 'feature')))
    ]
  },
  elements: {
    table: 'elements',
    upsert: (e) => {
      const has = (a) => bit(!(e.ages && e.ages.length) || e.ages.includes(a));
      const merged = opt(e.mergedInto);
      return [
        upsert('elements', ['id', 'name', 'kind_id', 'age_dark', 'age_feudal', 'age_castle', 'age_imperial', 'tells', 'description', 'where_note', 'is_active', 'merged_into_id', 'updated_at'],
          [e.id, str(e.name), str(e.kind), has('dark'), has('feudal'), has('castle'), has('imperial'), str(e.tells), str(e.description), str(e.whereNote), bit(e.active !== false && !merged), merged, now()]),
        ...placeRows('element_id', e.id, e.where)
      ];
    }
  },
  strategies: {
    table: 'strategies',
    upsert: (s) => {
      const merged = opt(s.mergedInto);
      return [
        upsert('strategies', ['id', 'name', 'description', 'notes', 'where_note', 'is_active', 'merged_into_id', 'updated_at'],
          [s.id, str(s.name), str(s.description), str(s.notes), str(s.whereNote), bit(s.active !== false && !merged), merged, now()]),
        stmt('DELETE FROM strategy_elements WHERE strategy_id = ?', s.id),
        ...(s.steps || []).map((st) => stmt('INSERT INTO strategy_elements (strategy_id, step_no, element_id, age, notes) VALUES (?, ?, ?, ?, ?)',
          s.id, Math.max(1, int(st.step) || 1), checkId(st.el, 'element'), age(st.age), str(st.notes))),
        ...placeRows('strategy_id', s.id, s.where)
      ];
    }
  }
};
function defsStatements(type, data, before) {
  if (!data || !Array.isArray(data.items)) throw new Error('Bad list for ' + type);
  const h = DEFS[type];
  const items = data.items;
  const prev = before && Array.isArray(before.items) ? new Map(before.items.map((x) => [x.id, x])) : null;
  const A = [], B = [];
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
function settingsStatements(data) {
  return { A: Object.entries(data || {}).map(([k, v]) => stmt('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v == null ? null : v))), B: [] };
}
function tagStatements(id, t) {
  if (!t) return { A: [], B: [stmt('DELETE FROM civ_element_tags WHERE id = ?', id)] };
  const p = placeCols(t.place);
  const isPlay = !!t.play;
  return {
    A: [upsert('civ_element_tags',
      ['id', 'civ_id', 'element_id', 'strategy_id', 'age', 'map_type_id', 'feature_id', 'map_id', 'timing_note', 'tells', 'notes', 'last_confirmed_on', 'is_active', 'created_at', 'updated_at'],
      [id, str(t.civ), isPlay ? null : opt(t.el), isPlay ? opt(t.play) : null, isPlay ? null : age(t.age), p.map_type_id, p.feature_id, p.map_id,
        str(t.timing), str(t.tells), str(t.notes), opt(t.confirmed), bit(t.active !== false), opt(t.createdAt) || now(), now()],
      ['created_at'])],
    B: []
  };
}
function gameStatements(id, g, before) {
  if (!g) return { A: [], B: [stmt('DELETE FROM games WHERE id = ?', id)] };
  const A = [upsert('games',
    ['id', 'is_mine', 'title', 'played_on', 'player_name', 'player_civ_id', 'opponent_name', 'opponent_civ_id', 'map_id', 'result', 'aoe4world_game_id', 'notes', 'created_at'],
    [id, bit(g.mine), str(g.title), opt(g.date), str(g.playerName), opt(g.playerCiv), str(g.oppName), opt(g.oppCiv), opt(g.map),
      g.result === 'win' || g.result === 'loss' ? g.result : null, int(g.aoe4worldGameId), str(g.notes), opt(g.createdAt) || now()],
    ['created_at'])];
  const plays = g.plays || [];
  plays.forEach((p, i) => {
    const isPlay = !!p.strategyId;
    const runBy = p.runBy === 'player' ? 'player' : 'opponent';
    A.push(upsert('game_plays',
      ['id', 'game_id', 'position', 'run_by', 'strategy_id', 'element_id', 'age', 'outcome', 'preparedness', 'response_id', 'response_notes', 'notes', 'created_at'],
      [checkId(p.pid, 'game play'), id, i + 1, runBy, isPlay ? opt(p.strategyId) : null, isPlay ? null : opt(p.elementId), isPlay ? null : age(p.age),
        ['worked', 'failed', 'mixed'].includes(p.outcome) ? p.outcome : null,
        runBy === 'opponent' && ['did_not_see', 'saw_no_plan', 'plan_misexecuted', 'handled'].includes(p.prep) ? p.prep : null,
        opt(p.answerId), str(p.did), str(p.notes), now()],
      ['created_at']));
  });
  const B = [];
  const keep = new Set(plays.map((p) => p.pid));
  ((before && before.plays) || []).forEach((p) => { if (!keep.has(p.pid)) B.push(stmt('DELETE FROM game_plays WHERE id = ?', p.pid)); });
  return { A, B };
}
function linkStatements(id, l, before) {
  if (!l) return { A: [], B: [stmt('DELETE FROM links WHERE id = ?', id)] };
  const kind = l.kind === 'guide' || l.kind === 'game' ? l.kind : l.gameId ? 'game' : 'guide';
  const A = [upsert('links',
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
      ['id', 'link_id', 'start_seconds', 'game_play_id', 'civ_id', 'strategy_id', 'element_id', 'age', 'shows', 'notes', 'created_at'],
      [checkId(m.mid, 'moment'), id, int(m.at), opt(m.playId), opt(m.civ), isPlay ? opt(m.strategyId) : null, isPlay ? null : opt(m.elementId), age(m.age),
        ['threat', 'response', 'both'].includes(m.shows) ? m.shows : null, str(m.note), now()],
      ['created_at']));
  });
  return { A, B: [] };
}
function answerStatements(id, a) {
  if (!a) return { A: [], B: [stmt('DELETE FROM responses WHERE id = ?', id)] };
  const isPlay = a.target === 'play';
  const p = placeCols(a.place);
  const A = [upsert('responses',
    ['id', 'strategy_id', 'element_id', 'age', 'my_civ_id', 'opponent_civ_id', 'map_type_id', 'feature_id', 'map_id', 'title', 'plan', 'status', 'notes', 'last_confirmed_on', 'is_active', 'created_at', 'updated_at'],
    [id, isPlay ? opt(a.strategyId) : null, isPlay ? null : opt(a.elementId), isPlay ? null : age(a.age), opt(a.myCiv), opt(a.oppCiv), p.map_type_id, p.feature_id, p.map_id,
      str(a.title) || 'Answer', str(a.plan), ['idea', 'studying', 'practiced', 'proven'].includes(a.status) ? a.status : 'idea', str(a.notes), opt(a.confirmed),
      bit(a.active !== false), opt(a.createdAt) || now(), now()],
    ['created_at']),
  stmt('DELETE FROM response_steps WHERE response_id = ?', id)];
  (a.steps || []).filter((st) => st.answerId || st.note).forEach((st, i) => A.push(stmt('INSERT INTO response_steps (response_id, step_no, element_response_id, note) VALUES (?, ?, ?, ?)', id, i + 1, opt(st.answerId), opt(st.note))));
  return { A, B: [] };
}

// One document write as statements: A runs in write order, B (removals that
// other rows may point at) runs after every A, in reverse write order.
export function docStatements(path, data, before) {
  const { col, id } = parsePath(path);
  if (col === 'defs') return defsStatements(id, data, before);
  if (col === 'meta') return settingsStatements(data);
  if (col === 'tags') return tagStatements(id, data);
  if (col === 'games') return gameStatements(id, data, before);
  if (col === 'links') return linkStatements(id, data, before);
  return answerStatements(id, data);
}

export function newChangeId() {
  return new Date().toISOString().replace(/[^0-9]/g, '') + Math.random().toString(36).slice(2, 6);
}

// A save from the page: the writes, what the page saw before them, and either
// a label (logged for undo) or undoOf (an undo, which removes that log entry).
export function planCommit(body) {
  const writes = body && Array.isArray(body.writes) ? body.writes : null;
  if (!writes || !writes.length || writes.length > 400) throw new Error('Bad request: no writes');
  const before = new Map(((body && body.before) || []).map((b) => [b.path, b.data]));
  const A = [], B = [];
  writes.forEach((w) => {
    if (String(w.path).startsWith('changes/')) return;
    const r = docStatements(w.path, w.data, before.get(w.path));
    A.push(...r.A);
    B.unshift(...r.B);
  });
  let change = null;
  const log = [];
  if (body.undoOf) {
    log.push(stmt('DELETE FROM change_log WHERE id = ?', checkId(body.undoOf, 'change')));
  } else {
    const label = str(body.label).slice(0, 300) || 'Change';
    change = { id: newChangeId(), label, at: now() };
    log.push(stmt('INSERT INTO change_log (id, changed_at, label, before_json, paths) VALUES (?, ?, ?, ?, ?)',
      change.id, change.at, label, JSON.stringify((body.before || []).filter((b) => !String(b.path).startsWith('changes/'))), writes.map((w) => w.path).join(' ')));
    log.push(stmt('DELETE FROM change_log WHERE id NOT IN (SELECT id FROM change_log ORDER BY id DESC LIMIT 200)'));
  }
  return { statements: [...A, ...B, ...log], change };
}

// ---------------------------------------------------------------------------
// Loading: every table in one batch, rebuilt into the page's documents
// ---------------------------------------------------------------------------
export const STATE_QUERIES = [
  ['civs', 'SELECT * FROM civs ORDER BY rowid'],
  ['mapTypes', 'SELECT * FROM map_types ORDER BY sort_order, rowid'],
  ['features', 'SELECT * FROM map_features ORDER BY sort_order, rowid'],
  ['maps', 'SELECT * FROM maps ORDER BY rowid'],
  ['mapFeatures', 'SELECT map_id, feature_id FROM map_has_feature ORDER BY rowid'],
  ['kinds', 'SELECT * FROM element_kinds ORDER BY sort_order, rowid'],
  ['elements', 'SELECT * FROM elements ORDER BY rowid'],
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
];
function group(rows, key) {
  const m = new Map();
  rows.forEach((r) => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}
export function buildState(r) {
  const where = (rows) => rows.map(placeOf);
  const cuoEl = group(r.comesUpOn.filter((x) => x.element_id), 'element_id');
  const cuoSt = group(r.comesUpOn.filter((x) => x.strategy_id), 'strategy_id');
  const feats = group(r.mapFeatures, 'map_id');
  const steps = group(r.steps, 'strategy_id');
  const defs = {
    civs: r.civs.map((c) => ({ id: c.id, name: c.name, short: c.short_name || '', flag: c.flag_slug || null, parent: c.parent_civ_id || null, active: !!c.is_active })),
    mapTypes: r.mapTypes.map((x) => ({ id: x.id, name: x.name, description: x.description || '', active: !!x.is_active })),
    features: r.features.map((x) => ({ id: x.id, name: x.name, description: x.description || '', active: !!x.is_active })),
    maps: r.maps.map((m) => ({ id: m.id, name: m.name, aoe4worldName: m.aoe4world_name || null, type: m.map_type_id, notes: m.notes || '', features: (feats.get(m.id) || []).map((f) => f.feature_id), inPool: !!m.in_pool, active: !!m.is_active })),
    kinds: r.kinds.map((x) => ({ id: x.id, name: x.name, description: x.description || '', active: !!x.is_active })),
    elements: r.elements.map((e) => ({ id: e.id, name: e.name, kind: e.kind_id, ages: AGES.filter((a) => e['age_' + a]), tells: e.tells || '', description: e.description || '',
      where: where(cuoEl.get(e.id) || []), whereNote: e.where_note || '', active: !!e.is_active, mergedInto: e.merged_into_id || null })),
    strategies: r.strategies.map((s) => ({ id: s.id, name: s.name, description: s.description || '', notes: s.notes || '',
      steps: (steps.get(s.id) || []).map((st) => ({ el: st.element_id, age: st.age || null, step: st.step_no, notes: st.notes || '' })),
      where: where(cuoSt.get(s.id) || []), whereNote: s.where_note || '', active: !!s.is_active, mergedInto: s.merged_into_id || null }))
  };
  const tags = {};
  r.tags.forEach((t) => {
    tags[t.id] = { civ: t.civ_id, el: t.element_id || null, play: t.strategy_id || null, age: t.age || null, place: placeOf(t),
      timing: t.timing_note || '', tells: t.tells || '', notes: t.notes || '', confirmed: t.last_confirmed_on || null, active: !!t.is_active, createdAt: t.created_at };
  });
  const plays = group(r.plays, 'game_id');
  const games = {};
  r.games.forEach((g) => {
    games[g.id] = { mine: !!g.is_mine, title: g.title || '', date: g.played_on || null, playerName: g.player_name || '', playerCiv: g.player_civ_id || null,
      oppName: g.opponent_name || '', oppCiv: g.opponent_civ_id || null, map: g.map_id || null, result: g.result || null, notes: g.notes || '',
      aoe4worldGameId: g.aoe4world_game_id == null ? null : g.aoe4world_game_id, createdAt: g.created_at,
      plays: (plays.get(g.id) || []).map((p) => ({ pid: p.id, runBy: p.run_by, strategyId: p.strategy_id || null, elementId: p.element_id || null, age: p.age || null,
        outcome: p.outcome || null, prep: p.preparedness || null, answerId: p.response_id || null, did: p.response_notes || '', notes: p.notes || '' })) };
  });
  const marks = group(r.marks, 'link_id');
  const links = {};
  r.links.forEach((l) => {
    links[l.id] = { url: l.url, source: l.source, title: l.title || '', gameId: l.game_id || null, kind: l.kind, civ: l.civ_id || null, map: l.map_id || null,
      openAt: l.start_offset_seconds == null ? null : l.start_offset_seconds, status: l.link_status, checked: l.last_checked_on || null, notes: l.notes || '', createdAt: l.created_at,
      marks: (marks.get(l.id) || []).map((m) => ({ mid: m.id, at: m.start_seconds == null ? null : m.start_seconds, playId: m.game_play_id || null, civ: m.civ_id || null,
        elementId: m.element_id || null, strategyId: m.strategy_id || null, age: m.age || null, shows: m.shows || null, note: m.notes || '' })) };
  });
  const asteps = group(r.answerSteps, 'response_id');
  const answers = {};
  r.answers.forEach((a) => {
    answers[a.id] = { target: a.strategy_id ? 'play' : 'element', strategyId: a.strategy_id || null, elementId: a.element_id || null, age: a.age || null,
      myCiv: a.my_civ_id || null, oppCiv: a.opponent_civ_id || null, place: placeOf(a), title: a.title, plan: a.plan || '', status: a.status, notes: a.notes || '',
      confirmed: a.last_confirmed_on || null, active: !!a.is_active, createdAt: a.created_at,
      steps: (asteps.get(a.id) || []).map((st) => ({ answerId: st.element_response_id || null, note: st.note || '' })) };
  });
  const settings = {};
  r.settings.forEach((s) => { try { settings[s.key] = JSON.parse(s.value); } catch (e) { settings[s.key] = s.value; } });
  const changes = {};
  r.changes.forEach((c) => {
    let before = [];
    try { before = JSON.parse(c.before_json); } catch (e) { before = []; }
    changes[c.id] = { label: c.label, at: c.changed_at, before };
  });
  return { defs, tags, games, links, answers, settings, changes };
}

// SQL text with the values written in, for files run by wrangler d1 execute.
export function inlineSql(s) {
  let i = 0;
  return s.sql.replace(/\?/g, () => {
    const v = s.params[i++];
    if (v == null) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  });
}
