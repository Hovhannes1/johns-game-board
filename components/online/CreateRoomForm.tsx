'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/platform/ui/Dialog';
import { DEFAULT_SETTINGS, LIMITS } from '@/lib/protocol';
import type { RoomSettings, SeatColorId } from '@/lib/protocol';
import { online } from '@/games/splendor/lib/strings';
import { BrowserRoomStore } from '@/platform/room/browser-store';
import type { RoomRecord } from '@/platform/room/store';
import { useOnline } from '@/stores/online';
import { ColorPicker } from './ColorPicker';
import { SettingsFields } from './SettingsFields';

const t = online.host;

/**
 * Serverless room creation: creates the authoritative room inside this
 * browser tab, persists it to IndexedDB, and opens `/splendor/play/#CODE`.
 */
export function CreateRoomForm({ gameId = 'splendor' }: { gameId?: string }) {
  const router = useRouter();
  const id = useId();
  const hostCreate = useOnline((s) => s.hostCreate);

  const [savedRooms, setSavedRooms] = useState<RoomRecord[]>([]);
  const [name, setName] = useState('Friday Splendor');
  const [password, setPassword] = useState('');
  const [hostName, setHostName] = useState('Host');
  const [hostColor, setHostColor] = useState<SeatColorId>('brass');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const store = new BrowserRoomStore();
    void store.open().then(() => {
      const rooms = store.allRooms().sort((a, b) => b.updatedAt - a.updatedAt);
      setSavedRooms(rooms);
    });
  }, []);

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const trimmedPw = password.trim();
    const res = await hostCreate({
      gameId,
      name,
      ...(trimmedPw ? { password: trimmedPw } : {}),
      settings,
      hostName,
      hostColor,
    });
    setBusy(false);
    if (res.ok) {
      router.push(`/${gameId}/play/#${res.code}`);
    } else {
      setError(res.message);
    }
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-brass">{t.title}</h1>
          <p className="mt-1 text-sm text-parchment/75">
            Your browser hosts the room directly over WebRTC — keep this tab open while playing.
          </p>
        </div>
        <Link
          href={`/${gameId}/`}
          className="ml-auto text-sm text-parchment/70 underline-offset-4 hover:underline"
        >
          {online.join.back}
        </Link>
      </header>

      {savedRooms.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-brass/30 bg-felt-900/70 p-5">
          <h2 className="font-display text-xl text-brass">Resume hosted room</h2>
          <ul className="flex flex-col gap-2">
            {savedRooms.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-parchment/15 bg-felt-950/60 px-3 py-2 text-sm"
              >
                <span className="font-semibold">{r.name}</span>
                <span className="font-mono text-xs text-parchment/60">{r.code}</span>
                <Link
                  href={`/${gameId}/play/#${r.code}`}
                  className="ml-auto rounded-lg bg-brass px-3 py-1 font-semibold text-felt-950 hover:bg-[#d9b45c]"
                >
                  Resume
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        onSubmit={(e) => void createRoom(e)}
        className="flex flex-col gap-4 rounded-2xl border border-brass/30 bg-felt-900/80 p-6"
      >
        <h2 className="font-display text-2xl text-brass">{t.createTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-rname`} className="text-sm font-semibold">
              {t.roomName}
            </label>
            <input
              id={`${id}-rname`}
              required
              maxLength={LIMITS.roomNameMax}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-pw`} className="text-sm font-semibold">
              {t.roomPassword} <span className="font-normal opacity-60">(optional)</span>
            </label>
            <input
              id={`${id}-pw`}
              type="password"
              maxLength={LIMITS.passwordMax}
              placeholder="Leave blank for link-only access"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-hname`} className="text-sm font-semibold">
              {t.yourName}
            </label>
            <input
              id={`${id}-hname`}
              required
              maxLength={LIMITS.nameMax}
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
            />
          </div>
          <ColorPicker
            legend={t.yourColor}
            name={`${id}-hcolor`}
            value={hostColor}
            onChange={setHostColor}
          />
        </div>
        <SettingsFields value={settings} onChange={setSettings} />
        {error && (
          <p role="alert" className="text-sm text-[#f0a0a8]">
            {error}
          </p>
        )}
        <Button type="submit" disabledReason={busy ? 'Starting room…' : null}>
          {t.create}
        </Button>
      </form>
    </main>
  );
}
