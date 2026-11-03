/**
 * RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits) with a +/-1 step window.
 * Replay protection: the caller persists the last accepted counter per user and passes it back.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

export function totpCounter(timeMs: number, step = TOTP_STEP_SECONDS): number {
  return Math.floor(timeMs / 1000 / step);
}

export function totp(secret: Buffer, timeMs: number, step = TOTP_STEP_SECONDS, digits = TOTP_DIGITS): string {
  return hotp(secret, totpCounter(timeMs, step), digits);
}

/**
 * Verify a code against the secret within +/- `window` steps. Counters at or below `lastCounter` are rejected
 * (single use). Returns the matched counter, or null.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  timeMs: number,
  lastCounter: number | null = null,
  window = TOTP_WINDOW,
): number | null {
  const clean = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const base = totpCounter(timeMs);
  const given = Buffer.from(clean);
  for (let delta = -window; delta <= window; delta++) {
    const counter = base + delta;
    if (lastCounter !== null && counter <= lastCounter) continue;
    const expected = Buffer.from(hotp(secret, counter));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return counter;
  }
  return null;
}

export function otpauthUrl(issuer: string, account: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
}
