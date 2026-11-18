import { describe, expect, it } from 'vitest';
import { Library, builderToSteps, stepsToBuilder, tagKey, type Place, type Tag } from '../src';
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
    const p = L.play('barracks_towers');
    expect(p && L.playSignature(p)).toBe('dark:barracks>towers');
    expect(p && L.sequence(p.steps)).toBe('Dark Age barracks, then Tower rush');
    expect(L.planSequence(L.plan('towers_into_castle'))).toBe('Dark: Barracks into towers. Feudal: Naked castle');
  });
  it('round-trips steps through the builder', () => {
    const steps = [{ el: 'a', age: null, step: 1, notes: '' }, { el: 'b', age: null, step: 1, notes: '' }, { el: 'c', age: null, step: 2, notes: '' }];
    expect(builderToSteps(stepsToBuilder(steps))).toEqual(steps);
  });
  it('matches saved plays only in the same age, and adds new ones with the age in the id', () => {
    const rows = stepsToBuilder([{ el: 'barracks', age: null, step: 1, notes: '' }, { el: 'towers', age: null, step: 2, notes: '' }]);
    expect(L.matchPlay(rows, 'dark')?.id).toBe('barracks_towers');
    expect(L.matchPlay(rows, 'feudal')).toBeNull();
    const items = L.data.defs.plays.map((p) => ({ ...p }));
    expect(L.resolvePlay(rows, 'dark', '', items)).toEqual({ id: 'barracks_towers' });
    const towers = stepsToBuilder([{ el: 'towers', age: null, step: 1, notes: '' }]);
    const r = L.resolvePlay(towers, 'feudal', 'Feudal towers', items);
    expect(r).toEqual({ id: 'feudal_feudal_towers', created: true, name: 'Feudal towers' });
    expect(items.find((p) => p.id === r.id)).toMatchObject({ age: 'feudal', family: 'Straight to Castle', steps: [{ el: 'towers', age: 'feudal' }] });
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

describe('game plans', () => {
  const tagged = (t: Partial<Tag>) => {
    const data = fixture();
    data.tags.g = { civ: 'ottomans', el: null, play: null, plan: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true, ...t };
    return new Library(data);
  };
  it('pass a tag down to their plays and those plays\' elements, in the play\'s age', () => {
    const L = tagged({ civ: 'rus', plan: 'towers_into_castle' });
    expect(L.planEvidence('rus', 'towers_into_castle', any).map((e) => e.kind)).toEqual(['tag']);
    expect(L.playEvidence('rus', 'nfc', any).map((e) => e.kind)).toEqual(['viaPlan']);
    expect(L.elementEvidence('rus', 'castle', any, 'feudal').map((e) => e.kind)).toEqual(['tag', 'viaPlan']);
    // Naked castle is a Feudal Age element, so Rus has nothing for it in the Dark Age.
    expect(L.elementEvidence('rus', 'castle', any, 'dark')).toEqual([]);
    expect(L.evText(L.playEvidence('rus', 'nfc', any)[0]!, 'play')).toBe('Part of Towers into naked castle, tagged anywhere');
  });
  it('count from their stages when every stage\'s play is documented', () => {
    const L = tagged({ play: 'nfc' });
    expect(L.planEvidence('ottomans', 'towers_into_castle', any).map((e) => e.kind)).toEqual(['stages']);
    expect(new Library(fixture()).planEvidence('ottomans', 'towers_into_castle', any)).toEqual([]);
  });
  it('say whether a moment shows an item directly or as part of something bigger', () => {
    const L = new Library(fixture());
    expect(L.shows({ planId: 'towers_into_castle' }, 'play', 'nfc')).toBe('via');
    expect(L.shows({ playId: 'barracks_towers' }, 'el', 'towers')).toBe('via');
    expect(L.shows({ playId: 'nfc' }, 'play', 'nfc')).toBe('direct');
    expect(L.shows({ elementId: 'walls' }, 'el', 'towers')).toBeNull();
  });
  it('suggest a family from a play\'s steps', () => {
    const L = new Library(fixture());
    expect(L.suggestFamily(L.play('barracks_towers')!.steps, 'dark')).toBe('Barracks first');
    expect(L.suggestFamily(L.play('nfc')!.steps, 'feudal')).toBe('Straight to Castle');
    expect(L.suggestFamily([{ el: 'tower', age: 'dark', step: 1, notes: '' }], 'dark')).toBe('Towers first');
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
    expect(L.signature(steps, 'dark')).toBe('dark:tower!offensive>castle#regnitz-cathedral');
    expect(L.sequence(steps)).toBe('Tower (offensive), then Naked castle (Regnitz Cathedral)');
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

describe('ages by civ', () => {
  const L = new Library(fixture());
  it('use a civ\'s own ages when it has some, else the element\'s usual ages', () => {
    expect(L.civAges('ottomans', 'maa')).toEqual(['dark', 'feudal', 'castle', 'imperial']);
    expect(L.civAges('rus', 'maa')).toEqual(['feudal', 'castle', 'imperial']);
    expect(L.civAges('rus', 'tower')).toEqual([]);
    expect(L.civCan('ottomans', 'maa', 'dark')).toBe(true);
    expect(L.civCan('rus', 'maa', 'dark')).toBe(false);
  });
  it('allow a play step when any civ can do it in that age', () => {
    expect(L.anyCivCan('maa', 'dark')).toBe(true);
    expect(L.anyCivCan('castle', 'dark')).toBe(false);
    expect(L.civsOpening('maa', 'dark')).toEqual(['ottomans']);
    expect(L.agesNote('maa')).toBe('Feudal, Castle, Imperial · Ottomans from Dark');
    expect(L.health().issues).toEqual([]);
  });
  it('check tags against their own civ', () => {
    expect(L.blockers('ottomans', 'play', 'dark_maa')).toEqual([]);
    expect(L.blockers('rus', 'play', 'dark_maa')).toEqual([{ el: 'maa', age: 'dark' }]);
    expect(L.blockText('rus', { el: 'maa', age: 'dark' })).toBe("Men-at-arms isn't open to Rus in Dark Age");
    expect(L.blockers('rus', 'el', 'maa', 'dark')).toEqual([{ el: 'maa', age: 'dark' }]);
    expect(L.blockers('rus', 'el', 'tower')).toEqual([{ el: 'tower', age: null }]);
    const data = fixture();
    data.tags.bad = { civ: 'rus', el: null, play: 'dark_maa', plan: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true };
    data.tags.bad2 = { civ: 'rus', el: 'maa', play: null, plan: null, age: 'dark', place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true };
    expect(new Library(data).health().issues).toEqual([
      '1 step or tag uses an age its element no longer allows',
      "1 tag gives a civ a play or game plan with a step it can't do in that age"
    ]);
  });
  it('fill the ages between a new early age and the usual ones', () => {
    expect(L.agesWith('rus', 'maa', 'dark')).toEqual(['dark', 'feudal', 'castle', 'imperial']);
    const data = fixture();
    data.defs.elements.find((e) => e.id === 'maa')!.ages = ['castle', 'imperial'];
    expect(new Library(data).agesWith('rus', 'maa', 'dark')).toEqual(['dark', 'feudal', 'castle', 'imperial']);
    expect(new Library(data).agesWith('rus', 'maa', 'feudal')).toEqual(['feudal', 'castle', 'imperial']);
  });
  it('offer the game data\'s earlier ages the library doesn\'t have yet', () => {
    expect(L.earlyAges('maa')).toEqual([{ el: 'maa', civ: 'rus', age: 'dark', ages: ['dark', 'feudal', 'castle', 'imperial'] }]);
    const data = fixture();
    data.defs.elements.find((e) => e.id === 'maa')!.civAges!.rus = ['dark', 'feudal', 'castle', 'imperial'];
    expect(new Library(data).earlyAges('maa')).toEqual([]);
  });
  it('keep a civ\'s evidence to the ages it can do the element in', () => {
    const data = fixture();
    data.tags.m = { civ: 'rus', el: 'maa', play: null, plan: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true };
    data.tags.o = { civ: 'ottomans', el: 'maa', play: null, plan: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true };
    const M = new Library(data);
    expect(M.elementEvidence('rus', 'maa', any, 'feudal').map((e) => e.kind)).toEqual(['tag']);
    expect(M.elementEvidence('rus', 'maa', any, 'dark')).toEqual([]);
    // Ottomans can make them in the Dark Age and have a barracks tag; Rus can't.
    expect(M.playEvidence('ottomans', 'dark_maa', any).map((e) => e.kind)).toEqual(['parts']);
    expect(M.playEvidence('rus', 'dark_maa', any)).toEqual([]);
  });
});

describe('civ stages', () => {
  it('lay out a civ\'s plays by age and family, by evidence', () => {
    const L = new Library(fixture());
    const { columns, plans } = L.civStages('ottomans', dry);
    const dark = columns[0]!;
    expect(dark.age).toBe('dark');
    // Barracks into towers from parts on Dry Arabia; Barracks into men-at-arms possible but not seen.
    expect(dark.families.map((f) => [f.name, f.cards.map((c) => c.id + ':' + c.tier)])).toEqual([['Barracks first', ['barracks_towers:parts', 'dark_maa:open']]]);
    expect(L.stageBadge(dark.families[0]!.cards[0]!)).toBe('From parts');
    expect(plans).toEqual([]);
  });
  it('leave out plays a civ can\'t do in that age, and say what isn\'t open', () => {
    const L = new Library(fixture());
    const dark = L.civStages('rus', any).columns[0]!;
    expect(dark.families.flatMap((f) => f.cards.map((c) => c.id + ':' + c.tier))).toEqual(['barracks_towers:documented']);
    expect(L.stageBadge(dark.families[0]!.cards[0]!)).toBe('Tagged for some maps');
    expect(dark.closed).toEqual(['Men-at-arms']);
  });
  it('list game plans: documented first, then those from their plays', () => {
    const data = fixture();
    data.tags.g = { civ: 'rus', el: null, play: null, plan: 'towers_into_castle', age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true };
    const L = new Library(data);
    expect(L.civStages('rus', any).plans.filter((p) => p.tier === 'documented').map((p) => p.id)).toEqual(['towers_into_castle']);
    const feudal = L.civStages('rus', any).columns[1]!;
    expect(feudal.families.flatMap((f) => f.cards.map((c) => L.stageBadge(c)))).toEqual(['Through a game plan']);
  });
});

describe('branches and answers', () => {
  const L = new Library(fixture());
  it('read a branch\'s trigger and match it to what the opponent plays', () => {
    const b = L.branchesOf('greedy')[0]!;
    expect(L.triggerText(b.trigger)).toBe('Tower rush in Dark Age');
    expect(L.triggerMatches(b.trigger, 'barracks_towers', 'dark')).toBe(true);
    expect(L.triggerMatches(b.trigger, 'dark_maa', 'dark')).toBe(false);
    expect(L.triggerMatches({ el: null, play: 'barracks_towers', age: null, civ: 'rus' }, 'barracks_towers', 'dark')).toBe(true);
    expect(L.triggerText({ el: null, play: 'barracks_towers', age: null, civ: 'rus' })).toBe('Barracks into towers in Dark Age from Rus');
  });
  it('say what is wrong with a branch', () => {
    expect(L.branchProblems(L.branchesOf('greedy')[0]!)).toEqual([]);
    expect(L.branchProblems({ stages: {}, rejoins: null, trigger: null })).toEqual(['Pick a play for at least one age.']);
    expect(L.branchProblems({ stages: { dark: { play: 'dark_maa', notes: '' } }, rejoins: 'dark', trigger: null }))
      .toEqual(['It rejoins in Dark Age but still has a play there or later.']);
    expect(L.branchProblems({ stages: { dark: { play: 'dark_maa', notes: '' } }, rejoins: null, trigger: { el: 'towers', play: null, age: 'feudal', civ: null } }))
      .toEqual(['It starts in Dark Age, before you could scout Tower rush in Feudal Age.']);
    expect(L.branchProblems({ stages: { feudal: { play: 'dark_maa', notes: '' } }, rejoins: null, trigger: null }))
      .toEqual(['Barracks into men-at-arms is a Dark Age play, not Feudal Age.']);
  });
  it('find the answer for a pairing, most specific first', () => {
    expect(L.answerFor('towers_into_castle', 'greedy', 'rus', 'ottomans')![0]).toBe('a1');
    expect(L.answerFor('towers_into_castle', 'greedy', 'rus', 'scots')).toBe(null);
    const data = fixture();
    data.answers.a2 = { theirPlan: 'towers_into_castle', myPlan: 'greedy', myCiv: null, oppCiv: null, status: 'idea', notes: '', ageNotes: {}, active: true };
    expect(new Library(data).answerFor('towers_into_castle', 'greedy', 'rus', 'scots')![0]).toBe('a2');
    expect(new Library(data).answerFor('towers_into_castle', 'greedy', 'rus', 'ottomans')![0]).toBe('a1');
    expect(new Library(data).answersWith('greedy').length).toBe(2);
  });
});

describe('upkeep', () => {
  it('flags elements without one of the four types', () => {
    const data = fixture();
    data.defs.elements[2]!.kind = 'army';
    expect(new Library(data).health().issues).toEqual(['1 element has no type yet (unit, structure, economy, or age-up or tech)']);
  });
  it('finds plays with the same steps in the same age', () => {
    const data = fixture();
    data.defs.plays.push({ ...data.defs.plays[0]!, id: 'copy', name: 'Copy' }, { ...data.defs.plays[0]!, id: 'later', name: 'Later', age: 'feudal' });
    expect(new Library(data).health().dupes.map((g) => g.map((s) => s.id))).toEqual([['barracks_towers', 'copy']]);
  });
  it('finds game plans with the same stages, and stages in the wrong age', () => {
    const data = fixture();
    data.defs.gamePlans.push({ ...data.defs.gamePlans[0]!, id: 'twin', name: 'Twin' });
    data.defs.gamePlans.push({ ...data.defs.gamePlans[0]!, id: 'odd', name: 'Odd', stages: { castle: { play: 'nfc', notes: '' } } });
    const h = new Library(data).health();
    expect(h.planDupes.map((g) => g.map((s) => s.id))).toEqual([['towers_into_castle', 'twin']]);
    expect(h.issues).toEqual(['1 game plan stage holds a play from another age']);
  });
});
