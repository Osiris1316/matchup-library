// Start: preferences, then the library from D1, then the pages.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { S, backSheet, loadPrefs } from './store';
import { hasPendingSaves, loadState } from './api/client';
import { legacyPath } from './app/paths';
import { go } from './app/navigation';
import { createAppRouter } from './app/router';
import './styles/tokens.css';
import './styles/base.css';
import './styles/legacy.css';

// Old hash addresses (#civ-ottomans) become today's (/civs/ottomans) before the router reads them.
const legacy = legacyPath(location.hash);
if (legacy) history.replaceState(null, '', legacy);

loadPrefs();
void loadState();

const router = createAppRouter();

window.addEventListener('hashchange', () => { const to = legacyPath(location.hash); if (to) go(to, { replace: true }); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) backSheet(); });
// Pick up changes made on another device when you come back to the page.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.dbState === 'ready' && !S.sheet && !hasPendingSaves() && Date.now() - S.loadedAt > 30000) void loadState(true);
});

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
