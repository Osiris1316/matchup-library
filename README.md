# Matchup Library

An Age of Empires IV study notebook. Define elements and plays, tag what each civ does (anywhere, or only on some map types, features or maps), log games, VODs and guides with timestamped moments, and check what a matchup throws at you.

One Cloudflare Worker serves the page and a small API. Everything is saved in D1. Sign-in is Cloudflare Access, and the API checks the Access token itself as well, so it stays closed if Access is ever turned off.

It's a pnpm workspace in TypeScript, laid out like the league manager: `core` holds the shared types and rules, `api` is the Worker, `web` is the React page.

## What's in the repo

| Path | What it is |
| --- | --- |
| `packages/core/src/types.ts` | The records the app works with: civs, maps, elements, subjects, plays, tags, games, links. |
| `packages/core/src/library.ts` | The matchup rules: what a civ is documented doing on a map, and why, and how each use of an element looks. |
| `packages/core/src/docs.ts` | Maps records to D1 rows and back. Used by the Worker and the import script. |
| `packages/core/src/text.ts` | Formatting and link helpers (times, YouTube and Twitch links). |
| `packages/core/src/db/migrations/` | The D1 schema. |
| `packages/core/test/` | Tests for the rules and for the trip through the schema (`pnpm test`). |
| `packages/api/src/worker.ts` | The Worker (Hono): `/api/state`, `/api/commit`, and the page from the assets. |
| `packages/api/src/auth.ts` | The Access token check. |
| `packages/web/src/` | The page (React and Vite): `views/` for screens, `sheets/` for the pop-up sheets, `components/`, `styles/global.css`. |
| `packages/web/src/components/Pill.tsx` | The split pill: an element's icon tile coloured by type, its name coloured by intent. |
| `packages/web/public/flags/` | Civ flags, from the league manager. |
| `packages/web/public/icons/` | The aoe4world icons the library uses (see Credits). |
| `scripts/import-preview.ts` | Turns a download (Upkeep, then Download a copy) into SQL for D1. |
| `scripts/subjects.ts` | Loads units, buildings, landmarks and technologies from the aoe4world data repo, and copies the icons in use. |
| `scripts/phase1-elements.ts` | One-off: moves the elements from before phase 1 onto types, icons and intent. |
| `data/` | Your library data (kept out of git). |
| `docs/deferred-views.sql` | Matchup and coverage views from the design stage, set aside for later. |
| `test/e2e.cjs` | The browser test (optional, needs Playwright). |

## Elements, types, subjects and intent

Every element shows as a split pill. The icon tile is coloured by the element's **type**: unit, structure, economy, or age-up or tech. The name is coloured by its **intent**: offensive red, defensive blue, economic green, or grey for none. The icon comes from the element's **subject**, one thing in the game such as the spearman or the outpost.

Intent belongs to how something is used. An element has a usual intent, and every use of it (a play step, a civ tag, a game play or a moment) can set its own, along with the subject. The rule: the use's value if it has one, else the element's, else the subject's. An age-up that names a landmark shows the landmark's icon and name, coloured by the landmark's default intent, which you set under Library, Landmarks.

An element every civ can do, such as a tower or a second town centre, is marked **every civ can do it**. It counts for every civ without tags, except the civs listed as unable. It counts in its usual intent only: towers used to attack still need a tag for the civs known to do it.

## Deploy

Run everything from the repo folder in PowerShell. Each step ends with what you should see before moving on. The site is already deployed; these steps are for rebuilding it from scratch.

### 1. Put the repo on GitHub

On github.com, create an empty public repository called `matchup-library` (no README, no .gitignore), then push this folder to it. `git status` should list `packages`, `scripts`, `docs`, `test`, `data/README.md` and the config files. It should **not** list the JSON or SQL files in `data`, `.dev.vars`, `node_modules` or any `dist` folder.

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

It prints a `database_id`. Open `wrangler.jsonc` and paste it into the `DB` entry. Wrangler asks two questions here: answer no to "Would you like Wrangler to add it on your behalf?" and no to connecting to the remote resource for local dev (local development should use its own throwaway copy). If it added an entry anyway, copy its id into the `DB` entry and delete the added entry, so `d1_databases` holds exactly one entry: binding `DB`, database name `matchup-library`, your id, and `migrations_dir` `packages/core/src/db/migrations`.

### 4. Create the tables and load the subjects

```powershell
pnpm migrate:remote
pnpm subjects sql
npx wrangler d1 execute matchup-library --remote --file data\subjects.sql
```

The migration step asks to confirm, then shows each migration with a tick. `pnpm subjects sql` fetches the aoe4world data from GitHub and writes `data\subjects.sql`; it prints how many subjects it found (about 800). Check:

```powershell
npx wrangler d1 execute matchup-library --remote --command "SELECT (SELECT COUNT(*) FROM subjects) AS subjects, (SELECT COUNT(*) FROM element_kinds WHERE id IN ('unit', 'structure', 'economy', 'age_tech')) AS types"
```

`types` should be 4 and `subjects` should match what the script printed.

### 5. Bring over your data

Open Upkeep on the site, choose **Download a copy**, and save the file into `data`. Then convert it and load it:

```powershell
pnpm import-preview data\matchup-library-2026-11-12.json data\import.sql
npx wrangler d1 execute matchup-library --remote --file data\import.sql
```

The SQL only inserts or updates rows, so running it twice is harmless. Load the subjects (step 4) first, because elements and landmark intents point at them.

### 6. Deploy the Worker

```powershell
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`, which is a different pnpm command. If it fails with "binding DB of type d1 failed to generate" (code 10021) right after creating the database, wait a few minutes and run it again. It prints the address (for this account, `https://matchup-library.andrei-35b.workers.dev`). Until steps 7 and 8 are done, the page says **Sign-in is not set up yet**.

### 7. Put it behind Cloudflare Access

In the Cloudflare dashboard, go to **Workers & Pages**, open **matchup-library**, and open the **Access** tab.

1. Choose **Protect this Worker behind Access**.
2. Choose **All traffic**, so the workers.dev address and preview URLs are both covered.
3. Create a policy just for this app: action Allow, an Include rule on Emails with the address that should receive the sign-in codes, and the session duration you want (2 weeks is set now).
4. The modal also asks for a session duration (its longest option is 7 days). The policy's duration is more specific and wins.
5. Apply it.

### 8. Tell the Worker which Access app to trust

You need two values: the **team domain** (Zero Trust, Settings: `https://<your-team>.cloudflareaccess.com`) and the **audience tag** (Zero Trust, Access, Applications, the matchup-library application, the **AUD tag** tab under Additional settings, labelled Token).

```powershell
npx wrangler secret put TEAM_DOMAIN
npx wrangler secret put POLICY_AUD
```

Type both commands exactly as written: `TEAM_DOMAIN` and `POLICY_AUD` are the secret names, not placeholders. Wrangler then asks to "Enter a secret value": paste the team domain (with `https://`) for the first and the audience tag for the second. `npx wrangler secret list` should show exactly those two names; delete any wrongly named one with `npx wrangler secret delete "<name>"`. The audience tag is about 64 characters of digits and the letters a to f; anything starting with `eyJ` is a sign-in token, not the tag.

### 9. Check it

Open the workers.dev address. You should get the Access sign-in, receive a code by email, and then see your library. To confirm the API is closed to anyone not signed in:

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://matchup-library.andrei-35b.workers.dev/api/state
```

Expect `302` (redirect to sign-in) or `403`, never `200`. `000` means curl reached nothing, usually a mistyped address.

## Local development

```powershell
Copy-Item .dev.vars.example .dev.vars
pnpm migrate:local
pnpm subjects sql
npx wrangler d1 execute matchup-library --local --file data\subjects.sql
npx wrangler d1 execute matchup-library --local --file data\import.sql
pnpm dev
```

`pnpm dev` starts the Worker on port 8787 and the page on port 5173. Open http://localhost:5173: the page reloads as you edit it, and `/api` goes to the local Worker and its local D1. `.dev.vars` turns sign-in off locally. It's ignored by git and never deployed. Never set `ALLOW_NO_AUTH` on the real Worker.

Before you push a change:

```powershell
pnpm typecheck
pnpm test
```

`pnpm test` runs the rules tests and a round trip of records through every migration in a local SQLite. The round trip needs Node 22.13 or later and is skipped on older versions. The browser test in `test/e2e.cjs` is optional: it needs Playwright, a fresh local database with the subjects and a library loaded, and `pnpm build:web` then `npx wrangler dev` running. Set `CHROME_PATH` to use an installed Chrome.

## Changing things later

- Page or Worker changes: `pnpm run deploy`.
- Schema changes: add the next `packages/core/src/db/migrations/000N_....sql`, run `pnpm migrate:remote` first, then deploy. Ship the migration and the code that reads it together.
- A new game patch: run `pnpm subjects sql` again and load the file. It updates names, ages and icons, and leaves your landmark intents alone.
- New icons: after picking subjects whose icons aren't bundled yet (they show from data.aoe4world.com meanwhile), download a copy and run `pnpm subjects icons --from data\<download>.json`. It copies only the icons in use and updates `packages/web/src/icons.generated.ts`. Commit both and deploy.
- Watch live errors with `npx wrangler tail`.
- Back up with **Download a copy** in Upkeep, or `npx wrangler d1 export matchup-library --remote --output backup.sql`.

## Troubleshooting

- **"Sign-in is not set up yet"**: `TEAM_DOMAIN` or `POLICY_AUD` isn't set. Run `npx wrangler secret list` to check.
- **"The sign-in token was not valid"**: one of those two values is wrong. The team domain must be the full `https://<team>.cloudflareaccess.com`, and the audience tag must come from the application that protects this Worker.
- **"Couldn't reach the library"** after the page has been open a while: your Access session expired. Reload to sign in again.
- **A save fails**: the page reloads what is saved and tells you why. If it mentions another device, reload that device too.
- **"No subjects loaded yet"** in the element editor: load `data\subjects.sql` (step 4).
- **`wrangler deploy` says the assets directory is missing**: the page hasn't been built. Use `pnpm run deploy`, which builds it first.

## How saving works

The page holds everything in memory. Each change goes to `/api/commit` as one batch of records, together with what the page saw before the change. `packages/core/src/docs.ts` turns those records into rows. A definition list (civs, maps, elements and so on) is saved item by item, so only the items you changed are written. A subject only ever saves its default intent. The Worker writes the rows and an undo entry in `change_log` in a single D1 batch, so both succeed or neither does. Undo sends the earlier records back and removes the entry.

The page keeps one state object in `packages/web/src/store.ts`. Event handlers change it and call `emit()`, which re-renders the page. Saves and undo live in `packages/web/src/api/client.ts`, and what each button does in `packages/web/src/actions.ts`. Routes are the part after `#` in the address (`#library`, `#civ-ottomans`, `#ref-game-…`).

The schema's matchup and coverage views from the design stage aren't in use. The app works out matchups with the rules in `packages/core/src/library.ts`. Those views are kept in `docs/deferred-views.sql` until they're rewritten.

## Credits

Unit, building, landmark and technology data and icons come from the [AoE4 World data repo](https://github.com/aoe4world/data) by Robert van Hoesel and AoE4 World.

Age of Empires IV © Microsoft Corporation. Matchup Library was created under Microsoft's "[Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules)" using assets from Age of Empires IV, and it is not endorsed by or affiliated with Microsoft.
