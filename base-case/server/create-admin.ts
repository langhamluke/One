/**
 * Create or promote an admin: `npm run create-admin -- --email you@firm.com --password 'a long passphrase'`
 */
import { eq } from 'drizzle-orm';
import { boot } from './boot';
import { users } from './db/schema';
import { hashPassword, passwordPolicyError } from './auth/password';
import { findUserByEmail, isValidEmail, normalizeEmail } from './services/users';
import { ensureUser } from './seed';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq_ = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq_ ? eq_.slice(name.length + 3) : undefined;
}

const email = arg('email') ? normalizeEmail(arg('email')!) : undefined;
const password = arg('password') ?? process.env.ADMIN_PASSWORD;
if (!email || !isValidEmail(email) || !password) {
  console.error('usage: npm run create-admin -- --email <email> --password <password>');
  process.exit(2);
}
const policy = passwordPolicyError(password, email);
if (policy) {
  console.error(`password rejected: ${policy}`);
  process.exit(2);
}

const { deps, conn } = await boot();
try {
  const existing = await findUserByEmail(deps.db, email);
  if (existing) {
    await deps.db
      .update(users)
      .set({ role: 'admin', status: 'active', passwordHash: await hashPassword(password), passwordChangedAt: deps.clock.now(), failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, existing.id));
    console.log(`updated existing user ${email}: role=admin status=active password reset`);
  } else {
    const res = await ensureUser(deps, { email, password, role: 'admin', displayName: 'Administrator' });
    console.log(`created admin ${email} (${res.user.id})`);
  }
} finally {
  await conn.close();
}
