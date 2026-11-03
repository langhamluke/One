import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, passwordPolicyError, COMMON_PASSWORDS } from '../../server/auth/password';

describe('password hashing', () => {
  it('hashes with scrypt N=2^15 and verifies', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', h)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', h)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
  });

  it('uses a fresh 16-byte salt per hash', async () => {
    const a = await hashPassword('same-password-twice!');
    const b = await hashPassword('same-password-twice!');
    expect(a).not.toBe(b);
    expect(Buffer.from(a.split('$')[4], 'base64').length).toBe(16);
  });
});

describe('password policy', () => {
  it('requires 12+ chars, rejects email and common passwords', () => {
    expect(passwordPolicyError('short1!', 'a@b.com')).toMatch(/12 characters/);
    expect(passwordPolicyError('someone@example.com', 'someone@example.com')).toMatch(/email/);
    expect(passwordPolicyError('password1234', 'a@b.com')).toBeNull();
    expect(passwordPolicyError('qwertyuiop12', 'a@b.com')).toBeNull();
    expect(passwordPolicyError('1234567890123', 'a@b.com')).toBeNull();
    expect(passwordPolicyError('password123', 'a@b.com')).not.toBeNull();
    expect(passwordPolicyError('aaaaaaaaaaaaaa', 'a@b.com')).toMatch(/repeated/);
    expect(passwordPolicyError('BaseCase-Client-2026!', 'x@y.com')).toBeNull();
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(100);
  });
});
