import type { CardPack } from '../engine/types';
import baseJson from './packs/base.json';
import { parsePack } from './schema';

/** The base game: 90 development cards and 10 nobles, validated on load. */
export const basePack: CardPack = parsePack(baseJson);

export { packSchema, parsePack } from './schema';
