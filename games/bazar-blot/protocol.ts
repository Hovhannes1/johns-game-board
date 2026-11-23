import { z } from 'zod';
import { CARD_IDS } from '@/games/bazar-blot/engine/cards';
import type { ActionIntent } from '@/games/bazar-blot/engine/types';
import { MAX_BID, MIN_BID } from '@/games/bazar-blot/engine/types';

const strainSchema = z.enum(['S', 'H', 'D', 'C', 'BOY']);
const cardSchema = z.enum(CARD_IDS);

export const intentSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('BID'),
    value: z.number().int().min(MIN_BID).max(MAX_BID),
    strain: strainSchema,
    kaput: z.boolean(),
  }),
  z.strictObject({ type: z.literal('PASS') }),
  z.strictObject({ type: z.literal('KONTRA') }),
  z.strictObject({ type: z.literal('REKONTRA') }),
  z.strictObject({ type: z.literal('DECLARE_BONUS') }),
  z.strictObject({ type: z.literal('PLAY'), card: cardSchema }),
]);

// Compile-time check that the schema produces engine intents.
const _intentCheck = (i: z.infer<typeof intentSchema>): ActionIntent => i;
void _intentCheck;
