import { basePack } from '@/games/splendor/data';
import {
  applyAction,
  autoIntent,
  createGame,
  getPublicView,
  replayGame,
} from '@/games/splendor/engine';
import type { ActionIntent, GameAction, GameState, GameView } from '@/games/splendor/engine';
import { strings } from '@/games/splendor/lib/strings';
import { intentSchema } from '@/games/splendor/protocol';
import type { GameModule } from '@/platform/games/types';

export const splendorModule: GameModule<GameState, ActionIntent, GameAction, GameView> = {
  id: 'splendor',
  title: strings.appName,
  tagline: strings.tagline,
  minPlayers: 2,
  maxPlayers: 4,
  intentSchema,

  create(config, seed) {
    return createGame(
      {
        players: config.players,
        pack: basePack,
        ...(config.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: config.startingPlayerIndex }),
      },
      seed,
    );
  },

  apply(state, playerId, intent) {
    const result = applyAction(state, { ...intent, playerId } as GameAction);
    return result.ok ? { ok: true, state: result.state } : { ok: false, error: result.error };
  },

  replay(record) {
    return replayGame(
      {
        players: record.seats,
        pack: basePack,
        ...(record.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: record.startingPlayerIndex }),
      },
      record.seed,
      record.actions,
    );
  },

  viewFor(state, viewerId) {
    return getPublicView(state, viewerId);
  },

  autoIntent(state, playerId) {
    return autoIntent(state, playerId);
  },

  versionOf(state) {
    return state.version;
  },

  statusOf(state) {
    return state.status;
  },

  currentPlayer(state) {
    const p = state.players[state.currentPlayerIndex];
    return p ? { id: p.id, name: p.name } : null;
  },

  playersOf(state) {
    return state.players.map((p) => ({ id: p.id, name: p.name }));
  },

  lastAction(state) {
    const entry = state.log.at(-1);
    return entry ? ({ ...entry.action, playerId: entry.playerId } as GameAction) : null;
  },

  resultOf(state) {
    const result = state.result;
    if (!result) return null;
    return {
      rounds: state.round,
      reason: result.reason,
      standings: result.standings.map((s) => {
        const p = state.players.find((x) => x.id === s.playerId)!;
        return {
          name: p.name,
          points: s.points,
          cards: s.purchasedCount,
          nobles: p.nobles.length,
          rank: s.rank,
          winner: result.winners.includes(s.playerId),
        };
      }),
    };
  },
};
