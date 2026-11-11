// The matchup rules: what a civ is documented doing in a place, and why.
// A Library wraps the loaded data. It never changes the data; it only reads it.
import { AGES, AGE_NAME, type Age, type Civ, type Element, type Feature, type Game, type GamePlay, type Kind, type LibraryData,
  type Link, type MapDef, type MapType, type Mark, type Place, type PlaceKind, type Step, type Strategy, type Tag } from './types';
import { byName, cap, fmtDate, fmtTime, hostOf, lowerFirst, plural, slug } from './text';

export type TagWithId = Tag & { id: string };
export type PlayRef = { gid: string; g: Game; p: GamePlay };
export type GuideRef = { lid: string; l: Link; m: Mark };
export type Relation = 'own' | 'inherited' | 'narrower' | 'none';
export type Evidence =
  | { kind: 'tag'; t: TagWithId; rel: Relation; rank: number }
  | { kind: 'viaPlay'; t: TagWithId; rel: Relation; rank: number }
  | ({ kind: 'game'; rank: number } & PlayRef)
  | ({ kind: 'guide'; rank: number } & GuideRef)
  | { kind: 'parts'; parts: { st: Step; ev: Evidence[] }[]; rank: number };
export type ItemKind = 'el' | 'play';
export interface Moment {
  key: string; i: number; at: number | null; civ: string | null; strategyId: string | null; elementId: string | null;
  age: Age | null; note: string; outcome?: GamePlay['outcome']; shows?: Mark['shows'];
}
export interface RefItem { kind: 'mine' | 'game' | 'guide'; id: string; route: string; title: string; created: string; date: string; count: number; source: Link['source'] | null; civ?: string | null }
export interface BuilderRow { el: string; age: Age | null; join: boolean }

export const isActive = (x: { active?: boolean } | null | undefined): boolean => !!x && x.active !== false;
export const placeKey = (p: { kind: PlaceKind; id?: string | null } | null | undefined): string => (p && p.kind !== 'any' ? p.kind + ':' + (p.id || '') : 'any:');
export function parsePlace(key: string): Place {
  const [k, id] = String(key || 'any:').split(':');
  if (k === 'type' || k === 'feature' || k === 'map') return id ? { kind: k, id } : { kind: 'any' };
  return { kind: 'any' };
}
export const fitsAge = (a: Age | null | undefined, b: Age | null | undefined): boolean => !a || !b || a === b;
export function builderToSteps(b: BuilderRow[]): Step[] {
  let n = 0;
  return b.map((x, i) => { if (i === 0 || !x.join) n += 1; return { el: x.el, age: x.age || null, step: n, notes: '' }; });
}
export function sortedSteps(steps: Step[]): Step[] {
  return (steps || []).slice().sort((a, b) => a.step - b.step || (a.el < b.el ? -1 : a.el > b.el ? 1 : 0));
}
export function stepsToBuilder(steps: Step[]): BuilderRow[] {
  const s = sortedSteps(steps);
  return s.map((st, i) => ({ el: st.el, age: st.age || null, join: i > 0 && st.step === (s[i - 1] as Step).step }));
}
export const tagField = (t: Tag): ItemKind => (t.play ? 'play' : 'el');
export const tagTargetId = (t: Tag): string => (t.play || t.el || '');
export const tagKey = (t: Tag): string => t.civ + '|' + tagField(t) + ':' + tagTargetId(t) + '|' + (t.age || '') + '|' + placeKey(t.place);
export const tagKeyOf = (civ: string, field: ItemKind, id: string, age: Age | null, place: Place): string =>
  civ + '|' + field + ':' + id + '|' + (age || '') + '|' + placeKey(place);
export const ranCiv = (g: Game, p: GamePlay): string | null => (p.runBy === 'player' ? g.playerCiv : g.oppCiv);
export const timed = (l: Link | null | undefined): boolean => !!l && l.source !== 'aoe4world';
export const guideTitle = (l: Link | null | undefined): string => (l && (l.title || hostOf(l.url))) || 'Guide';
export function newTag(civ: string, field: ItemKind, id: string, place: Place): Tag {
  return { civ, el: field === 'el' ? id : null, play: field === 'play' ? id : null, age: null, place: place.kind === 'any' ? { kind: 'any' } : { kind: place.kind, id: place.id },
    timing: '', tells: '', notes: '', confirmed: null, active: true, createdAt: new Date().toISOString() };
}

export class Library {
  constructor(public readonly data: LibraryData) {}

  // -------------------------------------------------------------- lookups
  civ(id: string | null | undefined): Civ | null { return this.data.defs.civs.find((x) => x.id === id) || null; }
  el(id: string | null | undefined): Element | null { return this.data.defs.elements.find((x) => x.id === id) || null; }
  strat(id: string | null | undefined): Strategy | null { return this.data.defs.strategies.find((x) => x.id === id) || null; }
  map(id: string | null | undefined): MapDef | null { return this.data.defs.maps.find((x) => x.id === id) || null; }
  mapType(id: string | null | undefined): MapType | null { return this.data.defs.mapTypes.find((x) => x.id === id) || null; }
  feature(id: string | null | undefined): Feature | null { return this.data.defs.features.find((x) => x.id === id) || null; }
  kind(id: string | null | undefined): Kind | null { return this.data.defs.kinds.find((x) => x.id === id) || null; }
  civName(id: string | null | undefined, fb?: string): string { const c = this.civ(id); return c ? c.name : fb || 'Not set'; }
  civShort(id: string | null | undefined): string { const c = this.civ(id); return c ? c.short || c.name : ''; }
  elName(id: string | null | undefined): string { const e = this.el(id); return e ? e.name : 'Unknown element'; }
  playTitle(id: string | null | undefined): string { const s = this.strat(id); return s ? s.name : 'Unknown play'; }
  elAges(id: string | null | undefined): Age[] { const e = this.el(id); return e && e.ages && e.ages.length ? e.ages : AGES; }
  activeCivs(): Civ[] { return this.data.defs.civs.filter(isActive).slice().sort(byName); }
  activeTypes(): MapType[] { return this.data.defs.mapTypes.filter(isActive); }
  activeFeatures(): Feature[] { return this.data.defs.features.filter(isActive); }
  mapsOfType(typeId: string): MapDef[] { return this.data.defs.maps.filter((m) => isActive(m) && m.type === typeId).sort(byName); }

  // -------------------------------------------------------------- plays as steps
  stepToken(st: Step): string { return st.el + (st.age && this.elAges(st.el).length > 1 ? '@' + st.age : ''); }
  stepLabel(st: Step): string { return this.elName(st.el) + (st.age && this.elAges(st.el).length > 1 ? ' in ' + AGE_NAME[st.age] + ' Age' : ''); }
  // "dark_barracks>tower_rush@dark": '>' later, '+' same step, '@age' only when it matters.
  signature(steps: Step[]): string {
    let out = '', prev: number | null = null;
    sortedSteps(steps).forEach((st, i) => { out += (i === 0 ? '' : st.step === prev ? '+' : '>') + this.stepToken(st); prev = st.step; });
    return out;
  }
  sequence(steps: Step[]): string {
    let out = '', prev: number | null = null;
    sortedSteps(steps).forEach((st, i) => { out += (i === 0 ? '' : st.step === prev ? ' with ' : ', then ') + this.stepLabel(st); prev = st.step; });
    return out;
  }
  containsEl(sid: string, elId: string, age: Age | null): boolean {
    const s = this.strat(sid);
    return !!s && s.steps.some((st) => st.el === elId && fitsAge(st.age, age));
  }
  // The saved play with these steps, preferring the one being edited.
  matchPlay(builder: BuilderRow[], orig?: string | null): Strategy | null {
    const sig = this.signature(builderToSteps(builder));
    const o = orig ? this.strat(orig) : null;
    if (o && this.signature(o.steps) === sig) return o;
    return this.data.defs.strategies.find((s) => isActive(s) && this.signature(s.steps) === sig) || null;
  }
  // Find the saved play with these steps, or add a new one to items.
  resolveStrategy(builder: BuilderRow[], name: string, items: Strategy[], orig?: string | null): { id: string; created?: boolean; name?: string } {
    const steps = builderToSteps(builder);
    const sig = this.signature(steps);
    if (orig && items.some((s) => s.id === orig && this.signature(s.steps) === sig)) return { id: orig };
    const hit = items.find((s) => isActive(s) && this.signature(s.steps) === sig);
    if (hit) return { id: hit.id };
    const display = (name || '').trim() || this.sequence(steps);
    const base = slug(display);
    let id = base, n = 2;
    while (items.some((s) => s.id === id)) { id = base + '_' + n; n += 1; }
    items.push({ id, name: display, description: '', notes: '', steps, where: [], whereNote: '', active: true, mergedInto: null });
    return { id, created: true, name: display };
  }

  // -------------------------------------------------------------- tags and games
  allTags(): TagWithId[] { return Object.entries(this.data.tags).map(([id, t]) => ({ id, ...t })); }
  activeTags(): TagWithId[] { return this.allTags().filter((t) => t.active !== false); }
  tagTargetName(t: Tag): string { return t.play ? this.playTitle(t.play) : this.elName(t.el); }
  tagTargetActive(t: Tag): boolean { return t.play ? isActive(this.strat(t.play)) : isActive(this.el(t.el)); }
  tagAgeText(t: Tag): string { return t.el && t.age && this.elAges(t.el).length > 1 ? AGE_NAME[t.age] + ' Age' : ''; }
  tagDetail(t: Tag): string { return [t.timing, t.tells ? 'Tells: ' + t.tells : '', t.notes].filter(Boolean).join('. '); }
  civCount(field: ItemKind, id: string): number { return new Set(this.activeTags().filter((t) => t[field] === id).map((t) => t.civ)).size; }
  civTagSummary(civId: string): string {
    const ts = this.activeTags().filter((t) => t.civ === civId);
    const e = new Set(ts.filter((t) => t.el).map((t) => t.el)).size;
    const p = new Set(ts.filter((t) => t.play).map((t) => t.play)).size;
    if (!e && !p) return 'Nothing tagged yet';
    return [e ? plural(e, 'element') : '', p ? plural(p, 'play') : ''].filter(Boolean).join(', ');
  }
  allPlays(): PlayRef[] { return Object.entries(this.data.games).flatMap(([gid, g]) => (g.plays || []).map((p) => ({ gid, g, p }))); }
  playActive(p: { strategyId?: string | null; elementId?: string | null }): boolean {
    return p.strategyId ? isActive(this.strat(p.strategyId)) : p.elementId ? isActive(this.el(p.elementId)) : false;
  }

  // -------------------------------------------------------------- places
  placeName(p: Place | null | undefined): string {
    if (!p || p.kind === 'any') return 'anywhere';
    if (p.kind === 'type') { const t = this.mapType(p.id); return (t ? t.name.toLowerCase() : p.id) + ' maps'; }
    if (p.kind === 'feature') { const f = this.feature(p.id); return f ? f.name.toLowerCase() : p.id; }
    const m = this.map(p.id);
    return m ? m.name : p.id;
  }
  placePhrase(p: Place | null | undefined): string {
    if (!p || p.kind === 'any') return 'anywhere';
    if (p.kind === 'feature') return 'on maps with ' + this.placeName(p);
    return 'on ' + this.placeName(p);
  }
  placeLabel(p: Place | null | undefined): string {
    if (!p || p.kind === 'any') return 'Anywhere';
    if (p.kind === 'type') return cap(this.placeName(p));
    if (p.kind === 'feature') return 'Maps with ' + this.placeName(p);
    return this.placeName(p);
  }
  wherePhrase(p: Place): string { return p.kind === 'feature' ? 'maps with ' + this.placeName(p) : this.placeName(p); }
  // How a tag's place (tp) relates to the place being viewed (vp).
  relation(tp: Place | null | undefined, vp: Place): Relation {
    const t: Place = tp || { kind: 'any' };
    if (vp.kind === 'any') return t.kind === 'any' ? 'own' : 'narrower';
    if (t.kind === 'any') return 'inherited';
    if (vp.kind === 'type') {
      if (t.kind === 'type') return t.id === vp.id ? 'own' : 'none';
      if (t.kind === 'map') { const m = this.map(t.id); return m && m.type === vp.id ? 'narrower' : 'none'; }
      if (t.kind === 'feature') return isActive(this.feature(t.id)) && this.data.defs.maps.some((m) => isActive(m) && m.type === vp.id && (m.features || []).includes(t.id)) ? 'narrower' : 'none';
      return 'none';
    }
    const m = this.map(vp.id);
    if (!m) return 'none';
    if (t.kind === 'map') return t.id === vp.id ? 'own' : 'none';
    if (t.kind === 'type') return m.type === t.id ? 'inherited' : 'none';
    if (t.kind === 'feature') return isActive(this.feature(t.id)) && (m.features || []).includes(t.id) ? 'inherited' : 'none';
    return 'none';
  }
  firstIdFor(k: PlaceKind): string | null {
    if (k === 'type') return (this.activeTypes()[0] || { id: null }).id;
    if (k === 'feature') return (this.activeFeatures()[0] || { id: null }).id;
    if (k === 'map') { for (const t of this.activeTypes()) { const m = this.mapsOfType(t.id)[0]; if (m) return m.id; } }
    return null;
  }
  gameMatches(map: string | null | undefined, vp: Place): boolean {
    if (vp.kind === 'any' || !map) return true;
    const m = this.map(map);
    if (!m) return true;
    if (vp.kind === 'type') return m.type === vp.id;
    const v = this.map(vp.id);
    return !!v && m.type === v.type;
  }

  // -------------------------------------------------------------- evidence
  civTags(civId: string): TagWithId[] { return this.activeTags().filter((t) => t.civ === civId && this.tagTargetActive(t)); }
  gamePlays(civId: string, vp: Place): PlayRef[] {
    return this.allPlays().filter(({ g, p }) => this.playActive(p) && ranCiv(g, p) === civId && this.gameMatches(g.map, vp));
  }
  gameMark(gid: string, pid: string): GuideRef | null {
    for (const [lid, l] of Object.entries(this.data.links)) {
      if (l.gameId !== gid) continue;
      const m = (l.marks || []).find((x) => x.playId === pid);
      if (m) return { lid, l, m };
    }
    return null;
  }
  // Guide moments for one civ, filtered by the guide's map when it has one.
  guideMarks(civId: string, vp: Place): GuideRef[] {
    const out: GuideRef[] = [];
    Object.entries(this.data.links).forEach(([lid, l]) => {
      if (l.gameId || l.status === 'dead' || !this.gameMatches(l.map || null, vp)) return;
      (l.marks || []).forEach((m) => { if (m.civ === civId && this.playActive(m)) out.push({ lid, l, m }); });
    });
    return out;
  }
  elementEvidence(civId: string, elId: string, vp: Place, age: Age | null): Evidence[] {
    const out: Evidence[] = [];
    this.civTags(civId).forEach((t) => {
      const rel = this.relation(t.place, vp);
      if (rel === 'none') return;
      if (t.el === elId && fitsAge(t.age, age)) out.push({ kind: 'tag', t, rel, rank: rel === 'narrower' ? 1 : 0 });
      if (t.play && this.containsEl(t.play, elId, age)) out.push({ kind: 'viaPlay', t, rel, rank: 2 });
    });
    this.gamePlays(civId, vp).forEach((x) => {
      if (x.p.strategyId ? this.containsEl(x.p.strategyId, elId, age) : x.p.elementId === elId && fitsAge(x.p.age, age)) out.push({ kind: 'game', ...x, rank: 3 });
    });
    this.guideMarks(civId, vp).forEach((x) => {
      if (x.m.strategyId ? this.containsEl(x.m.strategyId, elId, age) : x.m.elementId === elId && fitsAge(x.m.age, age)) out.push({ kind: 'guide', ...x, rank: 3 });
    });
    return out;
  }
  playEvidence(civId: string, sid: string, vp: Place): Evidence[] {
    const s = this.strat(sid);
    const out: Evidence[] = [];
    if (!s) return out;
    this.civTags(civId).forEach((t) => { if (t.play === sid) { const rel = this.relation(t.place, vp); if (rel !== 'none') out.push({ kind: 'tag', t, rel, rank: rel === 'narrower' ? 1 : 0 }); } });
    this.gamePlays(civId, vp).forEach((x) => { if (x.p.strategyId === sid) out.push({ kind: 'game', ...x, rank: 3 }); });
    this.guideMarks(civId, vp).forEach((x) => { if (x.m.strategyId === sid) out.push({ kind: 'guide', ...x, rank: 3 }); });
    if (!out.length && s.steps.length) {
      const parts = sortedSteps(s.steps).map((st) => ({ st, ev: this.elementEvidence(civId, st.el, vp, st.age).sort((a, b) => a.rank - b.rank) }));
      if (parts.every((x) => x.ev.length)) out.push({ kind: 'parts', parts, rank: 4 });
    }
    return out;
  }
  civElements(civId: string, vp: Place): { id: string; ev: Evidence[] }[] {
    return this.data.defs.elements.filter(isActive).map((e) => ({ id: e.id, ev: this.elementEvidence(civId, e.id, vp, null) })).filter((x) => x.ev.length)
      .sort((a, b) => minRank(a.ev) - minRank(b.ev) || this.elName(a.id).localeCompare(this.elName(b.id)));
  }
  civPlays(civId: string, vp: Place): { id: string; ev: Evidence[] }[] {
    return this.data.defs.strategies.filter(isActive).map((s) => ({ id: s.id, ev: this.playEvidence(civId, s.id, vp) })).filter((x) => x.ev.length)
      .sort((a, b) => minRank(a.ev) - minRank(b.ev) || this.playTitle(a.id).localeCompare(this.playTitle(b.id)));
  }
  civElsewhere(civId: string, vp: Place): TagWithId[] {
    return vp.kind === 'any' ? [] : this.civTags(civId).filter((t) => this.relation(t.place, vp) === 'none');
  }
  // "Comes up on" places on an element or play that match the place being viewed.
  whereHits(def: { where?: Place[] } | null, vp: Place): Place[] {
    const w = (def && def.where) || [];
    if (vp.kind === 'any') return [];
    return w.filter((p) => {
      if (p.kind === 'any') return false;
      if (vp.kind === 'type') {
        if (p.kind === 'type') return p.id === vp.id;
        if (p.kind === 'map') { const m = this.map(p.id); return !!m && m.type === vp.id; }
        return isActive(this.feature(p.id)) && this.data.defs.maps.some((m) => isActive(m) && m.type === vp.id && (m.features || []).includes(p.id));
      }
      const m = this.map(vp.id);
      if (!m) return false;
      if (p.kind === 'type') return p.id === m.type;
      if (p.kind === 'map') return p.id === m.id;
      return isActive(this.feature(p.id)) && (m.features || []).includes(p.id);
    });
  }
  tagReason(t: Tag, rel: Relation): string {
    const age = this.tagAgeText(t);
    return (rel === 'narrower' ? 'Tagged only ' : 'Tagged ') + this.placePhrase(t.place) + (age ? ', ' + age : '');
  }
  gameReason(g: Game): string {
    const m = g.map ? this.map(g.map) : null;
    return (g.mine ? 'Seen in your game' : 'Seen in a game you logged') + (m ? ' on ' + m.name : '') + (g.date ? ', ' + fmtDate(g.date) : '');
  }
  evText(e: Evidence, itemKind: ItemKind): string {
    if (e.kind === 'tag') return this.tagReason(e.t, e.rel);
    if (e.kind === 'viaPlay') return 'Part of ' + this.playTitle(e.t.play) + ', ' + lowerFirst(this.tagReason(e.t, e.rel));
    if (e.kind === 'game') {
      const mk = this.gameMark(e.gid, e.p.pid);
      return this.gameReason(e.g) + (mk && mk.m.at != null ? ', at ' + fmtTime(mk.m.at) : '') + (itemKind === 'el' && e.p.strategyId ? ', in ' + this.playTitle(e.p.strategyId) : '');
    }
    if (e.kind === 'guide') return 'Shown in a guide: ' + guideTitle(e.l) + (e.m.at != null ? ', at ' + fmtTime(e.m.at) : '') + (itemKind === 'el' && e.m.strategyId ? ', in ' + this.playTitle(e.m.strategyId) : '');
    return 'From its parts, each one tagged or seen';
  }
  partText(e: Evidence | undefined): string {
    if (!e) return '';
    if (e.kind === 'tag') return e.rel === 'narrower' ? 'tagged for some maps' : 'tagged';
    if (e.kind === 'viaPlay') return 'part of ' + this.playTitle(e.t.play);
    if (e.kind === 'guide') return 'shown in a guide';
    return 'seen in a game';
  }

  // -------------------------------------------------------------- upkeep checks
  health(): { dupes: Strategy[][]; issues: string[] } {
    const issues: string[] = [];
    const groups: Record<string, Strategy[]> = {};
    this.data.defs.strategies.filter(isActive).forEach((s) => { const k = this.signature(s.steps); (groups[k] = groups[k] || []).push(s); });
    const dupes = Object.values(groups).filter((g) => g.length > 1);
    const ageBad = (elId: string, age: Age | null) => !!age && !this.elAges(elId).includes(age);
    let ageConflicts = 0;
    this.data.defs.strategies.filter(isActive).forEach((s) => s.steps.forEach((st) => { if (ageBad(st.el, st.age)) ageConflicts += 1; }));
    this.activeTags().forEach((t) => { if (t.el && ageBad(t.el, t.age)) ageConflicts += 1; });
    const merged = new Set(this.data.defs.strategies.filter((s) => s.mergedInto).map((s) => s.id));
    const mergedRefs = this.allPlays().filter(({ p }) => p.strategyId && merged.has(p.strategyId)).length + this.activeTags().filter((t) => t.play && merged.has(t.play)).length;
    if (ageConflicts) issues.push(plural(ageConflicts, 'step or tag uses an age its element no longer allows', 'steps or tags use ages their elements no longer allow'));
    if (mergedRefs) issues.push(plural(mergedRefs, 'record still points at a merged play', 'records still point at merged plays'));
    return { dupes, issues };
  }

  // -------------------------------------------------------------- references
  gameLinks(gid: string): (Link & { id: string })[] {
    return Object.entries(this.data.links).filter(([, l]) => l.gameId === gid).map(([id, l]) => ({ id, ...l }));
  }
  mainLink(gid: string): (Link & { id: string }) | null {
    const ls = this.gameLinks(gid);
    return ls.find((l) => /youtube|twitch/.test(l.source || '')) || ls[0] || null;
  }
  refTitleGame(g: Game): string {
    if (g.title) return g.title;
    const m = g.map ? this.map(g.map) : null;
    return (this.civShort(g.playerCiv) || 'Someone') + ' vs ' + (this.civShort(g.oppCiv) || 'someone') + (m ? ', ' + m.name : '');
  }
  refItems(): RefItem[] {
    const games: RefItem[] = Object.entries(this.data.games).map(([id, g]) => ({
      kind: g.mine ? 'mine' : 'game', id, route: 'ref-game-' + id, title: this.refTitleGame(g), created: g.createdAt || '', date: g.date || '',
      count: (g.plays || []).length, source: (this.mainLink(id) || { source: null }).source
    }));
    const guides: RefItem[] = Object.entries(this.data.links).filter(([, l]) => !l.gameId).map(([id, l]) => ({
      kind: 'guide', id, route: 'ref-guide-' + id, title: guideTitle(l), created: l.createdAt || '', date: '', count: (l.marks || []).length, source: l.source, civ: l.civ || null
    }));
    return [...games, ...guides].sort((a, b) => b.created.localeCompare(a.created) || b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }
  // Every moment, in a game or a guide, that shows an element or play.
  refsFor(field: ItemKind, id: string): { route: string; game?: Game; guide?: Link; sub: string }[] {
    const rows: { route: string; game?: Game; guide?: Link; sub: string }[] = [];
    this.allPlays().forEach(({ gid, g, p }) => {
      const direct = field === 'el' ? p.elementId === id : p.strategyId === id;
      const via = field === 'el' && !!p.strategyId && this.containsEl(p.strategyId, id, null);
      if (!direct && !via) return;
      const mk = this.gameMark(gid, p.pid);
      rows.push({ route: 'ref-game-' + gid, game: g, sub: this.civName(ranCiv(g, p), 'Side not set') + (mk && mk.m.at != null ? ' at ' + fmtTime(mk.m.at) : '') + (via ? ', in ' + this.playTitle(p.strategyId) : '') });
    });
    Object.entries(this.data.links).forEach(([lid, l]) => {
      if (l.gameId) return;
      (l.marks || []).forEach((m) => {
        const direct = field === 'el' ? m.elementId === id : m.strategyId === id;
        const via = field === 'el' && !!m.strategyId && this.containsEl(m.strategyId, id, null);
        if (!direct && !via) return;
        rows.push({ route: 'ref-guide-' + lid, guide: l, sub: 'Guide' + (m.civ ? ', ' + this.civName(m.civ) : '') + (m.at != null ? ' at ' + fmtTime(m.at) : '') + (via ? ', in ' + this.playTitle(m.strategyId) : '') });
      });
    });
    return rows;
  }
  gameMoments(gid: string, g: Game): Moment[] {
    return (g.plays || []).map((p, i) => {
      const mk = this.gameMark(gid, p.pid);
      return { key: p.pid, i, at: mk ? mk.m.at : null, civ: ranCiv(g, p), strategyId: p.strategyId || null, elementId: p.elementId || null, age: p.age || null, note: p.notes || '', outcome: p.outcome || null };
    });
  }
  guideMoments(l: Link): Moment[] {
    return (l.marks || []).map((m, i) => ({ i, key: m.mid, at: m.at, civ: m.civ, strategyId: m.strategyId || null, elementId: m.elementId || null, age: m.age || null, note: m.note || '', shows: m.shows }))
      .sort((a, b) => (a.at == null ? 1e9 : a.at) - (b.at == null ? 1e9 : b.at) || a.i - b.i);
  }
  momentName(mo: { strategyId: string | null; elementId: string | null; age: Age | null }): string {
    if (mo.strategyId) return this.playTitle(mo.strategyId);
    if (mo.elementId) return this.elName(mo.elementId) + (mo.age && this.elAges(mo.elementId).length > 1 ? ', ' + AGE_NAME[mo.age] + ' Age' : '');
    return 'Not classified yet';
  }
}

export const minRank = (ev: Evidence[]): number => Math.min(...ev.map((e) => e.rank));
