import { describe, expect, it } from 'vitest';
import type { CardState } from '@matchup-library/core';
import { focusOrder, foldAll, isFolded, toggleFold, type FoldState } from '../src/pages/civs/stages/order';

const fams = [
  { name: 'Barracks', cards: [{ id: 'b1' }, { id: 'b2' }] },
  { name: 'Economy', cards: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] },
  { name: 'Range', cards: [{ id: 'r1' }] },
  { name: 'Stable', cards: [{ id: 's1' }, { id: 's2' }] }
];
const states = (m: Record<string, CardState>) => (id: string): CardState => m[id] || 'dim';

describe('focus order', () => {
  it('keeps the usual order when nothing is picked', () => {
    const v = focusOrder(fams, () => 'free', false);
    expect(v.map((f) => f.name)).toEqual(['Barracks', 'Economy', 'Range', 'Stable']);
    expect(v.every((f) => f.focus === 'free')).toBe(true);
  });

  it('puts the pick\'s family first with the pick on top, then families with lit cards', () => {
    const v = focusOrder(fams, states({ e3: 'picked', s2: 'lit' }), true);
    expect(v.map((f) => f.name)).toEqual(['Economy', 'Stable', 'Barracks', 'Range']);
    expect(v[0]!.cards.map((c) => c.id)).toEqual(['e3', 'e1', 'e2']);
    expect(v[1]!.cards.map((c) => c.id)).toEqual(['s2', 's1']);
    expect(v.map((f) => f.focus)).toEqual(['picked', 'lit', 'faded', 'faded']);
    expect(v[1]).toMatchObject({ lit: 1, faded: 1 });
  });

  it('keeps ties in their usual order', () => {
    const v = focusOrder(fams, states({ b2: 'lit', r1: 'lit' }), true);
    expect(v.map((f) => f.name)).toEqual(['Barracks', 'Range', 'Economy', 'Stable']);
    expect(v[0]!.cards.map((c) => c.id)).toEqual(['b2', 'b1']);
  });
});

describe('folding', () => {
  const st: FoldState = { folded: ['Range'], opened: [], foldFaded: true };
  const faded = { name: 'Stable', focus: 'faded' as const };
  const lit = { name: 'Range', focus: 'lit' as const };

  it('folds faded families while narrowing, and what you folded at any time', () => {
    expect(isFolded(faded, st, true)).toBe(true);
    expect(isFolded(faded, st, false)).toBe(false);
    expect(isFolded(lit, st, true)).toBe(true);
    expect(isFolded({ name: 'Barracks', focus: 'lit' }, st, true)).toBe(false);
  });

  it('leaves faded families open when that preference is off', () => {
    expect(isFolded(faded, { ...st, foldFaded: false }, true)).toBe(false);
  });

  it('opening a faded family while narrowing doesn\'t change your own folds', () => {
    const next = toggleFold(faded, st, true);
    expect(next.opened).toEqual(['Stable']);
    expect(next.folded).toEqual(['Range']);
    expect(isFolded(faded, next, true)).toBe(false);
  });

  it('folding by hand is remembered by name', () => {
    expect(toggleFold({ name: 'Economy', focus: 'free' }, st, false).folded).toEqual(['Range', 'Economy']);
    expect(toggleFold(lit, st, true).folded).toEqual([]);
  });

  it('expands or collapses every family on the page', () => {
    const names = ['Barracks', 'Stable'];
    const open = foldAll(names, st, false);
    expect(open.folded).toEqual(['Range']);
    expect(isFolded(faded, open, true)).toBe(false);
    const shut = foldAll(names, st, true);
    expect(shut.folded).toEqual(['Range', 'Barracks', 'Stable']);
    expect(shut.opened).toEqual([]);
  });
});
