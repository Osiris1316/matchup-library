import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BadRequest, DEF_TYPES, STATE_QUERIES, buildState, docStatements, inlineSql, parsePath, planCommit, type StateRows } from '../src';
import { fixture } from './fixture';

describe('paths', () => {
  it('accepts record paths and refuses anything else', () => {
    expect(parsePath('defs/civs')).toEqual({ col: 'defs', id: 'civs' });
    expect(parsePath('tags/abc-1')).toEqual({ col: 'tags', id: 'abc-1' });
    for (const bad of ['defs/nope', 'meta/other', 'users/1', 'tags/a/b', 'tags/a b', '']) expect(() => parsePath(bad)).toThrow(BadRequest);
  });
});

describe('definition lists', () => {
  it('writes only changed items, and deletes removed ones last', () => {
    const before = { items: fixture().defs.kinds.concat([{ id: 'army', name: 'Army', description: '', active: true }]) };
    const after = { items: [{ id: 'structure', name: 'Buildings', description: '', active: true }] };
    const r = docStatements('defs/kinds', after, before);
    expect(r.A).toHaveLength(1);
    expect(r.A[0]!.params).toContain('Buildings');
    expect(r.B.map((s) => s.sql)).toEqual(['DELETE FROM element_kinds WHERE id = ?']);
    expect(r.B[0]!.params).toEqual(['army']);
  });
  it('skips items that only differ in key order', () => {
    const k = { id: 'structure', name: 'Structure', description: '', active: true };
    expect(docStatements('defs/kinds', { items: [{ active: true, description: '', name: 'Structure', id: 'structure' }] }, { items: [k] }).A).toHaveLength(0);
  });
});

describe('commits', () => {
  it('logs a change with what came before', () => {
    const plan = planCommit({ label: 'Edited a tag', writes: [{ path: 'tags/t1', data: fixture().tags.t1 }], before: [{ path: 'tags/t1', data: null }] });
    expect(plan.change?.label).toBe('Edited a tag');
    const log = plan.statements.filter((s) => /change_log/.test(s.sql));
    expect(log.map((s) => s.sql.split(' ')[0])).toEqual(['INSERT', 'DELETE']);
  });
  it('removes the log entry on undo', () => {
    const plan = planCommit({ writes: [{ path: 'tags/t1', data: null }], before: [], undoOf: '20261110abc' });
    expect(plan.change).toBeNull();
    expect(plan.statements.at(-1)?.sql).toBe('DELETE FROM change_log WHERE id = ?');
  });
  it('refuses an empty save', () => {
    expect(() => planCommit({ writes: [] })).toThrow(BadRequest);
  });
  it('writes SQL text with quotes escaped', () => {
    expect(inlineSql({ sql: 'SELECT ?, ?, ?', params: ["It's", 3, null] })).toBe("SELECT 'It''s', 3, NULL");
  });
});

// The whole trip: records to rows in a real SQLite with the D1 schema, then
// rows back to records. Needs Node's built-in SQLite (Node 22.13 or later).
type Db = { exec(sql: string): void; prepare(sql: string): { run(...p: unknown[]): unknown; all(): Record<string, unknown>[] } };
let DatabaseSync: (new (path: string) => Db) | null = null;
try { DatabaseSync = (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Db }).DatabaseSync; } catch { DatabaseSync = null; }

describe.skipIf(!DatabaseSync)('round trip through the schema', () => {
  it('reads back what it wrote', () => {
    const db = new (DatabaseSync as new (path: string) => Db)(':memory:');
    db.exec(readFileSync(new URL('../src/db/migrations/0001_initial_schema.sql', import.meta.url), 'utf8'));
    const ex = fixture();
    const writes: { path: string; data: unknown }[] = [];
    DEF_TYPES.forEach((t) => writes.push({ path: 'defs/' + t, data: { items: ex.defs[t] } }));
    writes.push({ path: 'meta/settings', data: ex.settings });
    Object.entries(ex.tags).forEach(([id, d]) => writes.push({ path: 'tags/' + id, data: d }));
    Object.entries(ex.games).forEach(([id, d]) => writes.push({ path: 'games/' + id, data: d }));
    Object.entries(ex.links).forEach(([id, d]) => writes.push({ path: 'links/' + id, data: d }));
    writes.forEach((w) => docStatements(w.path, w.data, null).A.forEach((s) => db.prepare(s.sql).run(...s.params)));

    const rows = {} as StateRows;
    STATE_QUERIES.forEach(([key, sql]) => { rows[key] = db.prepare(sql).all(); });
    const st = buildState(rows);
    expect(st.defs).toEqual(ex.defs);
    expect(st.settings).toEqual(ex.settings);
    const strip = <T extends object>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, createdAt: undefined }]));
    expect(strip(st.tags)).toEqual(strip(ex.tags));
    expect(strip(st.games)).toEqual(strip(ex.games));
    expect(strip(st.links)).toEqual(strip(ex.links));
  });
});
