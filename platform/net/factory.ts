import { BroadcastChannelTransport } from './broadcast-channel';
import type { Envelope } from './envelope';
import type { Transport } from './transport';
import { TrysteroTransport } from './trystero';

const TRANSPORT_KEY = 'jgb:transport';

export function isBroadcastMode(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('transport');
  if (param === 'broadcast') {
    try {
      window.sessionStorage?.setItem(TRANSPORT_KEY, 'broadcast');
    } catch {
      // Ignore storage errors.
    }
    return true;
  }
  try {
    return window.sessionStorage?.getItem(TRANSPORT_KEY) === 'broadcast';
  } catch {
    return false;
  }
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
