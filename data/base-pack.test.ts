import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GEM_COLORS } from '../engine/gems';
import { cardKey, diffKeys, nobleKey } from './canonical';
import baseJson from './packs/base.json';
import { basePack, packSchema, parsePack } from './index';

const sourcesDir = fileURLToPath(new URL('./sources', import.meta.url));
const sources = readdirSync(sourcesDir)
  .filter((f) => f.endsWith('.json'))
  .map(
    (f) =>
      JSON.parse(readFileSync(path.join(sourcesDir, f), 'utf8')) as {
        name: string;
        cards: Parameters<typeof cardKey>[0][];
        nobles: Parameters<typeof nobleKey>[0][] | null;
      },
  );

const byLevel = (level: number) => basePack.cards.filter((c) => c.level === level);

describe('base card pack (FR-22)', () => {
  it('passes the schema', () => {
    expect(packSchema.safeParse(baseJson).success).toBe(true);
  });

  it('has 40 / 30 / 20 cards per level and 10 nobles', () => {
    expect(basePack.cards).toHaveLength(90);
    expect(byLevel(1)).toHaveLength(40);
    expect(byLevel(2)).toHaveLength(30);
    expect(byLevel(3)).toHaveLength(20);
    expect(basePack.nobles).toHaveLength(10);
  });

  it('has an even bonus color distribution per level (8 / 6 / 4)', () => {
    for (const [level, perColor] of [
      [1, 8],
      [2, 6],
      [3, 4],
    ] as const) {
      for (const color of GEM_COLORS) {
        expect(byLevel(level).filter((c) => c.bonus === color)).toHaveLength(perColor);
      }
    }
  });

  it('has the published prestige distribution per level', () => {
    const histogram = (level: number) => {
      const h: Record<number, number> = {};
      for (const c of byLevel(level)) h[c.points] = (h[c.points] ?? 0) + 1;
      return h;
    };
    expect(histogram(1)).toEqual({ 0: 35, 1: 5 });
    expect(histogram(2)).toEqual({ 1: 10, 2: 15, 3: 5 });
    expect(histogram(3)).toEqual({ 3: 5, 4: 10, 5: 5 });
  });

  it('only uses gem colors in costs, with positive totals and no gold', () => {
    for (const c of basePack.cards) {
      expect(Object.keys(c.cost).sort()).toEqual([...GEM_COLORS].sort());
      expect(Object.values(c.cost).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(c.cost).not.toHaveProperty('gold');
    }
  });

  it('has nobles worth 3 that require 4+4 or 3+3+3 bonuses', () => {
    const shapes = basePack.nobles.map((n) =>
      Object.values(n.requires)
        .filter((v) => v > 0)
        .sort()
        .join('+'),
    );
    expect(basePack.nobles.every((n) => n.points === 3)).toBe(true);
    expect(shapes.filter((s) => s === '4+4')).toHaveLength(5);
    expect(shapes.filter((s) => s === '3+3+3')).toHaveLength(5);
  });

  it('uses unique ids', () => {
    const ids = [...basePack.cards, ...basePack.nobles].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cross-check against independent sources (FR-23)', () => {
  const packCards = baseJson.cards.map(cardKey);
  const packNobles = baseJson.nobles.map(nobleKey);

  it('has at least two independent card sources and two noble sources', () => {
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.filter((s) => s.nobles).length).toBeGreaterThanOrEqual(2);
  });

  for (const source of sources) {
    it(`matches every card in ${source.name}`, () => {
      expect(diffKeys(source.cards.map(cardKey), packCards)).toEqual({ missing: [], extra: [] });
    });
    if (source.nobles) {
      it(`matches every noble in ${source.name}`, () => {
        expect(diffKeys(source.nobles!.map(nobleKey), packNobles)).toEqual({
          missing: [],
          extra: [],
        });
      });
    }
  }
});

describe('pack parsing', () => {
  type LoosePack = Record<string, unknown> & {
    cards: { id: string; cost: Record<string, number> }[];
  };
  const clone = () => JSON.parse(JSON.stringify(baseJson)) as LoosePack;

  it('rejects unknown fields, gold costs, duplicate ids and empty costs', () => {
    expect(() => parsePack(clone())).not.toThrow();

    const extraField = clone();
    extraField.surprise = true;
    expect(() => parsePack(extraField)).toThrow();

    const gold = clone();
    gold.cards[0]!.cost.gold = 1;
    expect(() => parsePack(gold)).toThrow();

    const dup = clone();
    dup.cards[1]!.id = dup.cards[0]!.id;
    expect(() => parsePack(dup)).toThrow(/duplicate/);

    const empty = clone();
    empty.cards[0]!.cost = {};
    expect(() => parsePack(empty)).toThrow();
  });
});
