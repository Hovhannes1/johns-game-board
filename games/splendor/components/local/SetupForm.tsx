'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { SEAT_COLORS } from '@/games/splendor/components/art/palette';
import { Button } from '@/platform/ui/Dialog';
import { strings } from '@/games/splendor/lib/strings';

const MAX_NAME = 20;

interface SetupFormProps {
  onStart: (names: string[], randomStart: boolean) => void;
}

/** Hot-seat setup: player count, names and who goes first. */
export function SetupForm({ onStart }: SetupFormProps) {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(() => [1, 2, 3, 4].map(strings.setup.defaultName));
  const [randomStart, setRandomStart] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = names.slice(0, count).map((n) => n.trim());
    if (chosen.some((n) => n.length === 0)) return setError(strings.setup.nameRequired);
    if (new Set(chosen.map((n) => n.toLowerCase())).size !== chosen.length) {
      return setError(strings.setup.nameUnique);
    }
    setError(null);
    onStart(chosen, randomStart);
  };

  return (
    <form
      onSubmit={submit}
      aria-describedby={`${formId}-intro`}
      className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl border border-brass/30 bg-felt-900/80 p-6 shadow-2xl"
    >
      <div>
        <h1 className="font-display text-3xl font-semibold text-brass">{strings.setup.title}</h1>
        <p id={`${formId}-intro`} className="mt-1 text-sm text-parchment/75">
          {strings.setup.intro}
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{strings.setup.playerCount}</legend>
        <div className="flex gap-2">
          {[2, 3, 4].map((n) => (
            <label
              key={n}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brass ${count === n ? 'border-brass bg-brass/15' : 'border-parchment/25'}`}
            >
              <input
                type="radio"
                name="count"
                value={n}
                checked={count === n}
                onChange={() => setCount(n)}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        {names.slice(0, count).map((name, i) => (
          <label key={i} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ background: SEAT_COLORS[i] }}
            />
            <span className="sr-only">{strings.setup.playerName(i + 1)}</span>
            <input
              value={name}
              maxLength={MAX_NAME}
              autoComplete="off"
              onChange={(e) =>
                setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
              }
              className="w-full rounded-lg border border-parchment/25 bg-felt-950 px-3 py-2 text-parchment"
            />
          </label>
        ))}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{strings.setup.firstPlayer}</legend>
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="start"
              checked={randomStart}
              onChange={() => setRandomStart(true)}
            />
            {strings.setup.firstRandom}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="start"
              checked={!randomStart}
              onChange={() => setRandomStart(false)}
            />
            {strings.setup.firstListed}
          </label>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-[#f0a0a8]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit">{strings.setup.start}</Button>
        <Link href="/" className="text-sm text-parchment/70 underline-offset-4 hover:underline">
          {strings.setup.back}
        </Link>
      </div>
    </form>
  );
}
