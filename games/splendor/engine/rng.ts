/**
 * Re-export the shared ChaCha20 RNG from `platform/engine/rng.ts`.
 */
export { chacha20Block, createRng, isValidSeed, shuffle } from '@/platform/engine/rng';
export type { Rng } from '@/platform/engine/rng';
