// The records the app works with. The page holds them in memory and saves
// them as whole records; docs.ts maps them to and from D1 rows.

export type Age = 'dark' | 'feudal' | 'castle' | 'imperial';
export const AGES: Age[] = ['dark', 'feudal', 'castle', 'imperial'];
export const AGE_NAME: Record<Age, string> = { dark: 'Dark', feudal: 'Feudal', castle: 'Castle', imperial: 'Imperial' };

// Where a tag, an answer or a "comes up on" note applies.
export type Place =
  | { kind: 'any'; id?: undefined }
  | { kind: 'type' | 'feature' | 'map'; id: string };
export type PlaceKind = Place['kind'];

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------
export interface Civ { id: string; name: string; short: string; flag: string | null; parent: string | null; active: boolean }
export interface MapType { id: string; name: string; description: string; active: boolean }
export interface Feature { id: string; name: string; description: string; active: boolean }
export interface Kind { id: string; name: string; description: string; active: boolean }
export interface MapDef {
  id: string; name: string; aoe4worldName?: string | null; type: string; notes: string;
  features: string[]; inPool: boolean; active: boolean;
}
export interface Element {
  id: string; name: string; kind: string; ages: Age[]; tells: string; description: string;
  where: Place[]; whereNote: string; active: boolean; mergedInto?: string | null;
}
// One element of a play. Same step = at the same time; a higher step comes later.
export interface Step { el: string; age: Age | null; step: number; notes: string }
export interface Strategy {
  id: string; name: string; description: string; notes: string; steps: Step[];
  where: Place[]; whereNote: string; active: boolean; mergedInto: string | null;
}
export interface Defs {
  civs: Civ[]; mapTypes: MapType[]; features: Feature[]; maps: MapDef[];
  kinds: Kind[]; elements: Element[]; strategies: Strategy[];
}
export type DefType = keyof Defs;
export const DEF_TYPES: DefType[] = ['civs', 'mapTypes', 'features', 'maps', 'kinds', 'elements', 'strategies'];

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
// A civ does an element (optionally in one age) or a whole play, in a place.
export interface Tag {
  civ: string; el: string | null; play: string | null; age: Age | null; place: Place;
  timing: string; tells: string; notes: string; confirmed: string | null; active: boolean;
  createdAt?: string | null; copiedFrom?: string;
}
export type Outcome = 'worked' | 'mixed' | 'failed';
export type Prep = 'did_not_see' | 'saw_no_plan' | 'plan_misexecuted' | 'handled';
// What one side did in a game: a whole play, or one element with its age.
export interface GamePlay {
  pid: string; runBy: 'player' | 'opponent'; strategyId: string | null; elementId?: string | null; age?: Age | null;
  outcome: Outcome | null; prep: Prep | null; answerId: string | null; did: string; notes: string;
}
export interface Game {
  mine: boolean; title?: string; date: string | null; playerName: string; playerCiv: string | null;
  oppName: string; oppCiv: string | null; map: string | null; result: 'win' | 'loss' | null; notes: string;
  aoe4worldGameId: number | null; createdAt?: string | null; plays: GamePlay[];
}
export type Shows = 'threat' | 'response' | 'both';
// A timestamped moment in a link. In a game's link it points at a play; in a
// guide it names the civ and what it shows.
export interface Mark {
  mid: string; at: number | null; playId: string | null; civ: string | null;
  elementId: string | null; strategyId: string | null; age: Age | null; shows: Shows | null; note: string;
}
export type Source = 'youtube' | 'twitch_vod' | 'twitch_highlight' | 'twitch_clip' | 'aoe4world' | 'own_site' | 'other';
export interface Link {
  url: string; source: Source; title: string; gameId: string | null; kind?: 'game' | 'guide';
  civ?: string | null; map?: string | null; openAt: number | null; status: 'live' | 'dead';
  checked: string | null; notes: string; createdAt?: string | null; marks: Mark[];
}
export type AnswerStatus = 'idea' | 'studying' | 'practiced' | 'proven';
export interface Answer {
  target: 'element' | 'play'; elementId: string | null; strategyId: string | null; age: Age | null;
  myCiv: string | null; oppCiv: string | null; place: Place; title: string; plan: string;
  status: AnswerStatus; notes?: string; confirmed: string | null; active: boolean; createdAt?: string | null;
  steps: { answerId: string | null; note: string }[];
}
export interface Settings { lastPatch?: string | null; [key: string]: unknown }

// Everything the page loads.
export interface LibraryData {
  defs: Defs;
  tags: Record<string, Tag>;
  games: Record<string, Game>;
  links: Record<string, Link>;
  answers: Record<string, Answer>;
  settings: Settings;
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------
// A record path: defs/<type>, meta/settings, tags/<id>, games/<id>, links/<id>, answers/<id>.
export type DocPath = string;
export interface DocWrite { path: DocPath; data: unknown }
export interface ChangeEntry { label: string; at: string; before: DocWrite[] }
export interface StateResponse extends LibraryData { changes: Record<string, ChangeEntry> }
export interface CommitBody { label?: string; writes: DocWrite[]; before?: DocWrite[]; undoOf?: string }
export interface CommitResult { ok: true; change: { id: string; label: string; at: string } | null }

export function emptyDefs(): Defs {
  return { civs: [], mapTypes: [], features: [], maps: [], kinds: [], elements: [], strategies: [] };
}
