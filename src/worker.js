// Matchup Library Worker.
//   /api/state   GET   everything the page needs, as documents
//   /api/commit  POST  a batch of document writes, saved in one D1 batch
//                      with its undo record
// Everything else is the page and its flags, served from ./public.
//
// The site sits behind Cloudflare Access. The API checks the Access sign-in
// token itself as well, so it stays closed if Access is ever switched off or
// misconfigured. It refuses every request until TEAM_DOMAIN and POLICY_AUD
// are set, unless ALLOW_NO_AUTH is "true" (local development only).
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { STATE_QUERIES, buildState, planCommit } from './docs.js';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

let jwks = null;
let jwksFor = null;

function teamDomain(env) {
  let t = String(env.TEAM_DOMAIN || '').trim().replace(/\/+$/, '');
  if (t && !/^https?:\/\//.test(t)) t = 'https://' + t;
  return t;
}

async function authorize(request, env, ctx) {
  if (env.ALLOW_NO_AUTH === 'true') return { ok: true };
  if (ctx && ctx.access) return { ok: true };
  const team = teamDomain(env);
  const aud = String(env.POLICY_AUD || '').trim();
  if (!team || !aud) return { ok: false, status: 503, error: 'Sign-in is not set up yet. Set TEAM_DOMAIN and POLICY_AUD on the Worker.' };
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return { ok: false, status: 403, error: 'Not signed in through Cloudflare Access.' };
  try {
    if (!jwks || jwksFor !== team) {
      jwks = createRemoteJWKSet(new URL(team + '/cdn-cgi/access/certs'));
      jwksFor = team;
    }
    await jwtVerify(token, jwks, { issuer: team, audience: aud });
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 403, error: 'The sign-in token was not valid. Reload the page to sign in again.' };
  }
}

// Saves must come from the page itself.
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  const type = request.headers.get('content-type') || '';
  return type.includes('application/json') && (!origin || origin === url.origin);
}

function friendly(message) {
  if (/UNIQUE constraint failed: index 'ux_civ_element_tags'/.test(message)) return 'That tag already exists, maybe from another device. Reload to see it.';
  if (/FOREIGN KEY constraint failed/.test(message)) return 'Something it points at is missing or still in use, maybe changed on another device. Reload and try again.';
  if (/CHECK constraint failed/.test(message)) return 'Some of the data did not pass the database checks.';
  return message.replace(/^D1_ERROR:\s*/, '').slice(0, 300);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const auth = await authorize(request, env, ctx);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    try {
      if (url.pathname === '/api/state' && request.method === 'GET') {
        const results = await env.DB.batch(STATE_QUERIES.map(([, sql]) => env.DB.prepare(sql)));
        const rows = {};
        STATE_QUERIES.forEach(([key], i) => { rows[key] = results[i].results || []; });
        return json(buildState(rows));
      }
      if (url.pathname === '/api/commit' && request.method === 'POST') {
        if (!sameOrigin(request, url)) return json({ error: 'Saves must come from the app page.' }, 403);
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Bad request: not JSON' }, 400); }
        let plan;
        try { plan = planCommit(body); } catch (e) { return json({ error: e.message }, 400); }
        await env.DB.batch(plan.statements.map((s) => env.DB.prepare(s.sql).bind(...s.params)));
        return json({ ok: true, change: plan.change });
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const message = String((e && e.message) || e);
      console.error('api error', url.pathname, message);
      return json({ error: friendly(message) }, 500);
    }
  }
};
