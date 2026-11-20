// Where a reference's moments go on the age board: each one lands in the age it
// belongs to. A play goes in its own age; a game plan fills each age it has a
// stage for; an element goes in the age it was logged in, or its only age.
// Anything without an age on the board (nothing picked yet, an Imperial play,
// an element with several ages and none given) is left for a list below.
// Pure: the page passes in how to look things up, so this can be tested alone.
import { STAGE_AGES, type Age, type Picks } from '@matchup-library/core';

export interface BoardMoment {
  key: string; i: number; at: number | null;
  planId: string | null; playId: string | null; elementId: string | null; age: Age | null;
}
export interface BoardLookup {
  playAge: (id: string) => Age | null;
  // The play for each age the game plan has a stage in.
  planStages: (id: string) => Partial<Record<Age, string>>;
  elAges: (id: string) => Age[];
}
// One card on the board. `via` is the game plan a play came from, when it
// wasn't logged on its own; `key` is always the moment to open.
export type BoardItem =
  | { kind: 'play'; play: string; key: string; at: number | null; i: number; via: string | null }
  | { kind: 'el'; el: string; age: Age; key: string; at: number | null; i: number };
export interface Placed {
  cells: Partial<Record<Age, BoardItem[]>>;
  // Game plan moments, in order: named in the lane's heading.
  plans: BoardMoment[];
  unplaced: BoardMoment[];
}

const onBoard = (a: Age | null | undefined): a is Age => !!a && STAGE_AGES.includes(a);
const byTime = (a: { at: number | null; i: number }, b: { at: number | null; i: number }) =>
  (a.at == null ? 1e9 : a.at) - (b.at == null ? 1e9 : b.at) || a.i - b.i;

export function placeMoments(moments: BoardMoment[], look: BoardLookup): Placed {
  const cells: Partial<Record<Age, BoardItem[]>> = {};
  const plans: BoardMoment[] = [];
  const unplaced: BoardMoment[] = [];
  const put = (age: Age, item: BoardItem) => { (cells[age] = cells[age] || []).push(item); };
  moments.forEach((mo) => {
    if (mo.planId) {
      plans.push(mo);
      const st = look.planStages(mo.planId);
      let any = false;
      STAGE_AGES.forEach((age) => { const p = st[age]; if (p) { any = true; put(age, { kind: 'play', play: p, key: mo.key, at: mo.at, i: mo.i, via: mo.planId }); } });
      if (!any) unplaced.push(mo);
    } else if (mo.playId) {
      const age = look.playAge(mo.playId);
      if (onBoard(age)) put(age, { kind: 'play', play: mo.playId, key: mo.key, at: mo.at, i: mo.i, via: null });
      else unplaced.push(mo);
    } else if (mo.elementId) {
      const only = look.elAges(mo.elementId).filter(onBoard);
      const age = mo.age || (only.length === 1 ? only[0] : null);
      if (onBoard(age)) put(age, { kind: 'el', el: mo.elementId, age, key: mo.key, at: mo.at, i: mo.i });
      else unplaced.push(mo);
    } else unplaced.push(mo);
  });
  // A play logged on its own says more than the same play implied by a game
  // plan, so the implied one steps aside.
  STAGE_AGES.forEach((age) => {
    const xs = cells[age];
    if (!xs) return;
    const direct = new Set(xs.filter((x) => x.kind === 'play' && !x.via).map((x) => (x as { play: string }).play));
    const kept = xs.filter((x) => !(x.kind === 'play' && x.via && direct.has(x.play)));
    // Plays before elements, each in the order they happened.
    cells[age] = kept.sort((a, b) => (a.kind === b.kind ? byTime(a, b) : a.kind === 'play' ? -1 : 1));
  });
  return { cells, plans, unplaced: unplaced.sort(byTime) };
}

// The plays a lane went through, one per age, for lighting what goes with them.
export function lanePicks(p: Placed): Picks {
  const out: Picks = {};
  STAGE_AGES.forEach((age) => {
    const first = (p.cells[age] || []).find((x) => x.kind === 'play');
    if (first && first.kind === 'play') out[age] = first.play;
  });
  return out;
}

// The plays already on a lane in one age, so the picker doesn't offer them again.
export function playsIn(p: Placed, age: Age): Set<string> {
  return new Set((p.cells[age] || []).flatMap((x) => (x.kind === 'play' ? [x.play] : [])));
}
