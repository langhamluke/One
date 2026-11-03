/**
 * AES-256-GCM envelope encryption for data at rest (plan state, proposal state, chat messages, TOTP secrets).
 *
 * Blob format (base64): [keyId 1 byte][iv 12 bytes][auth tag 16 bytes][ciphertext]
 * AAD = `${table}:${column}:${rowId}` so a ciphertext cannot be swapped between rows or columns.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from './log';

const IV_LEN = 12;
const TAG_LEN = 16;
export const ACTIVE_KEY_ID = 1;

export class CryptoError extends Error {}

export function aad(table: string, column: string, rowId: string): string {
  return `${table}:${column}:${rowId}`;
}

export class Envelope {
  private keys: Map<number, Buffer>;
  constructor(masterKeyHex: string, private activeKeyId: number = ACTIVE_KEY_ID) {
    if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) throw new CryptoError('master key must be 64 hex characters (32 bytes)');
    this.keys = new Map([[activeKeyId, Buffer.from(masterKeyHex, 'hex')]]);
  }

  encrypt(plaintext: Buffer | string, associatedData: string): string {
    const key = this.keys.get(this.activeKeyId);
    if (!key) throw new CryptoError('active key missing');
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ct = Buffer.concat([cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([this.activeKeyId]), iv, tag, ct]).toString('base64');
  }

  decrypt(blob: string, associatedData: string): Buffer {
    const buf = Buffer.from(blob, 'base64');
    if (buf.length < 1 + IV_LEN + TAG_LEN) throw new CryptoError('ciphertext too short');
    const keyId = buf[0];
    const key = this.keys.get(keyId);
    if (!key) throw new CryptoError(`unknown key id ${keyId}`);
    const iv = buf.subarray(1, 1 + IV_LEN);
    const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
    const ct = buf.subarray(1 + IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch {
      throw new CryptoError('decryption failed (wrong key, tampered data or AAD mismatch)');
    }
  }

  encryptJson(value: unknown, associatedData: string): string {
    return this.encrypt(JSON.stringify(value), associatedData);
  }

  decryptJson<T = unknown>(blob: string, associatedData: string): T {
    return JSON.parse(this.decrypt(blob, associatedData).toString('utf8')) as T;
  }
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Resolve the master key: BASE_CASE_MASTER_KEY, else (dev only) a generated key persisted at <dataDir>/dev-master-key.
 * Production refuses to start without an explicit key.
 */
export function resolveMasterKey(opts: { masterKeyHex: string | null; dataDir: string; isProduction: boolean; logger: Logger }): string {
  if (opts.masterKeyHex) {
    if (!/^[0-9a-fA-F]{64}$/.test(opts.masterKeyHex)) throw new CryptoError('BASE_CASE_MASTER_KEY must be 64 hex characters');
    return opts.masterKeyHex;
  }
  if (opts.isProduction) {
    throw new CryptoError('BASE_CASE_MASTER_KEY is required in production (64 hex chars). Refusing to start.');
  }
  const file = path.resolve(opts.dataDir, 'dev-master-key');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(existing)) {
      opts.logger.warn('SECURITY: using DEV master key from ' + file + ' (set BASE_CASE_MASTER_KEY for real deployments)');
      return existing;
    }
  } catch {
    /* generate below */
  }
  const generated = randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, generated + '\n', { mode: 0o600 });
  opts.logger.warn('SECURITY: BASE_CASE_MASTER_KEY not set. Generated a DEV master key at ' + file + '. Never use this in production.');
  return generated;
}
