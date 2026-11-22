'use client';

import { useEffect, useState } from 'react';
import { checkNatConnectivity } from '@/platform/net/nat-check';

type Status = 'checking' | 'ready' | 'nat-warning';

const dotColor: Record<Status, string> = {
  checking: 'bg-gem-gold',
  ready: 'bg-gem-emerald',
  'nat-warning': 'bg-gem-ruby',
};

/**
 * Pre-flight WebRTC check: verifies UDP/STUN (`srflx`) reachability on the
 * current network and notes whether a TURN relay backup is configured.
 */
export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('Checking P2P network…');

  useEffect(() => {
    let alive = true;
    void checkNatConnectivity(3_000).then((res) => {
      if (!alive) return;
      if (!res.supported) {
        setStatus('nat-warning');
        setDetail('WebRTC is not supported in this browser.');
      } else if (res.hasSrflx) {
        setStatus('ready');
        setDetail(
          res.turnConfigured
            ? 'P2P ready (STUN + relay backup configured)'
            : 'P2P ready (direct STUN)',
        );
      } else if (res.hasRelay) {
        setStatus('ready');
        setDetail('UDP restricted — relay backup available');
      } else {
        setStatus('nat-warning');
        setDetail(
          'Your network may block direct P2P (UDP). Online play could fail; try another network or disable VPN.',
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm opacity-80">
      <span
        aria-hidden="true"
        className={`inline-block size-2.5 shrink-0 rounded-full ${dotColor[status]}`}
      />
      <span>{detail}</span>
    </p>
  );
}
