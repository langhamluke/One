import { describe, it, expect } from 'vitest';
import { Envelope, aad, CryptoError } from '../../server/crypto';

const KEY = '0123456789abcdef'.repeat(4);

describe('envelope encryption', () => {
  const env = new Envelope(KEY);

  it('round-trips JSON with AAD', () => {
    const blob = env.encryptJson({ a: 1, nested: { b: 'x' } }, aad('plans', 'state_enc', 'row-1'));
    const buf = Buffer.from(blob, 'base64');
    expect(buf[0]).toBe(1); // key id
    expect(buf.length).toBeGreaterThan(1 + 12 + 16);
    expect(env.decryptJson(blob, aad('plans', 'state_enc', 'row-1'))).toEqual({ a: 1, nested: { b: 'x' } });
  });

  it('fails on AAD mismatch (ciphertext cannot be moved between rows/columns)', () => {
    const blob = env.encryptJson({ secret: true }, aad('plans', 'state_enc', 'row-1'));
    expect(() => env.decryptJson(blob, aad('plans', 'state_enc', 'row-2'))).toThrow(CryptoError);
    expect(() => env.decryptJson(blob, aad('proposals', 'state_enc', 'row-1'))).toThrow(CryptoError);
  });

  it('fails on tampering', () => {
    const blob = env.encrypt('hello world', 'x:y:z');
    const buf = Buffer.from(blob, 'base64');
    buf[buf.length - 1] ^= 0x01; // flip a ciphertext bit
    expect(() => env.decrypt(buf.toString('base64'), 'x:y:z')).toThrow(CryptoError);
    const buf2 = Buffer.from(blob, 'base64');
    buf2[20] ^= 0x01; // flip a tag bit
    expect(() => env.decrypt(buf2.toString('base64'), 'x:y:z')).toThrow(CryptoError);
  });

  it('fails with a different key and rejects bad keys', () => {
    const blob = env.encrypt('hello', 'a:b:c');
    expect(() => new Envelope('f'.repeat(64)).decrypt(blob, 'a:b:c')).toThrow(CryptoError);
    expect(() => new Envelope('tooshort')).toThrow(CryptoError);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    expect(env.encrypt('same', 'a:b:c')).not.toBe(env.encrypt('same', 'a:b:c'));
  });
});
