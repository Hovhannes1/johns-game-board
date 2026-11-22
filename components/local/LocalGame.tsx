'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { getPublicView } from '@/engine';
import { GameTable } from '@/components/game/GameTable';
import { useHotseat } from '@/stores/hotseat';
import { SetupForm } from './SetupForm';

const subscribeNothing = () => () => {};

/** True only after hydration, so the saved game (localStorage) never mismatches the server render. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function LocalGame() {
  const hydrated = useHydrated();
  const game = useHotseat((s) => s.game);
  const { start, dispatch, playAgain, exit } = useHotseat.getState();

  // Hot-seat: the screen shows the view of whoever is taking their turn.
  const view = useMemo(
    () => (game ? getPublicView(game, game.players[game.currentPlayerIndex]!.id) : null),
    [game],
  );

  if (!hydrated) return null;
  if (!view) {
    return (
      <main className="flex min-h-dvh items-center px-4 py-10">
        <SetupForm onStart={start} />
      </main>
    );
  }
  return (
    <main>
      <GameTable
        view={view}
        onIntent={dispatch}
        onPlayAgain={playAgain}
        onNewGame={exit}
        onExit={exit}
      />
    </main>
  );
}
