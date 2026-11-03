/**
 * In-memory token buckets. Login: 5 per 15 minutes per ip+email. Chat: 20 per minute per user.
 * Buckets live in process memory (single-node deployment); behind a load balancer use sticky sessions
 * or move the buckets to the database/redis.
 */
export interface BucketOptions {
  /** Bucket capacity (burst) */
  max: number;
  /** Time to fully refill the bucket */
  windowMs: number;
}

export interface LimitResult {
  allowed: boolean;
  /** Seconds until a token becomes available (0 when allowed) */
  retryAfterSec: number;
  remaining: number;
}

interface Bucket {
  tokens: number;
  updated: number;
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(public readonly opts: BucketOptions) {}

  hit(key: string, nowMs: number = Date.now()): LimitResult {
    const rate = this.opts.max / this.opts.windowMs; // tokens per ms
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.opts.max, updated: nowMs };
      this.buckets.set(key, b);
    } else {
      b.tokens = Math.min(this.opts.max, b.tokens + (nowMs - b.updated) * rate);
      b.updated = nowMs;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, retryAfterSec: 0, remaining: Math.floor(b.tokens) };
    }
    const retryAfterSec = Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000));
    if (this.buckets.size > 50_000) this.prune(nowMs);
    return { allowed: false, retryAfterSec, remaining: 0 };
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }

  private prune(nowMs: number): void {
    for (const [k, b] of this.buckets) {
      if (nowMs - b.updated > this.opts.windowMs) this.buckets.delete(k);
    }
  }
}

export interface RateLimiters {
  login: TokenBucketLimiter;
  chat: TokenBucketLimiter;
  reset(): void;
}

export const LOGIN_LIMIT: BucketOptions = { max: 5, windowMs: 15 * 60 * 1000 };
export const CHAT_LIMIT: BucketOptions = { max: 20, windowMs: 60 * 1000 };
export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function createRateLimiters(login: BucketOptions = LOGIN_LIMIT, chat: BucketOptions = CHAT_LIMIT): RateLimiters {
  const l = new TokenBucketLimiter(login);
  const ch = new TokenBucketLimiter(chat);
  return {
    login: l,
    chat: ch,
    reset() {
      l.reset();
      ch.reset();
    },
  };
}
