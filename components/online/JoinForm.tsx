'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/platform/ui/Dialog';
import { api } from '@/lib/api-client';
import { LIMITS } from '@/lib/protocol';
import type { SeatColorId, SessionInfo } from '@/lib/protocol';
import { online } from '@/games/splendor/lib/strings';
import { ColorPicker } from './ColorPicker';

const t = online.join;

/** Join with the room password, a display name and a color (FR-2). */
export function JoinForm({ code }: { code: string }) {
  const router = useRouter();
  const id = useId();
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState<SeatColorId>('teal');
  const [spectator, setSpectator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Already seated in this room from this browser: go straight in (FR-5).
    void api<SessionInfo>('GET', '/api/session').then((res) => {
      if (res.ok && res.data.seat?.roomCode === code) router.replace(`/room/${code}`);
    });
  }, [code, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const res = await api<{ code: string }>('POST', `/api/rooms/${code}/join`, {
      password,
      name,
      color,
      spectator,
    });
    setBusy(false);
    if (res.ok) router.push(`/room/${res.data.code}`);
    else setError(res.error.message);
  };

  return (
    <main className="flex min-h-dvh items-center px-4 py-10">
      <form
        onSubmit={(e) => void submit(e)}
        className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-brass/30 bg-felt-900/80 p-6 shadow-2xl"
      >
        <div>
          <h1 className="font-display text-3xl font-semibold text-brass">{t.titleGeneric}</h1>
          <p className="mt-1 font-mono text-sm tracking-widest text-parchment/70">{code}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-pw`} className="text-sm font-semibold">
            {t.password}
          </label>
          <input
            id={`${id}-pw`}
            type="password"
            required
            autoComplete="current-password"
            maxLength={LIMITS.passwordMax}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
          />
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
        <ColorPicker legend={t.color} name={`${id}-color`} value={color} onChange={setColor} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={spectator}
            onChange={(e) => setSpectator(e.target.checked)}
          />
          {t.spectator}
        </label>
        {error && (
          <p role="alert" className="text-sm text-[#f0a0a8]">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabledReason={busy ? online.connection.connecting : null}>
            {t.submit}
          </Button>
          <Link href="/" className="text-sm text-parchment/70 underline-offset-4 hover:underline">
            {t.back}
          </Link>
        </div>
      </form>
    </main>
  );
}
