'use client';

import { animate } from 'motion/react';
import { useEffect, useRef } from 'react';
import { TOKEN_COLORS } from '@/games/splendor/engine';
import type { GameEvent, LogEntry, TokenColor } from '@/games/splendor/engine';
import { GEM_PALETTE } from '@/games/splendor/components/art/palette';
import { chipTile, spriteStyle } from '@/games/splendor/components/art/sprites';
import { playSound, primeAudio } from '@/games/splendor/lib/sound';
import type { ArtStyle } from '@/games/splendor/stores/preferences';

/**
 * Motion and sound for game events (section 4.2). Runs imperatively on DOM
 * anchors so it never re-renders the table, never takes pointer events, and
 * every flight finishes within about 450 ms.
 */

const FLIGHT_MS = 450;

/** Center of the first visible element matching any selector, in order. */
function center(...selectors: string[]): { x: number; y: number } | null {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  return null;
}

function chip(color: TokenColor, art: ArtStyle): HTMLDivElement {
  const p = GEM_PALETTE[color];
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:28px',
    'height:28px',
    'margin:-14px 0 0 -14px',
    'border-radius:50%',
    `background:radial-gradient(circle at 35% 30%, ${p.light}, ${p.base} 60%, ${p.dark})`,
    'box-shadow:0 6px 12px rgb(0 0 0 / 0.5), inset 0 0 0 3px rgb(255 255 255 / 0.55)',
    'will-change:transform,opacity',
  ].join(';');
  if (art === 'images') {
    Object.assign(el.style, spriteStyle('chips', chipTile(color), 0.04));
    el.style.boxShadow = '0 6px 12px rgb(0 0 0 / 0.5)';
  }
  return el;
}

function fly(
  layer: HTMLElement,
  art: ArtStyle,
  color: TokenColor,
  from: string[],
  to: string[],
  delay: number,
): void {
  const a = center(...from);
  const b = center(...to);
  if (!a || !b) return;
  const el = chip(color, art);
  layer.appendChild(el);
  // A gentle arc: the midpoint is lifted above the straight line.
  const lift = Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.25);
  const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  void animate(
    el,
    { x: [a.x, mid.x, b.x], y: [a.y, mid.y, b.y], opacity: [0, 1, 1, 0], scale: [0.8, 1, 0.9] },
    { duration: FLIGHT_MS / 1000, delay, ease: 'easeInOut' },
  ).then(() => el.remove());
}

function flights(layer: HTMLElement, event: GameEvent, art: ArtStyle): void {
  const bank = (c: TokenColor) => [`[data-anchor="bank-${c}"]`];
  // Land on the player's chip of that color, or anywhere on their tableau.
  const hand = (playerId: string, c: TokenColor) => [
    `[data-anchor="token-${playerId}-${c}"]`,
    `[data-anchor="tokens-${playerId}"]`,
  ];
  const each = (
    tokens: Partial<Record<TokenColor, number>>,
    run: (c: TokenColor, i: number) => void,
  ) => {
    let i = 0;
    for (const c of TOKEN_COLORS) for (let n = 0; n < Math.min(tokens[c] ?? 0, 3); n++) run(c, i++);
  };
  const p = 'playerId' in event ? event.playerId : '';
  switch (event.type) {
    case 'TOKENS_TAKEN':
      each(event.tokens, (c, i) => fly(layer, art, c, bank(c), hand(p, c), i * 0.06));
      return;
    case 'TOKENS_RETURNED':
      each(event.tokens, (c, i) => fly(layer, art, c, hand(p, c), bank(c), i * 0.06));
      return;
    case 'CARD_PURCHASED':
      each(event.payment, (c, i) => fly(layer, art, c, hand(p, c), bank(c), i * 0.05));
      return;
    case 'CARD_RESERVED':
      if (event.gold > 0) fly(layer, art, 'gold', bank('gold'), hand(p, 'gold'), 0.1);
      return;
    default:
      return;
  }
}

function sound(event: GameEvent): void {
  switch (event.type) {
    case 'TOKENS_TAKEN':
    case 'TOKENS_RETURNED':
      playSound(
        'tokens',
        Object.values(event.tokens).reduce((a, b) => a + (b ?? 0), 0),
      );
      return;
    case 'CARD_PURCHASED':
    case 'CARD_RESERVED':
      playSound('card');
      return;
    case 'NOBLE_VISITED':
      playSound('noble');
      return;
    case 'GAME_ENDED':
      playSound('end');
      return;
    default:
      return;
  }
}

export function TableEffects({
  log,
  animations,
  sounds,
  myTurn,
  art,
}: {
  log: readonly LogEntry[];
  animations: boolean;
  sounds: boolean;
  /** Plays a soft chime when it becomes this viewer's turn (online). */
  myTurn: boolean;
  art: ArtStyle;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const seen = useRef<number | null>(null);
  const wasMyTurn = useRef(myTurn);

  useEffect(() => {
    const unlock = () => primeAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    const last = log.at(-1)?.seq ?? 0;
    const previous = seen.current;
    seen.current = last;
    // First render (or a new game): show the table as it is, no replays.
    if (previous === null || last < previous) return;
    for (const entry of log) {
      if (entry.seq <= previous) continue;
      for (const event of entry.events) {
        if (animations && layer.current) flights(layer.current, event, art);
        if (sounds) sound(event);
      }
    }
  }, [log, animations, sounds, art]);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current && sounds) playSound('turn');
    wasMyTurn.current = myTurn;
  }, [myTurn, sounds]);

  return <div ref={layer} aria-hidden="true" className="pointer-events-none fixed inset-0 z-40" />;
}
