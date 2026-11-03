import { describe, expect, it } from 'vitest';
import { connect } from '../../server/db/index';
import { migrate } from '../../server/db/migrate';
import { Envelope } from '../../server/crypto';
import { silentLogger } from '../../server/log';
import { verifyMasterKey } from '../../server/boot';
import { makeApp, createUser, login, req } from './helpers';
import { plans } from '../../server/db/schema';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('master key canary', () => {
  it('stores a canary on first boot and accepts the same key later', async () => {
    const conn = await connect({ memory: true });
    await migrate(conn);
    await verifyMasterKey(conn.db, new Envelope(KEY_A), silentLogger);
    await expect(verifyMasterKey(conn.db, new Envelope(KEY_A), silentLogger)).resolves.toBeUndefined();
    await conn.close();
  });

  it('refuses to start with a different key over the same database', async () => {
    const conn = await connect({ memory: true });
    await migrate(conn);
    await verifyMasterKey(conn.db, new Envelope(KEY_A), silentLogger);
    await expect(verifyMasterKey(conn.db, new Envelope(KEY_B), silentLogger)).rejects.toThrow(/does not match/);
    await conn.close();
  });
});

describe('undecryptable plan rows fail loudly', () => {
  it('returns 500 plan_unreadable instead of a blank plan', async () => {
    const t = await makeApp();
    const clientId = await createUser(t, { email: 'x@test.local', password: 'Correct-Horse-Battery-2026', role: 'client' });
    // A row encrypted under a different key
    const other = new Envelope(KEY_B);
    await t.deps.db.insert(plans).values({
      clientId,
      version: 1,
      stateEnc: other.encryptJson({ profile: { nickname: 'Ghost' } }, `plans:state_enc:${clientId}`),
      updatedAt: t.clock.now(),
      updatedBy: null,
    });
    const cookie = await login(t, 'x@test.local', 'Correct-Horse-Battery-2026');
    const res = await req(t, 'GET', '/api/plans/me', { cookie });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('plan_unreadable');
    await t.close();
  });
});
