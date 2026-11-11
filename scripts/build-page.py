"""Build public/index.html from the preview artifact page.

The preview saved through claude.ai's built-in store. The deployed page saves
through the Worker API instead; everything else is the same page. Run from the
repo root:  python scripts/build-page.py path/to/preview.html
"""
import re
import sys

src_path = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else 'public/index.html'
s = open(src_path, encoding='utf-8').read()


def cut(text, start, end):
    a = text.index(start)
    b = text.index(end, a)
    return text[:a], text[a:b], text[b:]


# Split the preview into its head parts and its body.
style = re.search(r'<style>.*?</style>', s, re.S).group(0)
fonts = re.search(r'<link rel="stylesheet"[^>]*>', s).group(0)
body = s[s.index('</style>') + len('</style>'):].strip()

# Swap the persistence layer.
db_start = '// ---------------------------------------------------------------------------\n// Database\n'
db_end = '// ---------------------------------------------------------------------------\n// Rendering\n'
head, _, tail = cut(body, db_start, db_end)
API = r"""// ---------------------------------------------------------------------------
// Database: the Worker API in front of D1
// ---------------------------------------------------------------------------
// The page keeps everything in memory and saves each change as one batch.
// Saves go out one at a time, in order. A failed save reloads what is saved.
const downloads = {
  async save({ filename, data }) {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { status: 'saved' };
  }
};
function applyLocal(col, id, data) {
  if (col === 'defs') { S.defs[id] = data ? (data.items || []) : []; return; }
  if (col === 'meta') { if (id === 'settings') S.settings = data || {}; return; }
  if (!S[col]) return;
  if (data) S[col][id] = data; else delete S[col][id];
}
function currentDoc(path) {
  const [col, id] = path.split('/');
  if (col === 'defs') return { items: clone(S.defs[id] || []) };
  if (col === 'meta') return id === 'settings' ? clone(S.settings) : null;
  return S[col] && S[col][id] ? clone(S[col][id]) : null;
}
function write(path, data) {
  const [col, id] = path.split('/');
  applyLocal(col, id, data ? clone(data) : null);
}
let saveQueue = Promise.resolve();
let pendingSaves = 0;
async function postCommit(body) {
  const r = await fetch('/api/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  let out = null;
  try { out = await r.json(); } catch (e) { out = null; }
  if (!r.ok || !out) throw new Error((out && out.error) || 'The server did not answer (' + r.status + ').');
  return out;
}
function send(body) {
  pendingSaves += 1;
  const p = saveQueue.then(() => postCommit(body));
  saveQueue = p.catch(() => {}).then(() => { pendingSaves -= 1; });
  return p;
}
// Apply writes with an undo record. writes: [{path, data | null}]
async function commit(label, writes, toast) {
  const before = writes.map((w) => ({ path: w.path, data: currentDoc(w.path) }));
  writes.forEach((w) => write(w.path, w.data));
  try {
    const res = await send({ label, writes, before });
    const ch = res.change;
    S.changes[ch.id] = { label: ch.label, at: ch.at, before };
    const ids = Object.keys(S.changes).sort();
    ids.slice(0, Math.max(0, ids.length - 30)).forEach((x) => { delete S.changes[x]; });
    showToast(toast || label + '.', false, ch.id);
    return ch.id;
  } catch (e) {
    await loadState(true);
    showToast("Couldn't save that. " + e.message, true);
    return null;
  }
}
async function undoLast() {
  const ids = Object.keys(S.changes).sort();
  const last = ids[ids.length - 1];
  if (!last) return;
  const ch = S.changes[last];
  const restore = ch.before || [];
  const current = restore.map((b) => ({ path: b.path, data: currentDoc(b.path) }));
  restore.forEach((b) => write(b.path, b.data));
  delete S.changes[last];
  try {
    await send({ writes: restore, before: current, undoOf: last });
    showToast('Undone: ' + lowerFirst(ch.label) + '.');
  } catch (e) {
    await loadState(true);
    showToast("Couldn't undo that. " + e.message, true);
  }
  render();
}
async function loadState(quiet) {
  try {
    const r = await fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401 || r.status === 403 || r.status === 503) {
      let out = {};
      try { out = await r.json(); } catch (e) { out = {}; }
      S.dbState = 'unauthorized';
      S.authError = out.error || '';
      render();
      return;
    }
    if (!r.ok) throw new Error('status ' + r.status);
    const st = await r.json();
    DEF_TYPES.forEach((t) => { S.defs[t] = (st.defs && st.defs[t]) || []; });
    S.games = st.games || {};
    S.links = st.links || {};
    S.tags = st.tags || {};
    S.answers = st.answers || {};
    S.changes = st.changes || {};
    S.settings = st.settings || {};
    S.defsLoaded = true;
    S.dbState = 'ready';
    S.loadedAt = Date.now();
  } catch (e) {
    if (S.dbState !== 'ready') S.dbState = 'unavailable';
    else if (!quiet) showToast("Couldn't refresh. Check your connection.", true);
  }
  render();
}
// Pick up changes made on another device when you come back to the page.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.dbState === 'ready' && !S.sheet && !pendingSaves && Date.now() - (S.loadedAt || 0) > 30000) loadState(true);
});

"""
body = head + API + tail

# Messages for the states the preview did not have.
old_unavail = body[body.index("  if (S.dbState === 'unavailable')"):]
old_unavail = old_unavail[:old_unavail.index('\n') + 1]
body = body.replace(old_unavail,
    "  if (S.dbState === 'unavailable') return pageHead('Matchup Library') + `<main class=\"main\"><p class=\"empty\">Couldn't reach the library. Reload the page. If your sign-in has expired, you'll be asked to sign in again.</p></main>`;\n"
    "  if (S.dbState === 'unauthorized') return pageHead('Matchup Library') + `<main class=\"main\"><p class=\"empty\">${esc(S.authError || 'Not signed in.')}</p></main>`;\n")
body = body.replace("for safekeeping or for moving into D1 later.", "for safekeeping.")
assert body.count('\ninitDb();') == 1
body = body.replace('\ninitDb();', '\nloadState();')
assert 'window.claude' not in body, 'claude runtime calls left in the page'

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="robots" content="noindex">
<title>Matchup Library</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Crect x=%224%22 y=%224%22 width=%226%22 height=%2216%22 rx=%221%22 fill=%22%23ededed%22/%3E%3Crect x=%2214%22 y=%224%22 width=%226%22 height=%2216%22 rx=%221%22 fill=%22%23ededed%22/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
{fonts}
{style}
</head>
<body>
{body}
</body>
</html>
"""
open(out_path, 'w', encoding='utf-8').write(page)
print('wrote', out_path, len(page))
