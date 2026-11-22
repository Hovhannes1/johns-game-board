import { basePack } from '@/games/splendor/data';
import type { CardDef, CardPack, NobleDef } from '@/games/splendor/engine';

/**
 * Static card and noble lookup for packs the client knows about. The full
 * card list is public knowledge; only deck order and blind reserves are secret.
 */
export interface Catalog {
  card(id: string): CardDef | undefined;
  noble(id: string): NobleDef | undefined;
}

const packs: Record<string, CardPack> = { [basePack.id]: basePack };
const cache = new Map<string, Catalog>();

export function catalogFor(packId: string): Catalog {
  const cached = cache.get(packId);
  if (cached) return cached;
  const pack = packs[packId];
  const cards = new Map(pack?.cards.map((c) => [c.id, c]));
  const nobles = new Map(pack?.nobles.map((n) => [n.id, n]));
  const catalog: Catalog = { card: (id) => cards.get(id), noble: (id) => nobles.get(id) };
  cache.set(packId, catalog);
  return catalog;
}
