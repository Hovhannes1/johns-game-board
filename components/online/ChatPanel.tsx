'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SEAT_COLOR_HEX } from '@/components/art/palette';
import { Button } from '@/components/ui/Dialog';
import { EMOTES, LIMITS } from '@/lib/protocol';
import type { ChatMessage } from '@/lib/protocol';
import { online } from '@/lib/strings';
import { useOnline } from '@/stores/online';

/**
 * Text chat and quick emotes (FR-14). Messages are rendered as plain text by
 * React, never as HTML (SEC-12).
 */
export function ChatPanel({ messages }: { messages: readonly ChatMessage[] }) {
  const send = useOnline((s) => s.send);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    const ack = await send('chat:send', { text: value });
    if (ack.ok) {
      setText('');
      setError(null);
    } else setError(ack.error.message);
  };

  const emote = async (e: (typeof EMOTES)[number]) => {
    const ack = await send('chat:emote', { emote: e });
    setError(ack.ok ? null : ack.error.message);
  };

  return (
    <section aria-label={online.chat.title} className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-[0.2em] text-parchment/60 uppercase">
        {online.chat.title}
      </h2>
      <ol
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-56 min-h-24 overflow-y-auto rounded-lg border border-parchment/10 bg-felt-900/70 p-3 text-sm leading-relaxed"
      >
        {messages.length === 0 && <li className="text-parchment/50">{online.chat.empty}</li>}
        {messages.map((m) =>
          m.kind === 'system' ? (
            <li key={m.id} className="py-0.5 text-parchment/55 italic">
              {m.text}
            </li>
          ) : (
            <li key={m.id} className="py-0.5 break-words">
              <span
                className="font-semibold"
                style={{ color: m.color ? SEAT_COLOR_HEX[m.color] : undefined }}
              >
                {m.name}
              </span>{' '}
              <span className={m.kind === 'emote' ? 'text-lg' : ''}>{m.text}</span>
            </li>
          ),
        )}
      </ol>
      <div role="group" aria-label={online.chat.emotes} className="flex flex-wrap gap-1">
        {EMOTES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => void emote(e)}
            className="rounded-md px-1.5 py-0.5 text-lg hover:bg-white/10"
            aria-label={`${online.chat.send} ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <label className="sr-only" htmlFor="chat-input">
          {online.chat.label}
        </label>
        <input
          id="chat-input"
          value={text}
          maxLength={LIMITS.chatMax}
          autoComplete="off"
          placeholder={online.chat.placeholder}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-parchment/25 bg-felt-950 px-3 py-1.5 text-sm"
        />
        <Button type="submit" variant="secondary">
          {online.chat.send}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-[#f0a0a8]">
          {error}
        </p>
      )}
    </section>
  );
}
