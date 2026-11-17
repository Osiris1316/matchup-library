// The matchup rules: what a civ is documented doing in a place, and why.
// A Library wraps the loaded data. It never changes the data; it only reads it.
//
// Three kinds of thing can be documented for a civ:
//   el    an element, such as Spears or Tower
//   play  one way to play one age, such as "Spears, then towers" in the Dark Age
//   plan  a game plan: one play per age, Dark through early Castle
// Evidence flows downward: a tag on a game plan documents each of its plays,
// and a tag on a play documents each of its elements in that play's age.
import { AGES, AGE_NAME, EL_TYPES, INTENT_NAME, STAGE_AGES, STAGE_NAME, type Age, type Civ, type ElType, type Element, type Feature, type Game,
  type GamePlan, type GamePlay, type Intent, type Kind, type LibraryData, type Link, type MapDef, type MapType, type Mark, type Place, type PlaceKind,
  type Play, type Stage, type Step, type Subject, type Tag, type UseLook } from './types';
import { byName, cap, fmtDate, fmtTime, hostOf, lowerFirst, plural, slug } from './text';

export type TagWithId = Tag & { id: string };
export type PlayRef = { gid: string; g: Game; p: GamePlay };
export type GuideRef = { lid: string; l: Link; m: Mark };
export type Relation = 'own' | 'inherited' | 'narrower' | 'none';
export type Evidence =
  | { kind: 'tag'; t: TagWithId; rel: Relation; rank: number }
  | { kind: 'viaPlay'; t: TagWithId; rel: Relation; rank: number }
  | { kind: 'viaPlan'; t: TagWithId; rel: Relation; rank: number }
  | ({ kind: 'game'; rank: number } & PlayRef)
  | ({ kind: 'guide'; rank: number } & GuideRef)
  | { kind: 'parts'; parts: { st: Step; ev: Evidence[] }[]; rank: number }
  | { kind: 'stages'; stages: { age: Age; play: string; ev: Evidence[] }[]; rank: number }
  | { kind: 'universal'; rank: number };
export type ItemKind = 'el' | 'play' | 'plan';
export const ITEM_WORD: Record<ItemKind, string> = { el: 'element', play: 'play', plan: 'game plan' };
// What a game play, a moment or a mark points at.
export interface Target extends UseLook { elementId?: string | null; playId?: string | null; planId?: string | null; age?: Age | null }
export interface Moment extends UseLook {
  key: string; i: number; at: number | null; civ: string | null; planId: string | null; playId: string | null; elementId: string | null;
  age: Age | null; note: string; outcome?: GamePlay['outcome']; shows?: Mark['shows'];
}
export interface RefItem { kind: 'mine' | 'game' | 'guide'; id: string; route: string; title: string; created: string; date: string; count: number; source: Link['source'] | null; civ?: string | null }
export interface BuilderRow extends UseLook { el: string; age: Age | null; join: boolean }
// How one use of an element looks: the split pill's parts.
export interface Look {
  el: string; name: string; title: string; type: ElType | null; intent: Intent | null;
  subject: Subject | null; icon: string | null; landmark: boolean;
}
// Something a civ can't do: an element in an age, or (age null) at all.
export interface Block { el: string; age: Age | null }
// An earlier age the aoe4world data gives a civ, and the ages it would have with it.
export interface EarlyAge { el: string; civ: string; age: Age; ages: Age[] }
// The civ stages page: each age's plays for one civ, grouped by family.
//   documented  tagged, part of a tagged game plan, or seen in a game or guide
//   standard    every step is something every civ does
//   parts       every step documented for this civ, never seen together
//   open        possible for this civ, nothing documented
export type StageTier = 'documented' | 'standard' | 'parts' | 'open';
export interface StageCard { id: string; tier: StageTier; ev: Evidence[]; blocked: Block[] }
export interface StageColumn { age: Age; families: { name: string; cards: StageCard[] }[]; count: number; closed: string[] }
export interface StagePlan { id: string; ev: Evidence[]; tier: 'documented' | 'parts' }
// Families in the order the stages page shows them; others follow by name.
export const FAMILY_ORDER: Partial<Record<Age, string[]>> = {
  dark: ['Tech', 'Eco openings', 'Barracks first', 'Towers first'],
  feudal: ['Straight to Castle', 'Second TC first', 'Army first'],
  castle: ['Follow-ups']
};
const TIER_ORDER: StageTier[] = ['documented', 'standard', 'parts', 'open'];
const ANY_PLACE: Place = { kind: 'any' };

export const isActive = (x: { active?: boolean } | null | undefined): boolean => !!x && x.active !== false;
// A civ's ages with one more: the ages it has now, the new one, and every age
// from there up to where the usual ages begin.
export function agesFrom(now: Age[], usual: Age[], age: Age): Age[] {
  const from = AGES.indexOf(age);
  const firstUsual = AGES.findIndex((a) => usual.includes(a));
  return AGES.filter((a, i) => now.includes(a) || a === age || (i > from && i < firstUsual));
}
export const placeKey = (p: { kind: PlaceKind; id?: string | null } | null | undefined): string => (p && p.kind !== 'any' ? p.kind + ':' + (p.id || '') : 'any:');
export function parsePlace(key: string): Place {
  const [k, id] = String(key || 'any:').split(':');
  if (k === 'type' || k === 'feature' || k === 'map') return id ? { kind: k, id } : { kind: 'any' };
  return { kind: 'any' };
}
export const fitsAge = (a: Age | null | undefined, b: Age | null | undefined): boolean => !a || !b || a === b;
export const fitsIntent = (want: Intent | null | undefined, have: Intent | null | undefined): boolean => !want || !have || want === have;
// Only overrides that are set, so records stay as small as before.
export function lookOf(x: UseLook | null | undefined): UseLook {
  const o: UseLook = {};
  if (x && x.intent) o.intent = x.intent;
  if (x && x.subject) o.subject = x.subject;
  return o;
}
// A play's builder rows to steps, all in the play's age.
export function builderToSteps(b: BuilderRow[], age: Age | null = null): Step[] {
  let n = 0;
  return b.map((x, i) => { if (i === 0 || !x.join) n += 1; return { el: x.el, age: age || x.age || null, step: n, notes: '', ...lookOf(x) }; });
}
export function sortedSteps(steps: Step[]): Step[] {
  return (steps || []).slice().sort((a, b) => a.step - b.step || (a.el < b.el ? -1 : a.el > b.el ? 1 : 0));
}
export function stepsToBuilder(steps: Step[]): BuilderRow[] {
  const s = sortedSteps(steps);
  return s.map((st, i) => ({ el: st.el, age: st.age || null, join: i > 0 && st.step === (s[i - 1] as Step).step, ...lookOf(st) }));
}
export const tagField = (t: Tag): ItemKind => (t.plan ? 'plan' : t.play ? 'play' : 'el');
export const tagTargetId = (t: Tag): string => (t.plan || t.play || t.el || '');
// Matches the unique index on tags: civ, target, age, place and intent.
export const tagKey = (t: Tag): string => tagKeyOf(t.civ, tagField(t), tagTargetId(t), t.el ? t.age : null, t.place, t.el ? t.intent || null : null);
export const tagKeyOf = (civ: string, field: ItemKind, id: string, age: Age | null, place: Place, intent: Intent | null = null): string =>
  civ + '|' + field + ':' + id + '|' + (field === 'el' ? age || '' : '') + '|' + placeKey(place) + '|' + (field === 'el' ? intent || '' : '');
export const ranCiv = (g: Game, p: GamePlay): string | null => (p.runBy === 'player' ? g.playerCiv : g.oppCiv);
export const timed = (l: Link | null | undefined): boolean => !!l && l.source !== 'aoe4world';
export const guideTitle = (l: Link | null | undefined): string => (l && (l.title || hostOf(l.url))) || 'Guide';
export function newTag(civ: string, field: ItemKind, id: string, place: Place): Tag {
  return { civ, el: field === 'el' ? id : null, play: field === 'play' ? id : null, plan: field === 'plan' ? id : null, age: null,
    place: place.kind === 'any' ? { kind: 'any' } : { kind: place.kind, id: place.id },
    timing: '', tells: '', notes: '', confirmed: null, active: true, createdAt: new Date().toISOString() };
}
// Which field of a target is set, and its id.
export const targetField = (x: Target): ItemKind | null => (x.planId ? 'plan' : x.playId ? 'play' : x.elementId ? 'el' : null);
export const targetId = (x: Target): string => x.planId || x.playId || x.elementId || '';
export const targetOf = (field: ItemKind, id: string): { elementId: string | null; playId: string | null; planId: string | null } =>
  ({ elementId: field === 'el' ? id : null, playId: field === 'play' ? id : null, planId: field === 'plan' ? id : null });
// A plan's stages in age order, set ones only.
export const stagesOf = (g: GamePlan | null | undefined): { age: Age; stage: Stage }[] =>
  g ? AGES.filter((a) => g.stages && g.stages[a]).map((a) => ({ age: a, stage: g.stages[a] as Stage })) : [];

export class Library {
  constructor(public readonly data: LibraryData) {}

  // -------------------------------------------------------------- lookups
  civ(id: string | null | undefined): Civ | null { return this.data.defs.civs.find((x) => x.id === id) || null; }
  el(id: string | null | undefined): Element | null { return this.data.defs.elements.find((x) => x.id === id) || null; }
  play(id: string | null | undefined): Play | null { return this.data.defs.plays.find((x) => x.id === id) || null; }
  plan(id: string | null | undefined): GamePlan | null { return this.data.defs.gamePlans.find((x) => x.id === id) || null; }
  map(id: string | null | undefined): MapDef | null { return this.data.defs.maps.find((x) => x.id === id) || null; }
  mapType(id: string | null | undefined): MapType | null { return this.data.defs.mapTypes.find((x) => x.id === id) || null; }
  feature(id: string | null | undefined): Feature | null { return this.data.defs.features.find((x) => x.id === id) || null; }
  kind(id: string | null | undefined): Kind | null { return this.data.defs.kinds.find((x) => x.id === id) || null; }
  civName(id: string | null | undefined, fb?: string): string { const c = this.civ(id); return c ? c.name : fb || 'Not set'; }
  civShort(id: string | null | undefined): string { const c = this.civ(id); return c ? c.short || c.name : ''; }
  elName(id: string | null | undefined): string { const e = this.el(id); return e ? e.name : 'Unknown element'; }
  playTitle(id: string | null | undefined): string { const p = this.play(id); return p ? p.name : 'Unknown play'; }
  planTitle(id: string | null | undefined): string { const g = this.plan(id); return g ? g.name : 'Unknown game plan'; }
  itemName(field: ItemKind, id: string | null | undefined): string { return field === 'plan' ? this.planTitle(id) : field === 'play' ? this.playTitle(id) : this.elName(id); }
  itemDef(field: ItemKind, id: string | null | undefined): Element | Play | GamePlan | null { return field === 'plan' ? this.plan(id) : field === 'play' ? this.play(id) : this.el(id); }
  elAges(id: string | null | undefined): Age[] { const e = this.el(id); return e && e.ages && e.ages.length ? e.ages : AGES; }
  activeCivs(): Civ[] { return this.data.defs.civs.filter(isActive).slice().sort(byName); }
  activePlays(age?: Age | null): Play[] { return this.data.defs.plays.filter((p) => isActive(p) && (!age || p.age === age)); }
  activePlans(): GamePlan[] { return this.data.defs.gamePlans.filter(isActive); }
  // Families used so far in an age, in the order first seen.
  families(age: Age): string[] { return [...new Set(this.data.defs.plays.filter((p) => p.age === age && p.family).map((p) => p.family))]; }

  // -------------------------------------------------------------- looks: type, intent, subject
  subject(id: string | null | undefined): Subject | null { return (id && this.data.subjects && this.data.subjects[id]) || null; }
  subjects(): Subject[] { return Object.values(this.data.subjects || {}); }
  elType(id: string | null | undefined): ElType | null { const e = this.el(id); return e && EL_TYPES.includes(e.kind as ElType) ? (e.kind as ElType) : null; }
  // An element's default intent: its own, else its subject's.
  elIntent(id: string | null | undefined): Intent | null { const e = this.el(id); return (e && (e.intent || (this.subject(e.subject) || { defaultIntent: null }).defaultIntent)) || null; }
  // The display rule: the use's override if set, else the element's default,
  // else the subject's default. An age-up with a landmark shows the landmark.
  look(elId: string | null | undefined, use?: UseLook | null): Look {
    const e = this.el(elId);
    const sj = this.subject((use && use.subject) || (e && e.subject));
    const type = this.elType(elId);
    const landmark = !!sj && sj.kind === 'landmark' && type === 'age_tech';
    const name = e ? e.name : 'Unknown element';
    return {
      el: elId || '', name: landmark && sj ? sj.name : name, title: landmark && sj ? name + ': ' + sj.name : name, type,
      intent: (use && use.intent) || (e && e.intent) || (sj && sj.defaultIntent) || null, subject: sj, icon: sj ? sj.icon : null, landmark
    };
  }
  isUniversal(id: string | null | undefined): boolean { const e = this.el(id); return !!e && !!e.universal; }
  cannot(civId: string, elId: string): boolean { const e = this.el(elId); return !!e && (e.cannot || []).includes(civId); }

  // -------------------------------------------------------------- ages by civ
  // The ages a civ can do an element in: none when it's listed as a civ that
  // can't, its own ages when it has some, else the element's usual ages.
  civAges(civId: string, elId: string | null | undefined): Age[] {
    const e = this.el(elId);
    if (!e) return AGES;
    if ((e.cannot || []).includes(civId)) return [];
    const own = e.civAges && e.civAges[civId];
    return own ? AGES.filter((a) => own.includes(a)) : this.elAges(elId);
  }
  hasOwnAges(civId: string, elId: string | null | undefined): boolean { const e = this.el(elId); return !!e && !!e.civAges && !!e.civAges[civId]; }
  civCan(civId: string, elId: string, age: Age): boolean { return this.civAges(civId, elId).includes(age); }
  // A play step is allowed when any civ can do the element in the play's age.
  anyCivCan(elId: string, age: Age): boolean {
    if (this.elAges(elId).includes(age)) return true;
    const e = this.el(elId);
    return !!e && Object.values(e.civAges || {}).some((ages) => ages.includes(age));
  }
  anyCivAges(elId: string): Age[] { return AGES.filter((a) => this.anyCivCan(elId, a)); }
  // The civs whose own ages open an age the element usually lacks.
  civsOpening(elId: string, age: Age): string[] {
    const e = this.el(elId);
    if (!e || this.elAges(elId).includes(age)) return [];
    return Object.entries(e.civAges || {}).filter(([, ages]) => ages.includes(age)).map(([c]) => c).sort((a, b) => this.civName(a, a).localeCompare(this.civName(b, b)));
  }
  // "Feudal, Castle, Imperial · English from Dark": the usual ages, and civs that differ.
  agesNote(elId: string): string {
    const e = this.el(elId);
    const usual = this.elAges(elId);
    const diff = Object.entries((e && e.civAges) || {}).map(([c, ages]) => {
      const first = ages[0];
      if (first && AGES.indexOf(first) < AGES.indexOf(usual[0] as Age)) return this.civShort(c) + ' from ' + AGE_NAME[first];
      return this.civShort(c) + ': ' + (ages.length ? ages.map((a) => AGE_NAME[a]).join(', ') : 'none');
    });
    const base = usual.length === 4 ? 'Any age' : usual.length === 1 ? AGE_NAME[usual[0] as Age] + ' only' : usual.map((a) => AGE_NAME[a]).join(', ');
    return base + (diff.length ? ' · ' + diff.join(', ') : '');
  }
  // The ages a civ would have with one more: its ages now, the new one, and
  // every age from there up to where the element's usual ages begin.
  agesWith(civId: string, elId: string, age: Age): Age[] {
    const usual = this.elAges(elId);
    return agesFrom(this.cannot(civId, elId) ? usual : this.civAges(civId, elId), usual, age);
  }
  // What a civ can't do among some steps, all in one age.
  cantDo(civId: string, steps: Step[], age: Age): Block[] {
    const out: Block[] = [];
    sortedSteps(steps).forEach((st) => {
      if (!this.civCan(civId, st.el, age) && !out.some((b) => b.el === st.el && b.age === age)) out.push({ el: st.el, age: this.civAges(civId, st.el).length ? age : null });
    });
    return out;
  }
  // What stops a civ being tagged with an element (in an age), a play, or a game plan.
  blockers(civId: string, field: ItemKind, id: string, age: Age | null = null): Block[] {
    if (field === 'el') {
      const ages = this.civAges(civId, id);
      if (!ages.length) return [{ el: id, age: null }];
      return age && !ages.includes(age) ? [{ el: id, age }] : [];
    }
    if (field === 'play') { const p = this.play(id); return p ? this.cantDo(civId, p.steps, p.age) : []; }
    const out: Block[] = [];
    stagesOf(this.plan(id)).forEach(({ stage }) => {
      const p = this.play(stage.play);
      if (p) this.cantDo(civId, p.steps, p.age).forEach((b) => { if (!out.some((x) => x.el === b.el && x.age === b.age)) out.push(b); });
    });
    return out;
  }
  // "Men-at-arms isn't open to HRE in Dark Age."
  blockText(civId: string, b: Block): string {
    return b.age ? this.elName(b.el) + " isn't open to " + this.civShort(civId) + ' in ' + STAGE_NAME[b.age]
      : this.civShort(civId) + " is listed as a civ that can't do " + this.elName(b.el);
  }
  // Earlier ages the aoe4world data gives civs, that this library doesn't have yet.
  earlyAges(elId: string): EarlyAge[] {
    const e = this.el(elId);
    const sj = e && isActive(e) ? this.subject(e.subject) : null;
    if (!e || !sj || !sj.early) return [];
    const out: EarlyAge[] = [];
    Object.entries(sj.early).forEach(([c, n]) => {
      const a = AGES[Number(n) - 1];
      if (!a || !isActive(this.civ(c)) || this.cannot(c, elId) || this.civCan(c, elId, a)) return;
      out.push({ el: elId, civ: c, age: a, ages: this.agesWith(c, elId, a) });
    });
    return out.sort((x, y) => this.civName(x.civ).localeCompare(this.civName(y.civ)));
  }
  allEarlyAges(): EarlyAge[] { return this.data.defs.elements.filter(isActive).flatMap((e) => this.earlyAges(e.id)); }
  // Whether this civ plausibly has the element at all: the game data's civ
  // list for its subject, unless the library says otherwise (its own ages, a
  // tag, a game or a guide). Only used to keep "not seen" plays believable.
  civMayHave(civId: string, elId: string): boolean {
    const e = this.el(elId);
    if (!e) return false;
    if (this.cannot(civId, elId)) return false;
    if (e.universal || (e.civAges && e.civAges[civId])) return true;
    const sj = this.subject(e.subject);
    if (!sj || !sj.civs || sj.kind === 'landmark') return true;
    const parent = (this.civ(civId) || { parent: null }).parent;
    if (sj.civs.includes(civId) || (!!parent && sj.civs.includes(parent))) return true;
    return this.elementEvidence(civId, elId, ANY_PLACE, null).some((x) => x.kind !== 'universal');
  }
  // An age-up rather than a technology: an age-up or tech element with no subject, or a landmark.
  isAgeUp(elId: string | null | undefined): boolean {
    if (this.elType(elId) !== 'age_tech') return false;
    const sj = this.subject((this.el(elId) || { subject: null }).subject);
    return !sj || sj.kind === 'landmark';
  }
  // What a use adds to an element's text name: a landmark, or an intent that differs from the default.
  useNote(elId: string, use: UseLook | null | undefined): string {
    const parts: string[] = [];
    const sj = use && use.subject ? this.subject(use.subject) : null;
    if (sj) parts.push(sj.name);
    if (use && use.intent && use.intent !== this.elIntent(elId)) parts.push(INTENT_NAME[use.intent].toLowerCase());
    return parts.join(', ');
  }
  activeTypes(): MapType[] { return this.data.defs.mapTypes.filter(isActive); }
  activeFeatures(): Feature[] { return this.data.defs.features.filter(isActive); }
  mapsOfType(typeId: string): MapDef[] { return this.data.defs.maps.filter((m) => isActive(m) && m.type === typeId).sort(byName); }

  // -------------------------------------------------------------- steps, plays and plans
  // '!intent' and '#subject' only when the step overrides them. A play's
  // steps share its age, so the age isn't part of the token.
  stepToken(st: Step): string { return st.el + (st.intent ? '!' + st.intent : '') + (st.subject ? '#' + st.subject : ''); }
  stepLabel(st: Step): string { const note = this.useNote(st.el, st); return this.elName(st.el) + (note ? ' (' + note + ')' : ''); }
  // "dark:barracks>tower!offensive": '>' later, '+' same step.
  signature(steps: Step[], age: Age | null = null): string {
    let out = '', prev: number | null = null;
    sortedSteps(steps).forEach((st, i) => { out += (i === 0 ? '' : st.step === prev ? '+' : '>') + this.stepToken(st); prev = st.step; });
    return (age ? age + ':' : '') + out;
  }
  playSignature(p: Play): string { return this.signature(p.steps, p.age); }
  sequence(steps: Step[]): string {
    let out = '', prev: number | null = null;
    sortedSteps(steps).forEach((st, i) => { out += (i === 0 ? '' : st.step === prev ? ' with ' : ', then ') + this.stepLabel(st); prev = st.step; });
    return out;
  }
  // "Dark: Spears. Feudal: Fast castle." Ages not set are left out.
  planSequence(g: GamePlan | null | undefined): string {
    return stagesOf(g).map(({ age, stage }) => AGE_NAME[age] + ': ' + this.playTitle(stage.play)).join('. ');
  }
  planSignature(g: GamePlan): string { return stagesOf(g).map(({ age, stage }) => age + '=' + stage.play).join('|'); }
  // The intent a use actually has, for matching: its override, else the element's default.
  useIntent(elId: string, use: UseLook | null | undefined): Intent | null { return (use && use.intent) || this.elIntent(elId); }
  playHasEl(pid: string | null | undefined, elId: string, age: Age | null, intent: Intent | null = null): boolean {
    const p = this.play(pid);
    return !!p && fitsAge(p.age, age) && p.steps.some((st) => st.el === elId && fitsIntent(intent, this.useIntent(elId, st)));
  }
  planHasPlay(gid: string | null | undefined, pid: string): boolean { return stagesOf(this.plan(gid)).some(({ stage }) => stage.play === pid); }
  planHasEl(gid: string | null | undefined, elId: string, age: Age | null, intent: Intent | null = null): boolean {
    return stagesOf(this.plan(gid)).some(({ stage }) => this.playHasEl(stage.play, elId, age, intent));
  }
  // Does a game play, moment or mark show this item, directly or as part of something bigger?
  shows(x: Target, field: ItemKind, id: string): 'direct' | 'via' | null {
    if (field === 'plan') return x.planId === id ? 'direct' : null;
    if (field === 'play') return x.playId === id ? 'direct' : x.planId && this.planHasPlay(x.planId, id) ? 'via' : null;
    if (x.elementId) return x.elementId === id ? 'direct' : null;
    if (x.playId) return this.playHasEl(x.playId, id, null) ? 'via' : null;
    if (x.planId) return this.planHasEl(x.planId, id, null) ? 'via' : null;
    return null;
  }
  // The saved play with these steps in this age, preferring the one being edited.
  matchPlay(builder: BuilderRow[], age: Age, orig?: string | null): Play | null {
    const sig = this.signature(builderToSteps(builder, age), age);
    const o = orig ? this.play(orig) : null;
    if (o && this.playSignature(o) === sig) return o;
    return this.activePlays().find((p) => this.playSignature(p) === sig) || null;
  }
  // Find the saved play with these steps in this age, or add a new one to items.
  resolvePlay(builder: BuilderRow[], age: Age, name: string, items: Play[], orig?: string | null): { id: string; created?: boolean; name?: string } {
    const steps = builderToSteps(builder, age);
    const sig = this.signature(steps, age);
    if (orig && items.some((p) => p.id === orig && this.playSignature(p) === sig)) return { id: orig };
    const hit = items.find((p) => isActive(p) && this.playSignature(p) === sig);
    if (hit) return { id: hit.id };
    const display = (name || '').trim() || this.sequence(steps);
    const base = age + '_' + slug(display);
    let id = base, n = 2;
    while (items.some((p) => p.id === id)) { id = base + '_' + n; n += 1; }
    items.push({ id, name: display, age, family: this.suggestFamily(steps, age), description: '', tells: '', notes: '', steps, where: [], whereNote: '', active: true, mergedInto: null });
    return { id, created: true, name: display };
  }
  // A first guess at a play's family, from its steps. Editable.
  suggestFamily(steps: Step[], age: Age): string {
    const s = sortedSteps(steps);
    if (age === 'dark') {
      if (s.every((st) => this.elType(st.el) === 'economy')) return s.some((st) => this.subject((this.el(st.el) || { subject: null }).subject)?.id === 'villager') && s.length === 1 ? 'Tech' : 'Eco openings';
      const first = s.find((st) => this.elType(st.el) !== 'economy');
      if (first && this.elType(first.el) === 'structure' && this.el(first.el)?.subject === 'outpost') return 'Towers first';
      return 'Barracks first';
    }
    if (age === 'feudal') {
      const first = s.find((st) => !(this.elType(st.el) === 'age_tech' && !this.isAgeUp(st.el)) && this.el(st.el)?.subject !== 'outpost');
      if (!first) return 'Straight to Castle';
      if (this.isAgeUp(first.el)) return 'Straight to Castle';
      if (this.elType(first.el) === 'economy') return 'Second TC first';
      return 'Army first';
    }
    return 'Follow-ups';
  }

  // -------------------------------------------------------------- tags and games
  allTags(): TagWithId[] { return Object.entries(this.data.tags).map(([id, t]) => ({ id, ...t })); }
  activeTags(): TagWithId[] { return this.allTags().filter((t) => t.active !== false); }
  tagTargetName(t: Tag): string { return this.itemName(tagField(t), tagTargetId(t)); }
  tagTargetActive(t: Tag): boolean { return isActive(this.itemDef(tagField(t), tagTargetId(t))); }
  tagAgeText(t: Tag): string {
    if (t.play) { const p = this.play(t.play); return p ? STAGE_NAME[p.age] : ''; }
    return t.el && t.age && this.elAges(t.el).length > 1 ? AGE_NAME[t.age] + ' Age' : '';
  }
  tagDetail(t: Tag): string { return [t.timing, t.tells ? 'Tells: ' + t.tells : '', t.notes].filter(Boolean).join('. '); }
  civCount(field: ItemKind, id: string): number { return new Set(this.activeTags().filter((t) => tagField(t) === field && tagTargetId(t) === id).map((t) => t.civ)).size; }
  civTagSummary(civId: string): string {
    const ts = this.activeTags().filter((t) => t.civ === civId);
    const n = (f: ItemKind) => new Set(ts.filter((t) => tagField(t) === f).map(tagTargetId)).size;
    const e = n('el'), p = n('play'), g = n('plan');
    if (!e && !p && !g) return 'Nothing tagged yet';
    return [e ? plural(e, 'element') : '', p ? plural(p, 'play') : '', g ? plural(g, 'game plan') : ''].filter(Boolean).join(', ');
  }
  allPlays(): PlayRef[] { return Object.entries(this.data.games).flatMap(([gid, g]) => (g.plays || []).map((p) => ({ gid, g, p }))); }
  targetActive(x: Target): boolean { const f = targetField(x); return !!f && isActive(this.itemDef(f, targetId(x))); }
  targetName(x: Target): string { const f = targetField(x); return f ? this.itemName(f, targetId(x)) : 'Not classified yet'; }

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
    return this.allPlays().filter(({ g, p }) => this.targetActive(p) && ranCiv(g, p) === civId && this.gameMatches(g.map, vp));
  }
  gameMark(gid: string, pid: string): GuideRef | null {
    for (const [lid, l] of Object.entries(this.data.links)) {
      if (l.gameId !== gid) continue;
      const m = (l.marks || []).find((x) => x.gamePlayId === pid);
      if (m) return { lid, l, m };
    }
    return null;
  }
  // Guide moments for one civ, filtered by the guide's map when it has one.
  guideMarks(civId: string, vp: Place): GuideRef[] {
    const out: GuideRef[] = [];
    Object.entries(this.data.links).forEach(([lid, l]) => {
      if (l.gameId || l.status === 'dead' || !this.gameMatches(l.map || null, vp)) return;
      (l.marks || []).forEach((m) => { if (m.civ === civId && this.targetActive(m)) out.push({ lid, l, m }); });
    });
    return out;
  }
  // intent narrows the match when a play step asks for a particular use.
  // A universal element counts for every civ that can do it, in its default
  // intent; a different use (towers used offensively, say) still needs a tag.
  // A civ that can't do the element in that age has no evidence for it there.
  elementEvidence(civId: string, elId: string, vp: Place, age: Age | null, intent: Intent | null = null): Evidence[] {
    const out: Evidence[] = [];
    if (age && !this.civCan(civId, elId, age)) return out;
    const fits = (use: UseLook | null | undefined) => fitsIntent(intent, this.useIntent(elId, use));
    const hit = (x: Target) => (x.elementId ? x.elementId === elId && fitsAge(x.age, age) && fits(x)
      : x.playId ? this.playHasEl(x.playId, elId, age, intent) : !!x.planId && this.planHasEl(x.planId, elId, age, intent));
    this.civTags(civId).forEach((t) => {
      const rel = this.relation(t.place, vp);
      if (rel === 'none') return;
      if (t.el === elId && fitsAge(t.age, age) && fits(t)) out.push({ kind: 'tag', t, rel, rank: rel === 'narrower' ? 1 : 0 });
      if (t.play && this.playHasEl(t.play, elId, age, intent)) out.push({ kind: 'viaPlay', t, rel, rank: 2 });
      if (t.plan && this.planHasEl(t.plan, elId, age, intent)) out.push({ kind: 'viaPlan', t, rel, rank: 2 });
    });
    this.gamePlays(civId, vp).forEach((x) => { if (hit(x.p)) out.push({ kind: 'game', ...x, rank: 3 }); });
    this.guideMarks(civId, vp).forEach((x) => { if (hit(x.m)) out.push({ kind: 'guide', ...x, rank: 3 }); });
    if (this.isUniversal(elId) && !this.cannot(civId, elId) && (!intent || intent === this.elIntent(elId))) out.push({ kind: 'universal', rank: 5 });
    return out;
  }
  // A play: tagged itself, part of a tagged game plan, seen, or from its parts.
  playEvidence(civId: string, pid: string, vp: Place): Evidence[] {
    const p = this.play(pid);
    const out: Evidence[] = [];
    if (!p) return out;
    this.civTags(civId).forEach((t) => {
      const rel = this.relation(t.place, vp);
      if (rel === 'none') return;
      if (t.play === pid) out.push({ kind: 'tag', t, rel, rank: rel === 'narrower' ? 1 : 0 });
      if (t.plan && this.planHasPlay(t.plan, pid)) out.push({ kind: 'viaPlan', t, rel, rank: 2 });
    });
    this.gamePlays(civId, vp).forEach((x) => { if (this.shows(x.p, 'play', pid)) out.push({ kind: 'game', ...x, rank: 3 }); });
    this.guideMarks(civId, vp).forEach((x) => { if (this.shows(x.m, 'play', pid)) out.push({ kind: 'guide', ...x, rank: 3 }); });
    if (!out.length && p.steps.length) {
      const parts = sortedSteps(p.steps).map((st) => ({ st, ev: this.elementEvidence(civId, st.el, vp, p.age, st.intent || null).sort((a, b) => a.rank - b.rank) }));
      if (parts.every((x) => x.ev.length)) out.push({ kind: 'parts', parts, rank: 4 });
    }
    return out;
  }
  // A game plan: tagged, seen, or every stage's play documented.
  planEvidence(civId: string, gid: string, vp: Place): Evidence[] {
    const g = this.plan(gid);
    const out: Evidence[] = [];
    if (!g) return out;
    this.civTags(civId).forEach((t) => { if (t.plan === gid) { const rel = this.relation(t.place, vp); if (rel !== 'none') out.push({ kind: 'tag', t, rel, rank: rel === 'narrower' ? 1 : 0 }); } });
    this.gamePlays(civId, vp).forEach((x) => { if (x.p.planId === gid) out.push({ kind: 'game', ...x, rank: 3 }); });
    this.guideMarks(civId, vp).forEach((x) => { if (x.m.planId === gid) out.push({ kind: 'guide', ...x, rank: 3 }); });
    const st = stagesOf(g);
    if (!out.length && st.length) {
      const stages = st.map(({ age, stage }) => ({ age, play: stage.play, ev: this.playEvidence(civId, stage.play, vp).sort((a, b) => a.rank - b.rank) }));
      if (stages.every((x) => x.ev.length)) out.push({ kind: 'stages', stages, rank: 4 });
    }
    return out;
  }
  evidence(field: ItemKind, civId: string, id: string, vp: Place): Evidence[] {
    return field === 'plan' ? this.planEvidence(civId, id, vp) : field === 'play' ? this.playEvidence(civId, id, vp) : this.elementEvidence(civId, id, vp, null);
  }
  // Universal elements are implied, so they only show when something else documents them.
  civElements(civId: string, vp: Place): { id: string; ev: Evidence[] }[] {
    return this.data.defs.elements.filter(isActive).map((e) => ({ id: e.id, ev: this.elementEvidence(civId, e.id, vp, null).filter((x) => x.kind !== 'universal') })).filter((x) => x.ev.length)
      .sort((a, b) => minRank(a.ev) - minRank(b.ev) || this.elName(a.id).localeCompare(this.elName(b.id)));
  }
  civPlays(civId: string, vp: Place): { id: string; ev: Evidence[] }[] {
    return this.activePlays().map((p) => ({ id: p.id, ev: this.playEvidence(civId, p.id, vp) })).filter((x) => x.ev.length)
      .sort((a, b) => AGES.indexOf((this.play(a.id) as Play).age) - AGES.indexOf((this.play(b.id) as Play).age) || minRank(a.ev) - minRank(b.ev) || this.playTitle(a.id).localeCompare(this.playTitle(b.id)));
  }
  civPlans(civId: string, vp: Place): { id: string; ev: Evidence[] }[] {
    return this.activePlans().map((g) => ({ id: g.id, ev: this.planEvidence(civId, g.id, vp) })).filter((x) => x.ev.length)
      .sort((a, b) => minRank(a.ev) - minRank(b.ev) || this.planTitle(a.id).localeCompare(this.planTitle(b.id)));
  }
  civItems(field: ItemKind, civId: string, vp: Place): { id: string; ev: Evidence[] }[] {
    return field === 'plan' ? this.civPlans(civId, vp) : field === 'play' ? this.civPlays(civId, vp) : this.civElements(civId, vp);
  }
  civElsewhere(civId: string, vp: Place): TagWithId[] {
    return vp.kind === 'any' ? [] : this.civTags(civId).filter((t) => this.relation(t.place, vp) === 'none');
  }
  // "Comes up on" places on an element, play or game plan that match the place being viewed.
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
    const age = t.el ? this.tagAgeText(t) : '';
    const note = t.el ? this.useNote(t.el, t) : '';
    return (rel === 'narrower' ? 'Tagged only ' : 'Tagged ') + this.placePhrase(t.place) + (age ? ', ' + age : '') + (note ? ', ' + note : '');
  }
  gameReason(g: Game): string {
    const m = g.map ? this.map(g.map) : null;
    return (g.mine ? 'Seen in your game' : 'Seen in a game you logged') + (m ? ' on ' + m.name : '') + (g.date ? ', ' + fmtDate(g.date) : '');
  }
  // ", in <the play or plan it was part of>", when the evidence came through something bigger.
  private inWhat(x: Target, field: ItemKind): string {
    if (field === 'plan') return '';
    if (x.playId && field === 'el') return ', in ' + this.playTitle(x.playId);
    if (x.planId) return ', in ' + this.planTitle(x.planId);
    return '';
  }
  evText(e: Evidence, itemKind: ItemKind): string {
    if (e.kind === 'tag') return this.tagReason(e.t, e.rel);
    if (e.kind === 'viaPlay') return 'Part of ' + this.playTitle(e.t.play) + ', ' + lowerFirst(this.tagReason(e.t, e.rel));
    if (e.kind === 'viaPlan') return 'Part of ' + this.planTitle(e.t.plan) + ', ' + lowerFirst(this.tagReason(e.t, e.rel));
    if (e.kind === 'game') {
      const mk = this.gameMark(e.gid, e.p.pid);
      return this.gameReason(e.g) + (mk && mk.m.at != null ? ', at ' + fmtTime(mk.m.at) : '') + this.inWhat(e.p, itemKind);
    }
    if (e.kind === 'guide') return 'Shown in a guide: ' + guideTitle(e.l) + (e.m.at != null ? ', at ' + fmtTime(e.m.at) : '') + this.inWhat(e.m, itemKind);
    if (e.kind === 'universal') return 'Every civ can do it';
    if (e.kind === 'stages') return 'From its plays, each one tagged or seen';
    return 'From its parts, each one tagged or seen';
  }
  partText(e: Evidence | undefined): string {
    if (!e) return '';
    if (e.kind === 'tag') return e.rel === 'narrower' ? 'tagged for some maps' : 'tagged';
    if (e.kind === 'viaPlay') return 'part of ' + this.playTitle(e.t.play);
    if (e.kind === 'viaPlan') return 'part of ' + this.planTitle(e.t.plan);
    if (e.kind === 'guide') return 'shown in a guide';
    if (e.kind === 'universal') return 'every civ can';
    if (e.kind === 'parts' || e.kind === 'stages') return 'from its parts';
    return 'seen in a game';
  }

  // -------------------------------------------------------------- upkeep checks
  health(): { dupes: Play[][]; planDupes: GamePlan[][]; issues: string[]; early: EarlyAge[] } {
    const issues: string[] = [];
    const groupBy = <T>(items: T[], key: (x: T) => string): T[][] => {
      const g: Record<string, T[]> = {};
      items.forEach((x) => { const k = key(x); (g[k] = g[k] || []).push(x); });
      return Object.values(g).filter((x) => x.length > 1);
    };
    const dupes = groupBy(this.activePlays().filter((p) => p.steps.length), (p) => this.playSignature(p));
    const planDupes = groupBy(this.activePlans().filter((g) => stagesOf(g).length), (g) => this.planSignature(g));
    // The age rule: a play step needs some civ that can; a tag needs its own civ to.
    let ageConflicts = 0;
    this.activePlays().forEach((p) => p.steps.forEach((st) => { if (!this.anyCivCan(st.el, p.age)) ageConflicts += 1; }));
    this.activeTags().forEach((t) => { if (t.el && !t.play && !t.plan && t.age && !this.civCan(t.civ, t.el, t.age)) ageConflicts += 1; });
    const civConflicts = this.activeTags().filter((t) => (t.play || t.plan) && this.tagTargetActive(t) && this.blockers(t.civ, tagField(t), tagTargetId(t)).length).length;
    let wrongStage = 0;
    this.activePlans().forEach((g) => stagesOf(g).forEach(({ age, stage }) => { const p = this.play(stage.play); if (p && p.age !== age) wrongStage += 1; }));
    const mergedPlays = new Set(this.data.defs.plays.filter((p) => p.mergedInto).map((p) => p.id));
    const mergedPlans = new Set(this.data.defs.gamePlans.filter((g) => g.mergedInto).map((g) => g.id));
    const refMerged = (x: Target) => (x.playId && mergedPlays.has(x.playId)) || (x.planId && mergedPlans.has(x.planId));
    const mergedRefs = this.allPlays().filter(({ p }) => refMerged(p)).length
      + this.activeTags().filter((t) => (t.play && mergedPlays.has(t.play)) || (t.plan && mergedPlans.has(t.plan))).length
      + this.activePlans().reduce((n, g) => n + stagesOf(g).filter(({ stage }) => mergedPlays.has(stage.play)).length, 0);
    if (ageConflicts) issues.push(plural(ageConflicts, 'step or tag uses an age its element no longer allows', 'steps or tags use ages their elements no longer allow'));
    if (civConflicts) issues.push(plural(civConflicts, 'tag gives a civ a play or game plan with a step it can\'t do in that age', 'tags give civs plays or game plans with steps they can\'t do in that age'));
    if (wrongStage) issues.push(plural(wrongStage, 'game plan stage holds a play from another age', 'game plan stages hold plays from other ages'));
    if (mergedRefs) issues.push(plural(mergedRefs, 'record still points at something merged', 'records still point at merged plays or game plans'));
    const untyped = this.data.defs.elements.filter((e) => isActive(e) && !this.elType(e.id)).length;
    if (untyped) issues.push(plural(untyped, 'element has no type yet', 'elements have no type yet') + ' (unit, structure, economy, or age-up or tech)');
    return { dupes, planDupes, issues, early: this.allEarlyAges() };
  }

  // -------------------------------------------------------------- the civ stages page
  // One civ's plays per age, grouped by family, and its game plans. A play
  // the civ can't do in its age is left out, unless something documents it.
  civStages(civId: string, vp: Place): { columns: StageColumn[]; plans: StagePlan[] } {
    const columns = STAGE_AGES.map((age): StageColumn => {
      const cards: (StageCard & { family: string })[] = [];
      this.activePlays(age).forEach((p) => {
        if (!p.steps.length) return;
        const ev = this.playEvidence(civId, p.id, vp);
        const blocked = this.cantDo(civId, p.steps, age);
        let tier: StageTier | null = null;
        if (ev.some((e) => e.kind === 'tag' || e.kind === 'viaPlan' || e.kind === 'game' || e.kind === 'guide')) tier = 'documented';
        else if (blocked.length) tier = null;
        else if (ev.some((e) => e.kind === 'parts')) {
          const parts = ev.find((e) => e.kind === 'parts');
          tier = parts && parts.kind === 'parts' && parts.parts.every((x) => x.ev.every((e) => e.kind === 'universal')) ? 'standard' : 'parts';
        } else if (p.steps.every((st) => this.civMayHave(civId, st.el))) tier = 'open';
        if (tier) cards.push({ id: p.id, tier, ev: ev.sort((a, b) => a.rank - b.rank), blocked, family: p.family || 'Other' });
      });
      const order = FAMILY_ORDER[age] || [];
      const names = [...new Set(cards.map((c) => c.family))].sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b);
      });
      const families = names.map((name) => ({
        name,
        cards: cards.filter((c) => c.family === name)
          .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || this.playTitle(a.id).localeCompare(this.playTitle(b.id)))
          .map(({ family: _f, ...c }) => c)
      }));
      // Elements in this age's plays that some civ can do here, but not this one.
      const used = [...new Set(this.activePlays(age).flatMap((p) => p.steps.map((st) => st.el)))];
      const closed = used.filter((el) => isActive(this.el(el)) && this.anyCivCan(el, age) && (!this.civCan(civId, el, age) || !this.civMayHave(civId, el)))
        .map((el) => this.elName(el)).sort((a, b) => a.localeCompare(b));
      return { age, families, count: cards.length, closed };
    });
    const plans: StagePlan[] = this.activePlans().map((g) => ({ id: g.id, ev: this.planEvidence(civId, g.id, vp).sort((a, b) => a.rank - b.rank) }))
      .filter((x) => x.ev.length)
      .map((x) => ({ ...x, tier: x.ev.some((e) => e.kind !== 'stages') ? 'documented' as const : 'parts' as const }))
      .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'documented' ? -1 : 1) || minRank(a.ev) - minRank(b.ev) || this.planTitle(a.id).localeCompare(this.planTitle(b.id)));
    return { columns, plans };
  }
  // A card's evidence in a few words: "Tagged · 2 games", "From parts", "Not seen".
  stageBadge(card: StageCard): string {
    if (card.tier === 'standard') return 'Standard';
    if (card.tier === 'parts') return 'From parts';
    if (card.tier === 'open') return 'Not seen';
    const ev = card.ev;
    const words: string[] = [];
    const tags = ev.filter((e) => e.kind === 'tag');
    if (tags.some((e) => e.kind === 'tag' && e.rel !== 'narrower')) words.push('Tagged');
    else if (tags.length) words.push('Tagged for some maps');
    else if (ev.some((e) => e.kind === 'viaPlan')) words.push('Through a game plan');
    const games = new Set(ev.flatMap((e) => (e.kind === 'game' ? [e.gid] : []))).size;
    if (games) words.push(plural(games, 'game'));
    if (ev.some((e) => e.kind === 'guide')) words.push(words.length ? 'guide' : 'In a guide');
    if (words[0] && /^\d/.test(words[0])) words[0] = 'In ' + words[0];
    return words.join(' · ');
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
  // Every moment, in a game or a guide, that shows an element, play or game plan.
  refsFor(field: ItemKind, id: string): { route: string; game?: Game; guide?: Link; sub: string }[] {
    const rows: { route: string; game?: Game; guide?: Link; sub: string }[] = [];
    this.allPlays().forEach(({ gid, g, p }) => {
      const how = this.shows(p, field, id);
      if (!how) return;
      const mk = this.gameMark(gid, p.pid);
      rows.push({ route: 'ref-game-' + gid, game: g, sub: this.civName(ranCiv(g, p), 'Side not set') + (mk && mk.m.at != null ? ' at ' + fmtTime(mk.m.at) : '') + (how === 'via' ? ', in ' + this.targetName(p) : '') });
    });
    Object.entries(this.data.links).forEach(([lid, l]) => {
      if (l.gameId) return;
      (l.marks || []).forEach((m) => {
        const how = this.shows(m, field, id);
        if (!how) return;
        rows.push({ route: 'ref-guide-' + lid, guide: l, sub: 'Guide' + (m.civ ? ', ' + this.civName(m.civ) : '') + (m.at != null ? ' at ' + fmtTime(m.at) : '') + (how === 'via' ? ', in ' + this.targetName(m) : '') });
      });
    });
    return rows;
  }
  gameMoments(gid: string, g: Game): Moment[] {
    return (g.plays || []).map((p, i) => {
      const mk = this.gameMark(gid, p.pid);
      return { key: p.pid, i, at: mk ? mk.m.at : null, civ: ranCiv(g, p), planId: p.planId || null, playId: p.playId || null, elementId: p.elementId || null,
        age: p.age || null, note: p.notes || '', outcome: p.outcome || null, ...lookOf(p) };
    });
  }
  guideMoments(l: Link): Moment[] {
    return (l.marks || []).map((m, i) => ({ i, key: m.mid, at: m.at, civ: m.civ, planId: m.planId || null, playId: m.playId || null, elementId: m.elementId || null,
      age: m.age || null, note: m.note || '', shows: m.shows, ...lookOf(m) }))
      .sort((a, b) => (a.at == null ? 1e9 : a.at) - (b.at == null ? 1e9 : b.at) || a.i - b.i);
  }
  momentName(mo: Target): string {
    if (mo.planId) return this.planTitle(mo.planId);
    if (mo.playId) { const p = this.play(mo.playId); return p ? p.name + ', ' + STAGE_NAME[p.age] : 'Unknown play'; }
    if (mo.elementId) {
      const note = this.useNote(mo.elementId, mo);
      return this.elName(mo.elementId) + (note ? ' (' + note + ')' : '') + (mo.age && this.elAges(mo.elementId).length > 1 ? ', ' + AGE_NAME[mo.age] + ' Age' : '');
    }
    return 'Not classified yet';
  }
}

export const minRank = (ev: Evidence[]): number => Math.min(...ev.map((e) => e.rank));
