# Matchup Library

An Age of Empires IV study notebook. Define elements and plays, tag what each civ does (anywhere, or only on some map types, features or maps), log games, VODs and guides with timestamped moments, and check what a matchup throws at you.

One Cloudflare Worker serves the page and a small API. Everything is saved in D1. Sign-in is Cloudflare Access, and the API checks the Access token itself as well, so it stays closed if Access is ever turned off.

## What's in the repo

| Path | What it is |
| --- | --- |
| `public/index.html` | The app. The same page as the claude.ai preview, saving through the API. |
| `public/flags/` | Civ flags, from the league manager. |
| `src/worker.js` | The Worker: serves `/api/state` and `/api/commit`, checks sign-in. |
| `src/docs.js` | Maps the page's records to D1 rows and back. Also used by the import script. |
| `migrations/0001_initial_schema.sql` | The D1 schema. |
| `scripts/import-preview.mjs` | Turns a preview download into SQL for D1. |
| `scripts/build-page.py` | How `public/index.html` was made from the preview page. Not needed day to day. |
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

`git status` should list `public`, `src`, `migrations`, `scripts`, `docs`, `test`, `data/README.md` and the config files. It should **not** list the JSON or SQL files in `data`, `.dev.vars` or `node_modules`.

```powershell
git commit -m "Matchup Library v1"
git remote add origin https://github.com/Osiris1316/matchup-library.git
git push -u origin main
```

### 2. Install and sign in to Cloudflare

```powershell
npm install
npx wrangler login
npx wrangler whoami
```

`whoami` should show your Cloudflare account.

### 3. Create the database

```powershell
npx wrangler d1 create matchup-library
```

It prints a `database_id`. Open `wrangler.jsonc` and paste it over `REPLACE_WITH_YOUR_DATABASE_ID`. If Wrangler offers to add the binding for you, say no. If it added an entry anyway, delete it, so `d1_databases` holds exactly one entry: binding `DB`, database name `matchup-library`, your id, and `migrations_dir` `migrations`.

```powershell
npx wrangler d1 list
```

`matchup-library` should be listed with the same id.

### 4. Create the tables

```powershell
npx wrangler d1 migrations apply matchup-library --remote
```

It asks to confirm, then shows `0001_initial_schema.sql` with a tick. Check:

```powershell
npx wrangler d1 execute matchup-library --remote --command "SELECT COUNT(*) AS found FROM sqlite_master WHERE type = 'table' AND name IN ('civs', 'maps', 'elements', 'strategies', 'civ_element_tags', 'games', 'links', 'change_log')"
```

`found` should be 8.

### 5. Bring over your preview data

The `data` folder has a snapshot from November 10 with 32 tags. If you've changed anything in the preview since, take a fresh copy: open the preview on claude.ai, open Upkeep, choose **Download a copy**, and save the file into `data` as `preview-download.json`. Then convert it:

```powershell
node scripts/import-preview.mjs data\preview-download.json data\import.sql
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
npx wrangler deploy
```

It prints the address, `https://matchup-library.<your-subdomain>.workers.dev`. If you open it now, the page loads but says **Sign-in is not set up yet**. That's expected: the API stays closed until the next two steps are done.

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
npm run migrate:local
npx wrangler d1 execute matchup-library --local --file data\import-2026-11-10.sql
npm run dev
```

Open http://localhost:8787. `.dev.vars` turns sign-in off locally. It's ignored by git and never deployed. Never set `ALLOW_NO_AUTH` on the real Worker.

## Changing things later

- Page or Worker changes: `npx wrangler deploy`.
- Schema changes: add `migrations/0002_....sql`, run `npm run migrate:remote` first, then deploy. Ship the migration and the code that reads it together.
- Watch live errors with `npx wrangler tail`.
- Back up with **Download a copy** in Upkeep, or `npx wrangler d1 export matchup-library --remote --output backup.sql`.

## Troubleshooting

- **"Sign-in is not set up yet"**: `TEAM_DOMAIN` or `POLICY_AUD` isn't set. Run `npx wrangler secret list` to check.
- **"The sign-in token was not valid"**: one of those two values is wrong. The team domain must be the full `https://<team>.cloudflareaccess.com`, and the audience tag must come from the application that protects this Worker.
- **"Couldn't reach the library"** after the page has been open a while: your Access session expired. Reload to sign in again.
- **A save fails**: the page reloads what is saved and tells you why. If it mentions another device, reload that device too. The page also refreshes itself when you come back to it after 30 seconds away.

## How saving works

The page holds everything in memory, as the preview did. Each change goes to `/api/commit` as one batch of records, together with what the page saw before the change. `src/docs.js` turns those records into rows. A definition list (civs, maps, elements and so on) is saved item by item, so only the items you changed are written. The Worker writes the rows and an undo entry in `change_log` in a single D1 batch, so both succeed or neither does. Undo sends the earlier records back and removes the entry.

The schema's matchup and coverage views from the design stage aren't part of v1. The app works out matchups in the page, by rules that have moved on since then: whole-play tags, single-element game moments, guide moments with a civ, and parts matched by age. Those views are kept in `docs/deferred-views.sql` until they're rewritten.
