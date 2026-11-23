'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { getGameModule, listGames } from '@/platform/games/registry';
import { Button } from '@/platform/ui/Dialog';
import { roomCode } from '@/lib/protocol';
import { online } from '@/games/splendor/lib/strings';

function extractCode(raw: string): string {
  const hashIdx = raw.indexOf('#');
  const candidate = hashIdx >= 0 ? raw.slice(hashIdx + 1) : raw;
  return candidate.replace(/[\s-]/g, '');
}

/** Room-code or invite-link entry: navigates to `/<gameId>/play/#CODE`. */
export function JoinCodeForm({
  gameId = 'splendor',
  showGamePicker = false,
}: {
  gameId?: string;
  showGamePicker?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const games = listGames();
  const [selectedGame, setSelectedGame] = useState(
    () => getGameModule(gameId)?.id ?? games[0]?.id ?? 'splendor',
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = roomCode.safeParse(extractCode(code));
    if (!parsed.success) return setError(online.home.badCode);
    const target = showGamePicker ? selectedGame : gameId;
    router.push(`/${target}/play/#${parsed.data}`);
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-parchment/20 px-5 py-4 text-left"
    >
      <label htmlFor={id} className="font-semibold">
        {online.home.join}
      </label>
      <span className="text-sm opacity-80">{online.home.joinHint}</span>
      {showGamePicker && games.length > 1 && (
        <select
          aria-label="Game"
          value={selectedGame}
          onChange={(e) => setSelectedGame(e.target.value)}
          className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2 text-sm"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={online.home.codeLabel}
          autoComplete="off"
          maxLength={120}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2 font-mono tracking-widest uppercase"
        />
        <Button type="submit">{online.home.go}</Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-[#f0a0a8]">
          {error}
        </p>
      )}
    </form>
  );
}
