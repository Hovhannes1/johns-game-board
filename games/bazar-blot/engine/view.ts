import type { CardId } from './cards';
import { canKontra, canRekontra } from './bidding';
import { legalCards } from './play';
import type {
  Bid,
  BidCall,
  Combo,
  ComboKind,
  CompletedTrick,
  Contract,
  GameState,
  MatchResult,
  Phase,
  PlayerSeat,
  RoundSummary,
  TargetScore,
  TeamIndex,
  TrickPlay,
} from './types';

export interface AnnouncedComboSummary {
  seat: number;
  kind: ComboKind;
  points: number;
}

export interface PlayerView extends PlayerSeat {
  seat: number;
  team: TeamIndex;
  handCount: number;
  /** Only populated for the viewer themselves. */
  hand: CardId[] | null;
}

export interface GameView {
  version: number;
  status: 'playing' | 'finished';
  targetScore: TargetScore;
  roundNo: number;
  dealer: number;
  currentSeat: number;
  viewerSeat: number | null;
  phase: Phase;
  players: PlayerView[];
  bidding: {
    calls: BidCall[];
    high: { seat: number; bid: Bid } | null;
    kontraBy: number | null;
    canKontra: boolean;
    canRekontra: boolean;
  };
  contract: Contract | null;
  trick: {
    leader: number;
    plays: TrickPlay[];
  };
  lastTrick: CompletedTrick | null;
  legalCards: CardId[];
  tricksWon: [number, number];
  combos: {
    canDeclareBonus: boolean;
    announced: AnnouncedComboSummary[];
    revealed: Combo[] | null;
    winningTeam: TeamIndex | null;
    blot: { seat: number; team: TeamIndex } | null;
  };
  scores: [number, number];
  rounds: RoundSummary[];
  result: MatchResult | null;
}

export function getPublicView(state: GameState, viewerId: string | null): GameView {
  const viewerSeatIdx = viewerId ? state.players.findIndex((p) => p.id === viewerId) : -1;
  const viewerSeat = viewerSeatIdx >= 0 ? viewerSeatIdx : null;

  const players: PlayerView[] = state.players.map((p, seat) => ({
    id: p.id,
    name: p.name,
    seat,
    team: (seat % 2) as TeamIndex,
    handCount: state.hands[seat]!.length,
    hand: viewerSeat === seat ? [...state.hands[seat]!] : null,
  }));

  const announced: AnnouncedComboSummary[] = [];
  for (let s = 0; s < 4; s++) {
    if (!state.combos.declaredSeats[s]) continue;
    for (const c of state.combos.bySeat[s]!) {
      announced.push({ seat: s, kind: c.kind, points: c.points });
    }
  }

  const blotRevealed =
    state.combos.blot && state.combos.blot.played === 2
      ? { seat: state.combos.blot.seat, team: state.combos.blot.team }
      : null;

  const isViewerTurn =
    viewerSeat !== null && viewerSeat === state.currentSeat && state.status === 'playing';
  const tricksPlayed = state.captured.tricks[0] + state.captured.tricks[1];
  const canDeclareBonus =
    isViewerTurn &&
    state.phase === 'playing' &&
    state.hands[viewerSeat]!.length === 8 &&
    !state.combos.declaredSeats[viewerSeat] &&
    state.combos.bySeat[viewerSeat]!.length > 0;

  return {
    version: state.version,
    status: state.status,
    targetScore: state.options.targetScore,
    roundNo: state.roundNo,
    dealer: state.dealer,
    currentSeat: state.currentSeat,
    viewerSeat,
    phase: state.phase,
    players,
    bidding: {
      calls: [...state.bidding.calls],
      high: state.bidding.high ? { ...state.bidding.high } : null,
      kontraBy: state.bidding.kontraBy,
      canKontra: isViewerTurn && canKontra(state, viewerSeat),
      canRekontra: isViewerTurn && canRekontra(state, viewerSeat),
    },
    contract: state.contract ? { ...state.contract } : null,
    trick: {
      leader: state.trick.leader,
      plays: [...state.trick.plays],
    },
    lastTrick: state.lastTrick ? { ...state.lastTrick, plays: [...state.lastTrick.plays] } : null,
    legalCards:
      isViewerTurn && state.phase === 'playing' && state.contract
        ? legalCards(state.hands[viewerSeat]!, state.trick.plays, state.contract.strain, viewerSeat)
        : [],
    tricksWon: [...state.captured.tricks] as [number, number],
    combos: {
      canDeclareBonus,
      announced,
      revealed:
        state.combos.resolved && tricksPlayed < 2
          ? state.combos.resolved.valid.map((c) => ({ ...c }))
          : null,
      winningTeam: state.combos.resolved ? state.combos.resolved.winningTeam : null,
      blot: blotRevealed,
    },
    scores: [...state.scores] as [number, number],
    rounds: state.rounds.map((r) => ({ ...r })),
    result: state.result ? { ...state.result } : null,
  };
}
