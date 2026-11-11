// A small library for the tests: two civs, two maps, three elements, one play.
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
      kinds: [{ id: 'structure', name: 'Structure', description: '', active: true }],
      elements: [
        { id: 'barracks', name: 'Dark Age barracks', kind: 'structure', ages: ['dark'], tells: '', description: '', where: [], whereNote: '', active: true, mergedInto: null },
        { id: 'towers', name: 'Tower rush', kind: 'structure', ages: ['dark', 'feudal', 'castle', 'imperial'], tells: 'Villagers walk out', description: '',
          where: [{ kind: 'feature', id: 'close_gold' }], whereNote: 'Gold sits in the open', active: true, mergedInto: null },
        { id: 'walls', name: 'Offensive walls', kind: 'structure', ages: ['dark', 'feudal', 'castle', 'imperial'], tells: '', description: '', where: [], whereNote: '', active: true, mergedInto: null }
      ],
      strategies: [
        { id: 'barracks_towers', name: 'Barracks into towers', description: '', notes: '', where: [], whereNote: '', active: true, mergedInto: null,
          steps: [{ el: 'barracks', age: 'dark', step: 1, notes: '' }, { el: 'towers', age: 'dark', step: 2, notes: '' }] }
      ]
    },
    tags: {
      t1: { civ: 'ottomans', el: 'towers', play: null, age: null, place: { kind: 'any' }, timing: '', tells: '', notes: '', confirmed: null, active: true },
      t2: { civ: 'ottomans', el: 'barracks', play: null, age: null, place: { kind: 'feature', id: 'close_gold' }, timing: '3 min', tells: '', notes: '', confirmed: null, active: true },
      t3: { civ: 'rus', el: null, play: 'barracks_towers', age: null, place: { kind: 'type', id: 'open' }, timing: '', tells: '', notes: '', confirmed: null, active: true }
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
    answers: {},
    settings: { lastPatch: '12.1' }
  };
}
