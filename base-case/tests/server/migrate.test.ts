import { describe, it, expect, afterAll } from 'vitest';
import { connect } from '../../server/db/index';
import { migrate, listMigrations } from '../../server/db/migrate';

describe('migrations', () => {
  const connP = connect({ memory: true });
  afterAll(async () => (await connP).close());

  it('apply once, then are a no-op the second time', async () => {
    const conn = await connP;
    const first = await migrate(conn);
    expect(first.length).toBe(listMigrations().length);
    expect(first[0]).toBe('0001_init.sql');
    const second = await migrate(conn);
    expect(second).toEqual([]);
    // the SQL itself is idempotent too: re-running the raw file must not throw
    for (const f of listMigrations()) await conn.exec(f.sql);
    const tables = await conn.queryRows<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
    const names = tables.map((t) => t.table_name);
    for (const t of ['users', 'sessions', 'invites', 'advisor_clients', 'plans', 'plan_versions', 'proposals', 'chat_threads', 'chat_messages', 'audit_log', 'settings', '_migrations']) {
      expect(names).toContain(t);
    }
  });

  it('audit_log is append-only at the database level', async () => {
    const conn = await connP;
    await conn.exec("INSERT INTO audit_log (action) VALUES ('test.append')");
    await conn.exec("UPDATE audit_log SET action = 'tampered'");
    await conn.exec('DELETE FROM audit_log');
    const rows = await conn.queryRows<{ action: string }>('SELECT action FROM audit_log');
    expect(rows).toEqual([{ action: 'test.append' }]);
  });
});
