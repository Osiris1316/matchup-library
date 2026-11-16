// The page's state: one object, changed in place by event handlers, which call
// emit() to re-render. Components read it directly. This mirrors how the first
// version worked, so the saving and undo logic carries over unchanged.
import { useSyncExternalStore } from 'react';
import {
  Library, emptyDefs, type Age, type BuilderRow, type ChangeEntry, type DefType, type Intent, type ItemKind, type LibraryData,
  type Outcome, type Place, type PlaceKind, type Prep, type Shows
} from '@matchup-library/core';

export type DbState = 'connecting' | 'ready' | 'unavailable' | 'unauthorized';
export interface Toast { text: string; warn: boolean; undoId: string | null; at: number }
export type PlaceDraft = { kind: PlaceKind; id: string | null };

// Drafts: what a sheet is editing, before it's saved.
export interface DefDraft {
  name: string; description: string;
  kind: string; ages: Age[]; tells: string;                   // elements
  subject: string; intent: Intent | ''; universal: boolean; cannot: string[];
  builder: BuilderRow[];                                      // plays
  where: Place[]; whereNote: string; civOn: string[];         // elements and plays
  mapsOn: string[];                                           // features
  type: string; features: string[]; inPool: boolean; notes: string; // maps
  short: string; parent: string;                              // civs
}
export interface TagDraft {
  tagId: string | null; civ: string; field: ItemKind; target: string; place: PlaceDraft;
  age: Age | null; timing: string; tells: string; notes: string;
  intent: Intent | ''; subject: string;                       // element tags only
}
export interface BulkDraft { civ: string; seg: ItemKind; place: PlaceDraft; pickedEl: string[]; pickedPlay: string[] }
export type RefKind = 'mine' | 'game' | 'guide';
export interface RefDraft {
  kind: RefKind; id: string | null; url: string; title: string; notes: string;
  civ: string; map: string;                                   // guides (map for games too)
  playerCiv: string; oppCiv: string; result: '' | 'win' | 'loss'; playerName: string; oppName: string; date: string;
}
export type Side = 'player' | 'opponent';
export interface MomentDraft {
  refKind: 'game' | 'guide'; gameId: string | null; linkId: string | null; pid: string | null; mid: string | null;
  side: Side; civ: string; builder: BuilderRow[]; origStrategy: string | null; name: string; at: string; note: string;
  outcome: Outcome | null; prep: Prep | null; did: string; showHow: boolean; shows: Shows;
}

interface SheetBase { sid: number; back?: Sheet | null; open?: string | null }
export type DefSheet = SheetBase & { kind: 'def'; type: DefType; id: string | null; draft: DefDraft; picking: boolean };
export type TagSheet = SheetBase & { kind: 'tag'; draft: TagDraft };
export type BulkSheet = SheetBase & { kind: 'bulk'; draft: BulkDraft };
export type WhySheet = SheetBase & { kind: 'why'; itemKind: ItemKind; id: string; civ: string };
export type UpkeepSheet = SheetBase & { kind: 'upkeep' };
export type MergeSheet = SheetBase & { kind: 'merge'; keep: string | null };
export type RefSheet = SheetBase & { kind: 'refdet'; draft: RefDraft };
export type MomentSheet = SheetBase & { kind: 'moment'; draft: MomentDraft; picking: boolean };
export type Sheet = DefSheet | TagSheet | BulkSheet | WhySheet | UpkeepSheet | MergeSheet | RefSheet | MomentSheet;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewSheet = DistributiveOmit<Sheet, 'sid'>;

export type LibrarySeg = 'elements' | 'landmarks' | 'strategies';
export type MapsSeg = 'maps' | 'features' | 'mapTypes';
export type CheckSeg = 'plays' | 'elements' | 'mine';
export type RefsSeg = 'all' | 'mine' | 'games' | 'guides';

export const S = {
  dbState: 'connecting' as DbState,
  authError: '',
  loaded: false,
  loadedAt: 0,
  data: { defs: emptyDefs(), tags: {}, games: {}, links: {}, answers: {}, settings: {} } as LibraryData,
  changes: {} as Record<string, ChangeEntry>,
  view: 'library',
  lastView: null as string | null,
  ui: {
    // sel: the element open in the editor ('' for none, 'new' for a new one), with its draft.
    library: { seg: 'elements' as LibrarySeg, showRetired: false, sel: '', draft: null as DefDraft | null, saved: '', q: '', lmCiv: '', subjectPick: false, subjectQ: '' },
    civs: { showRetired: false },
    civ: { showRetired: false },
    maps: { seg: 'maps' as MapsSeg, showRetired: false },
    check: { me: 'chinese', opp: 'ottomans', place: 'any:', seg: 'plays' as CheckSeg, showElsewhere: false },
    refs: { seg: 'all' as RefsSeg, url: '' }
  },
  sheet: null as Sheet | null,
  // Which dropdown checklist is open outside a sheet (the Library editor).
  panel: { open: null as string | null },
  toast: null as Toast | null,
  refDefaults: {} as { myCiv?: string; guideCiv?: string },
  lastSide: 'opponent' as Side
};

// The rules, reading the same data object for the life of the page.
export const L = new Library(S.data);

// ---------------------------------------------------------------- re-rendering
let version = 0;
const listeners = new Set<() => void>();
export function emit(): void { version += 1; listeners.forEach((fn) => fn()); }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useStore(): number { return useSyncExternalStore(subscribe, () => version); }

// A text field bound to a draft property.
type ChangeEv = { target: { value: string } };
export function bind<T extends Record<K, string>, K extends keyof T>(o: T, k: K): { value: string; onChange: (e: ChangeEv) => void } {
  return { value: o[k], onChange: (e) => { (o as Record<K, string>)[k] = e.target.value; emit(); } };
}
export const toggleIn = (list: string[], v: string, on: boolean): string[] => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

// ---------------------------------------------------------------- sheets and toasts
let sheetSeq = 0;
export function openSheet(obj: NewSheet): void {
  S.sheet = { ...obj, sid: ++sheetSeq } as Sheet;
  if (S.toast && !S.toast.warn) S.toast = null;
  emit();
}
export const nextSid = (): number => ++sheetSeq;
export function closeSheet(): void { S.sheet = null; emit(); }
export function backSheet(): void { S.sheet = S.sheet && S.sheet.back ? S.sheet.back : null; emit(); }
export function showToast(text: string, warn = false, undoId: string | null = null): void {
  const at = Date.now();
  S.toast = { text, warn, undoId, at };
  emit();
  setTimeout(() => { if (S.toast && S.toast.at === at) { S.toast = null; emit(); } }, undoId ? 8000 : 6000);
}

// ---------------------------------------------------------------- prefs (this browser only)
const PREFS = 'matchup-library-prefs-v2';
export function loadPrefs(): void {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || '{}') as { check?: Partial<typeof S.ui.check>; lastView?: string; ref?: typeof S.refDefaults };
    if (p.check) Object.assign(S.ui.check, p.check);
    if (p.lastView) S.lastView = p.lastView;
    if (p.ref) S.refDefaults = p.ref;
  } catch { /* storage unavailable */ }
}
export function savePrefs(): void {
  try {
    const c = S.ui.check;
    localStorage.setItem(PREFS, JSON.stringify({ check: { me: c.me, opp: c.opp, place: c.place, seg: c.seg }, lastView: S.view.startsWith('ref-') ? 'refs' : S.view, ref: S.refDefaults }));
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- routes
const VIEWS = ['library', 'civs', 'maps', 'refs', 'check'];
export function route(): void {
  const h = (location.hash || '').replace(/^#/, '');
  const ok = (v: string | null): v is string => !!v && (VIEWS.includes(v) || v.startsWith('civ-') || v.startsWith('ref-'));
  S.view = ok(h) ? h : ok(S.lastView) ? S.lastView : 'library';
  S.sheet = null;
  if (!(S.toast && Date.now() - S.toast.at < 1500)) S.toast = null;
  savePrefs();
  emit();
  window.scrollTo(0, 0);
}
export const civSlug = (id: string): string => String(id).replace(/_/g, '-');
export const civIdFromView = (): string => S.view.slice(4).replace(/-/g, '_');
