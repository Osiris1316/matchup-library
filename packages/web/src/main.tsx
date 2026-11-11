import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { S, backSheet, loadPrefs, route } from './store';
import { hasPendingSaves, loadState } from './api/client';
import { App } from './App';
import './styles/global.css';

loadPrefs();
route();
void loadState();

window.addEventListener('hashchange', route);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) backSheet(); });
// Pick up changes made on another device when you come back to the page.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.dbState === 'ready' && !S.sheet && !hasPendingSaves() && Date.now() - S.loadedAt > 30000) void loadState(true);
});

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App /></StrictMode>);
