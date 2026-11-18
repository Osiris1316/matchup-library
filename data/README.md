# data

Library data goes here and stays out of git (see `.gitignore`), because the repo is public.

- Downloads from the site (Upkeep, then Download a copy), and the SQL made from them with `pnpm import-preview`.
- `subjects.sql`, written by `pnpm subjects sql` from the aoe4world data repo. Since migration 0004 it also carries each subject's earlier civ ages (`early_ages`), so load it after that migration.
- Backups from `npx wrangler d1 export matchup-library --remote --output data\backup-<date>.sql`.
