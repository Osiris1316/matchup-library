// What a civ's stages page shows, worked out from the library, the address and
// the routes. Kept apart from the drawing so the page reads as layout.
import {
  STAGE_AGES, branchRoute, isActive, parsePlace, planRoute, routeIs, routeMatches,
  type Age, type Branch, type Picks, type Place, type Route, type StagePlan
} from '@matchup-library/core';
import { L } from '../../../store';
import type { CivView } from '../../../app/paths';

// The map being viewed, or any map if it's gone.
export function placeOk(key: string): Place {
  const vp = parsePlace(key);
  if ((vp.kind === 'type' && !isActive(L.mapType(vp.id))) || (vp.kind === 'map' && !isActive(L.map(vp.id)))) return { kind: 'any' };
  return vp;
}

// The picks in the address that still make sense: a live play of that age.
export function picksFrom(view: CivView): Picks {
  const out: Picks = {};
  STAGE_AGES.forEach((a) => {
    const id = view[a as 'dark' | 'feudal' | 'castle'];
    const p = id ? L.play(id) : null;
    if (p && isActive(p) && p.age === a) out[a] = p.id;
  });
  return out;
}
export const pickedAges = (picks: Picks): Age[] => STAGE_AGES.filter((a) => !!picks[a]);

// A game plan in the rail, against the picks.
export interface PlanRow {
  plan: StagePlan;
  spine: Route;
  branches: { branch: Branch; route: Route }[];
  // Goes through every pick, on its spine or one of its branches.
  matches: boolean;
  // The spine, or a branch, that is exactly the picks.
  exact: Route | null;
  // The route to pick when the row is clicked: the spine, or the branch that matches.
  route: Route;
}

export function planRows(plans: StagePlan[], picks: Picks): PlanRow[] {
  return plans.flatMap((x) => {
    const g = L.plan(x.id);
    if (!g) return [];
    const spine = planRoute(g);
    const branches = L.branchesOf(g.id).map((b) => ({ branch: b, route: branchRoute(g, b) }));
    const all = [spine, ...branches.map((b) => b.route)];
    const hit = all.find((r) => routeMatches(r, picks)) || null;
    return [{ plan: x, spine, branches, matches: !!hit, exact: all.find((r) => routeIs(r, picks)) || null, route: hit && !routeMatches(spine, picks) ? hit : spine }];
  });
}

// Logged games where this civ's side went through every pick.
export const gamesThrough = (routes: Route[], picks: Picks): number =>
  new Set(routes.filter((r) => r.kind === 'game' && routeMatches(r, picks)).map((r) => r.game)).size;
