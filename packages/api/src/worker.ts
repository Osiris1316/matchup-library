// Matchup Library Worker.
//   GET  /api/state   everything the page needs, as records
//   POST /api/commit  a batch of record writes, saved in one D1 batch with its undo entry
// Everything else is the built page and its flags, served from the assets.
import { Hono } from 'hono';
import { BadRequest, STATE_QUERIES, buildState, planCommit, type CommitBody, type StateRows } from '@matchup-library/core';
import { authorize, sameOrigin } from './auth';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  c.header('cache-control', 'no-store');
  const auth = await authorize(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  await next();
});

app.get('/api/state', async (c) => {
  const results = await c.env.DB.batch(STATE_QUERIES.map(([, sql]) => c.env.DB.prepare(sql)));
  const rows = {} as StateRows;
  STATE_QUERIES.forEach(([key], i) => { rows[key] = (results[i]?.results || []) as Record<string, unknown>[]; });
  return c.json(buildState(rows));
});

app.post('/api/commit', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: 'Saves must come from the app page.' }, 403);
  let body: CommitBody;
  try { body = await c.req.json<CommitBody>(); } catch { return c.json({ error: 'Bad request: not JSON' }, 400); }
  const plan = planCommit(body);
  await c.env.DB.batch(plan.statements.map((s) => c.env.DB.prepare(s.sql).bind(...s.params)));
  return c.json({ ok: true, change: plan.change });
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// The page and flags. Only reached for paths the assets don't already match.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  const message = String((err && err.message) || err);
  console.error('api error', c.req.path, message);
  return c.json({ error: friendly(message) }, 500);
});

function friendly(message: string): string {
  if (/UNIQUE constraint failed: index 'ux_civ_element_tags'/.test(message)) return 'That tag already exists, maybe from another device. Reload to see it.';
  if (/FOREIGN KEY constraint failed/.test(message)) return 'Something it points at is missing or still in use, maybe changed on another device. Reload and try again.';
  if (/CHECK constraint failed/.test(message)) return 'Some of the data did not pass the database checks.';
  return message.replace(/^D1_ERROR:\s*/, '').slice(0, 300);
}

export default app;
