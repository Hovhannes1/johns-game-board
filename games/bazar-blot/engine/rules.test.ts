import { describe, expect, it } from 'vitest';
import {
  CARD_IDS,
  actionsFromLog,
  applyAction,
  autoIntent,
  checkMatchEnd,
  compareCombos,
  createGame,
  detectBlot,
  detectCombos,
  getPublicView,
  isValidBid,
  legalCards,
  playCardError,
  replayGame,
  resolveCombos,
  scoreRound,
  toSai,
  trickWinner,
} from './index';
import type { CardId, Combo, Contract, GameState } from './index';

const SEED = '0123456789abcdef'.repeat(4);
const SEATS = [
  { id: 'p0', name: 'Anna' },
  { id: 'p1', name: 'Ben' },
  { id: 'p2', name: 'Cleo' },
  { id: 'p3', name: 'Dan' },
];

describe('bazar-blot cards & play', () => {
  it('determines trick winner in trump and Boy contracts', () => {
    expect(
      trickWinner(
        [
          { seat: 0, card: 'AS' },
          { seat: 1, card: '10S' },
          { seat: 2, card: '7H' },
          { seat: 3, card: '9H' },
        ],
        'H',
      ).seat,
    ).toBe(3);

    expect(
      trickWinner(
        [
          { seat: 0, card: '9H' },
          { seat: 1, card: 'JH' },
          { seat: 2, card: 'AH' },
          { seat: 3, card: 'KH' },
        ],
        'H',
      ).seat,
    ).toBe(1);

    expect(
      trickWinner(
        [
          { seat: 0, card: '10S' },
          { seat: 1, card: 'JS' },
          { seat: 2, card: 'AH' },
          { seat: 3, card: 'AS' },
        ],
        'BOY',
      ).seat,
    ).toBe(3);
  });

  it('enforces follow-suit, must-trump, must-overtrump, and partner exception', () => {
    const hand: CardId[] = ['7S', 'AS', '9H', 'KH', '8D'];
    // Must follow led suit S
    expect(legalCards(hand, [{ seat: 0, card: '10S' }], 'H', 1)).toEqual(['7S', 'AS']);
    expect(playCardError(hand, [{ seat: 0, card: '10S' }], 'H', 1, '9H')).toBe('MUST_FOLLOW_SUIT');

    // Void in led suit C, opponent winning, JH on table -> must overtrump? No, 9H < JH so any trump is ok
    expect(
      legalCards(
        hand,
        [
          { seat: 0, card: 'AC' },
          { seat: 1, card: 'JH' },
        ],
        'H',
        2,
      ),
    ).toEqual(['9H', 'KH']);

    // Void in led suit C, opponent played KH -> must overtrump with 9H
    expect(
      legalCards(
        hand,
        [
          { seat: 0, card: 'AC' },
          { seat: 1, card: 'KH' },
        ],
        'H',
        2,
      ),
    ).toEqual(['9H']);
    expect(
      playCardError(
        hand,
        [
          { seat: 0, card: 'AC' },
          { seat: 1, card: 'KH' },
        ],
        'H',
        2,
        '8D',
      ),
    ).toBe('MUST_TRUMP');

    // Partner (seat 0) is winning -> any card allowed when void
    expect(
      legalCards(
        hand,
        [
          { seat: 0, card: 'AC' },
          { seat: 1, card: '10C' },
        ],
        'H',
        2,
      ),
    ).toEqual(hand);

    // Boy contract -> void in led suit allows any card
    expect(legalCards(hand, [{ seat: 0, card: 'AC' }], 'BOY', 1)).toEqual(hand);
  });
});

describe('bazar-blot bidding', () => {
  it('validates bid ordering and kaput progression', () => {
    expect(isValidBid(null, { value: 8, strain: 'S', kaput: false })).toBe(true);
    expect(isValidBid(null, { value: 7, strain: 'S', kaput: false })).toBe(false);
    expect(
      isValidBid(
        { seat: 0, bid: { value: 10, strain: 'H', kaput: false } },
        { value: 10, strain: 'S', kaput: false },
      ),
    ).toBe(false);
    expect(
      isValidBid(
        { seat: 0, bid: { value: 10, strain: 'H', kaput: false } },
        { value: 8, strain: 'S', kaput: true },
      ),
    ).toBe(true);
    expect(
      isValidBid(
        { seat: 0, bid: { value: 8, strain: 'S', kaput: true } },
        { value: 25, strain: 'H', kaput: false },
      ),
    ).toBe(false);
    expect(
      isValidBid(
        { seat: 0, bid: { value: 8, strain: 'S', kaput: true } },
        { value: 9, strain: 'H', kaput: true },
      ),
    ).toBe(true);
  });

  it('handles all-pass redeal and dealer rotation', () => {
    let state = createGame({ players: SEATS, startingPlayerIndex: 0 }, SEED);
    expect(state.dealer).toBe(3);
    expect(state.currentSeat).toBe(0);
    for (let i = 0; i < 4; i++) {
      const res = applyAction(state, { type: 'PASS', playerId: `p${i}` });
      expect(res.ok).toBe(true);
      if (res.ok) state = res.state;
    }
    expect(state.roundNo).toBe(2);
    expect(state.dealer).toBe(0);
    expect(state.currentSeat).toBe(1);
    expect(state.rounds[0]?.redeal).toBe(true);
  });

  it('handles Kontra and Rekontra turn flow', () => {
    let state = createGame({ players: SEATS, startingPlayerIndex: 0 }, SEED);
    // p0 bids 9H
    state = (
      applyAction(state, { type: 'BID', value: 9, strain: 'H', kaput: false, playerId: 'p0' }) as {
        ok: true;
        state: GameState;
      }
    ).state;
    // p0 cannot be kontra'd by p1 if p1's turn -> p1 CAN kontra (defender)
    expect(applyAction(state, { type: 'REKONTRA', playerId: 'p1' }).ok).toBe(false);
    state = (
      applyAction(state, { type: 'KONTRA', playerId: 'p1' }) as { ok: true; state: GameState }
    ).state;
    expect(state.phase).toBe('kontra');
    // Responders are p2 then p0
    expect(state.currentSeat).toBe(2);
    state = (applyAction(state, { type: 'PASS', playerId: 'p2' }) as { ok: true; state: GameState })
      .state;
    expect(state.currentSeat).toBe(0);
    state = (
      applyAction(state, { type: 'REKONTRA', playerId: 'p0' }) as { ok: true; state: GameState }
    ).state;
    expect(state.phase).toBe('playing');
    expect(state.contract?.kontra).toBe(2);
    expect(state.currentSeat).toBe(0); // leader is nextSeat(dealer=3) = 0
  });
});

describe('bazar-blot combos & blot', () => {
  it('detects sequences, overlaps, and four-of-a-kinds', () => {
    const hand: CardId[] = ['9S', '10S', 'JS', 'QS', 'KS', 'JH', 'JD', 'JC'];
    const trumpCombos = detectCombos(hand, 0, 'H');
    expect(trumpCombos.find((c) => c.kind === 'HUNDRED')?.points).toBe(100);
    expect(trumpCombos.find((c) => c.kind === 'FOUR')?.points).toBe(200);

    const boyCombos = detectCombos(hand, 0, 'BOY');
    expect(boyCombos.find((c) => c.kind === 'FOUR')?.points).toBe(100);
  });

  it('applies combo priority: value -> four beats 100 -> top card -> trump -> seat order', () => {
    const c100: Combo = {
      id: '1',
      seat: 0,
      team: 0,
      kind: 'HUNDRED',
      cards: ['7S', '8S', '9S', '10S', 'JS'],
      points: 100,
      topRank: 'J',
      suit: 'S',
    };
    const cFourQ: Combo = {
      id: '2',
      seat: 1,
      team: 1,
      kind: 'FOUR',
      cards: ['QS', 'QH', 'QD', 'QC'],
      points: 100,
      topRank: 'Q',
      suit: null,
    };
    expect(compareCombos(cFourQ, c100, 'H', 3)).toBeGreaterThan(0);

    const terzH: Combo = {
      id: '3',
      seat: 1,
      team: 1,
      kind: 'TERZ',
      cards: ['7H', '8H', '9H'],
      points: 20,
      topRank: '9',
      suit: 'H',
    };
    const terzS: Combo = {
      id: '4',
      seat: 0,
      team: 0,
      kind: 'TERZ',
      cards: ['7S', '8S', '9S'],
      points: 20,
      topRank: '9',
      suit: 'S',
    };
    expect(compareCombos(terzH, terzS, 'H', 3)).toBeGreaterThan(0);
    // In Boy, seat 0 (first from dealer=3) beats seat 1
    expect(compareCombos(terzS, terzH, 'BOY', 3)).toBeGreaterThan(0);

    const resolved = resolveCombos([[terzS], [terzH], [], []], 'H', 3);
    expect(resolved.winningTeam).toBe(1);
    expect(resolved.valid).toEqual([terzH]);
  });

  it('detects Blot-Reblot in trump contracts only', () => {
    const hands: CardId[][] = [
      ['KH', 'QH', '7S', '8S', '9S', '10S', 'JS', 'AS'],
      ['7H', '8H', '9H', '10H', 'JH', 'AH', '7D', '8D'],
      ['9D', '10D', 'JD', 'QD', 'KD', 'AD', '7C', '8C'],
      ['9C', '10C', 'JC', 'QC', 'KC', 'AC', 'QS', 'KS'],
    ];
    expect(detectBlot(hands, 'H')).toEqual({ seat: 0, team: 0, played: 0 });
    expect(detectBlot(hands, 'BOY')).toBeNull();
  });
});

describe('bazar-blot scoring & match end', () => {
  it('rounds .5 down in sai conversion', () => {
    expect(toSai(84)).toBe(8);
    expect(toSai(85)).toBe(8);
    expect(toSai(86)).toBe(9);
    expect(toSai(77)).toBe(8);
    expect(toSai(162)).toBe(16);
  });

  it('scores contract made, Kontra, failed, kaput, and reverse kaput', () => {
    const baseContract: Contract = {
      seat: 0,
      team: 0,
      value: 10,
      strain: 'H',
      kaput: false,
      kontra: 0,
    };
    const made = scoreRound({
      roundNo: 1,
      dealer: 3,
      contract: baseContract,
      trickPoints: [98, 64],
      tricksWon: [5, 3],
      validCombos: [
        {
          id: '1',
          seat: 0,
          team: 0,
          kind: 'TERZ',
          cards: ['7S', '8S', '9S'],
          points: 20,
          topRank: '9',
          suit: 'S',
        },
      ],
      blot: null,
      scoresBefore: [0, 0],
    });
    expect(made.made).toBe(true);
    // 10*1 + 16 - 6 + 2 = 22 | 6
    expect(made.awarded).toEqual([22, 6]);

    const kontraMade = scoreRound({
      roundNo: 1,
      dealer: 3,
      contract: { ...baseContract, kontra: 1 },
      trickPoints: [100, 62],
      tricksWon: [5, 3],
      validCombos: [],
      blot: null,
      scoresBefore: [0, 0],
    });
    expect(kontraMade.awarded).toEqual([36, 0]);

    const failed = scoreRound({
      roundNo: 1,
      dealer: 3,
      contract: { ...baseContract, strain: 'BOY', kontra: 2 },
      trickPoints: [60, 102],
      tricksWon: [3, 5],
      validCombos: [],
      blot: null,
      scoresBefore: [0, 0],
    });
    expect(failed.made).toBe(false);
    // 10*5 + 16 = 66
    expect(failed.awarded).toEqual([0, 66]);

    const revKaput = scoreRound({
      roundNo: 1,
      dealer: 3,
      contract: baseContract,
      trickPoints: [0, 162],
      tricksWon: [0, 8],
      validCombos: [],
      blot: null,
      scoresBefore: [140, 0],
    });
    expect(revKaput.reverseKaput).toBe(true);
    expect(revKaput.awarded).toEqual([0, 35]);
    expect(checkMatchEnd([140, 0], revKaput, 151)).toEqual({
      winningTeam: 1,
      reason: 'reverseKaput',
    });
  });

  it('enforces kaput and failing-leader match end exceptions', () => {
    const c: Contract = { seat: 0, team: 0, value: 10, strain: 'H', kaput: false, kontra: 0 };
    // Non-kontra kaput does not end match
    const kaputSummary = scoreRound({
      roundNo: 1,
      dealer: 3,
      contract: c,
      trickPoints: [162, 0],
      tricksWon: [8, 0],
      validCombos: [],
      blot: null,
      scoresBefore: [130, 50],
    });
    expect(checkMatchEnd([130, 50], kaputSummary, 151)).toBeNull();

    // Kontra'd kaput DOES end match
    const kontraKaput = scoreRound({
      roundNo: 1,
      dealer: 3,
      contract: { ...c, kontra: 1 },
      trickPoints: [162, 0],
      tricksWon: [8, 0],
      validCombos: [],
      blot: null,
      scoresBefore: [130, 50],
    });
    expect(checkMatchEnd([130, 50], kontraKaput, 151)).toEqual({
      winningTeam: 0,
      reason: 'targetReached',
    });

    // Leading team (>= target) fails bid -> only ends if defenders overtake
    const leaderFailsStillAhead = scoreRound({
      roundNo: 5,
      dealer: 3,
      contract: c,
      trickPoints: [70, 92],
      tricksWon: [4, 4],
      validCombos: [],
      blot: null,
      scoresBefore: [160, 100],
    });
    expect(checkMatchEnd([160, 100], leaderFailsStillAhead, 151)).toBeNull();

    const leaderFailsOvertaken = scoreRound({
      roundNo: 5,
      dealer: 3,
      contract: c,
      trickPoints: [70, 92],
      tricksWon: [4, 4],
      validCombos: [],
      blot: null,
      scoresBefore: [152, 140],
    });
    expect(checkMatchEnd([152, 140], leaderFailsOvertaken, 151)).toEqual({
      winningTeam: 1,
      reason: 'targetReached',
    });
  });
});

describe('bazar-blot view redaction, autoIntent & replay', () => {
  it('redacts opponent hands and seed, and replays identically', () => {
    let state = createGame({ players: SEATS, startingPlayerIndex: 0 }, SEED);
    const v0 = getPublicView(state, 'p0');
    expect(v0.players[0]!.hand).toHaveLength(8);
    expect(v0.players[1]!.hand).toBeNull();
    expect(v0.players[2]!.hand).toBeNull();
    expect(v0.players[3]!.hand).toBeNull();
    expect(JSON.stringify(v0)).not.toContain(SEED);

    const spec = getPublicView(state, null);
    expect(spec.viewerSeat).toBeNull();
    expect(spec.players.every((p) => p.hand === null)).toBe(true);

    // Bid 8H, then 3 passes, then play 1 trick with autoIntent
    state = (
      applyAction(state, { type: 'BID', value: 8, strain: 'H', kaput: false, playerId: 'p0' }) as {
        ok: true;
        state: GameState;
      }
    ).state;
    for (let i = 0; i < 7; i++) {
      const cur = state.players[state.currentSeat]!.id;
      const intent = autoIntent(state, cur)!;
      const res = applyAction(state, { ...intent, playerId: cur });
      expect(res.ok).toBe(true);
      if (res.ok) state = res.state;
    }

    const replayed = replayGame(
      { players: SEATS, startingPlayerIndex: 0 },
      SEED,
      actionsFromLog(state),
    );
    expect(replayed).toEqual(state);
    expect(CARD_IDS).toHaveLength(32);
  });
});
