/**
 * Deterministic, cryptographically strong RNG (FR-18).
 *
 * The server draws a 256-bit seed from a CSPRNG and keeps it private. The
 * engine expands that seed with the ChaCha20 block function (RFC 8439), so the
 * shuffle is unpredictable without the seed yet fully reproducible from it,
 * which is what makes replays and crash recovery possible (FR-17, FR-25).
 *
 * Pure TypeScript with no platform APIs, so the engine stays I/O free.
 */

export interface Rng {
  /** Next uniformly distributed unsigned 32-bit integer. */
  nextUint32(): number;
  /** Uniform integer in [0, maxExclusive) without modulo bias. */
  nextInt(maxExclusive: number): number;
}

const SEED_PATTERN = /^[0-9a-f]{64}$/;

export function isValidSeed(seed: string): boolean {
  return SEED_PATTERN.test(seed);
}

function rotl(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number): void {
  let va = x[a]!;
  let vb = x[b]!;
  let vc = x[c]!;
  let vd = x[d]!;
  va = (va + vb) >>> 0;
  vd = rotl(vd ^ va, 16);
  vc = (vc + vd) >>> 0;
  vb = rotl(vb ^ vc, 12);
  va = (va + vb) >>> 0;
  vd = rotl(vd ^ va, 8);
  vc = (vc + vd) >>> 0;
  vb = rotl(vb ^ vc, 7);
  x[a] = va;
  x[b] = vb;
  x[c] = vc;
  x[d] = vd;
}

/**
 * ChaCha20 block function. `key` is 8 little-endian words, `nonce` 3 words.
 * Returns the 16 output words (serialize little-endian for the keystream).
 */
export function chacha20Block(
  key: ArrayLike<number>,
  counter: number,
  nonce: ArrayLike<number>,
): Uint32Array {
  if (key.length !== 8 || nonce.length !== 3) {
    throw new Error('chacha20Block: key must be 8 words and nonce 3 words');
  }
  const input = new Uint32Array(16);
  input[0] = 0x61707865;
  input[1] = 0x3320646e;
  input[2] = 0x79622d32;
  input[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) input[4 + i] = key[i]!;
  input[12] = counter >>> 0;
  for (let i = 0; i < 3; i++) input[13 + i] = nonce[i]!;

  const x = input.slice();
  for (let round = 0; round < 10; round++) {
    quarterRound(x, 0, 4, 8, 12);
    quarterRound(x, 1, 5, 9, 13);
    quarterRound(x, 2, 6, 10, 14);
    quarterRound(x, 3, 7, 11, 15);
    quarterRound(x, 0, 5, 10, 15);
    quarterRound(x, 1, 6, 11, 12);
    quarterRound(x, 2, 7, 8, 13);
    quarterRound(x, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) x[i] = (x[i]! + input[i]!) >>> 0;
  return x;
}

function seedToKey(seedHex: string): Uint32Array {
  const key = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    // Each word is 4 bytes, little-endian.
    let word = 0;
    for (let b = 3; b >= 0; b--) {
      const byte = parseInt(seedHex.slice((i * 4 + b) * 2, (i * 4 + b) * 2 + 2), 16);
      word = (word << 8) | byte;
    }
    key[i] = word >>> 0;
  }
  return key;
}

/** Creates a ChaCha20 keystream RNG from a 64-hex-character (256-bit) seed. */
export function createRng(seedHex: string): Rng {
  if (!isValidSeed(seedHex)) {
    throw new Error('Seed must be 64 lowercase hex characters (256 bits)');
  }
  const key = seedToKey(seedHex);
  const nonce = [0, 0, 0];
  let counter = 0;
  let block = chacha20Block(key, counter, nonce);
  let index = 0;

  const nextUint32 = (): number => {
    if (index === 16) {
      counter = (counter + 1) >>> 0;
      if (counter === 0) throw new Error('RNG keystream exhausted');
      block = chacha20Block(key, counter, nonce);
      index = 0;
    }
    return block[index++]!;
  };

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
      throw new Error(`nextInt: invalid bound ${maxExclusive}`);
    }
    // Rejection sampling removes modulo bias.
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    for (;;) {
      const value = nextUint32();
      if (value < limit) return value % maxExclusive;
    }
  };

  return { nextUint32, nextInt };
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
