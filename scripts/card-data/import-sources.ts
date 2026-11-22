/**
 * Downloads independent, published Splendor card lists and normalizes them to
 * data/sources/<name>.json (FR-23). Run with: npm run data:import-sources
 *
 * Only public card facts are extracted (level, bonus, points, cost); no code or
 * art from the sources is stored. The normalized files are committed so the
 * cross-check test can run offline.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Gem = 'diamond' | 'sapphire' | 'emerald' | 'ruby' | 'onyx';
type Cost = Partial<Record<Gem, number>>;

export interface SourceCard {
  level: 1 | 2 | 3;
  bonus: Gem;
  points: number;
  cost: Cost;
}

export interface SourceNoble {
  points: number;
  requires: Cost;
}

export interface NormalizedSource {
  name: string;
  url: string;
  retrieved: string;
  notes: string;
  cards: SourceCard[];
  nobles: SourceNoble[] | null;
}

const COLOR_NAMES: Record<string, Gem> = {
  white: 'diamond',
  blue: 'sapphire',
  green: 'emerald',
  red: 'ruby',
  black: 'onyx',
};

function gem(name: string): Gem {
  const color = COLOR_NAMES[name.toLowerCase()];
  if (!color) throw new Error(`Unknown color name: ${name}`);
  return color;
}

function level(n: number): 1 | 2 | 3 {
  if (n === 1 || n === 2 || n === 3) return n;
  throw new Error(`Bad level: ${n}`);
}

async function download(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.text();
}

function parseCostPairs(text: string, pattern: RegExp): Cost {
  const cost: Cost = {};
  for (const m of text.matchAll(pattern)) {
    const n = Number(m[2]);
    if (n > 0) cost[gem(m[1]!)] = n;
  }
  return cost;
}

// Source A: monk-time/splendor-fastest-win (CSV, levels implied by row order).
async function monkTime(): Promise<NormalizedSource> {
  const url = 'https://raw.githubusercontent.com/monk-time/splendor-fastest-win/master/cards.csv';
  const lines = (await download(url)).trim().split(/\r?\n/);
  const header = lines.shift()!.split(',');
  const expected = 'White,Blue,Green,Red,Black,Pt,Bonus';
  if (header.join(',') !== expected) throw new Error(`Unexpected CSV header: ${header.join(',')}`);
  if (lines.length !== 90) throw new Error(`Expected 90 rows, got ${lines.length}`);
  const cards = lines.map((line, row): SourceCard => {
    const [w, u, g, r, k, pt, bonus] = line.split(',');
    const cost: Cost = {};
    const pairs: [Gem, string | undefined][] = [
      ['diamond', w],
      ['sapphire', u],
      ['emerald', g],
      ['ruby', r],
      ['onyx', k],
    ];
    for (const [color, value] of pairs) if (Number(value) > 0) cost[color] = Number(value);
    // Rows are grouped by level: 40 level I, 30 level II, 20 level III.
    const lvl = row < 40 ? 1 : row < 70 ? 2 : 3;
    return { level: lvl, bonus: gem(bonus!), points: Number(pt), cost };
  });
  return {
    name: 'monk-time',
    url,
    retrieved: new Date().toISOString().slice(0, 10),
    notes: 'CSV has no level column; level inferred from row grouping (40/30/20).',
    cards,
    nobles: null,
  };
}

// Source B: COMP90054 (University of Melbourne) Splendor environment, splendor_utils.py.
async function comp90054(): Promise<NormalizedSource> {
  const url =
    'https://raw.githubusercontent.com/P1ckl3Farty/COMP90054-2021S2-FinalProject/main/Splendor/splendor_utils.py';
  const text = await download(url);
  const cardPattern = /'[^']+':\s*\('(\w+)',\s*\{([^}]*)\},\s*(\d),\s*(\d)\)/g;
  const cards = [...text.matchAll(cardPattern)].map((m): SourceCard => ({
    bonus: gem(m[1]!),
    cost: parseCostPairs(m[2]!, /'(\w+)':\s*(\d+)/g),
    level: level(Number(m[3])),
    points: Number(m[4]),
  }));
  const noblesBlock = text.slice(text.indexOf('NOBLES'), text.indexOf('COLOURS'));
  const nobles = [...noblesBlock.matchAll(/\('[^']+',\s*\{([^}]*)\}\)/g)].map((m): SourceNoble => ({
    points: 3,
    requires: parseCostPairs(m[1]!, /'(\w+)':\s*(\d+)/g),
  }));
  return {
    name: 'comp90054',
    url,
    retrieved: new Date().toISOString().slice(0, 10),
    notes: 'Explicit deck id and points per card; nobles listed without points (all worth 3).',
    cards,
    nobles,
  };
}

// Source C: reedstonefood/splendor_game (Ruby), load_cards.rb.
async function reedstonefood(): Promise<NormalizedSource> {
  const url =
    'https://raw.githubusercontent.com/reedstonefood/splendor_game/master/lib/splendor_game/load_cards.rb';
  const text = await download(url);
  const cardPattern = /Card\.new\((\d),\s*:(\w+),\s*\{([^}]*)\}(?:,\s*(\d+))?\)/g;
  const cards = [...text.matchAll(cardPattern)].map((m): SourceCard => ({
    level: level(Number(m[1])),
    bonus: gem(m[2]!),
    cost: parseCostPairs(m[3]!, /:(\w+)\s*=>\s*(\d+)/g),
    points: m[4] ? Number(m[4]) : 0,
  }));
  const nobles = [...text.matchAll(/Noble\.new\(\{([^}]*)\},\s*(\d+)\)/g)].map(
    (m): SourceNoble => ({
      points: Number(m[2]),
      requires: parseCostPairs(m[1]!, /:(\w+)\s*=>\s*(\d+)/g),
    }),
  );
  return {
    name: 'reedstonefood',
    url,
    retrieved: new Date().toISOString().slice(0, 10),
    notes: 'Explicit level and points per card; nobles with points.',
    cards,
    nobles,
  };
}

async function main(): Promise<void> {
  const outDir = path.join(process.cwd(), 'games', 'splendor', 'data', 'sources');
  await mkdir(outDir, { recursive: true });
  for (const load of [monkTime, comp90054, reedstonefood]) {
    const source = await load();
    const file = path.join(outDir, `${source.name}.json`);
    await writeFile(file, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
    console.log(
      `${source.name}: ${source.cards.length} cards, ${source.nobles?.length ?? 0} nobles -> ${file}`,
    );
  }
}

await main();
