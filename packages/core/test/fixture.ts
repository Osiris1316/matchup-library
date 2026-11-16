// A small library for the tests: two civs, two maps, five elements, one play,
// and a few subjects from the game data.
import type { LibraryData } from '../src';

export function fixture(): LibraryData {
  return {
    defs: {
      civs: [
        { id: 'ottomans', name: 'Ottomans', short: 'Ottomans', flag: 'ottomans', parent: null, active: true },
        { id: 'rus', name: 'Rus', short: 'Rus', flag: 'rus', parent: null, active: true }
      ],
      mapTypes: [
        { id: 'open', name: 'Open', description: '', active: true },
        { id: 'water', name: 'Water', description: '', active: true }
      ],
      features: [{ id: 'close_gold', name: 'Close gold', description: 'Gold near the start', active: true }],
      maps: [
        { id: 'dry-arabia', name: 'Dry Arabia', aoe4worldName: 'Dry Arabia', type: 'open', notes: '', features: ['close_gold'], inPool: true, active: true },
        { id: 'lake', name: 'Lake', aoe4worldName: null, type: 'water', notes: "It's wet", features: [], inPool: false, active: true }
      ],
      kinds: [
        { id: 'unit', name: 'Unit', description: '', active: true },
        { id: 'structure', name: 'Structure', description: '', active: true },
        { id: 'economy', name: 'Economy', description: '', active: true },
        { id: 'age_tech', name: 'Age-up or tech', description: '', active: true }
      ],
      elements: [
        { id: 'barracks', name: 'Dark Age barracks', kind: 'structure', ages: ['dark'], tells: '', description: '', where: [], whereNote: '', active: true, mergedInto: null,
          subject: 'barracks', intent: 'offensive', universal: false, cannot: [] },
        { id: 'towers', name: 'Tower rush', kind: 'structure', ages: ['dark', 'feudal', 'castle', 'imperial'], tells: 'Villagers walk out', description: '',
          where: [{ kind: 'feature', id: 'close_gold' }], whereNote: 'Gold sits in the open', active: true, mergedInto: null,
          subject: 'outpost', intent: 'offensive', universal: false, cannot: [] },
        { id: 'walls', name: 'Offensive walls', kind: 'structure', ages: ['dark', 'feudal', 'castle', 'imperial'], tells: '', description: '', where: [], whereNote: '', active: true, mergedInto: null,
          subject: null, intent: null, universal: false, cannot: [] },
        { id: 'tower', name: 'Tower', kind: 'structure', ages: ['dark', 'feudal', 'castle', 'imperial'], tells: '', description: '', where: [], whereNote: '', active: true, mergedInto: null,
          subject: 'outpost', intent: 'defensive', universal: true, cannot: ['rus'] },
        { id: 'castle', name: 'Naked castle', kind: 'age_tech', ages: ['feudal'], tells: '', description: '', where: [], whereNote: '', active: true, mergedInto: null,
          subject: null, intent: null, universal: false, cannot: [] }
      ],
      strategies: [
        { id: 'barracks_towers', name: 'Barracks into towers', description: '', notes: '', where: [], whereNote: '', active: true, mergedInto: null,
          steps: [{ el: 'barracks', age: 'dark', step: 1, notes: '' }, { el: 'towers', age: 'dark', step: 2, notes: '' }] }
      ]
    },
    tags: {
      t1: { civ: 'ottomans', el: 'towers', play: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true },
      t2: { civ: 'ottomans', el: 'barracks', play: null, age: null, place: { kind: 'feature', id: 'close_gold' }, timing: '3 min', tells: '', notes: '', confirmed: null, active: true },
      t3: { civ: 'rus', el: null, play: 'barracks_towers', age: null, place: { kind: 'type', id: 'open' }, timing: '', tells: '', notes: '', confirmed: null, active: true },
      t4: { civ: 'ottomans', el: 'tower', play: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: 'Pushes towers forward', confirmed: null, active: true, intent: 'offensive' },
      t5: { civ: 'rus', el: 'castle', play: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true, subject: 'burgrave-palace' }
    },
    games: {
      g1: { mine: true, title: '', date: '2026-11-09', playerName: '', playerCiv: 'rus', oppName: 'Someone', oppCiv: 'ottomans', map: 'dry-arabia', result: 'loss', notes: '',
        aoe4worldGameId: null, plays: [{ pid: 'p1', runBy: 'opponent', strategyId: null, elementId: 'walls', age: 'dark', outcome: 'worked', prep: 'saw_no_plan', answerId: null, did: 'Kept mining', notes: '' }] }
    },
    links: {
      l1: { url: 'https://www.twitch.tv/videos/1', source: 'twitch_vod', title: '', gameId: 'g1', kind: 'game', civ: null, map: null, openAt: null, status: 'live', checked: null, notes: '',
        marks: [{ mid: 'm1', at: 250, playId: 'p1', civ: null, elementId: null, strategyId: null, age: null, shows: 'both', note: '' }] },
      l2: { url: 'https://youtube.com/watch?v=x', source: 'youtube', title: 'Rus guide', gameId: null, kind: 'guide', civ: 'rus', map: null, openAt: null, status: 'live', checked: null, notes: '',
        marks: [{ mid: 'm2', at: 90, playId: null, civ: 'rus', elementId: 'walls', strategyId: null, age: null, shows: 'threat', note: "Don't skip it" }] }
    },
    subjects: {
      barracks: { id: 'barracks', name: 'Barracks', kind: 'building', age: 1, civs: null, icon: 'buildings/barracks-1.png', defaultIntent: null, active: true },
      outpost: { id: 'outpost', name: 'Outpost', kind: 'building', age: 1, civs: null, icon: 'buildings/outpost-1.png', defaultIntent: null, active: true },
      'burgrave-palace': { id: 'burgrave-palace', name: 'Burgrave Palace', kind: 'landmark', age: 2, civs: ['holy_roman_empire'], icon: 'buildings/burgrave-palace-2.png', defaultIntent: 'offensive', active: true },
      'regnitz-cathedral': { id: 'regnitz-cathedral', name: 'Regnitz Cathedral', kind: 'landmark', age: 2, civs: ['holy_roman_empire'], icon: 'buildings/regnitz-cathedral-2.png', defaultIntent: null, active: true }
    },
    answers: {},
    settings: { lastPatch: '12.1' }
  };
}
