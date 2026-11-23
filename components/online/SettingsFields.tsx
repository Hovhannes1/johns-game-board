'use client';

import { useId } from 'react';
import { getGameModule } from '@/platform/games/registry';
import type { GameOptionValue } from '@/platform/games/types';
import { DISCONNECT_SKIPS, TURN_TIMERS } from '@/lib/protocol';
import type { RoomSettings } from '@/lib/protocol';
import { online } from '@/games/splendor/lib/strings';

const t = online.settings;

function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const found = options.find((o) => String(o.value) === e.target.value);
          if (found) onChange(found.value);
        }}
        className="rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2 text-sm disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Room options from spec 3.7, plus per-game options when provided by the module. */
export function SettingsFields({
  gameId,
  value,
  onChange,
  disabled,
}: {
  gameId?: string;
  value: RoomSettings;
  onChange: (next: RoomSettings) => void;
  disabled?: boolean;
}) {
  const mod = gameId ? getGameModule(gameId) : undefined;
  const minP = mod?.minPlayers ?? 2;
  const maxP = mod?.maxPlayers ?? 4;
  const playerChoices = ([2, 3, 4] as const).filter((n) => n >= minP && n <= maxP);
  const set = <K extends keyof RoomSettings>(key: K, v: RoomSettings[K]) =>
    onChange({ ...value, [key]: v });
  const setOption = (key: string, v: GameOptionValue) =>
    onChange({ ...value, gameOptions: { ...(value.gameOptions ?? {}), [key]: v } });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={t.maxPlayers}
        value={value.maxPlayers}
        disabled={disabled}
        options={playerChoices.map((n) => ({ value: n, label: String(n) }))}
        onChange={(v) => set('maxPlayers', v)}
      />
      <Select
        label={t.turnTimer}
        value={value.turnTimer}
        disabled={disabled}
        options={TURN_TIMERS.map((n) => ({ value: n, label: n === 0 ? t.timerOff : t.seconds(n) }))}
        onChange={(v) => set('turnTimer', v)}
      />
      <Select
        label={t.seatOrder}
        value={value.seatOrder}
        disabled={disabled}
        options={[
          { value: 'random' as const, label: t.seatRandom },
          { value: 'joined' as const, label: t.seatJoined },
        ]}
        onChange={(v) => set('seatOrder', v)}
      />
      <Select
        label={t.firstPlayer}
        value={value.firstPlayer}
        disabled={disabled}
        options={[
          { value: 'random' as const, label: t.firstRandom },
          { value: 'firstSeat' as const, label: t.firstSeat },
        ]}
        onChange={(v) => set('firstPlayer', v)}
      />
      <Select
        label={t.disconnectSkip}
        value={value.disconnectSkip}
        disabled={disabled}
        options={DISCONNECT_SKIPS.map((n) => ({
          value: n,
          label: n === 0 ? t.never : t.seconds(n),
        }))}
        onChange={(v) => set('disconnectSkip', v)}
      />
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          checked={value.spectators}
          disabled={disabled}
          onChange={(e) => set('spectators', e.target.checked)}
        />
        {t.spectators}
      </label>
      {mod?.options?.fields.map((field) => {
        const cur = value.gameOptions?.[field.key] ?? mod.options!.defaults[field.key]!;
        return (
          <Select
            key={field.key}
            label={field.label}
            value={String(cur)}
            disabled={disabled}
            options={field.choices.map((c) => ({ value: String(c.value), label: c.label }))}
            onChange={(raw) => {
              const found = field.choices.find((c) => String(c.value) === raw);
              if (found) setOption(field.key, found.value);
            }}
          />
        );
      })}
    </div>
  );
}
