# Matchup Library

An Age of Empires IV study notebook. Define elements and plays, tag what each civ does (anywhere, or only on some map types, features or maps), log games, VODs and guides with timestamped moments, and check what a matchup throws at you.

One Cloudflare Worker serves the page and a small API. Everything is saved in D1. Sign-in is Cloudflare Access, and the API checks the Access token itself as well, so it stays closed if Access is ever turned off.

It's a pnpm workspace in TypeScript, laid out like the league manager: `core` holds the shared types and rules, `api` is the Worker, `web` is the React page.

## What's in the repo

| Path | What it is |
| --- | --- |
| `packages/core/src/types.ts` | The records the app works with: civs, maps, elements, plays, tags, games, links. |
| `packages/core/src/library.ts` | The matchup rules: what a civ is documented doing on a map, and why. |
| `packages/core/src/docs.ts` | Maps records to D1 rows and back. Used by the Worker and the import script. |
| `packages/core/src/text.ts` | Formatting and link helpers (times, YouTube and Twitch links). |
| `packages/core/src/db/migrations/` | The D1 schema. |
| `packages/core/test/` | Tests for the rules and for the trip through the schema (`pnpm test`). |
| `packages/api/src/worker.ts` | The Worker (Hono): `/api/state`, `/api/commit`, and the page from the assets. |
| `packages/api/src/auth.ts` | The Access token check. |
| `packages/web/src/` | The page (React and Vite): `views/` for screens, `sheets/` for the pop-up sheets, `components/`, `styles/global.css`. |
| `packages/web/public/flags/` | Civ flags, from the league manager. |
| `scripts/import-preview.ts` | Turns a preview download into SQL for D1. |
| `data/` | Your library data (kept out of git). Includes a snapshot from November 10. |
| `docs/deferred-views.sql` | Matchup and coverage views from the design stage, set aside for later. |
| `test/e2e.cjs` | The browser test run before handover (optional, needs Playwright). |

## Deploy

Run everything from the repo folder in PowerShell. Each step ends with what you should see before moving on.

### 1. Put the repo on GitHub

Unzip into a folder, for example `C:\Users\andre\Documents\GitHub\matchup-library`. On github.com, create an empty public repository called `matchup-library` (no README, no .gitignore). Then:

```powershell
cd C:\Users\andre\Documents\GitHub\matchup-library
git init -b main
git add .
git status
```

`git status` should list `packages`, `scripts`, `docs`, `test`, `data/README.md` and the config files. It should **not** list the JSON or SQL files in `data`, `.dev.vars`, `node_modules` or any `dist` folder.

```powershell
git commit -m "Matchup Library v1"
git remote add origin https://github.com/Osiris1316/matchup-library.git
git push -u origin main
```

### 2. Install and sign in to Cloudflare

```powershell
pnpm --version
pnpm install
npx wrangler login
npx wrangler whoami
```

`pnpm --version` should print 10 or later. If it isn't found, run `npm install -g pnpm` first. `pnpm install` should end with `Done`, and `whoami` should show your Cloudflare account.

### 3. Create the database

```powershell
npx wrangler d1 create matchup-library
```

It prints a `database_id`. Open `wrangler.jsonc` and paste it over `REPLACE_WITH_YOUR_DATABASE_ID`. If Wrangler offers to add the binding for you, say no. If it added an entry anyway, delete it, so `d1_databases` holds exactly one entry: binding `DB`, database name `matchup-library`, your id, and `migrations_dir` `packages/core/src/db/migrations`.

```powershell
npx wrangler d1 list
```

`matchup-library` should be listed with the same id.

### 4. Create the tables

```powershell
pnpm migrate:remote
```

It asks to confirm, then shows `0001_initial_schema.sql` with a tick. Check:

```powershell
npx wrangler d1 execute matchup-library --remote --command "SELECT COUNT(*) AS found FROM sqlite_master WHERE type = 'table' AND name IN ('civs', 'maps', 'elements', 'strategies', 'civ_element_tags', 'games', 'links', 'change_log')"
```

`found` should be 8.

### 5. Bring over your preview data

The `data` folder has a snapshot from November 10 with 32 tags. If you've changed anything in the preview since, take a fresh copy: open the preview on claude.ai, open Upkeep, choose **Download a copy**, and save the file into `data` as `preview-download.json`. Then convert it:

```powershell
pnpm import-preview data\preview-download.json data\import.sql
```

It prints how many civs, maps, elements, plays, tags, games and links it found. Load it:

```powershell
npx wrangler d1 execute matchup-library --remote --file data\import.sql
```

To use the snapshot instead, load `data\import-2026-11-10.sql` the same way. The SQL only inserts or updates rows, so running it twice is harmless. Check:

```powershell
npx wrangler d1 execute matchup-library --remote --command "SELECT (SELECT COUNT(*) FROM civs) AS civs, (SELECT COUNT(*) FROM civ_element_tags) AS tags, (SELECT COUNT(*) FROM games) AS games, (SELECT COUNT(*) FROM links) AS links"
```

The counts should match what the import script printed.

### 6. Deploy the Worker

```powershell
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`, which is a different pnpm command. It builds the page, then deploys the Worker with it, and prints the address, `https://matchup-library.<your-subdomain>.workers.dev`. If you open it now, the page loads but says **Sign-in is not set up yet**. That's expected: the API stays closed until the next two steps are done.

### 7. Put it behind Cloudflare Access

In the Cloudflare dashboard, go to **Workers & Pages**, open **matchup-library**, and open the **Access** tab.

1. Choose **Protect this Worker behind Access**.
2. Choose **All traffic**, so the workers.dev address and preview URLs are both covered.
3. For who can sign in, allow your own email address.
4. Apply it.

If your account hasn't used Zero Trust before, the dashboard asks you to pick a team name first. The free plan is enough.

### 8. Tell the Worker which Access app to trust

You need two values:

- **Team domain.** In Zero Trust, under Settings, it looks like `https://<your-team>.cloudflareaccess.com`.
- **Audience tag.** In Zero Trust, go to Access, then Applications, and open the application created for matchup-library. Copy the **Application Audience (AUD) Tag**.

```powershell
npx wrangler secret put TEAM_DOMAIN
npx wrangler secret put POLICY_AUD
```

Paste each value when asked. Secrets take effect without another deploy.

### 9. Check it

Open the workers.dev address in a browser. You should get the Access sign-in, receive a code by email, and then see your library. Try it on your phone too.

To confirm the API is closed to anyone not signed in:

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://matchup-library.<your-subdomain>.workers.dev/api/state
```

Expect `302` (redirect to sign-in) or `403`, never `200`.

## Local development

```powershell
Copy-Item .dev.vars.example .dev.vars
pnpm migrate:local
npx wrangler d1 execute matchup-library --local --file data\import-2026-11-10.sql
pnpm dev
```

`pnpm dev` starts the Worker on port 8787 and the page on port 5173. Open http://localhost:5173: the page reloads as you edit it, and `/api` goes to the local Worker and its local D1. `.dev.vars` turns sign-in off locally. It's ignored by git and never deployed. Never set `ALLOW_NO_AUTH` on the real Worker.

Before you push a change:

```powershell
pnpm typecheck
pnpm test
```

`pnpm test` runs the rules tests and a round trip of records through the D1 schema in a local SQLite. The round trip needs Node 22.13 or later and is skipped on older versions. The browser test in `test/e2e.cjs` is optional: it needs Playwright, a fresh local database with the snapshot loaded, and `pnpm build:web` then `npx wrangler dev` running.

## Changing things later

- Page or Worker changes: `pnpm run deploy`.
- Schema changes: add `packages/core/src/db/migrations/0002_....sql`, run `pnpm migrate:remote` first, then deploy. Ship the migration and the code that reads it together.
- Watch live errors with `npx wrangler tail`.
- Back up with **Download a copy** in Upkeep, or `npx wrangler d1 export matchup-library --remote --output backup.sql`.

## Troubleshooting

- **"Sign-in is not set up yet"**: `TEAM_DOMAIN` or `POLICY_AUD` isn't set. Run `npx wrangler secret list` to check.
- **"The sign-in token was not valid"**: one of those two values is wrong. The team domain must be the full `https://<team>.cloudflareaccess.com`, and the audience tag must come from the application that protects this Worker.
- **"Couldn't reach the library"** after the page has been open a while: your Access session expired. Reload to sign in again.
- **A save fails**: the page reloads what is saved and tells you why. If it mentions another device, reload that device too. The page also refreshes itself when you come back to it after 30 seconds away.
- **`wrangler deploy` says the assets directory is missing**: the page hasn't been built. Use `pnpm run deploy`, which builds it first.

## How saving works

The page holds everything in memory. Each change goes to `/api/commit` as one batch of records, together with what the page saw before the change. `packages/core/src/docs.ts` turns those records into rows. A definition list (civs, maps, elements and so on) is saved item by item, so only the items you changed are written. The Worker writes the rows and an undo entry in `change_log` in a single D1 batch, so both succeed or neither does. Undo sends the earlier records back and removes the entry.

The page keeps one state object in `packages/web/src/store.ts`. Event handlers change it and call `emit()`, which re-renders the page. Saves and undo live in `packages/web/src/api/client.ts`, and what each button does in `packages/web/src/actions.ts`. Routes are the part after `#` in the address (`#library`, `#civ-ottomans`, `#ref-game-…`), so links from the first version keep working.

The schema's matchup and coverage views from the design stage aren't part of v1. The app works out matchups with the rules in `packages/core/src/library.ts`: whole-play tags, single-element game moments, guide moments with a civ, and parts matched by age. Those views are kept in `docs/deferred-views.sql` until they're rewritten.
