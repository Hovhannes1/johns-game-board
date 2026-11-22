import { BroadcastChannelTransport } from './broadcast-channel';
import type { Envelope } from './envelope';
import type { Transport } from './transport';
import { TrysteroTransport } from './trystero';

export function isBroadcastMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('transport') === 'broadcast';
}

export function createRoomTransport(opts: {
  gameId: string;
  code: string;
  isHost: boolean;
  includeTurn?: boolean;
}): Transport<Envelope> {
  const code = opts.code.toUpperCase();
  if (isBroadcastMode()) {
    return new BroadcastChannelTransport<Envelope>(`jgb:${opts.gameId}:${code}`);
  }
  return new TrysteroTransport<Envelope>(opts.gameId, code, {
    isHost: opts.isHost,
    includeTurn: opts.includeTurn,
  });
}
