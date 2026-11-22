import crypto from 'node:crypto';

/** 256-bit random session token, URL-safe (SEC-3). */
export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 digests, so a leaked database cannot be replayed. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** No 0/O/1/I to avoid misreading codes aloud. 31 symbols, 10 chars: about 49.5 bits (SEC-4). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 10;

function randomFrom(alphabet: string, length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      // Rejection sampling keeps every symbol equally likely.
      if (byte < 256 - (256 % alphabet.length) && out.length < length)
        out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

export function newRoomCode(): string {
  return randomFrom(CODE_ALPHABET, ROOM_CODE_LENGTH);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

/** Fresh 256-bit game seed; never leaves the server (FR-18). */
export function newSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Constant-time string comparison via digests (lengths may differ). */
export function safeEqual(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a).digest();
  const db = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

/** Unbiased crypto shuffle for seat order. */
export function cryptoShuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
