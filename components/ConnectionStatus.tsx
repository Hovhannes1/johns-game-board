'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { strings } from '@/lib/strings';

type Status = 'connecting' | 'connected' | 'disconnected';

const dotColor: Record<Status, string> = {
  connecting: 'bg-gem-gold',
  connected: 'bg-gem-emerald',
  disconnected: 'bg-gem-ruby',
};

/**
 * Shows whether the realtime server is reachable from this browser. Visitors
 * without a seat are refused with UNAUTHORIZED, which still proves the full
 * WebSocket path (Tailscale Serve included) works.
 */
export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>('connecting');

  useEffect(() => {
    const socket = io({ transports: ['websocket'], reconnection: false, timeout: 8000 });
    socket.on('connect', () => setStatus('connected'));
    socket.on('connect_error', (error: Error) =>
      setStatus(error.message === 'UNAUTHORIZED' ? 'connected' : 'disconnected'),
    );
    socket.on('disconnect', () => setStatus((s) => (s === 'connected' ? s : 'disconnected')));
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm opacity-80">
      <span
        aria-hidden="true"
        className={`inline-block size-2.5 rounded-full ${dotColor[status]}`}
      />
      {strings.connection[status]}
    </p>
  );
}
