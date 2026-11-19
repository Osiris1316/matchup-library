import { describe, expect, it } from 'vitest';
import { Library, branchRoute, cardState, onRoute, planRoute, routeIs, routeMatches, togglePick, type Branch, type GamePlan, type Place, type Route } from '../src';
import { fixture } from './fixture';

const any: Place = { kind: 'any' };
const plan = (stages: Partial<Record<'dark' | 'feudal' | 'castle', string>>): GamePlan => ({
  id: 'g', name: 'G', description: '', notes: '', status: null, where: [], whereNote: '', active: true, mergedInto: null,
  stages: Object.fromEntries(Object.entries(stages).map(([a, play]) => [a, { play, notes: '' }]))
});
const branch = (stages: Partial<Record<'dark' | 'feudal' | 'castle', string>>, rejoins: Branch['rejoins']): Branch => ({
  id: 'b', name: 'B', trigger: null, rejoins, tells: '', notes: '', status: null, active: true,
  stages: Object.fromEntries(Object.entries(stages).map(([a, play]) => [a, { play, notes: '' }]))
});

describe('routes', () => {
  const g = plan({ dark: 'd1', feudal: 'f1', castle: 'c1' });

  it('a game plan is its spine', () => {
    expect(planRoute(g).stages).toEqual({ dark: 'd1', feudal: 'f1', castle: 'c1' });
  });

  it('a branch takes the spine before it and after it rejoins', () => {
    expect(branchRoute(g, branch({ feudal: 'f2' }, 'castle')).stages).toEqual({ dark: 'd1', feudal: 'f2', castle: 'c1' });
    expect(branchRoute(g, branch({ dark: 'd2' }, 'feudal')).stages).toEqual({ dark: 'd2', feudal: 'f1', castle: 'c1' });
  });

  it('an age a branch skips in the middle stays on the spine', () => {
    expect(branchRoute(g, branch({ dark: 'd2', castle: 'c2' }, null)).stages).toEqual({ dark: 'd2', feudal: 'f1', castle: 'c2' });
  });

  it('after a branch that never rejoins, or before it rejoins, the age is unknown', () => {
    expect(branchRoute(g, branch({ dark: 'd2' }, null)).stages).toEqual({ dark: 'd2' });
    expect(branchRoute(g, branch({ dark: 'd2' }, 'castle')).stages).toEqual({ dark: 'd2', castle: 'c1' });
  });

  const routes: Route[] = [
    { kind: 'plan', stages: { dark: 'd1', feudal: 'f1', castle: 'c1' } },
    { kind: 'plan', stages: { dark: 'd1', feudal: 'f2', castle: 'c2' } },
    { kind: 'game', stages: { dark: 'd3', feudal: 'f2' } }
  ];

  it('lights plays that share a route with every pick, in both directions', () => {
    expect(onRoute(routes, { dark: 'd1' }, 'feudal', 'f1')).toBe(true);
    expect(onRoute(routes, { dark: 'd1' }, 'feudal', 'f2')).toBe(true);
    expect(onRoute(routes, { dark: 'd1' }, 'castle', 'c2')).toBe(true);
    expect(onRoute(routes, { feudal: 'f2' }, 'dark', 'd3')).toBe(true);
    expect(onRoute(routes, { feudal: 'f2' }, 'dark', 'd1')).toBe(true);
    expect(onRoute(routes, { dark: 'd1', feudal: 'f1' }, 'castle', 'c2')).toBe(false);
    expect(onRoute(routes, { dark: 'd3' }, 'castle', 'c2')).toBe(false);
    expect(onRoute(routes, {}, 'castle', 'anything')).toBe(true);
  });

  it('says how each card stands', () => {
    const picks = { dark: 'd1' };
    expect(cardState(routes, picks, 'dark', 'd1')).toBe('picked');
    expect(cardState(routes, picks, 'dark', 'd3')).toBe('dim');
    expect(cardState(routes, picks, 'feudal', 'f2')).toBe('lit');
    expect(cardState(routes, picks, 'feudal', 'f9')).toBe('dim');
    expect(cardState(routes, {}, 'feudal', 'f9')).toBe('free');
  });

  it('matches routes to picks, and knows an exact one', () => {
    expect(routeMatches(routes[1]!, { dark: 'd1', castle: 'c2' })).toBe(true);
    expect(routeIs(routes[1]!, { dark: 'd1', feudal: 'f2', castle: 'c2' })).toBe(true);
    expect(routeIs(routes[1]!, { dark: 'd1', feudal: 'f2' })).toBe(false);
  });

  it('toggles a pick, replacing that age or clearing it', () => {
    expect(togglePick({ dark: 'd1' }, 'dark', 'd3')).toEqual({ dark: 'd3' });
    expect(togglePick({ dark: 'd1', feudal: 'f1' }, 'dark', 'd1')).toEqual({ feudal: 'f1' });
  });
});

describe('a civ\'s routes and your answers', () => {
  const data = fixture();
  // Ottomans ran towers into a naked castle in a game.
  data.games.g1!.plays.push({ pid: 'p2', runBy: 'opponent', planId: 'towers_into_castle', playId: null, elementId: null, age: null, outcome: null, prep: null, answerId: null, did: '', notes: '' });
  const L = new Library(data);

  it('collects a civ\'s game plans, their branches and its games', () => {
    const r = L.civRoutes('ottomans', any);
    expect(r.some((x) => x.kind === 'plan' && x.plan === 'towers_into_castle')).toBe(true);
    expect(r.some((x) => x.kind === 'game' && x.game === 'g1' && x.stages.dark === 'barracks_towers' && x.stages.feudal === 'nfc')).toBe(true);
  });

  it('finds your branch that answers their play, by the element you scout in that age', () => {
    const hits = L.answersToPlay('rus', 'ottomans', 'barracks_towers', 'dark', any);
    expect(hits.map((x) => x.branch.id)).toEqual(['b1']);
    expect(L.answersToPlay('rus', 'ottomans', 'dark_maa', 'dark', any)).toEqual([]);
  });

  it('finds your answer to their game plan, for these civs or any', () => {
    expect(L.answersToPlan('towers_into_castle', 'rus', 'ottomans').map(([id]) => id)).toEqual(['a1']);
    expect(L.answersToPlan('towers_into_castle', 'ottomans', 'rus')).toEqual([]);
  });
});
