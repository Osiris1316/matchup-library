import { describe, expect, it } from 'vitest';
import { Library, builderToSteps, stepsToBuilder, type Place } from '../src';
import { fixture } from './fixture';

const any: Place = { kind: 'any' };
const dry: Place = { kind: 'map', id: 'dry-arabia' };
const lake: Place = { kind: 'map', id: 'lake' };
const open: Place = { kind: 'type', id: 'open' };

describe('places', () => {
  const L = new Library(fixture());
  it('relates a tag place to the place being viewed', () => {
    expect(L.relation(any, dry)).toBe('inherited');
    expect(L.relation(open, dry)).toBe('inherited');
    expect(L.relation({ kind: 'feature', id: 'close_gold' }, dry)).toBe('inherited');
    expect(L.relation({ kind: 'feature', id: 'close_gold' }, lake)).toBe('none');
    expect(L.relation(dry, open)).toBe('narrower');
    expect(L.relation(dry, any)).toBe('narrower');
    expect(L.relation(any, any)).toBe('own');
  });
  it('finds "comes up on" notes that match the map', () => {
    const towers = L.el('towers');
    expect(L.whereHits(towers, dry)).toEqual([{ kind: 'feature', id: 'close_gold' }]);
    expect(L.whereHits(towers, lake)).toEqual([]);
    expect(L.whereHits(towers, any)).toEqual([]);
  });
});

describe('plays', () => {
  const L = new Library(fixture());
  it('writes steps as a signature and a sentence', () => {
    const s = L.strat('barracks_towers');
    expect(s && L.signature(s.steps)).toBe('barracks>towers@dark');
    expect(s && L.sequence(s.steps)).toBe('Dark Age barracks, then Tower rush in Dark Age');
  });
  it('round-trips steps through the builder', () => {
    const steps = [{ el: 'a', age: null, step: 1, notes: '' }, { el: 'b', age: null, step: 1, notes: '' }, { el: 'c', age: null, step: 2, notes: '' }];
    expect(builderToSteps(stepsToBuilder(steps))).toEqual(steps);
  });
});

describe('evidence', () => {
  it('documents a play from its parts when each part is documented', () => {
    const L = new Library(fixture());
    const ev = L.playEvidence('ottomans', 'barracks_towers', dry);
    expect(ev.map((e) => e.kind)).toEqual(['parts']);
    expect(L.playEvidence('ottomans', 'barracks_towers', lake)).toEqual([]);
  });
  it('counts a play tag for its own elements', () => {
    const L = new Library(fixture());
    const ev = L.elementEvidence('rus', 'towers', dry, null);
    expect(ev.map((e) => e.kind)).toEqual(['viaPlay']);
    expect(L.evText(ev[0]!, 'el')).toBe('Part of Barracks into towers, tagged on open maps');
  });
  it('uses game moments and guide moments, with their times', () => {
    const L = new Library(fixture());
    const opp = L.elementEvidence('ottomans', 'walls', dry, null);
    expect(opp.map((e) => e.kind)).toEqual(['game']);
    expect(L.evText(opp[0]!, 'el')).toMatch(/^Seen in your game on Dry Arabia, November \d+, at 4:10$/);
    const rus = L.elementEvidence('rus', 'walls', lake, null);
    expect(rus.map((e) => e.kind)).toEqual(['guide']);
    expect(L.evText(rus[0]!, 'el')).toBe('Shown in a guide: Rus guide, at 1:30');
  });
  it('sorts own tags ahead of narrower ones', () => {
    const L = new Library(fixture());
    expect(L.civElements('ottomans', any).map((x) => x.id)).toEqual(['towers', 'barracks', 'walls']);
  });
});

describe('upkeep', () => {
  it('finds plays with the same steps', () => {
    const data = fixture();
    data.defs.strategies.push({ ...data.defs.strategies[0]!, id: 'copy', name: 'Copy' });
    expect(new Library(data).health().dupes.map((g) => g.map((s) => s.id))).toEqual([['barracks_towers', 'copy']]);
  });
});
