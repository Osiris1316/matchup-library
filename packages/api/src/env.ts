export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  // Secrets, set with `npx wrangler secret put`.
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  // Local development only, from .dev.vars. Never set on the deployed Worker.
  ALLOW_NO_AUTH?: string;
}
