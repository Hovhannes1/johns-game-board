'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Dialog';
import { roomCode } from '@/lib/protocol';
import { online } from '@/lib/strings';

/** Home-page entry: type a room code, continue to the join form. */
export function JoinCodeForm() {
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = roomCode.safeParse(code.replace(/[\s-]/g, ''));
    if (!parsed.success) return setError(online.home.badCode);
    router.push(`/join/${parsed.data}`);
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
      <div className="flex gap-2">
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={online.home.codeLabel}
          autoComplete="off"
          maxLength={14}
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
