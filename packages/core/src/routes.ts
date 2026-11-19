// Routes: the ways a civ's game has been written down going age by age. A game
// plan is one route, each of its branches is another, and so is what one side
// did in a logged game. The civ page narrows by them: pick a play in one age,
// and plays in the other ages that share a route with it stay lit.
import { STAGE_AGES, type Age, type Branch, type GamePlan } from './types';

// A play per age: what has been picked, or what a route goes through.
export type Picks = Partial<Record<Age, string>>;

export interface Route {
  kind: 'plan' | 'branch' | 'game';
  plan?: string;
  branch?: string;
  game?: string;
  stages: Picks;
}

// The ages the page works in that have a play.
const agesOf = (p: Picks): Age[] => STAGE_AGES.filter((a) => !!p[a]);

export function planRoute(g: GamePlan): Route {
  const stages: Picks = {};
  STAGE_AGES.forEach((a) => { const st = g.stages[a]; if (st && st.play) stages[a] = st.play; });
  return { kind: 'plan', plan: g.id, stages };
}

// A branch takes the spine until its first play, its own plays where it has
// them (an age it skips in between stays on the spine), and the spine again
// from where it rejoins. Ages between its last play and the rejoin, or after
// a branch that never rejoins, aren't known.
export function branchRoute(g: GamePlan, b: Branch): Route {
  const spine = planRoute(g).stages;
  const own = STAGE_AGES.filter((a) => b.stages[a] && b.stages[a]?.play);
  const first = own[0], last = own[own.length - 1];
  const stages: Picks = {};
  const at = (a: Age) => STAGE_AGES.indexOf(a);
  STAGE_AGES.forEach((a) => {
    const mine = b.stages[a];
    if (mine && mine.play) { stages[a] = mine.play; return; }
    const before = !first || at(a) < at(first);
    const between = !!first && !!last && at(a) > at(first) && at(a) < at(last);
    const rejoined = !!b.rejoins && at(a) >= at(b.rejoins);
    if ((before || between || rejoined) && spine[a]) stages[a] = spine[a];
  });
  return { kind: 'branch', plan: g.id, branch: b.id, stages };
}

// Whether a route goes through every pick.
export function routeMatches(r: Route, picks: Picks): boolean {
  return agesOf(picks).every((a) => r.stages[a] === picks[a]);
}

// Whether a route is exactly the picks, age for age.
export function routeIs(r: Route, picks: Picks): boolean {
  return STAGE_AGES.every((a) => (r.stages[a] || null) === (picks[a] || null));
}

// Whether a play shares a route with every pick. With nothing picked, every play does.
export function onRoute(routes: Route[], picks: Picks, age: Age, play: string): boolean {
  if (!agesOf(picks).length) return true;
  return routes.some((r) => r.stages[age] === play && routeMatches(r, picks));
}

// How a card stands against the picks: picked, lit (shares a route with them),
// or dim (another play in a picked age, or nothing documented with the picks).
export type CardState = 'picked' | 'lit' | 'dim' | 'free';
export function cardState(routes: Route[], picks: Picks, age: Age, play: string): CardState {
  if (!agesOf(picks).length) return 'free';
  if (picks[age] === play) return 'picked';
  if (picks[age]) return 'dim';
  return onRoute(routes, picks, age, play) ? 'lit' : 'dim';
}

// The picks with one card toggled: picking a card in an age replaces that
// age's pick; picking it again clears it.
export function togglePick(picks: Picks, age: Age, play: string): Picks {
  const next = { ...picks };
  if (next[age] === play) delete next[age];
  else next[age] = play;
  return next;
}
