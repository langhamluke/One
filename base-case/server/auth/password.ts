/**
 * Password hashing (scrypt, Node crypto) and the password policy.
 * Hash format: scrypt$N$r$p$<salt b64>$<key b64>
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
const N = 2 ** 15;
const R = 8;
const P = 1;
const SALT_LEN = 16;
const KEY_LEN = 32;
const MAXMEM = 128 * N * R * 2; // scrypt needs 128*N*r bytes; leave headroom

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Equalise timing for unknown users / users without a password.
    await scrypt('x', Buffer.alloc(SALT_LEN), KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const key = await scrypt(password.normalize('NFKC'), salt, expected.length, { N: n, r, p, maxmem: 128 * n * r * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const PASSWORD_MIN_LENGTH = 12;

/** Top-100 most common passwords (SecLists / NCSC / Have I Been Pwned top lists; merged, lower-cased). */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456', 'password', '123456789', '12345678', '12345', 'qwerty', '1234567', '111111', '1234567890', '123123',
  'abc123', '1234', 'password1', 'iloveyou', '1q2w3e4r', '000000', 'qwerty123', 'zaq12wsx', 'dragon', 'sunshine',
  'princess', 'letmein', '654321', 'monkey', '27653', '1qaz2wsx', '123321', 'qwertyuiop', 'superman', 'asdfghjkl',
  'football', 'baseball', 'welcome', 'shadow', 'michael', 'ashley', 'master', 'jennifer', 'jordan', 'hunter',
  'trustno1', 'ranger', 'buster', 'thomas', 'robert', 'soccer', 'batman', 'test', 'pass', 'killer',
  'hockey', 'george', 'charlie', 'andrew', 'michelle', 'love', 'jessica', 'pepper', 'daniel', 'access',
  'mustang', 'computer', 'tigger', 'joshua', 'maggie', 'cookie', 'summer', 'hello', 'freedom', 'whatever',
  'nicole', 'ginger', 'hammer', 'silver', 'starwars', 'cheese', 'amanda', 'matthew', 'yankees', 'secret',
  'passw0rd', 'password123', 'admin', 'admin123', 'root', 'toor', 'changeme', 'default', 'welcome1', 'welcome123',
  'qwerty1', 'abcd1234', 'abcdefgh', '1234qwer', 'qazwsx', 'asdfgh', 'zxcvbnm', '112233', '121212', '987654321',
  'password!', 'p@ssw0rd', 'p@ssword', 'letmein1', 'iloveyou1', 'passw0rd1', 'monkey123', 'dragon123', 'football1', 'qwerty12345',
  'basecase', 'base-case', 'basecase123', 'password2026', 'basecase2026',
]);

/** Returns an error message when the password violates policy, else null. */
export function passwordPolicyError(password: string, email?: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > 256) return 'Password is too long';
  const lower = password.toLowerCase();
  if (email && lower === email.trim().toLowerCase()) return 'Password must not equal your email address';
  if (email) {
    const local = email.split('@')[0]?.toLowerCase();
    if (local && local.length >= 4 && lower === local) return 'Password must not equal your email address';
  }
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripped)) return 'That password is too common';
  if (/^(.)\1+$/.test(password)) return 'Password must not be a single repeated character';
  return null;
}
