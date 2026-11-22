/**
 * Order-independent fingerprints for cards and nobles, used to cross-check the
 * pack against independent sources (FR-23).
 */

const GEMS = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'] as const;

type Cost = Partial<Record<(typeof GEMS)[number], number>>;

export function costKey(cost: Cost): string {
  return GEMS.map((g) => cost[g] ?? 0).join('');
}

export function cardKey(card: {
  level: number;
  bonus: string;
  points: number;
  cost: Cost;
}): string {
  return `L${card.level}|${card.bonus}|${card.points}pt|${costKey(card.cost)}`;
}

export function nobleKey(noble: { points: number; requires: Cost }): string {
  return `${noble.points}pt|${costKey(noble.requires)}`;
}

/** Multiset difference report between two key lists; empty arrays mean identical. */
export function diffKeys(
  expected: readonly string[],
  actual: readonly string[],
): { missing: string[]; extra: string[] } {
  const counts = new Map<string, number>();
  for (const k of expected) counts.set(k, (counts.get(k) ?? 0) + 1);
  const extra: string[] = [];
  for (const k of actual) {
    const n = counts.get(k) ?? 0;
    if (n === 0) extra.push(k);
    else counts.set(k, n - 1);
  }
  const missing = [...counts.entries()].flatMap(([k, n]) => Array<string>(n).fill(k));
  return { missing: missing.sort(), extra: extra.sort() };
}
