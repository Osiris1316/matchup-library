// What the buttons do: open sheets with drafts, and turn saved drafts into
// record writes. Each save is one commit, so it can be undone in one step.
import {
  AGES, AGE_NAME, EL_TYPES, EL_TYPE_GROUP, INTENT_NAME, ITEM_WORD, STAGE_NAME, agesFrom, aoe4worldId, builderToSteps, clone, detectSource, guideTitle, isActive, lookOf, newId, newTag,
  normalizeUrl, openAtFrom, parsePlace, parseTime, placeKey, plural, safeUrl, slug, stable, stagesOf, stepsToBuilder, tagField, tagKey, tagKeyOf, tagTargetId, targetOf, timed,
  fmtTime, type Age, type Block, type BuilderRow, type DefType, type DocWrite, type EarlyAge, type Element, type Game, type GamePlan, type GamePlay, type Intent, type ItemKind,
  type Link, type Mark, type Place, type Play, type Step, type Tag
} from '@matchup-library/core';
import { commit } from './api/client';
import { paths, refFromPath, refPath } from './app/paths';
import { currentPath, go } from './app/navigation';
import {
  L, S, emit, nextSid, openSheet, savePrefs, showToast,
  type DefDraft, type DefSheet, type MomentDraft, type PlaceDraft, type RefDraft, type RefKind, type Sheet
} from './store';

export const DEF_WORD: Record<DefType, string> = { elements: 'element', plays: 'play', gamePlans: 'game plan', kinds: 'kind', features: 'map feature', maps: 'map', mapTypes: 'map type', civs: 'civ' };
const FIELD_OF: Partial<Record<DefType, ItemKind>> = { elements: 'el', plays: 'play', gamePlans: 'plan' };
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
// The game or guide whose page is showing, if any.
export function refFromView(): RefCtx | null {
  const r = refFromPath(currentPath());
  if (!r) return null;
  if (r.kind === 'game') { const g = S.data.games[r.id]; return g ? { kind: 'game', id: r.id, g } : null; }
  const l = S.data.links[r.id];
  return l && !l.gameId ? { kind: 'guide', id: r.id, l } : null;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
type TagOpen = { tagId: string } | { civ: string; field: ItemKind; id: string; place: Place | PlaceDraft };
export function openTagSheet(opts: TagOpen, back?: Sheet | null): void {
  if ('tagId' in opts) {
    const t = S.data.tags[opts.tagId];
    if (!t) return;
    openSheet({ kind: 'tag', back: back || null, draft: { tagId: opts.tagId, civ: t.civ, field: tagField(t), target: tagTargetId(t), place: draftOf(t.place), age: t.age || null, timing: t.timing || '', tells: t.tells || '', notes: t.notes || '', intent: t.intent || '', subject: t.subject || '' } });
    return;
  }
  const place: PlaceDraft = opts.place.kind !== 'any' && opts.place.id ? { kind: opts.place.kind, id: opts.place.id } : { kind: 'any', id: null };
  const same = L.activeTags().find((t) => tagKey(t) === tagKeyOf(opts.civ, opts.field, opts.id, null, toPlace(place) || { kind: 'any' }));
  if (same) { openTagSheet({ tagId: same.id }, back); return; }
  openSheet({ kind: 'tag', back: back || null, draft: { tagId: null, civ: opts.civ, field: opts.field, target: opts.id, place, age: null, timing: '', tells: '', notes: '', intent: '', subject: '' } });
}

export async function saveTag(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'tag') return;
  const d = sh.draft;
  const place = toPlace(d.place);
  if (!place) { showToast('Pick where it applies first.', true); return; }
  const age = d.field === 'el' ? d.age || null : null;
  const look = d.field === 'el' ? lookOf({ intent: d.intent || null, subject: d.subject || null }) : {};
  const myKey = tagKeyOf(d.civ, d.field, d.target, age, place, look.intent || null);
  const same = L.allTags().find((t) => t.id !== d.tagId && tagKey(t) === myKey);
  const fields = { timing: d.timing.trim(), tells: d.tells.trim(), notes: d.notes.trim() };
  const name = L.itemName(d.field, d.target);
  const blocks = L.blockers(d.civ, d.field, d.target, age);
  if (blocks.length) { showToast(L.blockText(d.civ, blocks[0] as Block) + '. Open it for ' + L.civShort(d.civ) + ' from the sheet, or change the tag.', true); return; }
  if (same && same.active !== false) { showToast('That tag already exists, so it is open now.', true); openTagSheet({ tagId: same.id }, sh.back); return; }
  const writes: DocWrite[] = [];
  if (same) {
    const old = S.data.tags[same.id] as Tag;
    writes.push({ path: 'tags/' + same.id, data: { ...clone(old), active: true, timing: fields.timing || old.timing || '', tells: fields.tells || old.tells || '', notes: fields.notes || old.notes || '' } });
    if (d.tagId) writes.push({ path: 'tags/' + d.tagId, data: { ...clone(S.data.tags[d.tagId] as Tag), active: false } });
  } else {
    const prev = d.tagId ? S.data.tags[d.tagId] : null;
    const base: Tag = prev ? clone(prev) : newTag(d.civ, d.field, d.target, place);
    delete base.intent;
    delete base.subject;
    writes.push({ path: 'tags/' + (d.tagId || newId()), data: { ...base, place, age, ...look, ...fields, active: true } });
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
  openSheet({ kind: 'bulk', draft: { civ, seg: 'el', place: { kind: 'any', id: null }, picked: { el: [], play: [], plan: [] } } });
}

export async function saveBulk(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'bulk') return;
  const d = sh.draft;
  const place = toPlace(d.place);
  if (!place) { showToast('Pick where it applies first.', true); return; }
  const picked = d.picked[d.seg];
  const writes: DocWrite[] = [];
  picked.forEach((id) => {
    if (L.blockers(d.civ, d.seg, id).length) return;
    const twin = L.allTags().find((t) => tagKey(t) === tagKeyOf(d.civ, d.seg, id, null, place));
    if (twin && twin.active !== false) return;
    if (twin) writes.push({ path: 'tags/' + twin.id, data: { ...clone(S.data.tags[twin.id] as Tag), active: true } });
    else writes.push({ path: 'tags/' + newId(), data: newTag(d.civ, d.seg, id, place) });
  });
  if (!writes.length) { showToast('Everything ticked is already tagged here.', true); return; }
  S.sheet = null;
  await commit('Tagged ' + L.civName(d.civ) + ' with ' + plural(writes.length, ITEM_WORD[d.seg]) + ' ' + L.placePhrase(place), writes);
}

// A variant starts from its base civ's tags. A tag the variant already has,
// even a retired one, isn't copied again; a retired one comes back instead.
export async function copyFromParent(cid: string): Promise<void> {
  const c = L.civ(cid);
  if (!c || !c.parent) return;
  const parent = c.parent;
  const own = new Map(L.allTags().filter((t) => t.civ === cid).map((t) => [tagKey({ ...t, civ: '' }), t] as const));
  const writes: DocWrite[] = [];
  let skipped = 0;
  L.activeTags().filter((t) => t.civ === parent).forEach((t) => {
    // The variant may not have every age its base civ has.
    if (L.blockers(cid, tagField(t), tagTargetId(t), t.el ? t.age : null).length) { skipped += 1; return; }
    const twin = own.get(tagKey({ ...t, civ: '' }));
    if (twin && twin.active !== false) return;
    if (twin) {
      const old = S.data.tags[twin.id] as Tag;
      writes.push({ path: 'tags/' + twin.id, data: { ...clone(old), active: true, timing: old.timing || t.timing || '', tells: old.tells || t.tells || '', notes: old.notes || t.notes || '' } });
      return;
    }
    writes.push({ path: 'tags/' + newId(), data: { ...newTag(cid, tagField(t), tagTargetId(t), t.place), age: t.age || null, ...lookOf(t), timing: t.timing || '', tells: t.tells || '', notes: t.notes || '', copiedFrom: t.id } });
  });
  const skipNote = skipped ? ' Left out ' + plural(skipped, 'tag') + ' with ages ' + c.name + " can't do." : '';
  if (!writes.length) { showToast('Nothing new to copy.' + skipNote, true); return; }
  S.sheet = null;
  await commit('Copied ' + plural(writes.length, 'tag') + ' from ' + L.civName(parent) + ' to ' + c.name, writes, 'Copied ' + plural(writes.length, 'tag') + '.' + skipNote);
}

// ---------------------------------------------------------------------------
// Definitions: elements, plays, kinds, features, maps, map types, civs
// ---------------------------------------------------------------------------
const civOnFor = (field: ItemKind, id: string): string[] => [...new Set(L.activeTags().filter((t) => t[field] === id && placeKey(t.place) === 'any:').map((t) => t.civ))];
function blankDraft(): DefDraft {
  return { name: '', description: '', kind: '', ages: AGES.slice(), tells: '', subject: '', intent: '', universal: false, cannot: [], civAges: {},
    builder: [], age: 'dark', family: '', stages: {}, status: '',
    where: [], whereNote: '', civOn: [], mapsOn: [], type: '', features: [], inPool: true, notes: '', short: '', parent: '' };
}
function elementDraft(id: string | null): DefDraft {
  const d = blankDraft();
  const it = S.data.defs.elements.find((x) => x.id === id);
  if (it) {
    Object.assign(d, { name: it.name, kind: it.kind || '', ages: L.elAges(it.id).slice(), description: it.description || '', tells: it.tells || '', where: clone(it.where || []), whereNote: it.whereNote || '',
      civOn: civOnFor('el', it.id), subject: it.subject || '', intent: it.intent || '', universal: !!it.universal, cannot: (it.cannot || []).slice(), civAges: clone(it.civAges || {}) });
  } else d.kind = 'unit';
  return d;
}

// ---------------------------------------------------------------------------
// The Library's element editor: one element open beside the list, not in a sheet.
// ---------------------------------------------------------------------------
export const elementDirty = (): boolean => {
  const u = S.ui.library;
  return !!u.draft && stable(u.draft) !== u.saved;
};
export function openElement(id: string | null, force = false): void {
  const u = S.ui.library;
  if (!force && elementDirty() && (id || 'new') !== u.sel) {
    showToast('Save or revert the changes to ' + (u.draft && u.draft.name.trim() || 'this element') + ' first.', true);
    return;
  }
  const it = id ? S.data.defs.elements.find((x) => x.id === id) : null;
  u.sel = it ? it.id : 'new';
  u.draft = elementDraft(it ? it.id : null);
  u.saved = stable(u.draft);
  u.subjectPick = !it;
  S.panel.open = null;
  emit();
  if (window.innerWidth < 1100) window.scrollTo(0, 0);
}
export function closeElement(): void {
  if (elementDirty()) { showToast('Save or revert your changes first.', true); return; }
  const u = S.ui.library;
  u.sel = ''; u.draft = null; u.saved = ''; S.panel.open = null;
  emit();
}
export function revertElement(): void {
  const u = S.ui.library;
  if (u.sel === 'new') { u.sel = ''; u.draft = null; u.saved = ''; emit(); return; }
  openElement(u.sel, true);
}
export async function saveElement(): Promise<void> {
  const u = S.ui.library;
  if (!u.draft) return;
  const id = await saveDefDraft('elements', u.sel === 'new' ? null : u.sel, u.draft, () => {});
  if (id) openElement(id, true);
}

// A subject's default intent, set from the Library's landmark list.
export async function setSubjectIntent(id: string, intent: Intent | null): Promise<void> {
  const x = S.data.subjects && S.data.subjects[id];
  if (!x || (x.defaultIntent || null) === intent) return;
  await commit('Set ' + x.name + ' to ' + (intent ? INTENT_NAME[intent].toLowerCase() : 'no intent'), [{ path: 'subjects/' + id, data: { ...clone(x), defaultIntent: intent } }]);
}

// opts.age: the age for a new play. opts.stageFor: the play is being made
// from the game plan sheet in opts.back, for that age's stage.
export function openDef(type: DefType, id: string | null, opts: { age?: Age; back?: Sheet | null; stageFor?: Age } = {}): void {
  if (type === 'elements') { openElement(id); return; }
  const d = blankDraft();
  const D = S.data.defs;
  if (type === 'plays') {
    const it = D.plays.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, age: it.age, family: it.family || '', description: it.description || '', tells: it.tells || '', notes: it.notes || '',
      builder: stepsToBuilder(it.steps), where: clone(it.where || []), whereNote: it.whereNote || '', civOn: civOnFor('play', it.id) });
    else d.age = opts.age || 'dark';
  } else if (type === 'gamePlans') {
    const it = D.gamePlans.find((x) => x.id === id);
    if (it) Object.assign(d, { name: it.name, description: it.description || '', notes: it.notes || '', status: it.status || '', stages: clone(it.stages || {}),
      where: clone(it.where || []), whereNote: it.whereNote || '', civOn: civOnFor('plan', it.id) });
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
  openSheet({ kind: 'def', type, id: it ? it.id : null, draft: d, picking: false, back: opts.back || null, stageFor: opts.stageFor || null });
}

function civTagWrites(field: ItemKind, id: string, civOn: string[]): { writes: DocWrite[]; on: number; off: number } {
  const writes: DocWrite[] = [];
  let on = 0, off = 0;
  const anyTags = L.allTags().filter((t) => tagField(t) === field && tagTargetId(t) === id && placeKey(t.place) === 'any:');
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
  // A new play made for a stage goes back into the game plan or branch it came from.
  const back = sh.back && ((sh.back.kind === 'def' && sh.back.type === 'gamePlans') || sh.back.kind === 'branch') ? sh.back : null;
  const stageAge = sh.stageFor || null;
  const id = await saveDefDraft(sh.type, sh.id, sh.draft, () => { S.sheet = back || sh.back || null; });
  if (id && back && stageAge) {
    back.draft.stages[stageAge] = { play: id, notes: (back.draft.stages[stageAge] || { notes: '' }).notes || '' };
    emit();
  }
}

// Saves a definition draft as one commit. Returns the saved id, or null if
// the draft wasn't ready. close() runs just before the commit.
async function saveDefDraft(t: DefType, origId: string | null, d: DefDraft, close: () => void): Promise<string | null> {
  const word = DEF_WORD[t];
  const name = (d.name || '').trim();
  if (!name) { showToast('Give it a name first.', true); return null; }
  const items = clone(listOf(t)) as (Item & Record<string, unknown>)[];
  // Plays in different ages can share a name: Spears in Dark and in Feudal are different plays.
  const dup = items.find((x) => x.id !== origId && x.name.toLowerCase() === name.toLowerCase() && (t !== 'plays' || x.age === d.age));
  if (dup) { showToast(isActive(dup) ? 'There is already a ' + word + ' with that name' + (t === 'plays' ? ' in this age.' : '.') : 'A retired ' + word + ' has that name. Restore it instead.', true); return null; }
  let id = origId;
  if (!id) {
    const sep = t === 'maps' ? '-' : '_';
    const base = t === 'maps' ? slug(name).replace(/_/g, '-') : t === 'plays' ? d.age + '_' + slug(name) : slug(name);
    let next = base, n = 2;
    while (items.some((x) => x.id === next)) { next = base + sep + n; n += 1; }
    id = next;
  }
  const prev = origId ? findDef(t, origId) : null;
  const item: Item & Record<string, unknown> = prev ? clone(prev) : { id, name, active: true };
  item.name = name;
  const extra: DocWrite[] = [];
  let tagNote = '';
  const field = FIELD_OF[t];
  if (field) {
    if (t === 'elements') {
      const cannot = d.universal ? d.cannot.slice().sort() : [];
      const civAges: Record<string, Age[]> = {};
      Object.keys(d.civAges).sort().forEach((c) => { const a = AGES.filter((x) => (d.civAges[c] || []).includes(x)); if (a.length && !cannot.includes(c)) civAges[c] = a; });
      Object.assign(item, { kind: d.kind, ages: AGES.filter((a) => d.ages.includes(a)), description: d.description.trim(), tells: d.tells.trim(),
        subject: d.subject || null, intent: d.intent || null, universal: !!d.universal, cannot });
      if (Object.keys(civAges).length) item.civAges = civAges; else delete item.civAges;
    } else if (t === 'plays') {
      const steps = builderToSteps(d.builder, d.age);
      if (!steps.length) { showToast('Add at least one element to the play.', true); return null; }
      const off = steps.find((st) => !L.anyCivCan(st.el, d.age));
      if (off) { showToast('No civ can do ' + L.elName(off.el) + ' in ' + STAGE_NAME[d.age] + ' yet. Open it for a civ from its step, change the age, or take it out.', true); return null; }
      const twin = L.matchPlay(d.builder, d.age, origId);
      if (twin && twin.id !== origId) { showToast('Same steps as ' + twin.name + ' in this age. Edit that play instead, or change the steps.', true); return null; }
      const p = prev as Play | null;
      const oldNotes: Record<string, string> = {};
      (p ? p.steps : []).forEach((s) => { oldNotes[s.el + '@' + s.step] = s.notes; });
      Object.assign(item, { age: d.age, family: d.family.trim() || L.suggestFamily(steps, d.age), description: d.description.trim(), tells: d.tells.trim(), notes: d.notes.trim(),
        steps: steps.map((s) => ({ ...s, notes: oldNotes[s.el + '@' + s.step] || '' })), mergedInto: p ? p.mergedInto || null : null });
    } else {
      const stages: GamePlan['stages'] = {};
      AGES.forEach((a) => { const st = d.stages[a]; if (st && st.play) stages[a] = { play: st.play, notes: (st.notes || '').trim() }; });
      const twin = L.activePlans().find((g) => g.id !== origId && stagesOf(g).length && L.planSignature(g) === L.planSignature({ stages } as GamePlan));
      if (twin) { showToast('Same play in every age as ' + twin.name + '. Edit that game plan instead, or change a stage.', true); return null; }
      const p = prev as GamePlan | null;
      Object.assign(item, { description: d.description.trim(), notes: d.notes.trim(), status: d.status || null, stages, mergedInto: p ? p.mergedInto || null : null });
    }
    item.where = d.where;
    item.whereNote = d.where.length ? d.whereNote.trim() : '';
    // A civ newly ticked for a play or game plan must be able to do every step in its age.
    if (t !== 'elements') {
      const fresh = d.civOn.filter((c) => !L.activeTags().some((x) => x.civ === c && tagField(x) === field && tagTargetId(x) === origId && placeKey(x.place) === 'any:'));
      const stuck = fresh.find((c) => draftBlockers(t, d, c).length);
      if (stuck) { showToast(L.blockText(stuck, draftBlockers(t, d, stuck)[0] as Block) + '. Open it for ' + L.civShort(stuck) + ' below, or untick ' + L.civShort(stuck) + '.', true); return null; }
    }
    // A universal element is implied for every civ, so its civ list isn't edited here.
    const r = t === 'elements' && d.universal ? { writes: [], on: 0, off: 0 } : civTagWrites(field, id, d.civOn);
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
  close();
  await commit((prev ? 'Edited ' : 'Added ') + name, [{ path: 'defs/' + t, data: { items: next } }, ...extra], (prev ? 'Saved ' : 'Added ') + name + '.' + tagNote);
  return id;
}

export async function toggleDefActive(type: DefType, id: string): Promise<void> {
  const it = findDef(type, id);
  if (!it) return;
  const on = !isActive(it);
  const items = clone(listOf(type)).map((x) => (x.id === id ? { ...x, active: on } : x));
  S.sheet = null;
  await commit((on ? 'Restored ' : 'Retired ') + it.name, [{ path: 'defs/' + type, data: { items } }], on ? null : 'Retired ' + it.name + '. Show retired to bring it back.');
}

// The element list for "Add element": active elements, grouped by type.
export function elementGroups(): { name: string; items: Element[] }[] {
  const els = S.data.defs.elements.filter(isActive);
  const groups = EL_TYPES.map((ty) => ({ name: EL_TYPE_GROUP[ty], items: els.filter((e) => e.kind === ty) }));
  groups.push({ name: 'No type yet', items: els.filter((e) => !L.elType(e.id)) });
  return groups.filter((g) => g.items.length).map((g) => ({ ...g, items: g.items.slice().sort((a, b) => a.name.localeCompare(b.name)) }));
}
export function addStep(builder: BuilderRow[], elId: string): void {
  const ages = L.elAges(elId);
  const prev = builder[builder.length - 1];
  let age: Age | null = null;
  if (ages.length === 1) age = ages[0] as Age; else if (prev && prev.age && ages.includes(prev.age)) age = prev.age;
  builder.push({ el: elId, age, join: false });
}
// ---------------------------------------------------------------------------
// Ages by civ: what a civ can't do, and the one-tap fixes
// ---------------------------------------------------------------------------
// The civ a moment is about: the side that did it in a game, or the guide's civ.
export function momentCiv(d: MomentDraft): string | null {
  if (d.refKind === 'game' && d.gameId) {
    const g = S.data.games[d.gameId];
    return g ? (d.side === 'player' ? g.playerCiv : g.oppCiv) || null : null;
  }
  return d.civ || null;
}
// What a civ can't do in a play or game plan as it stands in the sheet, before saving.
export function draftBlockers(t: DefType, d: DefDraft, civ: string): Block[] {
  if (t === 'plays') return L.cantDo(civ, builderToSteps(d.builder, d.age), d.age);
  if (t !== 'gamePlans') return [];
  const out: Block[] = [];
  AGES.forEach((a) => {
    const p = d.stages[a] ? L.play(d.stages[a]?.play) : null;
    if (p) L.cantDo(civ, p.steps as Step[], p.age).forEach((b) => { if (!out.some((x) => x.el === b.el && x.age === b.age)) out.push(b); });
  });
  return out;
}
// The element with new ages for some civs, as saved. A civ on the "can't" list comes off it.
function withCivAges(e: Element, changes: { civ: string; ages: Age[] }[]): Element {
  const next = clone(e);
  const civAges: Record<string, Age[]> = { ...(next.civAges || {}) };
  changes.forEach((c) => { civAges[c.civ] = AGES.filter((a) => c.ages.includes(a)); });
  next.civAges = civAges;
  next.cannot = (next.cannot || []).filter((c) => !changes.some((x) => x.civ === c));
  return next;
}
// Keeps an open element editor in step with a change saved from elsewhere.
function syncEditor(elId: string, changes: { civ: string; ages: Age[] }[]): void {
  const u = S.ui.library;
  if (u.sel !== elId || !u.draft) return;
  const dirty = elementDirty();
  changes.forEach((c) => { u.draft!.civAges[c.civ] = c.ages.slice(); u.draft!.cannot = u.draft!.cannot.filter((x) => x !== c.civ); });
  if (!dirty) u.saved = stable(u.draft);
}
// The fix for a block: let the civ do the element in that age (and up to its usual ages),
// or take it off the "can't" list.
export async function openForCiv(civ: string, b: Block): Promise<void> {
  const e = L.el(b.el);
  if (!e) return;
  const ages = b.age ? L.agesWith(civ, b.el, b.age) : L.elAges(b.el);
  const change = [{ civ, ages }];
  const items = clone(S.data.defs.elements).map((x) => (x.id === b.el ? withCivAges(x, change) : x));
  syncEditor(b.el, change);
  const what = b.age ? 'Opened ' + e.name + ' to ' + L.civShort(civ) + ' in ' + STAGE_NAME[b.age] : 'Took ' + L.civShort(civ) + " off the civs that can't do " + e.name;
  await commit(what, [{ path: 'defs/elements', data: { items } }], what + '. ' + L.civShort(civ) + ' can do it in ' + ages.map((a) => AGE_NAME[a]).join(', ') + '.');
}
// The aoe4world data's earlier ages, added in one go.
export async function addEarlyAges(list: EarlyAge[]): Promise<void> {
  if (!list.length) return;
  const byEl = new Map<string, { civ: string; ages: Age[] }[]>();
  list.forEach((x) => byEl.set(x.el, [...(byEl.get(x.el) || []), { civ: x.civ, ages: x.ages }]));
  const items = clone(S.data.defs.elements).map((x) => (byEl.has(x.id) ? withCivAges(x, byEl.get(x.id) || []) : x));
  byEl.forEach((ch, el) => syncEditor(el, ch));
  await commit('Added ' + plural(list.length, 'earlier age') + ' from AoE4 World', [{ path: 'defs/elements', data: { items } }],
    'Added ' + list.map((x) => L.civShort(x.civ) + ' ' + L.elName(x.el) + ' from ' + AGE_NAME[x.age]).join(', ') + '.');
}
// The draft's ages for a civ with one more, for the element editor.
export function draftAgesWith(d: DefDraft, civ: string, age: Age): Age[] {
  return agesFrom(d.civAges[civ] || d.ages, d.ages, age);
}

// A step's intent: the element's default, then each override in turn.
export function cycleIntent(row: BuilderRow): void {
  const opts: (Intent | null)[] = [null, 'offensive', 'defensive', 'economic'];
  const next = opts[(opts.indexOf(row.intent || null) + 1) % opts.length] ?? null;
  if (next) row.intent = next; else delete row.intent;
}
export function cycleAge(row: BuilderRow): void {
  const opts: (Age | null)[] = [null, ...L.elAges(row.el)];
  row.age = opts[(opts.indexOf(row.age) + 1) % opts.length] ?? null;
}

// ---------------------------------------------------------------------------
// Upkeep: merge duplicate plays or game plans
// ---------------------------------------------------------------------------
export async function doMerge(what: 'play' | 'plan', keepId: string): Promise<void> {
  const h = L.health();
  const group = (what === 'play' ? h.dupes : h.planDupes).find((g) => (g as { id: string }[]).some((s) => s.id === keepId)) as { id: string }[] | undefined;
  if (!group) return;
  const gone = group.filter((s) => s.id !== keepId).map((s) => s.id);
  const isGone = (id: string | null | undefined) => !!id && gone.includes(id);
  const key = what === 'play' ? 'playId' : 'planId';
  const writes: DocWrite[] = [what === 'play'
    ? { path: 'defs/plays', data: { items: clone(S.data.defs.plays).map((s) => (gone.includes(s.id) ? { ...s, active: false, mergedInto: keepId } : s)) } }
    : { path: 'defs/gamePlans', data: { items: clone(S.data.defs.gamePlans).map((s) => (gone.includes(s.id) ? { ...s, active: false, mergedInto: keepId } : s)) } }];
  let moved = 0;
  // Game plans and their branches that use a merged play now use the one kept.
  if (what === 'play') {
    const plans = clone(S.data.defs.gamePlans);
    let changed = false;
    plans.forEach((g) => {
      AGES.forEach((a) => { const st = g.stages[a]; if (st && isGone(st.play)) { st.play = keepId; changed = true; moved += 1; } });
      (g.branches || []).forEach((b) => {
        AGES.forEach((a) => { const st = b.stages[a]; if (st && isGone(st.play)) { st.play = keepId; changed = true; moved += 1; } });
        if (b.trigger && isGone(b.trigger.play)) { b.trigger.play = keepId; changed = true; moved += 1; }
      });
    });
    if (changed) writes.push({ path: 'defs/gamePlans', data: { items: plans } });
  } else {
    // A merged game plan's branches move to the one kept, and so do its answers,
    // unless the kept one already has an answer for that pairing.
    const plans = writes[0]!.data as { items: GamePlan[] };
    const keep = plans.items.find((g) => g.id === keepId);
    plans.items.forEach((g) => {
      if (!gone.includes(g.id) || !keep || !(g.branches || []).length) return;
      keep.branches = [...(keep.branches || []), ...(g.branches || []).map((b) => ({ ...b, name: (keep.branches || []).some((x) => x.name === b.name) ? b.name + ' (' + g.name + ')' : b.name }))];
      moved += (g.branches || []).length;
      delete g.branches;
    });
    const answers = Object.entries(S.data.answers || {});
    answers.forEach(([aid, a]) => {
      if (!isGone(a.theirPlan) && !isGone(a.myPlan)) return;
      const next = { ...clone(a), theirPlan: isGone(a.theirPlan) ? keepId : a.theirPlan, myPlan: isGone(a.myPlan) ? keepId : a.myPlan };
      if (answers.some(([x, b]) => x !== aid && b.theirPlan === next.theirPlan && b.myPlan === next.myPlan && (b.myCiv || null) === (next.myCiv || null) && (b.oppCiv || null) === (next.oppCiv || null))) return;
      writes.push({ path: 'answers/' + aid, data: next });
      moved += 1;
    });
  }
  Object.entries(S.data.games).forEach(([gid, g]) => {
    if (!(g.plays || []).some((p) => isGone(p[key]))) return;
    const next = clone(g);
    next.plays.forEach((p) => { if (isGone(p[key])) { p[key] = keepId; moved += 1; } });
    writes.push({ path: 'games/' + gid, data: next });
  });
  const tagKeyName = what === 'play' ? 'play' : 'plan';
  Object.entries(S.data.tags).forEach(([tid, t]) => { if (isGone(t[tagKeyName])) { writes.push({ path: 'tags/' + tid, data: { ...clone(t), [tagKeyName]: keepId } }); moved += 1; } });
  Object.entries(S.data.links).forEach(([lid, l]) => {
    if (!(l.marks || []).some((m) => isGone(m[key]))) return;
    const next = clone(l);
    next.marks.forEach((m) => { if (isGone(m[key])) m[key] = keepId; });
    writes.push({ path: 'links/' + lid, data: next });
  });
  const name = (id: string) => L.itemName(what, id);
  S.sheet = null;
  await commit('Merged ' + gone.map(name).join(', ') + ' into ' + name(keepId), writes, 'Merged. ' + plural(moved, 'reference') + ' moved to ' + name(keepId) + '.');
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
  if (isNew) go(refPath(route));
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
  go(paths.refs());
}

// ---------------------------------------------------------------------------
// Moments: what happened in a game or guide, and when
// ---------------------------------------------------------------------------
// What a moment shows, as a draft: a game plan, or steps in one age (one
// element, or several for a play).
function targetDraft(x: { planId?: string | null; playId?: string | null; elementId?: string | null; age?: Age | null; intent?: Intent | null; subject?: string | null }):
  Pick<MomentDraft, 'mode' | 'builder' | 'age' | 'plan' | 'origPlay'> {
  if (x.planId) return { mode: 'plan', builder: [], age: 'dark', plan: x.planId, origPlay: null };
  const p = x.playId ? L.play(x.playId) : null;
  if (p) return { mode: 'steps', builder: stepsToBuilder(p.steps), age: p.age, plan: '', origPlay: p.id };
  if (x.elementId) return { mode: 'steps', builder: [{ el: x.elementId, age: x.age || null, join: false, ...lookOf(x) }], age: x.age || L.elAges(x.elementId)[0] || 'dark', plan: '', origPlay: null };
  return { mode: 'steps', builder: [], age: 'dark', plan: '', origPlay: null };
}
function blankMoment(d: Pick<MomentDraft, 'refKind' | 'gameId' | 'linkId' | 'side' | 'civ' | 'shows'>): MomentDraft {
  return { refKind: d.refKind, gameId: d.gameId, linkId: d.linkId, pid: null, mid: null, side: d.side, civ: d.civ, mode: 'steps', builder: [], age: 'dark', plan: '', origPlay: null, name: '', at: '', note: '',
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
      Object.assign(d, { pid: p.pid, side: p.runBy || 'opponent', ...targetDraft(p), at: mk && mk.m.at != null ? fmtTime(mk.m.at) : '', note: p.notes || '',
        outcome: p.outcome || null, prep: p.prep || null, did: p.did || '', showHow: !!(p.outcome || p.prep || p.did) });
    }
  } else {
    const m = key ? (r.l.marks || []).find((x) => x.mid === key) : null;
    d = blankMoment({ refKind: 'guide', gameId: null, linkId: r.id, side: 'opponent', civ: r.l.civ || '', shows: 'threat' });
    if (m) Object.assign(d, { mid: m.mid, civ: m.civ || '', ...targetDraft(m), at: m.at != null ? fmtTime(m.at) : '', note: m.note || '', shows: m.shows || 'threat' });
  }
  openSheet({ kind: 'moment', draft: d, picking: !key });
}

export async function saveMoment(again: boolean): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'moment') return;
  const d = sh.draft;
  const planMode = d.mode === 'plan';
  const steps = planMode ? [] : builderToSteps(d.builder, d.age);
  const first = steps[0];
  if (planMode && !d.plan) { showToast('Pick the game plan first.', true); return; }
  if (!planMode && !first) { showToast('Add what happened first: one element, or several for a play.', true); return; }
  const civ = momentCiv(d);
  const off = steps.find((st) => (civ ? !L.civCan(civ, st.el, d.age) : !L.anyCivCan(st.el, d.age)));
  if (off) {
    showToast((civ ? L.blockText(civ, { el: off.el, age: d.age }) + '. Open it for ' + L.civShort(civ) : 'No civ can do ' + L.elName(off.el) + ' in ' + STAGE_NAME[d.age] + ' yet. Open it for a civ')
      + ' from its step, change the age, or take it out.', true);
    return;
  }
  const atText = (d.at || '').trim();
  const at = atText ? parseTime(atText) : null;
  if (atText && at == null) { showToast('Write the time like 2:30, or leave it empty.', true); return; }
  const items = clone(S.data.defs.plays);
  type Tgt = { planId: string | null; playId: string | null; elementId: string | null; age: Age | null; created?: boolean; name?: string; intent?: Intent | null; subject?: string | null };
  let tgt: Tgt;
  if (planMode) tgt = { ...targetOf('plan', d.plan), age: null };
  else if (steps.length === 1 && first) tgt = { ...targetOf('el', first.el), age: d.age, ...lookOf(first) };
  else {
    const nm = (d.name || '').trim();
    if (!L.matchPlay(d.builder, d.age, d.origPlay) && nm && items.some((x) => x.age === d.age && x.name.toLowerCase() === nm.toLowerCase())) { showToast('A different play in this age already has that name. Pick another.', true); return; }
    const r = L.resolvePlay(d.builder, d.age, nm, items, d.origPlay);
    tgt = { ...targetOf('play', r.id), age: null, created: !!r.created, name: r.name };
  }
  const writes: DocWrite[] = [];
  if (tgt.created) writes.push({ path: 'defs/plays', data: { items } });
  let title: string;
  if (d.refKind === 'game' && d.gameId) {
    const gameId = d.gameId;
    const g = clone(S.data.games[gameId] as Game);
    title = L.refTitleGame(g);
    g.plays = g.plays || [];
    const pid = d.pid || newId();
    const i = g.plays.findIndex((p) => p.pid === pid);
    const old: Partial<GamePlay> = i >= 0 ? { ...(g.plays[i] as GamePlay) } : {};
    delete old.intent;
    delete old.subject;
    const play: GamePlay = { ...old, ...lookOf(tgt), pid, runBy: d.side, planId: tgt.planId, playId: tgt.playId, elementId: tgt.elementId, age: tgt.age, outcome: d.outcome || null,
      prep: g.mine && d.side === 'opponent' ? d.prep || null : null, answerId: old.answerId || null, did: (d.did || '').trim(), notes: (d.note || '').trim() };
    if (i >= 0) g.plays[i] = play; else g.plays.push(play);
    writes.push({ path: 'games/' + gameId, data: g });
    const link = L.mainLink(gameId);
    if (link && timed(link)) {
      const lk = clone(S.data.links[link.id] as Link);
      const had = (lk.marks || []).some((m) => m.gamePlayId === pid);
      if (had || at != null) {
        lk.marks = (lk.marks || []).filter((m) => m.gamePlayId !== pid);
        if (at != null) lk.marks.push({ mid: newId(), at, gamePlayId: pid, civ: null, elementId: null, playId: null, planId: null, age: null, shows: 'both', note: '' });
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
    const mark: Mark = { mid, at, gamePlayId: null, civ: d.civ || null, elementId: tgt.elementId, playId: tgt.playId, planId: tgt.planId, age: tgt.age, shows: d.shows || 'threat', note: (d.note || '').trim(), ...lookOf(tgt) };
    const i = lk.marks.findIndex((m) => m.mid === mid);
    if (i >= 0) lk.marks[i] = mark; else lk.marks.push(mark);
    writes.push({ path: 'links/' + linkId, data: lk });
  } else return;
  const what = tgt.name || L.targetName(tgt);
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
    L.gameLinks(d.gameId).forEach((l) => { if ((l.marks || []).some((m) => m.gamePlayId === d.pid)) writes.push({ path: 'links/' + l.id, data: { ...clone(S.data.links[l.id] as Link), marks: l.marks.filter((m) => m.gamePlayId !== d.pid) } }); });
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
  openTagSheet({ civ: sh.civ, field: sh.itemKind, id: sh.id, place: parsePlace(sh.place ?? S.ui.check.place) }, sh);
}
export type { DefSheet };
