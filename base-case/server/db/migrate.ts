/**
 * Minimal migration runner: applies server/db/migrations/*.sql in filename order, recording each in `_migrations`.
 * Files are hand-written, idempotent SQL; re-running is a no-op.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbConn } from './index';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(here, 'migrations');

export interface MigrationFile {
  name: string;
  sql: string;
}

export function listMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/** Apply pending migrations; returns the names applied in this run. */
export async function migrate(conn: DbConn, files: MigrationFile[] = listMigrations()): Promise<string[]> {
  await conn.exec('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await conn.queryRows<{ name: string }>('SELECT name FROM _migrations')).map((r) => r.name));
  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f.name)) continue;
    await conn.exec(f.sql);
    await conn.queryRows('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [f.name]);
    done.push(f.name);
  }
  return done;
}
