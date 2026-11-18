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

// Intent colours an element's name: offensive red, defensive blue, economic
// green, or none (grey). An element has a default, and each use can override it.
export type Intent = 'offensive' | 'defensive' | 'economic';
export const INTENTS: Intent[] = ['offensive', 'defensive', 'economic'];
export const INTENT_NAME: Record<Intent, string> = { offensive: 'Offensive', defensive: 'Defensive', economic: 'Economic' };
// The four element types colour the icon tile. They are rows in element_kinds.
export type ElType = 'unit' | 'structure' | 'economy' | 'age_tech';
export const EL_TYPES: ElType[] = ['unit', 'structure', 'economy', 'age_tech'];
export const EL_TYPE_NAME: Record<ElType, string> = { unit: 'Unit', structure: 'Structure', economy: 'Economy', age_tech: 'Age-up or tech' };
export const EL_TYPE_GROUP: Record<ElType, string> = { unit: 'Units', structure: 'Structures', economy: 'Economy', age_tech: 'Age-ups and tech' };
// A thing in the game, from the aoe4world data repo. It gives an element its icon.
export type SubjectKind = 'unit' | 'building' | 'landmark' | 'technology';
export interface Subject {
  id: string; name: string; kind: SubjectKind; age: number | null; civs: string[] | null; icon: string | null;
  defaultIntent: Intent | null; active: boolean;
  // Civs that get it earlier than most, by the aoe4world data: civ id to age 1 to 4.
  early?: Record<string, number> | null;
}
// The overrides every use of an element can carry.
export interface UseLook { intent?: Intent | null; subject?: string | null }

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
  subject?: string | null; intent?: Intent | null;
  universal?: boolean;            // every civ can do it; cannot lists the exceptions
  cannot?: string[];
  // Civs whose ages differ from the usual ones: exactly these ages for that civ.
  civAges?: Record<string, Age[]>;
}
// One element of a play. Same step = at the same time; a higher step comes later.
// In a play every step's age is the play's age.
export interface Step extends UseLook { el: string; age: Age | null; step: number; notes: string }
// One way to play one age, such as "Spears, then towers" in the Dark Age.
// Plays are grouped within their age by family, such as "Barracks first".
export interface Play {
  id: string; name: string; age: Age; family: string; description: string; tells: string; notes: string;
  steps: Step[]; where: Place[]; whereNote: string; active: boolean; mergedInto: string | null;
}
// A game plan: one play per age, the spine. A stage's notes say what this
// plan does in that age beyond the play itself.
export interface Stage { play: string; notes: string }
export type PlanStatus = 'idea' | 'studying' | 'practiced' | 'proven';
export interface GamePlan {
  id: string; name: string; description: string; notes: string; status: PlanStatus | null;
  stages: Partial<Record<Age, Stage>>;
  where: Place[]; whereNote: string; active: boolean; mergedInto: string | null;
  branches?: Branch[];
}
// What you scout that sends you down a branch: one element in an age, or a
// whole play (in its own age); optionally only against one civ.
export interface Trigger { el: string | null; play: string | null; age: Age | null; civ: string | null }
// A detour off a game plan: a play for each age it covers, then back into the
// spine at rejoins (null: it doesn't rejoin). Your branches have a trigger;
// an opponent's variant has none.
export interface Branch {
  id: string; name: string; trigger: Trigger | null;
  stages: Partial<Record<Age, Stage>>; rejoins: Age | null;
  tells: string; notes: string; status: PlanStatus | null; active: boolean;
}
export interface Defs {
  civs: Civ[]; mapTypes: MapType[]; features: Feature[]; maps: MapDef[];
  kinds: Kind[]; elements: Element[]; plays: Play[]; gamePlans: GamePlan[];
}
export type DefType = keyof Defs;
export const DEF_TYPES: DefType[] = ['civs', 'mapTypes', 'features', 'maps', 'kinds', 'elements', 'plays', 'gamePlans'];
// The ages the library works in. Imperial stays in the data but isn't shown.
export const STAGE_AGES: Age[] = ['dark', 'feudal', 'castle'];
export const STAGE_NAME: Record<Age, string> = { dark: 'Dark Age', feudal: 'Feudal Age', castle: 'Early Castle', imperial: 'Imperial' };

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
// A civ does an element (optionally in one age), a play or a whole game plan, in a place.
export interface Tag extends UseLook {
  civ: string; el: string | null; play: string | null; plan?: string | null; age: Age | null; place: Place;
  timing: string; tells: string; notes: string; confirmed: string | null; active: boolean;
  createdAt?: string | null; copiedFrom?: string;
}
export type Outcome = 'worked' | 'mixed' | 'failed';
export type Prep = 'did_not_see' | 'saw_no_plan' | 'plan_misexecuted' | 'handled';
// What one side did in a game: a game plan, a play, or one element with its age.
export interface GamePlay extends UseLook {
  pid: string; runBy: 'player' | 'opponent'; planId?: string | null; playId?: string | null; elementId?: string | null; age?: Age | null;
  outcome: Outcome | null; prep: Prep | null; answerId: string | null; did: string; notes: string;
}
export interface Game {
  mine: boolean; title?: string; date: string | null; playerName: string; playerCiv: string | null;
  oppName: string; oppCiv: string | null; map: string | null; result: 'win' | 'loss' | null; notes: string;
  aoe4worldGameId: number | null; createdAt?: string | null; plays: GamePlay[];
}
export type Shows = 'threat' | 'response' | 'both';
// A timestamped moment in a link. In a game's link it points at one of the
// game's plays (gamePlayId); in a guide it names the civ and what it shows.
export interface Mark extends UseLook {
  mid: string; at: number | null; gamePlayId: string | null; civ: string | null;
  elementId: string | null; playId?: string | null; planId?: string | null; age: Age | null; shows: Shows | null; note: string;
}
export type Source = 'youtube' | 'twitch_vod' | 'twitch_highlight' | 'twitch_clip' | 'aoe4world' | 'own_site' | 'other';
export interface Link {
  url: string; source: Source; title: string; gameId: string | null; kind?: 'game' | 'guide';
  civ?: string | null; map?: string | null; openAt: number | null; status: 'live' | 'dead';
  checked: string | null; notes: string; createdAt?: string | null; marks: Mark[];
}
export type AnswerStatus = 'idea' | 'studying' | 'practiced' | 'proven';
// Your game plan against theirs, optionally for one civ on each side: a status,
// notes, and a note per age on where the two meet.
export interface Answer {
  theirPlan: string; myPlan: string; myCiv: string | null; oppCiv: string | null;
  status: AnswerStatus; notes: string; ageNotes: Partial<Record<Age, string>>;
  active: boolean; createdAt?: string | null;
}
export interface Settings { lastPatch?: string | null; [key: string]: unknown }

// Everything the page loads.
export interface LibraryData {
  defs: Defs;
  subjects?: Record<string, Subject>;
  tags: Record<string, Tag>;
  games: Record<string, Game>;
  links: Record<string, Link>;
  answers: Record<string, Answer>;
  settings: Settings;
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------
// A record path: defs/<type>, meta/settings, tags/<id>, games/<id>, links/<id>, answers/<id>,
// subjects/<id> (only a subject's default intent is saved).
export type DocPath = string;
export interface DocWrite { path: DocPath; data: unknown }
export interface ChangeEntry { label: string; at: string; before: DocWrite[] }
export interface StateResponse extends LibraryData { changes: Record<string, ChangeEntry> }
export interface CommitBody { label?: string; writes: DocWrite[]; before?: DocWrite[]; undoOf?: string }
export interface CommitResult { ok: true; change: { id: string; label: string; at: string } | null }

export function emptyDefs(): Defs {
  return { civs: [], mapTypes: [], features: [], maps: [], kinds: [], elements: [], plays: [], gamePlans: [] };
}
