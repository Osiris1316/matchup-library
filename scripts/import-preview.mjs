// Turn a preview download (Upkeep, then Download a copy) into SQL for D1.
//
//   node scripts/import-preview.mjs <download.json> [out.sql]
//
// The SQL only inserts or updates rows, so it is safe to run more than once
// and on a database that already has data. It never deletes anything.
import { readFileSync, writeFileSync } from 'node:fs';
import { DEF_TYPES, docStatements, inlineSql } from '../src/docs.js';

const [, , input, output = 'data/import.sql'] = process.argv;
if (!input) {
  console.error('Usage: node scripts/import-preview.mjs <download.json> [out.sql]');
  process.exit(1);
}
const ex = JSON.parse(readFileSync(input, 'utf8'));
if (!ex.defs || !Array.isArray(ex.defs.civs)) {
  console.error('That file does not look like a Matchup Library download (no civs in it).');
  process.exit(1);
}

// Parents before children, so every reference points at a row that exists.
const writes = [];
DEF_TYPES.forEach((t) => writes.push({ path: 'defs/' + t, data: { items: ex.defs[t] || [] } }));
writes.push({ path: 'meta/settings', data: ex.settings || {} });
Object.entries(ex.tags || {}).forEach(([id, d]) => writes.push({ path: 'tags/' + id, data: d }));
const answers = Object.entries(ex.answers || {});
answers.filter(([, a]) => a.target !== 'play').forEach(([id, d]) => writes.push({ path: 'answers/' + id, data: d }));
answers.filter(([, a]) => a.target === 'play').forEach(([id, d]) => writes.push({ path: 'answers/' + id, data: d }));
Object.entries(ex.games || {}).forEach(([id, d]) => writes.push({ path: 'games/' + id, data: d }));
Object.entries(ex.links || {}).forEach(([id, d]) => writes.push({ path: 'links/' + id, data: d }));

const lines = [];
writes.forEach((w) => docStatements(w.path, w.data, null).A.forEach((s) => lines.push(inlineSql(s) + ';')));

const count = (o) => Object.keys(o || {}).length;
const header = [
  '-- Matchup Library data, converted from a preview download.',
  `-- Source: ${input}${ex.exportedAt ? ' (downloaded ' + ex.exportedAt + ')' : ''}`,
  `-- ${ex.defs.civs.length} civs, ${(ex.defs.maps || []).length} maps, ${(ex.defs.elements || []).length} elements, ${(ex.defs.strategies || []).length} plays,`,
  `-- ${count(ex.tags)} tags, ${count(ex.games)} games, ${count(ex.links)} links, ${count(ex.answers)} answers.`,
  '-- Inserts or updates only. Safe to run again.',
  ''
].join('\n');
writeFileSync(output, header + '\n' + lines.join('\n') + '\n');
console.log(`Wrote ${output}: ${lines.length} statements.`);
console.log(header.split('\n').slice(2, 4).join('\n'));
