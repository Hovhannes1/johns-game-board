'use client';

import { useState } from 'react';
import { SEAT_COLOR_HEX } from '@/games/splendor/components/art/palette';
import { ConfirmDialog } from '@/games/splendor/components/game/dialogs';
import { Button } from '@/platform/ui/Dialog';
import type { ChatMessage, MemberView, RoomSettings, RoomView } from '@/lib/protocol';
import { online, strings } from '@/games/splendor/lib/strings';
import { useOnline } from '@/stores/online';
import { ChatPanel } from './ChatPanel';
import { SettingsFields } from './SettingsFields';

const t = online.lobby;

function MemberRow({
  member,
  me,
  canKick,
  onKick,
}: {
  member: MemberView;
  me: string;
  canKick: boolean;
  onKick: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-parchment/10 bg-felt-900/60 px-3 py-2">
      <span
        aria-hidden="true"
        className="size-3 rounded-full"
        style={{ background: SEAT_COLOR_HEX[member.color] }}
      />
      <span className="font-semibold">{member.name}</span>
      {member.isHost && (
        <span className="rounded-full bg-brass px-2 text-[0.7rem] font-semibold text-felt-950">
          {t.host}
        </span>
      )}
      {member.id === me && <span className="text-xs text-parchment/60">({t.you})</span>}
      <span className="ml-auto flex items-center gap-2 text-xs">
        {!member.connected && <span className="text-[#f0a0a8]">{t.offline}</span>}
        {member.role === 'player' && (
          <span className={member.ready ? 'text-gem-emerald' : 'text-parchment/55'}>
            {member.ready ? t.ready : t.notReady}
          </span>
        )}
        {canKick && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onKick}>
            <span aria-hidden="true">{t.remove}</span>
            <span className="sr-only">{t.removeLabel(member.name)}</span>
          </Button>
        )}
      </span>
    </li>
  );
}

/** Lobby: seats, ready state, host controls and chat (FR-3, FR-4). */
export function Lobby({
  room,
  chat,
  onLeft,
}: {
  room: RoomView;
  chat: readonly ChatMessage[];
  onLeft: () => void;
}) {
  const send = useOnline((s) => s.send);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ base: RoomSettings; value: RoomSettings } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const me = room.members.find((m) => m.id === room.me.memberId)!;
  const players = room.members.filter((m) => m.role === 'player');
  const spectators = room.members.filter((m) => m.role === 'spectator');
  const isHost = room.me.isHost;
  // Edits are kept until saved; a settings change from the server resets them.
  const settings = draft && draft.base === room.settings ? draft.value : room.settings;
  const dirty =
    draft !== null &&
    draft.base === room.settings &&
    JSON.stringify(draft.value) !== JSON.stringify(room.settings);

  const run = async (promise: ReturnType<typeof send>, success?: string) => {
    const ack = await promise;
    setError(ack.ok ? null : ack.error.message);
    setNotice(ack.ok && success ? success : null);
    return ack.ok;
  };

  const icePath = useOnline((s) => s.icePath);

  const copy = async () => {
    try {
      const base = window.location.href.split('#')[0] ?? window.location.href;
      await navigator.clipboard.writeText(`${base}#${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-parchment/60 uppercase">
            {strings.appName}
            {isHost ? ' · Hosting in this tab' : ''}
            {!isHost && icePath !== 'unknown' ? ` · ${icePath}` : ''}
          </p>
          <h1 className="font-display text-4xl font-semibold text-brass">{room.name}</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <span>
            {t.code}: <strong className="font-mono tracking-widest">{room.code}</strong>
          </span>
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? t.copied : `${t.copy} ${t.invite.toLowerCase()}`}
          </Button>
        </div>
      </header>

      {room.locked && (
        <p className="rounded-lg border border-brass/40 px-4 py-2 text-sm">{t.lockedNote}</p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-gem-ruby/60 bg-gem-ruby/15 px-4 py-2 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-gem-emerald">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="players-heading">
            <h2 id="players-heading" className="mb-2 font-display text-xl">
              {t.players} ({players.length}/{room.settings.maxPlayers})
            </h2>
            <ul className="flex flex-col gap-2">
              {players.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  me={me.id}
                  canKick={isHost && m.id !== me.id}
                  onKick={() => void run(send('host:kick', { memberId: m.id }))}
                />
              ))}
            </ul>
          </section>

          {spectators.length > 0 && (
            <section aria-labelledby="spectators-heading">
              <h2 id="spectators-heading" className="mb-2 font-display text-xl">
                {t.spectators}
              </h2>
              <ul className="flex flex-col gap-2">
                {spectators.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    me={me.id}
                    canKick={isHost}
                    onKick={() => void run(send('host:kick', { memberId: m.id }))}
                  />
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {isHost ? (
              <>
                <Button
                  onClick={() => void run(send('host:start', {}))}
                  disabledReason={room.startBlocker}
                >
                  {t.start}
                </Button>
                {room.startBlocker && (
                  <span className="text-sm text-parchment/75">{room.startBlocker}</span>
                )}
              </>
            ) : me.role === 'player' ? (
              <>
                <Button onClick={() => void run(send('lobby:ready', { ready: !me.ready }))}>
                  {me.ready ? t.notReadyButton : t.imReady}
                </Button>
                <span className="text-sm text-parchment/75">{t.waitingForHost}</span>
              </>
            ) : (
              <span className="text-sm text-parchment/75">{t.watching}</span>
            )}
          </div>

          <section
            aria-labelledby="settings-heading"
            className="rounded-xl border border-parchment/10 p-4"
          >
            <h2 id="settings-heading" className="mb-3 font-display text-xl">
              {online.settings.title}
            </h2>
            <SettingsFields
              value={settings}
              disabled={!isHost}
              onChange={(value) => setDraft({ base: room.settings, value })}
            />
            {isHost && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void run(send('host:settings', { settings }), online.settings.saved).then(
                      (ok) => ok && setDraft(null),
                    )
                  }
                  disabledReason={dirty ? null : online.settings.saved}
                >
                  {online.settings.save}
                </Button>
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            {isHost ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => void run(send('host:lock', { locked: !room.locked }))}
                >
                  {room.locked ? t.unlock : t.lock}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmClose(true)}>
                  {t.close}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => void run(send('lobby:leave', {})).then((ok) => ok && onLeft())}
              >
                {t.leave}
              </Button>
            )}
          </div>
        </div>

        <ChatPanel messages={chat} />
      </div>

      <ConfirmDialog
        open={confirmClose}
        title={online.host.closeConfirmTitle}
        body={online.host.closeConfirmBody}
        confirmLabel={t.close}
        cancelLabel={strings.exitConfirm.cancel}
        onConfirm={() => {
          setConfirmClose(false);
          void run(send('host:close', {}));
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </main>
  );
}
