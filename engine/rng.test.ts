import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chacha20Block, createRng, isValidSeed, shuffle } from './rng';

function wordsToBytes(words: Uint32Array): Buffer {
  const buf = Buffer.alloc(words.length * 4);
  words.forEach((w, i) => buf.writeUInt32LE(w, i * 4));
  return buf;
}

describe('ChaCha20 block function', () => {
  it('matches the RFC 8439 section 2.3.2 test vector', () => {
    const key = Array.from({ length: 8 }, (_, i) =>
      Buffer.from([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3]).readUInt32LE(0),
    );
    const nonce = [0x09000000, 0x4a000000, 0x00000000];
    const out = wordsToBytes(chacha20Block(key, 1, nonce));
    expect(out.toString('hex')).toBe(
      '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4e' +
        'd2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e',
    );
  });

  it('produces the same keystream as OpenSSL for random seeds', () => {
    for (let trial = 0; trial < 20; trial++) {
      const seed = randomBytes(32);
      const rng = createRng(seed.toString('hex'));
      const ours = Buffer.alloc(64 * 3);
      for (let i = 0; i < 48; i++) ours.writeUInt32LE(rng.nextUint32(), i * 4);
      // OpenSSL chacha20 IV = 32-bit LE counter followed by the 96-bit nonce (all zero here).
      const cipher = createCipheriv('chacha20', seed, Buffer.alloc(16));
      const theirs = cipher.update(Buffer.alloc(64 * 3));
      expect(ours.equals(theirs)).toBe(true);
    }
  });

  it('rejects malformed keys and nonces', () => {
    expect(() => chacha20Block([1, 2, 3], 0, [0, 0, 0])).toThrow();
    expect(() => chacha20Block(new Array(8).fill(0), 0, [0])).toThrow();
  });
});

describe('createRng', () => {
  const seed = 'ab'.repeat(32);

  it('validates seeds', () => {
    expect(isValidSeed(seed)).toBe(true);
    expect(isValidSeed('AB'.repeat(32))).toBe(false);
    expect(isValidSeed('ab'.repeat(31))).toBe(false);
    expect(() => createRng('not-a-seed')).toThrow(/64/);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = createRng(seed);
    const b = createRng(seed);
    const c = createRng('cd'.repeat(32));
    const seqA = Array.from({ length: 50 }, () => a.nextUint32());
    const seqB = Array.from({ length: 50 }, () => b.nextUint32());
    const seqC = Array.from({ length: 50 }, () => c.nextUint32());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('nextInt stays in range and covers every value', () => {
    const rng = createRng(seed);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('nextInt is roughly uniform', () => {
    const rng = createRng(seed);
    const buckets = new Array(10).fill(0);
    const draws = 50_000;
    for (let i = 0; i < draws; i++) buckets[rng.nextInt(10)] += 1;
    for (const count of buckets) expect(Math.abs(count - draws / 10)).toBeLessThan(draws / 50);
  });

  it('nextInt rejects invalid bounds', () => {
    const rng = createRng(seed);
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.nextInt(1.5)).toThrow();
    expect(() => rng.nextInt(2 ** 33)).toThrow();
    expect(rng.nextInt(1)).toBe(0);
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = Array.from({ length: 40 }, (_, i) => i);
    const copy = [...input];
    const out = shuffle(input, createRng('11'.repeat(32)));
    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input);
  });

  it('handles empty and single-element arrays', () => {
    const rng = createRng('22'.repeat(32));
    expect(shuffle([], rng)).toEqual([]);
    expect(shuffle(['x'], rng)).toEqual(['x']);
  });
});
