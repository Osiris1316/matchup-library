# data

Library data goes here and stays out of git (see `.gitignore`), because the repo is public.

- `preview-snapshot-2026-11-10.json`: the preview's data as of November 10, 2026.
- `import-2026-11-10.sql`: that snapshot converted to SQL for D1.

For your latest data, download a fresh copy from the preview (Upkeep, then Download a copy), save it here, and convert it:

```powershell
pnpm import-preview data\preview-download.json data\import.sql
```
