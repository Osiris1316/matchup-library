# data

Library data goes here and stays out of git (see `.gitignore`), because the repo is public.

- Downloads from the site (Upkeep, then Download a copy), and the SQL made from them with `pnpm import-preview`.
- `subjects.sql`, written by `pnpm subjects sql` from the aoe4world data repo.
- `phase1-elements.sql`, written by `pnpm phase1-elements <download.json>`: the one-off step that moves the elements onto types, icons and intent.
- Backups from `npx wrangler d1 export matchup-library --remote --output data\backup-<date>.sql`.
