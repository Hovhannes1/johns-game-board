/**
 * Builds data/packs/base.json from the normalized sources in data/sources.
 * Refuses to write anything if the card lists disagree (FR-23), printing the
 * differences so they can be resolved by hand.
 *
 * Run with: npm run data:build-pack
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cardKey, costKey, diffKeys, nobleKey } from '../../data/canonical';
import type { NormalizedSource, SourceCard, SourceNoble } from './import-sources';

const GEMS = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'] as const;

/** Original flavor names (no artwork or names from the published game). */
const NOBLE_NAMES = [
  'The Doge of Venice',
  'The Duchess of Milan',
  'The Prince of Florence',
  'The Countess of Flanders',
  'The Margrave of Ferrara',
  'The Archduchess of Styria',
  'The Banker of Genoa',
  'The Cardinal of Siena',
  'The Marquise of Mantua',
  'The Elector of Saxony',
];

function sparse(cost: SourceCard['cost']): SourceCard['cost'] {
  const out: SourceCard['cost'] = {};
  for (const g of GEMS) if (cost[g]) out[g] = cost[g];
  return out;
}

function total(cost: SourceCard['cost']): number {
  return GEMS.reduce((sum, g) => sum + (cost[g] ?? 0), 0);
}

async function loadSources(dir: string): Promise<NormalizedSource[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(
      async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as NormalizedSource,
    ),
  );
}

function assertAgreement<T>(
  label: string,
  lists: { name: string; items: T[] }[],
  key: (item: T) => string,
): void {
  const [reference, ...others] = lists;
  if (!reference) throw new Error(`No sources provide ${label}`);
  let ok = true;
  for (const other of others) {
    const diff = diffKeys(reference.items.map(key), other.items.map(key));
    if (diff.missing.length || diff.extra.length) {
      ok = false;
      console.error(`${label}: ${reference.name} vs ${other.name}`, diff);
    }
  }
  if (!ok) throw new Error(`${label}: sources disagree; resolve by hand before building.`);
  console.log(
    `${label}: ${lists.map((l) => l.name).join(', ')} agree (${reference.items.length}).`,
  );
}

async function main(): Promise<void> {
  const root = process.cwd();
  const sources = await loadSources(path.join(root, 'data', 'sources'));
  if (sources.length < 2) throw new Error('Need at least two independent sources (FR-23).');

  assertAgreement(
    'cards',
    sources.map((s) => ({ name: s.name, items: s.cards })),
    cardKey,
  );
  const nobleSources = sources.filter((s) => s.nobles !== null);
  if (nobleSources.length < 2) throw new Error('Need at least two noble sources (FR-23).');
  assertAgreement(
    'nobles',
    nobleSources.map((s) => ({ name: s.name, items: s.nobles! })),
    nobleKey,
  );

  const reference = sources[0]!;

  // Stable ids: per level and bonus color, ordered by points, total cost, then cost vector.
  const cards = [...reference.cards]
    .sort(
      (a, b) =>
        a.level - b.level ||
        GEMS.indexOf(a.bonus) - GEMS.indexOf(b.bonus) ||
        a.points - b.points ||
        total(a.cost) - total(b.cost) ||
        costKey(b.cost).localeCompare(costKey(a.cost)),
    )
    .map((card, _i, all) => {
      const siblings = all.filter((c) => c.level === card.level && c.bonus === card.bonus);
      const n = siblings.indexOf(card) + 1;
      return {
        id: `L${card.level}-${card.bonus}-${String(n).padStart(2, '0')}`,
        level: card.level,
        bonus: card.bonus,
        points: card.points,
        cost: sparse(card.cost),
      };
    });

  const nobles = [...nobleSources[0]!.nobles!]
    .sort(
      (a: SourceNoble, b: SourceNoble) =>
        total(b.requires) - total(a.requires) ||
        costKey(b.requires).localeCompare(costKey(a.requires)),
    )
    .map((noble, i) => ({
      id: `N${String(i + 1).padStart(2, '0')}`,
      name: NOBLE_NAMES[i]!,
      points: noble.points,
      requires: sparse(noble.requires),
    }));

  const pack = {
    format: 'splendor-card-pack@1',
    id: 'base',
    version: '1.0.0',
    name: 'Splendor base game',
    provenance: {
      sources: sources.map((s) => ({ name: s.name, url: s.url, retrieved: s.retrieved })),
      crossCheck: `Cards identical across ${sources.length} sources; nobles identical across ${nobleSources.length} sources.`,
      review: 'pending',
    },
    cards,
    nobles,
  };

  const out = path.join(root, 'data', 'packs', 'base.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${cards.length} cards and ${nobles.length} nobles to ${out}`);
}

await main();
