'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ConfirmDialog } from '@/games/splendor/components/game/dialogs';
import { Button } from '@/platform/ui/Dialog';
import { api } from '@/lib/api-client';
import { DEFAULT_SETTINGS, LIMITS } from '@/lib/protocol';
import type { RoomSettings, RoomSummary, SeatColorId, SessionInfo } from '@/lib/protocol';
import { online, strings } from '@/games/splendor/lib/strings';
import { ColorPicker } from './ColorPicker';
import { SettingsFields } from './SettingsFields';

const t = online.host;

function Field({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  minLength,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength: number;
  minLength?: number;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        value={value}
        maxLength={maxLength}
        minLength={minLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2"
      />
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const res = await api('POST', '/api/admin/login', { secret });
    if (res.ok) onDone();
    else setError(res.error.message);
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <h2 className="font-display text-2xl">{t.loginTitle}</h2>
      <p className="text-sm text-parchment/75">{t.loginBody}</p>
      <Field
        label={t.secretLabel}
        type="password"
        value={secret}
        onChange={setSecret}
        maxLength={LIMITS.adminSecretMax}
        autoComplete="current-password"
      />
      {error && (
        <p role="alert" className="text-sm text-[#f0a0a8]">
          {error}
        </p>
      )}
      <div>
        <Button type="submit">{t.login}</Button>
      </div>
    </form>
  );
}

function CreateRoom() {
  const router = useRouter();
  const [name, setName] = useState('Splendor night');
  const [password, setPassword] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostColor, setHostColor] = useState<SeatColorId>('brass');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const colorName = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const res = await api<{ code: string }>('POST', '/api/rooms', {
      name,
      password,
      settings,
      hostName,
      hostColor,
    });
    if (res.ok) router.push(`/room/${res.data.code}`);
    else setError(res.error.message);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <h2 className="font-display text-2xl">{t.createTitle}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.roomName} value={name} onChange={setName} maxLength={LIMITS.roomNameMax} />
        <Field
          label={t.roomPassword}
          type="password"
          value={password}
          onChange={setPassword}
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          autoComplete="new-password"
        />
        <Field
          label={t.yourName}
          value={hostName}
          onChange={setHostName}
          maxLength={LIMITS.nameMax}
          autoComplete="nickname"
        />
      </div>
      <ColorPicker
        legend={t.yourColor}
        name={colorName}
        value={hostColor}
        onChange={setHostColor}
      />
      <SettingsFields value={settings} onChange={setSettings} />
      {error && (
        <p role="alert" className="text-sm text-[#f0a0a8]">
          {error}
        </p>
      )}
      <div>
        <Button type="submit">{t.create}</Button>
      </div>
    </form>
  );
}

function RoomList() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await api<{ rooms: RoomSummary[] }>('GET', '/api/admin/rooms');
    if (res.ok) setRooms(res.data.rooms);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section aria-labelledby="rooms-heading" className="flex flex-col gap-3">
      <h2 id="rooms-heading" className="font-display text-2xl">
        {t.roomsTitle}
      </h2>
      {rooms?.length === 0 && <p className="text-sm text-parchment/70">{t.noRooms}</p>}
      <ul className="flex flex-col gap-2">
        {rooms?.map((r) => (
          <li
            key={r.code}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-parchment/10 bg-felt-900/60 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">{r.name}</p>
              <p className="text-xs text-parchment/65">
                <span className="font-mono tracking-widest">{r.code}</span> · {t.status[r.status]} ·{' '}
                {t.players(r.players, r.maxPlayers)}
                {r.spectators > 0 && ` · ${t.spectators(r.spectators)}`}
                {r.locked && ` · ${t.locked}`}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Link
                href={`/room/${r.code}`}
                className="rounded-lg bg-brass px-3 py-2 text-sm font-semibold text-felt-950"
              >
                {t.open}
              </Link>
              <Button variant="secondary" onClick={() => void copy(r.code)}>
                {copied === r.code ? t.copied : t.copyInvite}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void api('POST', `/api/rooms/${r.code}/lock`, { locked: !r.locked }).then(refresh)
                }
              >
                {r.locked ? t.unlock : t.lock}
              </Button>
              <Button variant="ghost" onClick={() => setClosing(r.code)}>
                {t.close}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={closing !== null}
        title={t.closeConfirmTitle}
        body={t.closeConfirmBody}
        confirmLabel={t.close}
        cancelLabel={strings.exitConfirm.cancel}
        onConfirm={() => {
          const code = closing;
          setClosing(null);
          if (code) void api('POST', `/api/rooms/${code}/close`, {}).then(refresh);
        }}
        onCancel={() => setClosing(null)}
      />
    </section>
  );
}

/** Host page (SEC-2): log in with the host secret, create and manage rooms. */
export function HostDashboard() {
  const [admin, setAdmin] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    const res = await api<SessionInfo>('GET', '/api/session');
    setAdmin(res.ok ? res.data.admin : false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void check(), 0);
    return () => clearTimeout(timer);
  }, [check]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex items-center gap-4">
        <h1 className="font-display text-4xl font-semibold text-brass">{t.title}</h1>
        <div className="ml-auto flex gap-2">
          <Link
            href="/"
            className="px-2 py-2 text-sm text-parchment/70 underline-offset-4 hover:underline"
          >
            {online.join.back}
          </Link>
          {admin && (
            <Button
              variant="ghost"
              onClick={() => void api('POST', '/api/admin/logout', {}).then(check)}
            >
              {t.logout}
            </Button>
          )}
        </div>
      </header>
      {admin === false && (
        <div className="rounded-2xl border border-brass/30 bg-felt-900/80 p-6">
          <Login onDone={() => void check()} />
        </div>
      )}
      {admin && (
        <>
          <div className="rounded-2xl border border-brass/30 bg-felt-900/80 p-6">
            <CreateRoom />
          </div>
          <RoomList />
        </>
      )}
    </main>
  );
}
