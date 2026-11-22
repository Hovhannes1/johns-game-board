/**
 * Abuse protection: token buckets for message rates, and an exponential-backoff
 * lockout for repeated password failures. Pure TypeScript, browser-safe.
 */

export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Consumes one token for `key`; false when the caller is over the limit. */
  take(key: string): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + ((now - bucket.updated) / 1000) * this.refillPerSecond,
    );
    bucket.updated = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }

  /** Drops buckets that have refilled completely, to bound memory. */
  prune(): void {
    const now = this.now();
    for (const [key, b] of this.buckets) {
      if (b.tokens + ((now - b.updated) / 1000) * this.refillPerSecond >= this.capacity) {
        this.buckets.delete(key);
      }
    }
  }
}

export interface LockoutOptions {
  /** Failures allowed before lockouts start. */
  freeAttempts: number;
  baseLockMs: number;
  maxLockMs: number;
  /** Failures are forgotten after this long without new ones. */
  forgetAfterMs: number;
}

export class FailureLockout {
  private readonly entries = new Map<
    string,
    { failures: number; lockedUntil: number; last: number }
  >();

  constructor(
    private readonly options: LockoutOptions,
    private readonly now: () => number = Date.now,
  ) {}

  /** Milliseconds until `key` may try again (0 = allowed now). */
  retryAfter(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const now = this.now();
    if (now - entry.last > this.options.forgetAfterMs) {
      this.entries.delete(key);
      return 0;
    }
    return Math.max(0, entry.lockedUntil - now);
  }

  fail(key: string): void {
    const now = this.now();
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: 0, last: now };
    if (now - entry.last > this.options.forgetAfterMs) entry.failures = 0;
    entry.failures += 1;
    entry.last = now;
    const over = entry.failures - this.options.freeAttempts;
    if (over > 0) {
      const lock = Math.min(this.options.maxLockMs, this.options.baseLockMs * 2 ** (over - 1));
      entry.lockedUntil = now + lock;
    }
    this.entries.set(key, entry);
  }

  succeed(key: string): void {
    this.entries.delete(key);
  }

  prune(): void {
    const now = this.now();
    for (const [key, e] of this.entries) {
      if (now - e.last > this.options.forgetAfterMs) this.entries.delete(key);
    }
  }
}
