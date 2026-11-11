// The site sits behind Cloudflare Access. The API checks the Access sign-in
// token itself as well, so it stays closed if Access is ever switched off or
// misconfigured. It refuses every request until TEAM_DOMAIN and POLICY_AUD
// are set, unless ALLOW_NO_AUTH is "true" (local development only).
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';

export type AuthResult = { ok: true } | { ok: false; status: 403 | 503; error: string };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksFor: string | null = null;

export function teamDomain(env: Env): string {
  let t = String(env.TEAM_DOMAIN || '').trim().replace(/\/+$/, '');
  if (t && !/^https?:\/\//.test(t)) t = 'https://' + t;
  return t;
}

// With static assets in front, Access does not hand the Worker its identity,
// so the token in the Cf-Access-Jwt-Assertion header is checked here.
export async function authorize(request: Request, env: Env): Promise<AuthResult> {
  if (env.ALLOW_NO_AUTH === 'true') return { ok: true };
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
  } catch {
    return { ok: false, status: 403, error: 'The sign-in token was not valid. Reload the page to sign in again.' };
  }
}

// Saves must come from the page itself.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const type = request.headers.get('content-type') || '';
  return type.includes('application/json') && (!origin || origin === new URL(request.url).origin);
}
