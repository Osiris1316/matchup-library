// Every address in the app, built in one place. Pages and links call these
// rather than writing paths by hand, so a route can change in one spot.
// Pure functions: tested in test/paths.test.ts.

export type CivTab = 'stages' | 'tags';
export type RefKind = 'game' | 'guide';
// Versus: their civ and game plan, yours.
export interface VersusPicks { them: string; their: string; me: string; mine: string }
const VERSUS_KEYS: (keyof VersusPicks)[] = ['them', 'their', 'me', 'mine'];

// Civ ids use underscores; addresses use hyphens (order_of_the_dragon, order-of-the-dragon).
export const civSlug = (id: string): string => String(id).replace(/_/g, '-');
export const civIdFromSlug = (slug: string): string => String(slug).replace(/-/g, '_');

export const paths = {
  library: () => '/library',
  civs: () => '/civs',
  civ: (id: string, tab: CivTab = 'stages') => '/civs/' + civSlug(id) + (tab === 'tags' ? '/tags' : ''),
  maps: () => '/maps',
  refs: () => '/refs',
  ref: (kind: RefKind, id: string) => '/refs/' + kind + '/' + encodeURIComponent(id),
  versus: (picks: Partial<VersusPicks> = {}) => {
    const q = new URLSearchParams();
    VERSUS_KEYS.forEach((k) => { const v = picks[k]; if (v) q.set(k, v); });
    const s = q.toString();
    return '/versus' + (s ? '?' + s : '');
  },
  check: () => '/check'
};

// The pages in the tab bar, in order, with the path each one opens.
export const TOP_PAGES = ['library', 'civs', 'maps', 'refs', 'versus', 'check'] as const;
export type TopPage = (typeof TOP_PAGES)[number];

export function readVersus(search: string): Partial<VersusPicks> {
  const q = new URLSearchParams(search);
  const out: Partial<VersusPicks> = {};
  VERSUS_KEYS.forEach((k) => { const v = q.get(k); if (v) out[k] = v; });
  return out;
}

// A reference route from the library's rules ('ref-game-<id>', 'ref-guide-<id>') as a path.
export function refPath(route: string): string {
  const m = /^ref-(game|guide)-(.+)$/.exec(route);
  return m ? paths.ref(m[1] as RefKind, m[2] as string) : paths.refs();
}

// The reference a path points at, if any.
export function refFromPath(pathname: string): { kind: RefKind; id: string } | null {
  const m = /^\/refs\/(game|guide)\/([^/]+)\/?$/.exec(pathname);
  return m ? { kind: m[1] as RefKind, id: decodeURIComponent(m[2] as string) } : null;
}

// The first version used hash addresses (#library, #civ-ottomans, #ref-game-<id>).
// Old bookmarks and links still work: this turns one into today's path.
export function legacyPath(hash: string): string | null {
  const h = String(hash || '').replace(/^#\/?/, '');
  if (!h) return null;
  if ((TOP_PAGES as readonly string[]).includes(h)) return '/' + h;
  if (h.startsWith('civ-') && h.length > 4) return paths.civ(civIdFromSlug(h.slice(4)));
  if (/^ref-(game|guide)-.+/.test(h)) return refPath(h);
  return null;
}

// Pages worth reopening on the next visit. Anything else falls back to the Library.
export function isKnownPath(pathname: string): boolean {
  return /^\/(library|civs|maps|refs|versus|check)(\/|$)/.test(pathname);
}
