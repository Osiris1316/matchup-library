// Saving and loading through the Worker API in front of D1.
// The page keeps everything in memory and saves each change as one batch.
// Saves go out one at a time, in order. A failed save reloads what is saved.
import { DEF_TYPES, clone, lowerFirst, type CommitBody, type CommitResult, type DocWrite, type LibraryData, type StateResponse } from '@matchup-library/core';
import { S, emit, showToast } from '../store';

type Coll = 'tags' | 'games' | 'links' | 'answers' | 'subjects';
const isColl = (c: string): c is Coll => c === 'tags' || c === 'games' || c === 'links' || c === 'answers' || c === 'subjects';

function applyLocal(col: string, id: string, data: unknown): void {
  if (col === 'defs') { (S.data.defs as unknown as Record<string, unknown[]>)[id] = data ? ((data as { items?: unknown[] }).items || []) : []; return; }
  if (col === 'meta') { if (id === 'settings') S.data.settings = (data || {}) as LibraryData['settings']; return; }
  if (!isColl(col)) return;
  const coll = (S.data[col] || (S.data[col] = {})) as Record<string, unknown>;
  if (data) coll[id] = data; else delete coll[id];
}
function currentDoc(path: string): unknown {
  const [col = '', id = ''] = path.split('/');
  if (col === 'defs') return { items: clone((S.data.defs as unknown as Record<string, unknown[]>)[id] || []) };
  if (col === 'meta') return id === 'settings' ? clone(S.data.settings) : null;
  if (!isColl(col)) return null;
  const v = ((S.data[col] || {}) as Record<string, unknown>)[id];
  return v ? clone(v) : null;
}
function write(path: string, data: unknown): void {
  const [col = '', id = ''] = path.split('/');
  applyLocal(col, id, data ? clone(data) : null);
}

let saveQueue: Promise<unknown> = Promise.resolve();
let pendingSaves = 0;
export const hasPendingSaves = (): boolean => pendingSaves > 0;
async function postCommit(body: CommitBody): Promise<CommitResult> {
  const r = await fetch('/api/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  let out: (CommitResult & { error?: string }) | null = null;
  try { out = await r.json(); } catch { out = null; }
  if (!r.ok || !out) throw new Error((out && out.error) || 'The server did not answer (' + r.status + ').');
  return out;
}
function send(body: CommitBody): Promise<CommitResult> {
  pendingSaves += 1;
  const p = saveQueue.then(() => postCommit(body));
  saveQueue = p.catch(() => {}).then(() => { pendingSaves -= 1; });
  return p;
}

// Apply writes with an undo entry. writes: [{path, data | null}]
export async function commit(label: string, writes: DocWrite[], toast?: string | null): Promise<string | null> {
  const before = writes.map((w) => ({ path: w.path, data: currentDoc(w.path) }));
  writes.forEach((w) => write(w.path, w.data));
  emit();
  try {
    const res = await send({ label, writes, before });
    const ch = res.change;
    if (!ch) return null;
    S.changes[ch.id] = { label: ch.label, at: ch.at, before };
    const ids = Object.keys(S.changes).sort();
    ids.slice(0, Math.max(0, ids.length - 30)).forEach((x) => { delete S.changes[x]; });
    showToast(toast || label + '.', false, ch.id);
    return ch.id;
  } catch (e) {
    await loadState(true);
    showToast("Couldn't save that. " + (e instanceof Error ? e.message : String(e)), true);
    return null;
  }
}

export async function undoLast(): Promise<void> {
  const ids = Object.keys(S.changes).sort();
  const last = ids[ids.length - 1];
  if (!last) return;
  const ch = S.changes[last];
  if (!ch) return;
  const restore = ch.before || [];
  const current = restore.map((b) => ({ path: b.path, data: currentDoc(b.path) }));
  restore.forEach((b) => write(b.path, b.data));
  delete S.changes[last];
  emit();
  try {
    await send({ writes: restore, before: current, undoOf: last });
    showToast('Undone: ' + lowerFirst(ch.label) + '.');
  } catch (e) {
    await loadState(true);
    showToast("Couldn't undo that. " + (e instanceof Error ? e.message : String(e)), true);
  }
}

export async function loadState(quiet = false): Promise<void> {
  try {
    const r = await fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401 || r.status === 403 || r.status === 503) {
      let out: { error?: string } = {};
      try { out = await r.json(); } catch { out = {}; }
      S.dbState = 'unauthorized';
      S.authError = out.error || '';
      emit();
      return;
    }
    if (!r.ok) throw new Error('status ' + r.status);
    const st = (await r.json()) as StateResponse;
    DEF_TYPES.forEach((t) => { (S.data.defs as unknown as Record<string, unknown[]>)[t] = (st.defs && st.defs[t]) || []; });
    S.data.games = st.games || {};
    S.data.links = st.links || {};
    S.data.tags = st.tags || {};
    S.data.answers = st.answers || {};
    S.data.subjects = st.subjects || {};
    S.data.settings = st.settings || {};
    S.changes = st.changes || {};
    S.loaded = true;
    S.dbState = 'ready';
    S.loadedAt = Date.now();
  } catch {
    if (S.dbState !== 'ready') S.dbState = 'unavailable';
    else if (!quiet) showToast("Couldn't refresh. Check your connection.", true);
  }
  emit();
}

// Everything in the library as one file, for safekeeping.
export function downloadCopy(): void {
  const d = S.data;
  const data = { exportedAt: new Date().toISOString(), defs: d.defs, tags: d.tags, games: d.games, links: d.links, answers: d.answers, settings: d.settings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'matchup-library-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Saved a copy.');
}
