import { describe, expect, it } from 'vitest';
import type { Age } from '@matchup-library/core';
import { lanePicks, placeMoments, playsIn, type BoardLookup, type BoardMoment } from '../src/pages/refs/board';

const ages: Record<string, Age> = { d_spears: 'dark', d_archers: 'dark', f_fc: 'feudal', f_horse: 'feudal', c_maa: 'castle', i_trebs: 'imperial' };
const look: BoardLookup = {
  playAge: (id) => ages[id] || null,
  planStages: (id) => (id === 'fc_maa' ? { dark: 'd_spears', feudal: 'f_fc', castle: 'c_maa' } : id === 'empty' ? {} : {}),
  elAges: (id) => (id === 'keep' ? ['castle', 'imperial'] : id === 'archers' ? ['dark', 'feudal', 'castle'] : [])
};
let n = 0;
const mo = (x: Partial<BoardMoment>): BoardMoment => ({ key: 'k' + n, i: n++, at: null, planId: null, playId: null, elementId: null, age: null, ...x });

describe('placing a reference on the age board', () => {
  it('puts a play in its own age', () => {
    const p = placeMoments([mo({ key: 'a', playId: 'f_horse' })], look);
    expect(p.cells.feudal?.map((x) => x.key)).toEqual(['a']);
    expect(p.cells.dark).toBeUndefined();
    expect(p.unplaced).toEqual([]);
  });

  it('spreads a game plan over its stages and names it for the heading', () => {
    const p = placeMoments([mo({ key: 'g', planId: 'fc_maa' })], look);
    expect(['dark', 'feudal', 'castle'].map((a) => p.cells[a as Age]?.[0])).toEqual([
      { kind: 'play', play: 'd_spears', key: 'g', at: null, i: expect.any(Number), via: 'fc_maa' },
      { kind: 'play', play: 'f_fc', key: 'g', at: null, i: expect.any(Number), via: 'fc_maa' },
      { kind: 'play', play: 'c_maa', key: 'g', at: null, i: expect.any(Number), via: 'fc_maa' }
    ]);
    expect(p.plans.map((x) => x.key)).toEqual(['g']);
  });

  it('lets a play logged on its own replace the same play implied by a game plan', () => {
    const p = placeMoments([mo({ key: 'g', planId: 'fc_maa' }), mo({ key: 's', playId: 'd_spears', at: 60 })], look);
    expect(p.cells.dark?.map((x) => x.key)).toEqual(['s']);
    expect(p.cells.feudal?.map((x) => x.key)).toEqual(['g']);
  });

  it('keeps a different play beside the game plan\'s', () => {
    const p = placeMoments([mo({ key: 'g', planId: 'fc_maa' }), mo({ key: 'x', playId: 'd_archers' })], look);
    expect(p.cells.dark?.map((x) => x.key)).toEqual(['g', 'x']);
  });

  it('orders a cell by time, plays before elements', () => {
    const p = placeMoments([
      mo({ key: 'late', playId: 'd_archers', at: 200 }),
      mo({ key: 'el', elementId: 'archers', age: 'dark', at: 10 }),
      mo({ key: 'early', playId: 'd_spears', at: 50 }),
      mo({ key: 'untimed', playId: 'd_spears' })
    ], look);
    expect(p.cells.dark?.map((x) => x.key)).toEqual(['early', 'late', 'untimed', 'el']);
  });

  it('places an element in the age it was logged in, or its only age on the board', () => {
    const p = placeMoments([mo({ key: 'a', elementId: 'archers', age: 'feudal' }), mo({ key: 'k', elementId: 'keep' })], look);
    expect(p.cells.feudal?.map((x) => x.key)).toEqual(['a']);
    expect(p.cells.castle?.map((x) => x.key)).toEqual(['k']);
  });

  it('leaves the rest for the list: nothing picked, Imperial, or no single age', () => {
    const p = placeMoments([
      mo({ key: 'none', at: 30 }),
      mo({ key: 'imp', playId: 'i_trebs', at: 10 }),
      mo({ key: 'many', elementId: 'archers' }),
      mo({ key: 'gone', playId: 'missing' }),
      mo({ key: 'bare', planId: 'empty' })
    ], look);
    expect(p.unplaced.map((x) => x.key)).toEqual(['imp', 'none', 'many', 'gone', 'bare']);
    expect(Object.keys(p.cells)).toEqual([]);
  });

  it('reads the lane\'s path for lighting what goes with it', () => {
    const p = placeMoments([mo({ key: 'g', planId: 'fc_maa' }), mo({ key: 'x', playId: 'f_horse', at: 5 })], look);
    expect(lanePicks(p)).toEqual({ dark: 'd_spears', feudal: 'f_horse', castle: 'c_maa' });
    expect([...playsIn(p, 'feudal')].sort()).toEqual(['f_fc', 'f_horse']);
  });
});
