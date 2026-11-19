// The order of a column while narrowing, and which families fold. Pure, so it
// can be tested without a page (test/order.test.ts).
import type { CardState } from '@matchup-library/core';

export interface Family<C> { name: string; cards: C[] }
export interface FamilyView<C> extends Family<C> {
  // Holds the picked card, has cards that go with the picks, or has only faded ones.
  focus: 'picked' | 'lit' | 'faded' | 'free';
  lit: number;
  faded: number;
}

const famRank = { picked: 0, lit: 1, free: 1, faded: 2 } as const;
const cardRank: Record<CardState, number> = { picked: 0, lit: 1, free: 1, dim: 2 };

// While narrowing, the family with the pick comes first with the pick at its
// top, then families with cards that go with the picks (those cards first),
// then families with nothing but faded cards. Otherwise the usual order. Ties
// keep the usual order, so nothing moves without a reason.
export function focusOrder<C extends { id: string }>(families: Family<C>[], stateOf: (id: string) => CardState, narrowing: boolean): FamilyView<C>[] {
  const views = families.map((f) => {
    const states = f.cards.map((c) => stateOf(c.id));
    const lit = states.filter((x) => x === 'lit').length;
    const faded = states.filter((x) => x === 'dim').length;
    const focus: FamilyView<C>['focus'] = !narrowing ? 'free' : states.includes('picked') ? 'picked' : lit ? 'lit' : 'faded';
    const cards = narrowing ? stableSort(f.cards, (c) => cardRank[stateOf(c.id)]) : f.cards;
    return { name: f.name, cards, focus, lit, faded };
  });
  return narrowing ? stableSort(views, (v) => famRank[v.focus]) : views;
}

function stableSort<T>(xs: T[], rank: (x: T) => number): T[] {
  return xs.map((x, i) => ({ x, i, r: rank(x) })).sort((a, b) => a.r - b.r || a.i - b.i).map((y) => y.x);
}

// Folding. Families you fold stay folded, by name, on every civ. While
// narrowing (when foldFaded is on), families with only faded cards fold too,
// unless you've opened them since you started narrowing.
export interface FoldState { folded: string[]; opened: string[]; foldFaded: boolean }

export function isFolded(f: { name: string; focus: FamilyView<unknown>['focus'] }, st: FoldState, narrowing: boolean): boolean {
  if (narrowing && st.foldFaded && f.focus === 'faded') return !st.opened.includes(f.name);
  return st.folded.includes(f.name);
}

// What folding or opening one family changes.
export function toggleFold(f: { name: string; focus: FamilyView<unknown>['focus'] }, st: FoldState, narrowing: boolean): FoldState {
  const flip = (xs: string[]) => (xs.includes(f.name) ? xs.filter((x) => x !== f.name) : [...xs, f.name]);
  if (narrowing && st.foldFaded && f.focus === 'faded') return { ...st, opened: flip(st.opened) };
  return { ...st, folded: flip(st.folded) };
}

// Expand all or collapse all, for the families on this page.
export function foldAll(names: string[], st: FoldState, fold: boolean): FoldState {
  const rest = st.folded.filter((x) => !names.includes(x));
  return fold ? { ...st, folded: [...rest, ...names], opened: [] } : { ...st, folded: rest, opened: [...new Set([...st.opened, ...names])] };
}
