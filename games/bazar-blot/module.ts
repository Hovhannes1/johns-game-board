import { z } from 'zod';
import {
  TARGET_SCORES,
  applyAction,
  autoIntent,
  createGame,
  getPublicView,
  replayGame,
  teamOf,
} from '@/games/bazar-blot/engine';
import type {
  ActionIntent,
  GameAction,
  GameState,
  GameView,
  TargetScore,
} from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';
import { intentSchema } from '@/games/bazar-blot/protocol';
import type { GameModule } from '@/platform/games/types';

const optionsSchema = z.strictObject({
  targetScore: z.union([z.literal(101), z.literal(151), z.literal(201), z.literal(301)]),
});

export const bazarBlotModule: GameModule<GameState, ActionIntent, GameAction, GameView> = {
  id: 'bazar-blot',
  title: strings.appName,
  tagline: strings.tagline,
  minPlayers: 4,
  maxPlayers: 4,
  intentSchema,
  options: {
    schema: optionsSchema,
    defaults: { targetScore: 151 },
    fields: [
      {
        key: 'targetScore',
        label: 'Target score',
        choices: TARGET_SCORES.map((v) => ({ value: v, label: `${v} pts` })),
      },
    ],
  },

  create(config, seed) {
    const targetScore = config.options?.targetScore as TargetScore | undefined;
    return createGame(
      {
        players: config.players,
        ...(config.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: config.startingPlayerIndex }),
        ...(targetScore === undefined ? {} : { options: { targetScore } }),
      },
      seed,
    );
  },

  apply(state, playerId, intent) {
    const result = applyAction(state, { ...intent, playerId } as GameAction);
    return result.ok ? { ok: true, state: result.state } : { ok: false, error: result.error };
  },

  replay(record) {
    const targetScore = record.options?.targetScore as TargetScore | undefined;
    return replayGame(
      {
        players: record.seats,
        ...(record.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: record.startingPlayerIndex }),
        ...(targetScore === undefined ? {} : { options: { targetScore } }),
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
    const p = state.players[state.currentSeat];
    return p ? { id: p.id, name: p.name } : null;
  },

  turnKey(state) {
    return `${state.roundNo}:${state.turnSeq}`;
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
    const winningTeam = result.winningTeam;
    return {
      rounds: state.rounds.length,
      reason: result.reason,
      standings: state.players.map((p, seat) => {
        const team = teamOf(seat);
        const winner = team === winningTeam;
        return {
          name: p.name,
          points: state.scores[team],
          rank: winner ? 1 : 2,
          winner,
        };
      }),
    };
  },
};
