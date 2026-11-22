const STUN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
    ],
  },
];

export function hasTurnConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURN_URL);
}

/**
 * Builds the WebRTC ICE configuration.
 * STUN servers are listed alongside optional TURN credentials so the browser's
 * ICE agent tries direct/STUN paths first and falls back to TURN only if needed.
 */
export function buildRtcConfig(includeTurn = true): RTCConfiguration {
  const iceServers: RTCIceServer[] = [...STUN_SERVERS];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (includeTurn && turnUrl) {
    const server: RTCIceServer = { urls: turnUrl.split(',').map((s) => s.trim()) };
    if (process.env.NEXT_PUBLIC_TURN_USERNAME) {
      server.username = process.env.NEXT_PUBLIC_TURN_USERNAME;
    }
    if (process.env.NEXT_PUBLIC_TURN_CREDENTIAL) {
      server.credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
    }
    iceServers.push(server);
  }
  return { iceServers };
}
