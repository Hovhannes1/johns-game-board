import { cardPoints, makeCardId } from './cards';
import type { Suit } from './cards';
import { canKontra, canRekontra, isValidBid } from './bidding';
import { detectBlot, detectCombos, resolveCombos } from './combos';
import type { RuleError } from './errors';
import { ruleError } from './errors';
import { playCardError, trickWinner } from './play';
import { checkMatchEnd, scoreRound } from './scoring';
import { dealHands } from './setup';
import type { Contract, GameAction, GameState } from './types';
import { nextSeat, teamOf } from './types';

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: RuleError };

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function startNewRound(state: GameState, dealer: number): void {
  const roundNo = state.roundNo + 1;
  const firstSeat = nextSeat(dealer);
  state.roundNo = roundNo;
  state.dealer = dealer;
  state.currentSeat = firstSeat;
  state.phase = 'bidding';
  state.hands = dealHands(state.seed, roundNo);
  state.bidding = {
    calls: [],
    high: null,
    passesInRow: 0,
    kontraBy: null,
    responders: [],
  };
  state.contract = null;
  state.trick = { leader: firstSeat, plays: [] };
  state.captured = { points: [0, 0], tricks: [0, 0] };
  state.combos = {
    bySeat: [[], [], [], []],
    declaredSeats: [false, false, false, false],
    resolved: null,
    blot: null,
  };
}

function finalizeContract(state: GameState, kontra: 0 | 1 | 2): void {
  const high = state.bidding.high!;
  const contract: Contract = {
    seat: high.seat,
    team: teamOf(high.seat),
    value: high.bid.value,
    strain: high.bid.strain,
    kaput: high.bid.kaput,
    kontra,
  };
  state.contract = contract;
  state.phase = 'playing';
  const leader = nextSeat(state.dealer);
  state.currentSeat = leader;
  state.trick = { leader, plays: [] };
  state.combos = {
    bySeat: state.hands.map((hand, seat) => detectCombos(hand, seat, contract.strain)),
    declaredSeats: [false, false, false, false],
    resolved: null,
    blot: detectBlot(state.hands, contract.strain),
  };
}

export function applyAction(state: GameState, action: GameAction): ApplyResult {
  if (state.status === 'finished') {
    return { ok: false, error: ruleError('GAME_FINISHED') };
  }
  const seat = state.players.findIndex((p) => p.id === action.playerId);
  if (seat === -1 || seat !== state.currentSeat) {
    return { ok: false, error: ruleError('NOT_YOUR_TURN') };
  }

  const next = cloneState(state);
  const { playerId, ...intent } = action;
  next.log.push({ version: state.version, playerId, seat, action: intent });
  next.version += 1;
  next.turnSeq += 1;

  if (intent.type === 'BID') {
    if (next.phase !== 'bidding') {
      return { ok: false, error: ruleError('WRONG_PHASE') };
    }
    const bid = { value: intent.value, strain: intent.strain, kaput: intent.kaput };
    if (!isValidBid(next.bidding.high, bid)) {
      return { ok: false, error: ruleError('INVALID_BID') };
    }
    next.bidding.calls.push({ seat, type: 'BID', bid });
    next.bidding.high = { seat, bid };
    next.bidding.passesInRow = 0;
    next.currentSeat = nextSeat(seat);
    return { ok: true, state: next };
  }

  if (intent.type === 'KONTRA') {
    if (!canKontra(next, seat)) {
      return { ok: false, error: ruleError('CANNOT_KONTRA') };
    }
    next.bidding.calls.push({ seat, type: 'KONTRA' });
    next.bidding.kontraBy = seat;
    next.phase = 'kontra';
    const responders = [nextSeat(seat), nextSeat(nextSeat(nextSeat(seat)))];
    next.bidding.responders = responders;
    next.currentSeat = responders[0]!;
    return { ok: true, state: next };
  }

  if (intent.type === 'REKONTRA') {
    if (!canRekontra(next, seat)) {
      return { ok: false, error: ruleError('CANNOT_REKONTRA') };
    }
    next.bidding.calls.push({ seat, type: 'REKONTRA' });
    finalizeContract(next, 2);
    return { ok: true, state: next };
  }

  if (intent.type === 'PASS') {
    if (next.phase === 'bidding') {
      next.bidding.calls.push({ seat, type: 'PASS' });
      next.bidding.passesInRow += 1;
      if (next.bidding.passesInRow >= 4) {
        if (!next.bidding.high) {
          next.rounds.push({
            roundNo: next.roundNo,
            dealer: next.dealer,
            redeal: true,
            totalsAfter: [...next.scores] as [number, number],
          });
          startNewRound(next, nextSeat(next.dealer));
        } else {
          finalizeContract(next, 0);
        }
      } else {
        next.currentSeat = nextSeat(seat);
      }
      return { ok: true, state: next };
    }
    if (next.phase === 'kontra') {
      next.bidding.calls.push({ seat, type: 'PASS' });
      const remaining = next.bidding.responders.slice(1);
      next.bidding.responders = remaining;
      if (remaining.length === 0) {
        finalizeContract(next, 1);
      } else {
        next.currentSeat = remaining[0]!;
      }
      return { ok: true, state: next };
    }
    return { ok: false, error: ruleError('WRONG_PHASE') };
  }

  if (intent.type === 'DECLARE_BONUS') {
    if (
      next.phase !== 'playing' ||
      next.hands[seat]!.length !== 8 ||
      next.combos.declaredSeats[seat] ||
      next.combos.bySeat[seat]!.length === 0
    ) {
      return { ok: false, error: ruleError('CANNOT_DECLARE_BONUS') };
    }
    next.combos.declaredSeats[seat] = true;
    next.turnSeq -= 1;
    return { ok: true, state: next };
  }

  if (intent.type === 'PLAY') {
    if (next.phase !== 'playing' || !next.contract) {
      return { ok: false, error: ruleError('WRONG_PHASE') };
    }
    const hand = next.hands[seat]!;
    const err = playCardError(hand, next.trick.plays, next.contract.strain, seat, intent.card);
    if (err) {
      return { ok: false, error: ruleError(err) };
    }

    // Remove card from hand and add to trick
    next.hands[seat] = hand.filter((c) => c !== intent.card);
    next.trick.plays.push({ seat, card: intent.card });

    // Track Blot-Reblot if K or Q of trump is played
    if (next.combos.blot && next.combos.blot.seat === seat && next.contract.strain !== 'BOY') {
      const trump = next.contract.strain as Suit;
      if (intent.card === makeCardId('K', trump) || intent.card === makeCardId('Q', trump)) {
        next.combos.blot.played = Math.min(2, next.combos.blot.played + 1) as 0 | 1 | 2;
      }
    }

    if (next.trick.plays.length < 4) {
      next.currentSeat = nextSeat(seat);
      return { ok: true, state: next };
    }

    // Trick complete
    const winnerPlay = trickWinner(next.trick.plays, next.contract.strain);
    const winnerTeam = teamOf(winnerPlay.seat);
    let trickPts = 0;
    for (const p of next.trick.plays) {
      trickPts += cardPoints(p.card, next.contract.strain);
    }
    const isLastTrick = next.captured.tricks[0] + next.captured.tricks[1] === 7;
    if (isLastTrick) trickPts += 10;

    next.captured.points[winnerTeam] += trickPts;
    next.captured.tricks[winnerTeam] += 1;
    next.lastTrick = {
      leader: next.trick.leader,
      winner: winnerPlay.seat,
      plays: next.trick.plays,
    };
    next.trick = { leader: winnerPlay.seat, plays: [] };

    // After trick 1, resolve only combinations that players explicitly declared via Bonus
    if (next.combos.resolved === null) {
      const declared = next.combos.bySeat.map((list, s) =>
        next.combos.declaredSeats[s] ? list : [],
      );
      next.combos.resolved = resolveCombos(declared, next.contract.strain, next.dealer);
    }

    if (!isLastTrick) {
      next.currentSeat = winnerPlay.seat;
      return { ok: true, state: next };
    }

    // Round complete (all 8 tricks played)
    const scoresBefore: [number, number] = [next.scores[0], next.scores[1]];
    const summary = scoreRound({
      roundNo: next.roundNo,
      dealer: next.dealer,
      contract: next.contract,
      trickPoints: next.captured.points,
      tricksWon: next.captured.tricks,
      validCombos: next.combos.resolved.valid,
      blot: next.combos.blot,
      scoresBefore,
    });
    next.scores = [...summary.totalsAfter] as [number, number];
    next.rounds.push(summary);

    const matchResult = checkMatchEnd(scoresBefore, summary, next.options.targetScore);
    if (matchResult) {
      next.status = 'finished';
      next.result = matchResult;
    } else {
      startNewRound(next, nextSeat(next.dealer));
    }
    return { ok: true, state: next };
  }

  return { ok: false, error: ruleError('MALFORMED_ACTION') };
}
