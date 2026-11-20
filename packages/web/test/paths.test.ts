import { describe, expect, it } from 'vitest';
import { civIdFromSlug, civSlug, isKnownPath, legacyPath, mapItemFromPath, paths, readVersus, refFromPath, refPath } from '../src/app/paths';

describe('paths', () => {
  it('builds civ addresses with hyphens, and reads them back', () => {
    expect(paths.civ('order_of_the_dragon')).toBe('/civs/order-of-the-dragon');
    expect(paths.civ('rus', 'tags')).toBe('/civs/rus/tags');
    expect(civIdFromSlug(civSlug('house_of_lancaster'))).toBe('house_of_lancaster');
  });

  it('keeps only the Versus picks that are set, in a fixed order', () => {
    expect(paths.versus()).toBe('/versus');
    expect(paths.versus({ mine: 'b', them: 'hre', their: '', me: 'chinese' })).toBe('/versus?them=hre&me=chinese&mine=b');
    expect(readVersus('?them=hre&me=chinese&mine=b&junk=1')).toEqual({ them: 'hre', me: 'chinese', mine: 'b' });
  });

  it('round-trips a reference, including ids that need escaping', () => {
    expect(paths.ref('game', 'a b')).toBe('/refs/game/a%20b');
    expect(refFromPath('/refs/game/a%20b')).toEqual({ kind: 'game', id: 'a b' });
    expect(refFromPath('/refs/guide/x1/')).toEqual({ kind: 'guide', id: 'x1' });
    expect(refFromPath('/refs')).toBeNull();
  });

  it('builds and reads a map, feature or map type', () => {
    expect(paths.mapItem('map', 'dry-arabia')).toBe('/maps/map/dry-arabia');
    expect(paths.mapItem('feature', 'close gold')).toBe('/maps/feature/close%20gold');
    expect(mapItemFromPath('/maps/type/open')).toEqual({ kind: 'type', id: 'open' });
    expect(mapItemFromPath('/maps/feature/close%20gold/')).toEqual({ kind: 'feature', id: 'close gold' });
    expect(mapItemFromPath('/maps/lake/x')).toBeNull();
    expect(mapItemFromPath('/maps')).toBeNull();
    expect(refPath('ref-guide-x1')).toBe('/refs/guide/x1');
    expect(refPath('nonsense')).toBe('/refs');
  });
});

describe('old hash addresses', () => {
  it('turns each kind into today\'s path', () => {
    expect(legacyPath('#library')).toBe('/library');
    expect(legacyPath('#versus')).toBe('/versus');
    expect(legacyPath('#civ-order-of-the-dragon')).toBe('/civs/order-of-the-dragon');
    expect(legacyPath('#ref-game-abc')).toBe('/refs/game/abc');
    expect(legacyPath('#/check')).toBe('/check');
  });
  it('leaves anything else alone', () => {
    expect(legacyPath('')).toBeNull();
    expect(legacyPath('#')).toBeNull();
    expect(legacyPath('#civ-')).toBeNull();
    expect(legacyPath('#section-2')).toBeNull();
  });
  it('knows which paths are pages', () => {
    expect(isKnownPath('/civs/rus')).toBe(true);
    expect(isKnownPath('/versus')).toBe(true);
    expect(isKnownPath('/library-old')).toBe(false);
    expect(isKnownPath('/')).toBe(false);
  });
});
