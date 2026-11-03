import { describe, it, expect } from 'vitest';
import { totp, verifyTotp, base32Encode, base32Decode, otpauthUrl, generateTotpSecret, hotp } from '../../server/auth/totp';

// RFC 6238 Appendix B test vectors (SHA-1, 8 digits) truncated to 6 digits.
const SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vectors', () => {
    expect(totp(SECRET, 59 * 1000)).toBe('287082'); // 94287082
    expect(totp(SECRET, 1111111109 * 1000)).toBe('081804'); // 07081804
    expect(totp(SECRET, 1234567890 * 1000)).toBe('005924'); // 89005924
    expect(totp(SECRET, 20000000000 * 1000)).toBe('353130'); // 65353130
  });

  it('HOTP RFC 4226 vectors', () => {
    expect(hotp(SECRET, 0)).toBe('755224');
    expect(hotp(SECRET, 1)).toBe('287082');
  });

  it('accepts +/-1 step and enforces single use', () => {
    const now = 1234567890 * 1000;
    const code = totp(SECRET, now);
    const prev = totp(SECRET, now - 30_000);
    const next = totp(SECRET, now + 30_000);
    const old = totp(SECRET, now - 60_000);
    const counter = verifyTotp(SECRET, code, now, null);
    expect(counter).toBe(Math.floor(now / 1000 / 30));
    expect(verifyTotp(SECRET, prev, now, null)).toBe(counter! - 1);
    expect(verifyTotp(SECRET, next, now, null)).toBe(counter! + 1);
    expect(verifyTotp(SECRET, old, now, null)).toBeNull();
    // replay: same (or older) counter rejected after use
    expect(verifyTotp(SECRET, code, now, counter)).toBeNull();
    expect(verifyTotp(SECRET, prev, now, counter)).toBeNull();
    expect(verifyTotp(SECRET, next, now, counter)).toBe(counter! + 1);
    expect(verifyTotp(SECRET, '12345', now, null)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', now, null)).toBeNull();
  });

  it('base32 round-trips and otpauth URL is well formed', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(base32Encode(SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const url = otpauthUrl('Base Case', 'me@example.com', s);
    expect(url.startsWith('otpauth://totp/Base%20Case%3Ame%40example.com?')).toBe(true);
    expect(url).toContain(`secret=${s}`);
    expect(url).toContain('issuer=Base+Case');
  });
});
