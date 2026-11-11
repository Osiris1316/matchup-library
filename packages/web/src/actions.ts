// What the buttons do: open sheets with drafts, and turn saved drafts into
// record writes. Each save is one commit, so it can be undone in one step.
import {
  AGES, aoe4worldId, builderToSteps, clone, detectSource, guideTitle, isActive, newId, newTag, normalizeUrl, openAtFrom,
  parsePlace, parseTime, placeKey, plural, safeUrl, slug, stepsToBuilder, tagField, tagKey, tagKeyOf, tagTargetId, timed,
  fmtTime, type Age, type BuilderRow, type DefType, type DocWrite, type Element, type Game, type GamePlay, type ItemKind,
  type Link, type Mark, type Place, type Strategy, type Tag
} from '@matchup-library/core';
import { commit } from './api/client';
import {
  L, S, emit, nextSid, openSheet, savePrefs, showToast,
  type DefDraft, type DefSheet, type MomentDraft, type PlaceDraft, type RefDraft, type RefKind, type Sheet
} from './store';

export const DEF_WORD: Record<DefType, string> = { elements: 'element', strategies: 'play', kinds: 'kind', features: 'map feature', maps: 'map', mapTypes: 'map type', civs: 'civ' };
type Item = { id: string; name: string; active: boolean };
const listOf = (t: DefType): Item[] => S.data.defs[t] as Item[];
const findDef = (t: DefType, id: string | null | undefined): Item | null => listOf(t).find((x) => x.id === id) || null;

export function toPlace(p: PlaceDraft): Place | null {
  if (p.kind === 'any') return { kind: 'any' };
  return p.id ? { kind: p.kind, id: p.id } : null;
}
const draftOf = (p: Place | null | undefined): PlaceDraft => (p && p.kind !== 'any' ? { kind: p.kind, id: p.id } : { kind: 'any', id: null });
export const setPlaceKind = (owner: { place: PlaceDraft }, k: PlaceDraft['kind']): void => {
  if (owner.place.kind === k) return;
  owner.place = k === 'any' ? { kind: 'any', id: null } : { kind: k, id: L.firstIdFor(k) };
  emit();
};

// ---------------------------------------------------------------------------
// References in the address bar
// ---------------------------------------------------------------------------
export type RefCtx = { kind: 'game'; id: string; g: Game } | { kind: 'guide'; id: string; l: Link };
export function refFromView(): RefCtx | null {
  if (S.view.startsWith('ref-game-')) { const id = S.view.slice(9); const g = S.data.games[id]; return g ? { kind: 'game', id, g } : null; }
  if (S.view.startsWith('ref-guide-')) { const id = S.view.slice(10); const l = S.data.links[id]; return l && !l.gameId ? { kind: 'guide', id, l } : null; }
  return null;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
type TagOpen = { tagId: string } | { civ: string; field: ItemKind; id: string; place: Place | PlaceDraft };
export function openTagSheet(opts: TagOpen, back?: Sheet | null): void {
  if ('tagId' in opts) {
    const t = S.data.tags[opts.tagId];
    if (!t) return;
    openSheet({ kind: 'tag', back: back || null, draft: { tagId: opts.tagId, civ: t.civ, field: tagField(t), target: tagTargetId(t), place: draftOf(t.place), age: t.age || null, timing: t.timing || '', tells: t.tells || '', notes: t.notes || '' } });
    return;
  }
  const place: PlaceDraft = opts.place.kind !== 'any' && opts.place.id ? { kind: opts.place.kind, id: opts.place.id } : { kind: 'any', id: null };
  const same = L.activeTags().find((t) => tagKey(t) === tagKeyOf(opts.civ, opts.field, opts.id, null, toPlace(place) || { kind: 'any' }));
  if (same) { openTagSheet({ tagId: same.id }, back); return; }
  openSheet({ kind: 'tag', back: back || null, draft: { tagId: null, civ: opts.civ, field: opts.field, target: opts.id, place, age: null, timing: '', tells: '', notes: '' } });
}

export async function saveTag(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'tag') return;
  const d = sh.draft;
  const place = toPlace(d.place);
  if (!place) { showToast('Pick where it applies first.', true); return; }
  const age = d.field === 'el' ? d.age || null : null;
  const myKey = tagKeyOf(d.civ, d.field, d.target, age, place);
  const same = L.allTags().find((t) => t.id !== d.tagId && tagKey(t) === myKey);
  const fields = { timing: d.timing.trim(), tells: d.tells.trim(), notes: d.notes.trim() };
  const name = d.field === 'el' ? L.elName(d.target) : L.playTitle(d.target);
  if (same && same.active !== false) { showToast('That tag already exists, so it is open now.', true); openTagSheet({ tagId: same.id }, sh.back); return; }
  const writes: DocWrite[] = [];
  if (same) {
    const old = S.data.tags[same.id] as Tag;
    writes.push({ path: 'tags/' + same.id, data: { ...clone(old), active: true, timing: fields.timing || old.timing || '', tells: fields.tells || old.tells || '', notes: fields.notes || old.notes || '' } });
    if (d.tagId) writes.push({ path: 'tags/' + d.tagId, data: { ...clone(S.data.tags[d.tagId] as Tag), active: false } });
  } else {
    const prev = d.tagId ? S.data.tags[d.tagId] : null;
    const base = prev ? clone(prev) : newTag(d.civ, d.field, d.target, place);
    writes.push({ path: 'tags/' + (d.tagId || newId()), data: { ...base, place, age, ...fields, active: true } });
  }
  S.sheet = sh.back || null;
  await commit(d.tagId ? 'Edited the ' + L.civName(d.civ) + ' ' + name + ' tag' : 'Tagged ' + L.civName(d.civ) + ' with ' + name + ' ' + L.placePhrase(place), writes,
    same ? 'There was a retired tag for exactly this, so it is back, with its old notes.' : null);
}

export async function retireTagFromSheet(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'tag') return;
  const d = sh.draft;
  S.sheet = sh.back || null;
  if (!d.tagId) { emit(); return; }
  const t = S.data.tags[d.tagId];
  if (!t) { emit(); return; }
  await commit('Retired the ' + L.civName(t.civ) + ' ' + L.tagTargetName(t) + ' tag', [{ path: 'tags/' + d.tagId, data: { ...clone(t), active: false } }], 'Tag retired. It waits under Retired tags on the civ page.');
}

export async function restoreTag(id: string): Promise<void> {
  const t = S.data.tags[id];
  if (!t) return;
  await commit('Restored the ' + L.civName(t.civ) + ' ' + L.tagTargetName(t) + ' tag', [{ path: 'tags/' + id, data: { ...clone(t), active: true } }]);
}

export function openBulk(civ: string): void {
  openSheet({ kind: 'bulk', draft: { civ, seg: 'el', place: { kind: 'any', id: null }, pickedEl: [], pickedPlay: [] } });
}

export async function saveBulk(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'bulk') return;
  const d = sh.draft;
  const isEl = d.seg === 'el';
  const place = toPlace(d.place);
  if (!place) { showToast('Pick where it applies first.', true); return; }
  const picked = isEl ? d.pickedEl : d.pickedPlay;
  const writes: DocWrite[] = [];
  picked.forEach((id) => {
    const twin = L.allTags().find((t) => tagKey(t) === tagKeyOf(d.civ, d.seg, id, null, place));
    if (twin && twin.active !== false) return;
    if (twin) writes.push({ path: 'tags/' + twin.id, data: { ...clone(S.data.tags[twin.id] as Tag), active: true } });
    else writes.push({ path: 'tags/' + newId(), data: newTag(d.civ, d.seg, id, place) });
  });
  if (!writes.length) { showToast('Everything ticked is already tagged here.', true); return; }
  S.sheet = null;
  await commit('Tagged ' + L.civName(d.civ) + ' with ' + plural(writes.length, isEl ? 'element' : 'play') + ' ' + L.placePhrase(place), writes);
}

// A variant starts from its base civ's tags. A tag the variant already has,
// even a retired one, isn't copied again; a retired one comes back instead.
export async function copyFromParent(cid: string): Promise<void> {
  const c = L.civ(cid);
  if (!c || !c.parent) return;
  const parent = c.parent;
  const own = new Map(L.allTags().filter((t) => t.civ === cid).map((t) => [tagKey({ ...t, civ: '' }), t] as const));
  const writes: DocWrite[] = [];
  L.activeTags().filter((t) => t.civ === parent).forEach((t) => {
    const twin = own.get(tagKey({ ...t, civ: '' }));
    if (twin && twin.active !== false) return;
    if (twin) {
      const old = S.data.tags[twin.id] as Tag;
      writes.push({ path: 'tags/' + twin.id, data: { ...clone(old), active: true, timing: old.timing || t.timing || '', tells: old.tells || t.tells || '', notes: old.notes || t.notes || '' } });
      return;
    }
    writes.push({ path: 'tags/' + newId(), data: { ...newTag(cid, tagField(t), tagTargetId(t), t.place), age: t.age || null, timing: t.timing || '', tells: t.tells || '', notes: t.notes || '', copiedFrom: t.id } });
  });
  if (!writes.length) { showToast('Nothing new to copy.', true); return; }
  S.sheet = null;
  await commit('Copied ' + plural(writes.length, 'tag') + ' from ' + L.civName(parent) + ' to ' + c.name, writes);
}

// ---------------------------------------------------------------------------
// Definitions: elements, plays, kinds, features, maps, map types, civs
// ---------------------------------------------------------------------------
const civOnFor = (field: ItemKind, id: string): string[] => [...new Set(L.activeTags().filter((t) => t[field] === id && placeKey(t.place) === 'any:').map((t) => t.civ))];
function blankDraft(): DefDraft {
  return { name: '', description: '', kind: '', ages: AGES.slice(), tells: '', builder: [], where: [], whereNote: '', civOn: [], mapsOn: [], type: '', features: [], inPool: true, notes: '', short: '', parent: '' };
}
export function openDef(type: DefType, id: string | null): void {
  const d = blankDraft();
  const D = S.data.defs;
  if (type === 'elements') {
    const it = D.elements.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, kind: it.kind || '', ages: L.elAges(it.id).slice(), description: it.description || '', tells: it.tells || '', where: clone(it.where || []), whereNote: it.whereNote || '', civOn: civOnFor('el', it.id) });
    else d.kind = (D.kinds.find(isActive) || { id: '' }).id;
  } else if (type === 'strategies') {
    const it = D.strategies.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, description: it.description || '', builder: stepsToBuilder(it.steps), where: clone(it.where || []), whereNote: it.whereNote || '', civOn: civOnFor('play', it.id) });
  } else if (type === 'features') {
    const it = D.features.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, description: it.description || '', mapsOn: D.maps.filter((m) => (m.features || []).includes(it.id)).map((m) => m.id) });
  } else if (type === 'maps') {
    const it = D.maps.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, type: it.type, features: (it.features || []).slice(), inPool: it.inPool !== false, notes: it.notes || '' });
    else d.type = (L.activeTypes()[0] || { id: '' }).id;
  } else if (type === 'civs') {
    const it = D.civs.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, short: it.short || '', parent: it.parent || '' });
  } else {
    const it = findDef(type, id) as (Item & { description?: string }) | null;
    if (it) Object.assign(d, { name: it.name, description: it.description || '' });
  }
  const it = findDef(type, id);
  openSheet({ kind: 'def', type, id: it ? it.id : null, draft: d, picking: false });
}

function civTagWrites(field: ItemKind, id: string, civOn: string[]): { writes: DocWrite[]; on: number; off: number } {
  const writes: DocWrite[] = [];
  let on = 0, off = 0;
  const anyTags = L.allTags().filter((t) => t[field] === id && placeKey(t.place) === 'any:');
  L.activeCivs().forEach((c) => {
    const mine = anyTags.filter((t) => t.civ === c.id);
    const live = mine.filter((t) => t.active !== false);
    const want = civOn.includes(c.id);
    if (want && !live.length) {
      const retired = mine.find((t) => !t.age);
      if (retired) writes.push({ path: 'tags/' + retired.id, data: { ...clone(S.data.tags[retired.id] as Tag), active: true } });
      else writes.push({ path: 'tags/' + newId(), data: newTag(c.id, field, id, { kind: 'any' }) });
      on += 1;
    } else if (!want && live.length) {
      live.forEach((t) => writes.push({ path: 'tags/' + t.id, data: { ...clone(S.data.tags[t.id] as Tag), active: false } }));
      off += 1;
    }
  });
  return { writes, on, off };
}

export async function saveDef(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'def') return;
  const d = sh.draft, t = sh.type;
  const word = DEF_WORD[t];
  const name = (d.name || '').trim();
  if (!name) { showToast('Give it a name first.', true); return; }
  const items = clone(listOf(t)) as (Item & Record<string, unknown>)[];
  const dup = items.find((x) => x.id !== sh.id && x.name.toLowerCase() === name.toLowerCase());
  if (dup) { showToast(isActive(dup) ? 'There is already a ' + word + ' with that name.' : 'A retired ' + word + ' has that name. Restore it instead.', true); return; }
  let id = sh.id;
  if (!id) {
    const sep = t === 'maps' ? '-' : '_';
    const base = t === 'maps' ? slug(name).replace(/_/g, '-') : slug(name);
    let next = base, n = 2;
    while (items.some((x) => x.id === next)) { next = base + sep + n; n += 1; }
    id = next;
  }
  const prev = sh.id ? findDef(t, sh.id) : null;
  const item: Item & Record<string, unknown> = prev ? clone(prev) : { id, name, active: true };
  item.name = name;
  const extra: DocWrite[] = [];
  let tagNote = '';
  if (t === 'elements' || t === 'strategies') {
    if (t === 'elements') Object.assign(item, { kind: d.kind, ages: AGES.filter((a) => d.ages.includes(a)), description: d.description.trim(), tells: d.tells.trim() });
    else {
      const steps = builderToSteps(d.builder);
      if (!steps.length) { showToast('Add at least one element to the play.', true); return; }
      const sig = L.signature(steps);
      const twin = S.data.defs.strategies.find((s) => s.id !== sh.id && isActive(s) && L.signature(s.steps) === sig);
      if (twin) { showToast('Same steps as ' + twin.name + '. Edit that play instead, or change the steps.', true); return; }
      const p = prev as Strategy | null;
      const oldNotes: Record<string, string> = {};
      (p ? p.steps : []).forEach((s) => { oldNotes[s.el + '@' + s.step] = s.notes; });
      Object.assign(item, { description: d.description.trim(), steps: steps.map((s) => ({ ...s, notes: oldNotes[s.el + '@' + s.step] || '' })), notes: p ? p.notes || '' : '', mergedInto: p ? p.mergedInto || null : null });
    }
    item.where = d.where;
    item.whereNote = d.where.length ? d.whereNote.trim() : '';
    const r = civTagWrites(t === 'elements' ? 'el' : 'play', id, d.civOn);
    extra.push(...r.writes);
    if (r.on || r.off) tagNote = ' ' + [r.on ? 'Tagged ' + plural(r.on, 'civ') : '', r.off ? (r.on ? 'untagged ' : 'Untagged ') + plural(r.off, 'civ') : ''].filter(Boolean).join(', ') + '.';
  } else if (t === 'features') {
    item.description = d.description.trim();
    const maps = clone(S.data.defs.maps);
    let changed = false;
    maps.forEach((m) => {
      const want = d.mapsOn.includes(m.id);
      const has = (m.features || []).includes(id as string);
      if (want && !has) { m.features = [...(m.features || []), id as string]; changed = true; }
      if (!want && has) { m.features = m.features.filter((f) => f !== id); changed = true; }
    });
    if (changed) extra.push({ path: 'defs/maps', data: { items: maps } });
  } else if (t === 'maps') {
    Object.assign(item, { type: d.type, features: d.features, inPool: !!d.inPool, notes: d.notes.trim() });
  } else if (t === 'civs') {
    Object.assign(item, { short: d.short.trim(), parent: d.parent || null });
  } else {
    item.description = d.description.trim();
  }
  const next = prev ? items.map((x) => (x.id === id ? item : x)) : [...items, item];
  S.sheet = null;
  await commit((prev ? 'Edited ' : 'Added ') + name, [{ path: 'defs/' + t, data: { items: next } }, ...extra], (prev ? 'Saved ' : 'Added ') + name + '.' + tagNote);
}

export async function toggleDefActive(type: DefType, id: string): Promise<void> {
  const it = findDef(type, id);
  if (!it) return;
  const on = !isActive(it);
  const items = clone(listOf(type)).map((x) => (x.id === id ? { ...x, active: on } : x));
  S.sheet = null;
  await commit((on ? 'Restored ' : 'Retired ') + it.name, [{ path: 'defs/' + type, data: { items } }], on ? null : 'Retired ' + it.name + '. Show retired to bring it back.');
}

// The element list for "Add element": active elements, grouped by kind.
export function elementGroups(): { name: string; items: Element[] }[] {
  const els = S.data.defs.elements.filter(isActive);
  const groups = S.data.defs.kinds.filter(isActive).map((k) => ({ name: k.name, items: els.filter((e) => e.kind === k.id) }));
  groups.push({ name: 'Other', items: els.filter((e) => !isActive(L.kind(e.kind))) });
  return groups.filter((g) => g.items.length).map((g) => ({ ...g, items: g.items.slice().sort((a, b) => a.name.localeCompare(b.name)) }));
}
export function addStep(builder: BuilderRow[], elId: string): void {
  const ages = L.elAges(elId);
  const prev = builder[builder.length - 1];
  let age: Age | null = null;
  if (ages.length === 1) age = ages[0] as Age; else if (prev && prev.age && ages.includes(prev.age)) age = prev.age;
  builder.push({ el: elId, age, join: false });
}
export function cycleAge(row: BuilderRow): void {
  const opts: (Age | null)[] = [null, ...L.elAges(row.el)];
  row.age = opts[(opts.indexOf(row.age) + 1) % opts.length] ?? null;
}

// ---------------------------------------------------------------------------
// Upkeep: merge duplicate plays
// ---------------------------------------------------------------------------
export async function doMerge(keepId: string): Promise<void> {
  const group = L.health().dupes.find((g) => g.some((s) => s.id === keepId));
  if (!group) return;
  const gone = group.filter((s) => s.id !== keepId).map((s) => s.id);
  const isGone = (id: string | null | undefined) => !!id && gone.includes(id);
  const writes: DocWrite[] = [{ path: 'defs/strategies', data: { items: clone(S.data.defs.strategies).map((s) => (gone.includes(s.id) ? { ...s, active: false, mergedInto: keepId } : s)) } }];
  let moved = 0;
  Object.entries(S.data.games).forEach(([gid, g]) => {
    if (!(g.plays || []).some((p) => isGone(p.strategyId))) return;
    const next = clone(g);
    next.plays.forEach((p) => { if (isGone(p.strategyId)) { p.strategyId = keepId; moved += 1; } });
    writes.push({ path: 'games/' + gid, data: next });
  });
  Object.entries(S.data.tags).forEach(([tid, t]) => { if (isGone(t.play)) { writes.push({ path: 'tags/' + tid, data: { ...clone(t), play: keepId } }); moved += 1; } });
  Object.entries(S.data.answers).forEach(([aid, a]) => { if (isGone(a.strategyId)) writes.push({ path: 'answers/' + aid, data: { ...clone(a), strategyId: keepId } }); });
  Object.entries(S.data.links).forEach(([lid, l]) => {
    if (!(l.marks || []).some((m) => isGone(m.strategyId))) return;
    const next = clone(l);
    next.marks.forEach((m) => { if (isGone(m.strategyId)) m.strategyId = keepId; });
    writes.push({ path: 'links/' + lid, data: next });
  });
  S.sheet = null;
  await commit('Merged ' + gone.map((x) => L.playTitle(x)).join(', ') + ' into ' + L.playTitle(keepId), writes, 'Merged. ' + plural(moved, 'game or tag', 'games and tags') + ' moved to ' + L.playTitle(keepId) + '.');
}

// ---------------------------------------------------------------------------
// References: games (yours or anyone's) and guides
// ---------------------------------------------------------------------------
export function openRefDetails(kind: RefKind | null, existing: RefCtx | null): void {
  const def = S.refDefaults || {};
  const d: RefDraft = { kind: kind || 'guide', id: null, url: '', title: '', notes: '', civ: '', map: '', playerCiv: '', oppCiv: '', result: '', playerName: '', oppName: '', date: '' };
  if (existing && existing.kind === 'game') {
    const g = existing.g;
    const l = L.mainLink(existing.id);
    Object.assign(d, { kind: g.mine ? 'mine' : 'game', id: existing.id, url: l ? l.url : '', title: g.title || '', playerCiv: g.playerCiv || '', oppCiv: g.oppCiv || '', map: g.map || '', result: g.result || '', playerName: g.playerName || '', oppName: g.oppName || '', date: g.date || '', notes: g.notes || '' });
  } else if (existing) {
    const l = existing.l;
    Object.assign(d, { kind: 'guide', id: existing.id, url: l.url || '', title: l.title || '', civ: l.civ || '', map: l.map || '', notes: l.notes || '' });
  } else if (kind === 'guide') {
    Object.assign(d, { url: normalizeUrl(S.ui.refs.url), civ: def.guideCiv || '' });
  } else {
    Object.assign(d, { url: normalizeUrl(S.ui.refs.url), playerCiv: kind === 'mine' ? def.myCiv || '' : '', date: kind === 'mine' ? new Date().toISOString().slice(0, 10) : '' });
  }
  openSheet({ kind: 'refdet', draft: d });
}

export async function saveRefDetails(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'refdet') return;
  const d = sh.draft;
  const url = normalizeUrl(d.url);
  if (url && !safeUrl(url)) { showToast("That link doesn't look right. It should start with https://.", true); return; }
  if (d.kind === 'guide' && !url) { showToast('A guide needs its link.', true); return; }
  const now = new Date().toISOString();
  const writes: DocWrite[] = [];
  let route: string, title: string;
  if (d.kind === 'guide') {
    const id = d.id || newId();
    const prev = d.id ? S.data.links[d.id] : null;
    const at = openAtFrom(url);
    const base: Link = prev ? clone(prev) : { url, source: 'other', title: '', marks: [], status: 'live', createdAt: now, gameId: null, checked: null, openAt: null, notes: '' };
    const data: Link = { ...base, url, source: detectSource(url), title: d.title.trim(), kind: 'guide', civ: d.civ || null, map: d.map || null, notes: d.notes.trim(), openAt: at != null ? at : prev ? prev.openAt || null : null };
    writes.push({ path: 'links/' + id, data });
    route = 'ref-guide-' + id;
    title = guideTitle(data);
    S.refDefaults.guideCiv = d.civ || '';
  } else {
    const id = d.id || 'g-' + newId();
    const prev = d.id ? S.data.games[d.id] : null;
    const base = prev ? clone(prev) : { plays: [], createdAt: now };
    const g: Game = { ...base, mine: d.kind === 'mine', title: d.title.trim(), playerCiv: d.playerCiv || null, oppCiv: d.oppCiv || null, map: d.map || null, result: d.result || null,
      playerName: d.kind === 'mine' ? (prev ? prev.playerName || '' : '') : d.playerName.trim(), oppName: d.oppName.trim(), date: d.date || null, notes: d.notes.trim(),
      aoe4worldGameId: aoe4worldId(url) || (prev ? prev.aoe4worldGameId || null : null) };
    writes.push({ path: 'games/' + id, data: g });
    const link = prev ? L.mainLink(id) : null;
    if (url && link) { if (link.url !== url) writes.push({ path: 'links/' + link.id, data: { ...clone(S.data.links[link.id] as Link), url, source: detectSource(url) } }); }
    else if (url) writes.push({ path: 'links/' + newId(), data: { url, source: detectSource(url), title: '', gameId: id, kind: 'game', civ: null, map: null, openAt: null, status: 'live', checked: null, notes: '', marks: [], createdAt: now } satisfies Link });
    else if (link) writes.push({ path: 'links/' + link.id, data: null });
    route = 'ref-game-' + id;
    title = L.refTitleGame(g);
    if (d.kind === 'mine' && d.playerCiv) S.refDefaults.myCiv = d.playerCiv;
  }
  const isNew = !d.id;
  S.sheet = null;
  if (isNew) S.ui.refs.url = '';
  savePrefs();
  await commit((isNew ? 'Added ' : 'Edited ') + title, writes, isNew ? 'Added ' + title + '. Now add its moments.' : 'Saved ' + title + '.');
  if (isNew) location.hash = route;
}

export async function deleteRef(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'refdet' || !sh.draft.id) return;
  const id = sh.draft.id;
  let writes: DocWrite[], title: string;
  if (sh.draft.kind === 'guide') { writes = [{ path: 'links/' + id, data: null }]; title = guideTitle(S.data.links[id]); }
  else { writes = [{ path: 'games/' + id, data: null }, ...L.gameLinks(id).map((l) => ({ path: 'links/' + l.id, data: null }))]; title = L.refTitleGame(S.data.games[id] as Game); }
  S.sheet = null;
  await commit('Deleted ' + title, writes, 'Deleted ' + title + '.');
  location.hash = 'refs';
}

// ---------------------------------------------------------------------------
// Moments: what happened in a game or guide, and when
// ---------------------------------------------------------------------------
function targetBuilder(x: { strategyId?: string | null; elementId?: string | null; age?: Age | null }): BuilderRow[] {
  const s = x.strategyId ? L.strat(x.strategyId) : null;
  if (s) return stepsToBuilder(s.steps);
  if (x.elementId) return [{ el: x.elementId, age: x.age || null, join: false }];
  return [];
}
function blankMoment(d: Pick<MomentDraft, 'refKind' | 'gameId' | 'linkId' | 'side' | 'civ' | 'shows'>): MomentDraft {
  return { refKind: d.refKind, gameId: d.gameId, linkId: d.linkId, pid: null, mid: null, side: d.side, civ: d.civ, builder: [], origStrategy: null, name: '', at: '', note: '',
    outcome: null, prep: null, did: '', showHow: false, shows: d.shows };
}
export function openMoment(key: string | null): void {
  const r = refFromView();
  if (!r) return;
  let d: MomentDraft;
  if (r.kind === 'game') {
    const p = key ? (r.g.plays || []).find((x) => x.pid === key) : null;
    d = blankMoment({ refKind: 'game', gameId: r.id, linkId: null, side: S.lastSide || 'opponent', civ: '', shows: 'threat' });
    if (p) {
      const mk = L.gameMark(r.id, p.pid);
      Object.assign(d, { pid: p.pid, side: p.runBy || 'opponent', builder: targetBuilder(p), origStrategy: p.strategyId || null, at: mk && mk.m.at != null ? fmtTime(mk.m.at) : '', note: p.notes || '',
        outcome: p.outcome || null, prep: p.prep || null, did: p.did || '', showHow: !!(p.outcome || p.prep || p.did) });
    }
  } else {
    const m = key ? (r.l.marks || []).find((x) => x.mid === key) : null;
    d = blankMoment({ refKind: 'guide', gameId: null, linkId: r.id, side: 'opponent', civ: r.l.civ || '', shows: 'threat' });
    if (m) Object.assign(d, { mid: m.mid, civ: m.civ || '', builder: targetBuilder(m), origStrategy: m.strategyId || null, at: m.at != null ? fmtTime(m.at) : '', note: m.note || '', shows: m.shows || 'threat' });
  }
  openSheet({ kind: 'moment', draft: d, picking: !key });
}

export async function saveMoment(again: boolean): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'moment') return;
  const d = sh.draft;
  const steps = builderToSteps(d.builder);
  const first = steps[0];
  if (!first) { showToast('Add what happened first: one element, or several for a play.', true); return; }
  const atText = (d.at || '').trim();
  const at = atText ? parseTime(atText) : null;
  if (atText && at == null) { showToast('Write the time like 2:30, or leave it empty.', true); return; }
  const items = clone(S.data.defs.strategies);
  let tgt: { strategyId: string | null; elementId: string | null; age: Age | null; created?: boolean; name?: string };
  if (steps.length === 1) tgt = { elementId: first.el, age: first.age || null, strategyId: null };
  else {
    const nm = (d.name || '').trim();
    if (!L.matchPlay(d.builder, d.origStrategy) && nm && items.some((x) => x.name.toLowerCase() === nm.toLowerCase())) { showToast('A different play already has that name. Pick another.', true); return; }
    const r = L.resolveStrategy(d.builder, nm, items, d.origStrategy);
    tgt = { strategyId: r.id, elementId: null, age: null, created: !!r.created, name: r.name };
  }
  const writes: DocWrite[] = [];
  if (tgt.created) writes.push({ path: 'defs/strategies', data: { items } });
  let title: string;
  if (d.refKind === 'game' && d.gameId) {
    const gameId = d.gameId;
    const g = clone(S.data.games[gameId] as Game);
    title = L.refTitleGame(g);
    g.plays = g.plays || [];
    const pid = d.pid || newId();
    const i = g.plays.findIndex((p) => p.pid === pid);
    const old: Partial<GamePlay> = i >= 0 ? (g.plays[i] as GamePlay) : {};
    const play: GamePlay = { ...old, pid, runBy: d.side, strategyId: tgt.strategyId, elementId: tgt.elementId, age: tgt.age, outcome: d.outcome || null,
      prep: g.mine && d.side === 'opponent' ? d.prep || null : null, answerId: old.answerId || null, did: (d.did || '').trim(), notes: (d.note || '').trim() };
    if (i >= 0) g.plays[i] = play; else g.plays.push(play);
    writes.push({ path: 'games/' + gameId, data: g });
    const link = L.mainLink(gameId);
    if (link && timed(link)) {
      const lk = clone(S.data.links[link.id] as Link);
      const had = (lk.marks || []).some((m) => m.playId === pid);
      if (had || at != null) {
        lk.marks = (lk.marks || []).filter((m) => m.playId !== pid);
        if (at != null) lk.marks.push({ mid: newId(), at, playId: pid, civ: null, elementId: null, strategyId: null, age: null, shows: 'both', note: '' });
        writes.push({ path: 'links/' + link.id, data: lk });
      }
    }
    S.lastSide = d.side;
  } else if (d.linkId) {
    const linkId = d.linkId;
    const lk = clone(S.data.links[linkId] as Link);
    title = guideTitle(lk);
    lk.marks = lk.marks || [];
    const mid = d.mid || newId();
    const mark: Mark = { mid, at, playId: null, civ: d.civ || null, elementId: tgt.elementId, strategyId: tgt.strategyId, age: tgt.age, shows: d.shows || 'threat', note: (d.note || '').trim() };
    const i = lk.marks.findIndex((m) => m.mid === mid);
    if (i >= 0) lk.marks[i] = mark; else lk.marks.push(mark);
    writes.push({ path: 'links/' + linkId, data: lk });
  } else return;
  const what = tgt.strategyId ? tgt.name || L.playTitle(tgt.strategyId) : L.elName(tgt.elementId);
  const editing = !!(d.pid || d.mid);
  S.sheet = again ? { kind: 'moment', draft: blankMoment(d), picking: true, sid: nextSid() } : null;
  await commit((editing ? 'Edited a moment in ' : 'Added ' + what + ' to ') + title, writes, (editing ? 'Saved the moment.' : 'Added ' + what + '.') + (tgt.created ? ' New play added to Library.' : ''));
}

export async function deleteMoment(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'moment') return;
  const d = sh.draft;
  const writes: DocWrite[] = [];
  let title: string;
  if (d.refKind === 'game' && d.gameId) {
    const g = clone(S.data.games[d.gameId] as Game);
    title = L.refTitleGame(g);
    g.plays = (g.plays || []).filter((p) => p.pid !== d.pid);
    writes.push({ path: 'games/' + d.gameId, data: g });
    L.gameLinks(d.gameId).forEach((l) => { if ((l.marks || []).some((m) => m.playId === d.pid)) writes.push({ path: 'links/' + l.id, data: { ...clone(S.data.links[l.id] as Link), marks: l.marks.filter((m) => m.playId !== d.pid) } }); });
  } else if (d.linkId) {
    const lk = clone(S.data.links[d.linkId] as Link);
    title = guideTitle(lk);
    lk.marks = (lk.marks || []).filter((m) => m.mid !== d.mid);
    writes.push({ path: 'links/' + d.linkId, data: lk });
  } else return;
  S.sheet = null;
  await commit('Deleted a moment from ' + title, writes, 'Moment deleted.');
}

// From Check: tag the civ for what's being viewed, in the place being viewed.
export function whyNewTag(): void {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'why') return;
  openTagSheet({ civ: sh.civ, field: sh.itemKind, id: sh.id, place: parsePlace(S.ui.check.place) }, sh);
}
export type { DefSheet };
