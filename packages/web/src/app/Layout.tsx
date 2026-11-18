// Around every page: the shell, the tab bar, the open sheet and the toast.
// Until the library has loaded, a message stands in for the page.
import { useEffect, type ReactNode } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useMatches, useRouteError } from 'react-router';
import { S, onPageChange, useStore } from '../store';
import { PageHead } from '../components/bits';
import { Nav } from './Nav';
import { SheetHost, Toast } from './SheetHost';
import { paths } from './paths';

// What a route can say about its page.
export interface RouteHandle { wide?: boolean }

function Message({ children }: { children: ReactNode }) {
  return <><PageHead title="Matchup Library" /><main className="main"><p className="empty">{children}</p></main></>;
}

// Shown instead of the page while the library can't be used yet.
function gate(): ReactNode | null {
  if (S.dbState === 'connecting') return <p className="loading">Opening your library…</p>;
  if (S.dbState === 'unavailable') return <Message>Couldn't reach the library. Reload the page. If your sign-in has expired, you'll be asked to sign in again.</Message>;
  if (S.dbState === 'unauthorized') return <Message>{S.authError || 'Not signed in.'}</Message>;
  if (!S.data.defs.civs.length) return <Message>{S.loaded ? 'The library has no civs, maps or elements yet. Load the starting reference data (see the README).' : 'Loading civs, maps and elements…'}</Message>;
  return null;
}

function Shell({ wide, children }: { wide: boolean; children: ReactNode }) {
  return (
    <>
      <div className={'shell' + (wide ? ' wide' : '')}><div id="view">{children}</div></div>
      <Nav />
      <div id="sheet"><SheetHost /></div>
      <div id="toast"><Toast /></div>
    </>
  );
}

export function Layout() {
  useStore();
  const location = useLocation();
  const wide = useMatches().some((m) => !!(m.handle as RouteHandle | undefined)?.wide);
  // Every move to another address: close the sheet, drop a stale toast, remember the page.
  useEffect(() => { onPageChange(); }, [location.key]);
  return (
    <>
      <Shell wide={wide}>{gate() ?? <Outlet />}</Shell>
      <ScrollRestoration />
    </>
  );
}

export function NotFound() {
  return (
    <>
      <PageHead title="Not found" />
      <main className="main"><p className="empty">There's no page at this address. <Link className="ulink" to={paths.library()}>Open the Library</Link>.</p></main>
    </>
  );
}

// A page that failed to draw. The tab bar stays, so you can move on.
export function RouteError() {
  const err = useRouteError();
  console.error(err);
  return (
    <Shell wide={false}>
      <PageHead title="Something went wrong" />
      <main className="main">
        <p className="empty">This page couldn't be drawn. Reload it, or open another page from the tabs. If it keeps happening, the browser console has the details.</p>
      </main>
    </Shell>
  );
}
