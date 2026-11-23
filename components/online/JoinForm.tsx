'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/platform/ui/Dialog';
import { LIMITS } from '@/lib/protocol';
import type { SeatColorId } from '@/lib/protocol';
import { online } from '@/games/splendor/lib/strings';
import { useOnline } from '@/stores/online';
import { ColorPicker } from './ColorPicker';

const t = online.join;

/**
 * Inline join form shown when connecting to a P2P room for the first time
 * (or after a rejected password / name).
 */
export function JoinForm({ code, gameId = 'splendor' }: { code: string; gameId?: string }) {
  const id = useId();
  const joining = useOnline((s) => s.joining);
  const joinError = useOnline((s) => s.joinError);
  const submitJoin = useOnline((s) => s.submitJoin);

  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState<SeatColorId>('teal');
  const [spectator, setSpectator] = useState(false);

  const busy = joining;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedPw = password.trim();
    submitJoin({
      name,
      color,
      spectator,
      ...(trimmedPw ? { password: trimmedPw } : {}),
    });
  };

  return (
    <main className="flex min-h-dvh items-center px-4 py-10">
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-brass/30 bg-felt-900/80 p-6 shadow-2xl"
      >
        <div>
          <h1 className="font-display text-3xl font-semibold text-brass">{t.titleGeneric}</h1>
          <p className="mt-1 font-mono text-sm tracking-widest text-parchment/70">{code}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-name`} className="text-sm font-semibold">
            {t.name}
          </label>
          <input
            id={`${id}-name`}
            required
            autoComplete="nickname"
            maxLength={LIMITS.nameMax}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-pw`} className="text-sm font-semibold">
            {t.password} <span className="font-normal opacity-60">(if set by host)</span>
          </label>
          <input
            id={`${id}-pw`}
            type="password"
            autoComplete="current-password"
            maxLength={LIMITS.passwordMax}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
          />
        </div>
        <ColorPicker legend={t.color} name={`${id}-color`} value={color} onChange={setColor} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={spectator}
            onChange={(e) => setSpectator(e.target.checked)}
          />
          {t.spectator}
        </label>
        {joinError && (
          <p role="alert" className="text-sm text-[#f0a0a8]">
            {joinError}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabledReason={busy ? online.connection.connecting : null}>
            {t.submit}
          </Button>
          <Link
            href={`/${gameId}/`}
            className="text-sm text-parchment/70 underline-offset-4 hover:underline"
          >
            {t.back}
          </Link>
        </div>
      </form>
    </main>
  );
}
