import type {
  BlotInfo,
  Combo,
  Contract,
  MatchResult,
  RoundSummary,
  TargetScore,
  TeamIndex,
} from './types';

/** Converts raw trick points to "sai" (tens), rounding .5 down (e.g. 85 -> 8, 86 -> 9). */
export function toSai(points: number): number {
  return Math.floor((points + 4) / 10);
}

export function contractMultiplier(contract: Pick<Contract, 'strain' | 'kontra'>): number {
  if (contract.strain === 'BOY') {
    return ([2, 3, 5] as const)[contract.kontra];
  }
  return ([1, 2, 4] as const)[contract.kontra];
}

export function scoreRound(input: {
  roundNo: number;
  dealer: number;
  contract: Contract;
  trickPoints: [number, number];
  tricksWon: [number, number];
  validCombos: readonly Combo[];
  blot: BlotInfo | null;
  scoresBefore: [number, number];
}): RoundSummary {
  const { roundNo, dealer, contract, trickPoints, tricksWon, validCombos, blot, scoresBefore } =
    input;
  const bidTeam = contract.team;
  const defTeam = (1 - bidTeam) as TeamIndex;
  const mult = contractMultiplier(contract);

  const blotTeam = blot && blot.played === 2 ? blot.team : null;
  const comboPts: [number, number] = [0, 0];
  for (const c of validCombos) comboPts[c.team] += c.points;
  if (blotTeam !== null) comboPts[blotTeam] += 20;

  const sai: [number, number] = [toSai(trickPoints[0]), toSai(trickPoints[1])];
  const bidUnits = comboPts[bidTeam] / 10;
  const defUnits = comboPts[defTeam] / 10;
  const allComboUnits = bidUnits + defUnits;

  const reverseKaput = tricksWon[bidTeam] === 0;
  const kaput = tricksWon[bidTeam] === 8;

  const made =
    !reverseKaput &&
    (contract.kaput ? kaput : trickPoints[bidTeam] + comboPts[bidTeam] >= contract.value * 10);

  const awarded: [number, number] = [0, 0];
  if (reverseKaput) {
    awarded[bidTeam] = 0;
    awarded[defTeam] = contract.value * mult + 25 + allComboUnits;
  } else if (made) {
    const baseBoard = kaput ? 25 : 16;
    if (contract.kontra === 0) {
      awarded[bidTeam] = contract.value * mult + baseBoard - sai[defTeam] + bidUnits;
      awarded[defTeam] = sai[defTeam] + defUnits;
    } else {
      awarded[bidTeam] = contract.value * mult + baseBoard + allComboUnits;
      awarded[defTeam] = 0;
    }
  } else {
    awarded[bidTeam] = 0;
    awarded[defTeam] = contract.value * mult + 16 + allComboUnits;
  }

  const totalsAfter: [number, number] = [
    scoresBefore[0] + awarded[0],
    scoresBefore[1] + awarded[1],
  ];

  return {
    roundNo,
    dealer,
    redeal: false,
    contract,
    made,
    kaput,
    reverseKaput,
    trickPoints,
    tricksWon,
    sai,
    comboPoints: comboPts,
    blotTeam,
    awarded,
    totalsAfter,
  };
}

export function checkMatchEnd(
  scoresBefore: readonly [number, number],
  summary: RoundSummary,
  targetScore: TargetScore,
): MatchResult | null {
  if (summary.redeal || !summary.contract) return null;
  const bidTeam = summary.contract.team;
  const defTeam = (1 - bidTeam) as TeamIndex;
  const after = summary.totalsAfter;

  if (summary.reverseKaput) {
    return { winningTeam: defTeam, reason: 'reverseKaput' };
  }

  if (summary.kaput && summary.contract.kontra === 0) {
    return null;
  }

  if (!summary.made && scoresBefore[bidTeam] >= targetScore) {
    return after[defTeam] > after[bidTeam]
      ? { winningTeam: defTeam, reason: 'targetReached' }
      : null;
  }

  if (after[0] >= targetScore || after[1] >= targetScore) {
    if (after[0] === after[1]) return null;
    return {
      winningTeam: after[0] > after[1] ? 0 : 1,
      reason: 'targetReached',
    };
  }

  return null;
}
