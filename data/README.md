# data

Library data goes here and stays out of git (see `.gitignore`), because the repo is public.

- Downloads from the site (Upkeep, then Download a copy), and the SQL made from them with `pnpm import-preview`.
- `subjects.sql`, written by `pnpm subjects sql` from the aoe4world data repo. Since migration 0004 it also carries each subject's earlier civ ages (`early_ages`), so load it after that migration.
- `phase1-elements.sql`, written by `pnpm phase1-elements <download.json>`: the one-off step that moves the elements onto types, icons and intent.
- `phase2-plays.sql`, written by `pnpm phase2-plays <download.json>`: the one-off step that splits the first version's plays into plays and game plans. Run it after migration 0003, on a download taken before that migration.
- Backups from `npx wrangler d1 export matchup-library --remote --output data\backup-<date>.sql`.
