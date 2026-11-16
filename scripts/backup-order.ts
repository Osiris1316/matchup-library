// Reorder a D1 export (npx wrangler d1 export ...) so it loads into an empty
// database.
//
//   pnpm backup-order <export.sql> [out.sql]
//
// An export creates each table and then fills it, in the order the tables were
// first made. A table changed by a later migration can point at a table made
// after it (elements at subjects, for example), and inserting into it fails
// with "no such table" until that table exists. This writes every table first,
// then every row, then the indexes and views. Nothing else changes.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input) {
  console.error('Usage: pnpm backup-order <export.sql> [out.sql]');
  process.exit(1);
}
const out = output || input.replace(/\.sql$/i, '') + '-load.sql';

// The export writes one statement per line, except CREATE statements, which
// run over several lines and end with a line ending in a semicolon.
const lines = readFileSync(input, 'utf8').split(/\r?\n/);
const statements: string[] = [];
let cur: string[] = [];
for (const line of lines) {
  if (!cur.length && !line.trim()) continue;
  cur.push(line);
  const multi = /^CREATE\s/i.test(cur[0] || '');
  if (!multi || /;\s*$/.test(line)) { statements.push(cur.join('\n')); cur = []; }
}
if (cur.length) statements.push(cur.join('\n'));

const pragmas: string[] = [], tables: string[] = [], rows: string[] = [], later: string[] = [];
for (const s of statements) {
  if (/^PRAGMA\s/i.test(s)) pragmas.push(s);
  else if (/^CREATE\s+TABLE\s/i.test(s)) tables.push(s);
  else if (/^CREATE\s/i.test(s)) later.push(s);
  else rows.push(s);
}
writeFileSync(out, [...pragmas, ...tables, ...rows, ...later].join('\n') + '\n');
console.log(`Wrote ${out}: ${tables.length} tables, ${rows.length} rows and other statements, ${later.length} indexes and views.`);
