import { describe, expect, it } from 'vitest';
import { Library, builderToSteps, stepsToBuilder, tagKey, type Place } from '../src';
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
    expect(L.civElements('ottomans', any).map((x) => x.id)).toEqual(['tower', 'towers', 'barracks', 'walls']);
  });
});

describe('looks', () => {
  const L = new Library(fixture());
  it('takes intent from the use, then the element, then the subject', () => {
    expect(L.look('tower').intent).toBe('defensive');
    expect(L.look('tower', { intent: 'offensive' }).intent).toBe('offensive');
    expect(L.look('walls').intent).toBeNull();
    const c = L.look('castle', { subject: 'burgrave-palace' });
    expect([c.name, c.title, c.intent, c.landmark, c.icon]).toEqual(['Burgrave Palace', 'Naked castle: Burgrave Palace', 'offensive', true, 'buildings/burgrave-palace-2.png']);
    expect(L.look('castle').name).toBe('Naked castle');
  });
  it('writes step overrides into the signature and the sentence', () => {
    const steps = [{ el: 'tower', age: 'dark' as const, step: 1, notes: '', intent: 'offensive' as const }, { el: 'castle', age: null, step: 2, notes: '', subject: 'regnitz-cathedral' }];
    expect(L.signature(steps)).toBe('tower@dark!offensive>castle#regnitz-cathedral');
    expect(L.sequence(steps)).toBe('Tower (offensive) in Dark Age, then Naked castle (Regnitz Cathedral)');
    expect(builderToSteps(stepsToBuilder(steps))).toEqual(steps);
  });
  it('keeps tags with different intents apart', () => {
    const t = fixture().tags.t4!;
    expect(tagKey(t)).not.toBe(tagKey({ ...t, intent: null }));
  });
});

describe('universal elements', () => {
  const L = new Library(fixture());
  it('count for every civ that can do them, in their default intent', () => {
    expect(L.elementEvidence('ottomans', 'tower', any, null).map((e) => e.kind)).toEqual(['tag', 'universal']);
    expect(L.elementEvidence('ottomans', 'tower', any, null, 'defensive').map((e) => e.kind)).toEqual(['universal']);
    expect(L.elementEvidence('ottomans', 'tower', any, null, 'offensive').map((e) => e.kind)).toEqual(['tag']);
    expect(L.elementEvidence('rus', 'tower', any, null)).toEqual([]);
  });
  it('stay out of a civ\'s element list unless something else documents them', () => {
    const data = fixture();
    delete data.tags.t4;
    expect(new Library(data).civElements('ottomans', any).map((x) => x.id)).not.toContain('tower');
  });
});

describe('upkeep', () => {
  it('flags elements without one of the four types', () => {
    const data = fixture();
    data.defs.elements[2]!.kind = 'army';
    expect(new Library(data).health().issues).toEqual(['1 element has no type yet (unit, structure, economy, or age-up or tech)']);
  });
  it('finds plays with the same steps', () => {
    const data = fixture();
    data.defs.strategies.push({ ...data.defs.strategies[0]!, id: 'copy', name: 'Copy' });
    expect(new Library(data).health().dupes.map((g) => g.map((s) => s.id))).toEqual([['barracks_towers', 'copy']]);
  });
});
