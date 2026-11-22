/**
 * Browser-safe cryptographic helpers (Web Crypto).
 * Replaces node:crypto from server/security/tokens.ts so room/game logic runs
 * identically in browsers and Node 24+.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** 256-bit random session / client token, URL-safe. */
export function newToken(): string {
  return bytesToBase64Url(randomBytes(32));
}

export const randomKey = newToken;

/** No 0/O/1/I to avoid misreading codes aloud. 31 symbols, 10 chars: ~49.5 bits. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 10;

function randomFrom(alphabet: string, length: number): string {
  let out = '';
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

export function newRoomCode(): string {
  return randomFrom(CODE_ALPHABET, ROOM_CODE_LENGTH);
}

export function newId(prefix: string): string {
  return `${prefix}_${bytesToBase64Url(randomBytes(9))}`;
}

/** Fresh 256-bit game seed (hex). */
export function newSeed(): string {
  return Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Unbiased crypto random integer in [0, maxExclusive). */
export function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0 || !Number.isInteger(maxExclusive)) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  if (maxExclusive === 1) return 0;
  const range = 0x1_0000_0000;
  const limit = range - (range % maxExclusive);
  const buf = new Uint32Array(1);
  while (true) {
    globalThis.crypto.getRandomValues(buf);
    const val = buf[0]!;
    if (val < limit) return val % maxExclusive;
  }
}

/** Unbiased crypto shuffle for seat order. */
export function cryptoShuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
