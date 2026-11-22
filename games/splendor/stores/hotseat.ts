import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { basePack } from '@/games/splendor/data';
import { actionsFromLog, applyAction, createGame, replayGame } from '@/games/splendor/engine';
import type {
  ActionIntent,
  GameAction,
  GameState,
  PlayerSeat,
  RuleError,
} from '@/games/splendor/engine';

/**
 * Hot-seat game on this device (Milestone 2). The real engine runs in the
 * browser; the store keeps the full state and the table renders the current
 * player's redacted view.
 */

interface SavedGame {
  seats: PlayerSeat[];
  startingPlayerIndex: number;
  seed: string;
  actions: GameAction[];
}

interface HotseatState {
  game: GameState | null;
  start: (names: readonly string[], randomStart: boolean) => void;
  dispatch: (intent: ActionIntent) => RuleError | null;
  playAgain: () => void;
  exit: () => void;
}

function randomSeed(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function newGame(seats: PlayerSeat[], randomStart: boolean): GameState {
  const seed = randomSeed();
  return createGame(
    { players: seats, pack: basePack, ...(randomStart ? {} : { startingPlayerIndex: 0 }) },
    seed,
  );
}

function save(game: GameState | null): SavedGame | null {
  if (!game) return null;
  return {
    seats: game.players.map((p) => ({ id: p.id, name: p.name })),
    startingPlayerIndex: game.startPlayerIndex,
    seed: game.seed,
    actions: actionsFromLog(game),
  };
}

/** Rebuilds a saved game by replaying it; anything invalid is discarded. */
function restore(saved: unknown): GameState | null {
  try {
    const s = saved as SavedGame | null;
    if (!s || !Array.isArray(s.seats) || !Array.isArray(s.actions)) return null;
    return replayGame(
      { players: s.seats, pack: basePack, startingPlayerIndex: s.startingPlayerIndex },
      s.seed,
      s.actions,
    );
  } catch {
    return null;
  }
}

export const useHotseat = create<HotseatState>()(
  persist(
    (set, get) => ({
      game: null,
      start: (names, randomStart) => {
        const seats = names.map((name, i) => ({ id: `p${i + 1}`, name: name.trim() }));
        set({ game: newGame(seats, randomStart) });
      },
      dispatch: (intent) => {
        const game = get().game;
        if (!game) return { code: 'UNKNOWN_PLAYER', message: 'No game in progress.' };
        const playerId = game.players[game.currentPlayerIndex]!.id;
        const result = applyAction(game, { ...intent, playerId } as GameAction);
        if (!result.ok) return result.error;
        set({ game: result.state });
        return null;
      },
      playAgain: () => {
        const game = get().game;
        if (!game) return;
        set({
          game: newGame(
            game.players.map((p) => ({ id: p.id, name: p.name })),
            true,
          ),
        });
      },
      exit: () => set({ game: null }),
    }),
    {
      name: 'splendor-hotseat',
      version: 1,
      // Throwing on the server makes zustand skip persistence during prerendering.
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') throw new Error('No storage on the server');
        return window.localStorage;
      }),
      partialize: (state) => ({ saved: save(state.game) }),
      merge: (persisted, current) => ({
        ...current,
        game: restore((persisted as { saved?: unknown } | undefined)?.saved ?? null),
      }),
    },
  ),
);
