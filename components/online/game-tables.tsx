'use client';

import type { ComponentType } from 'react';
import { BazarBlotTable } from '@/games/bazar-blot/components/BazarBlotTable';
import { GameTable } from '@/games/splendor/components/game/GameTable';
import type { OnlineTableProps } from '@/platform/games/table';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const gameTables: Record<string, ComponentType<OnlineTableProps<any, any>>> = {
  splendor: GameTable,
  'bazar-blot': BazarBlotTable,
};
