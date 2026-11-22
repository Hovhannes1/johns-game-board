/**
 * Card pack file format (FR-22, FR-24). A pack is plain JSON so expansions and
 * house variants can be added without code changes. Costs are sparse in the
 * file and expanded to full counts when loaded.
 */
import { z } from 'zod';
import { GEM_COLORS, toGemCounts } from '../engine/gems';
import type { CardPack } from '../engine/types';

const count = z.number().int().min(0).max(20);

const sparseGems = z
  .strictObject({
    diamond: count.optional(),
    sapphire: count.optional(),
    emerald: count.optional(),
    ruby: count.optional(),
    onyx: count.optional(),
  })
  .refine((c) => GEM_COLORS.some((g) => (c[g] ?? 0) > 0), 'must require at least one gem');

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'ids are short slugs');

export const cardSchema = z.strictObject({
  id,
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  bonus: z.enum(GEM_COLORS),
  points: z.number().int().min(0).max(10),
  cost: sparseGems,
});

export const nobleSchema = z.strictObject({
  id,
  name: z.string().min(1).max(60),
  points: z.number().int().min(0).max(10),
  requires: sparseGems,
});

export const packSchema = z
  .strictObject({
    format: z.literal('splendor-card-pack@1'),
    id,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
    name: z.string().min(1).max(80),
    provenance: z
      .strictObject({
        sources: z.array(
          z.strictObject({ name: z.string(), url: z.url(), retrieved: z.iso.date() }),
        ),
        crossCheck: z.string(),
        review: z.enum(['pending', 'approved']),
      })
      .optional(),
    cards: z.array(cardSchema).min(1),
    nobles: z.array(nobleSchema),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    for (const item of [...pack.cards, ...pack.nobles]) {
      if (seen.has(item.id)) ctx.addIssue({ code: 'custom', message: `duplicate id ${item.id}` });
      seen.add(item.id);
    }
  });

export type PackFile = z.infer<typeof packSchema>;

/** Validates raw JSON and converts it to the engine's CardPack shape. */
export function parsePack(json: unknown): CardPack {
  const file = packSchema.parse(json);
  return {
    id: file.id,
    version: file.version,
    name: file.name,
    cards: file.cards.map((c) => ({ ...c, cost: toGemCounts(c.cost) })),
    nobles: file.nobles.map((n) => ({ ...n, requires: toGemCounts(n.requires) })),
  };
}
