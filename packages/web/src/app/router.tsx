// The pages and their addresses. Each route is a page; the layout draws the
// shell around it. See paths.ts for building these addresses in code.
import { Navigate, createBrowserRouter } from 'react-router';
import { S } from '../store';
import { LibraryPage } from '../pages/library/LibraryPage';
import { CivPage } from '../pages/civs/CivPage';
import { MapsPage } from '../pages/maps/MapsPage';
import { MapPage } from '../pages/maps/MapPage';
import { RefsPage } from '../pages/refs/RefsPage';
import { RefPage } from '../pages/refs/RefPage';
import { VersusPage } from '../pages/versus/VersusPage';
import { CheckPage } from '../pages/check/CheckPage';
import { Layout, NotFound, RouteError, type RouteHandle } from './Layout';
import { registerNavigator } from './navigation';
import { motionOk } from '../kit/motion';
import { paths } from './paths';
import { civTarget } from './civTarget';

const wide: RouteHandle = { wide: true };

// /civs opens a civ: the civ picker in its head is the list of civs.
function CivsRedirect() {
  const id = civTarget();
  return <Navigate replace to={id ? paths.civ(id, S.ui.civ.tab) : paths.library()} />;
}

// The start page reopens wherever you were last time.
function Start() {
  return <Navigate replace to={S.lastPath || paths.library()} />;
}

// Made once on start, after main.tsx has turned any old hash address into a
// path, since the router reads the address when it's created.
export function createAppRouter() {
  const router = createBrowserRouter([
    {
      path: '/',
      element: <Layout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Start /> },
        { path: 'library', element: <LibraryPage />, handle: wide },
        { path: 'civs', element: <CivsRedirect /> },
        { path: 'civs/:civ', element: <CivPage tab="stages" />, handle: wide },
        { path: 'civs/:civ/tags', element: <CivPage tab="tags" />, handle: wide },
        { path: 'maps', element: <MapsPage />, handle: wide },
        { path: 'maps/:kind/:id', element: <MapPage />, handle: wide },
        { path: 'refs', element: <RefsPage />, handle: wide },
        { path: 'refs/:kind/:id', element: <RefPage />, handle: wide },
        { path: 'versus', element: <VersusPage />, handle: wide },
        { path: 'check', element: <CheckPage />, handle: wide },
        { path: '*', element: <NotFound /> }
      ]
    }
  ]);
  registerNavigator(
    (to, opts) => { void router.navigate(to, { replace: !!opts.replace, preventScrollReset: !!opts.keepScroll, viewTransition: !!opts.animate && motionOk() }); },
    () => router.state.location
  );
  return router;
}
