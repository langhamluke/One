/**
 * Database connection. DATABASE_URL -> Postgres via `pg`; otherwise embedded PGlite (file-backed, or in-memory for tests).
 * Both drivers expose the same Drizzle `Db` type plus a tiny raw escape hatch used only by the migration runner.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

export { schema };
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbConn {
  db: Db;
  kind: 'pglite' | 'pg';
  /** Run one or more SQL statements (no parameters). Migration use only. */
  exec(sql: string): Promise<void>;
  /** Run a single parameterised statement and return rows. Migration use only. */
  queryRows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface ConnectOptions {
  databaseUrl?: string | null;
  /** Directory for the PGlite data files; ignored when `memory` is true or databaseUrl is set */
  dataDir?: string;
  /** In-memory PGlite (tests) */
  memory?: boolean;
}

export async function connect(opts: ConnectOptions = {}): Promise<DbConn> {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as Db;
    return {
      db,
      kind: 'pg',
      async exec(sql) {
        await pool.query(sql);
      },
      async queryRows<T>(sql: string, params: unknown[] = []) {
        const r = await pool.query(sql, params);
        return r.rows as T[];
      },
      async close() {
        await pool.end();
      },
    };
  }
  let client: PGlite;
  if (opts.memory) {
    client = new PGlite();
  } else {
    const dir = path.resolve(opts.dataDir ?? './data', 'pg');
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return {
    db,
    kind: 'pglite',
    async exec(sql) {
      await client.exec(sql);
    },
    async queryRows<T>(sql: string, params: unknown[] = []) {
      const r = await client.query<T>(sql, params);
      return r.rows;
    },
    async close() {
      await client.close();
    },
  };
}
