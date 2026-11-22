import { z } from 'zod';
import { GEM_COLORS, TOKEN_COLORS } from '@/games/splendor/engine/gems';
import type { ActionIntent } from '@/games/splendor/engine/types';
import { idSchema } from '@/platform/room/protocol';

const gem = z.enum(GEM_COLORS);
const tokenCount = z.number().int().min(0).max(10);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const intentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('TAKE_THREE'), colors: z.array(gem).min(1).max(3) }),
  z.strictObject({ type: z.literal('TAKE_TWO'), color: gem }),
  z.strictObject({ type: z.literal('RESERVE_FACE_UP'), cardId: idSchema }),
  z.strictObject({ type: z.literal('RESERVE_FROM_DECK'), level }),
  z.strictObject({ type: z.literal('BUY_FACE_UP'), cardId: idSchema }),
  z.strictObject({ type: z.literal('BUY_RESERVED'), cardId: idSchema }),
  z.strictObject({
    type: z.literal('RETURN_TOKENS'),
    tokens: z.strictObject(
      Object.fromEntries(TOKEN_COLORS.map((c) => [c, tokenCount.optional()])) as Record<
        (typeof TOKEN_COLORS)[number],
        z.ZodOptional<typeof tokenCount>
      >,
    ),
  }),
  z.strictObject({ type: z.literal('CHOOSE_NOBLE'), nobleId: idSchema }),
  z.strictObject({ type: z.literal('PASS') }),
]);

// Compile-time check that the schema produces engine intents.
const _intentCheck = (i: z.infer<typeof intentSchema>): ActionIntent => i;
void _intentCheck;
