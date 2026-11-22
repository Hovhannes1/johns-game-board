import { buildRtcConfig } from './ice';

export interface NatCheckResult {
  supported: boolean;
  hasSrflx: boolean;
  hasRelay: boolean;
  turnConfigured: boolean;
}

/**
 * Lightweight pre-flight check: gathers ICE candidates for up to `timeoutMs`
 * to see whether UDP/STUN (`srflx`) works on the user's current network.
 */
export async function checkNatConnectivity(timeoutMs = 3_000): Promise<NatCheckResult> {
  const turnConfigured = Boolean(process.env.NEXT_PUBLIC_TURN_URL);
  if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
    return { supported: false, hasSrflx: false, hasRelay: false, turnConfigured };
  }

  let hasSrflx = false;
  let hasRelay = false;
  const pc = new RTCPeerConnection(buildRtcConfig(true));

  try {
    pc.createDataChannel('probe');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pc.onicecandidate = (e) => {
        const cand = e.candidate?.candidate ?? '';
        if (cand.includes(' typ srflx ')) hasSrflx = true;
        if (cand.includes(' typ relay ')) hasRelay = true;
        if (hasSrflx && (!turnConfigured || hasRelay)) {
          clearTimeout(timer);
          resolve();
        }
        if (!e.candidate) {
          clearTimeout(timer);
          resolve();
        }
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
      void pc
        .createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timer);
          resolve();
        });
    });
  } finally {
    pc.close();
  }

  return { supported: true, hasSrflx, hasRelay, turnConfigured };
}
