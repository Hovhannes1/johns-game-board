import { joinRoom } from 'trystero';
import type { DataPayload, MessageAction, Room } from 'trystero';
import { newId } from '@/platform/crypto';
import { buildRtcConfig } from './ice';
import type { IcePathKind, PeerId, Transport, TransportStatus } from './transport';

const APP_ID = 'johns-game-board-v1';
const ROOM_DISCOVERY_TIMEOUT_MS = 20_000;

/**
 * Serverless WebRTC transport backed by Trystero (Nostr relays by default).
 * The room code acts as both the room identifier and the signaling encryption key.
 */
export class TrysteroTransport<M = unknown> implements Transport<M> {
  readonly selfId: PeerId = newId('rtc');
  private readonly room: Room;
  private readonly action: MessageAction<DataPayload>;
  private readonly msgCbs = new Set<(from: PeerId, data: M) => void>();
  private readonly joinCbs = new Set<(peer: PeerId) => void>();
  private readonly leaveCbs = new Set<(peer: PeerId) => void>();
  private readonly statusCbs = new Set<(status: TransportStatus, path?: IcePathKind) => void>();
  private readonly discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private anyPeerJoined = false;

  constructor(gameId: string, roomCode: string, opts: { isHost: boolean; includeTurn?: boolean }) {
    const topic = `${gameId}:${roomCode.toUpperCase()}`;
    this.room = joinRoom(
      {
        appId: APP_ID,
        password: roomCode.toUpperCase(),
        rtcConfig: buildRtcConfig(opts.includeTurn ?? true),
      },
      topic,
    );

    this.action = this.room.makeAction<DataPayload>('m');
    this.action.onMessage((data, ctx) => {
      if (this.closed) return;
      for (const cb of this.msgCbs) cb(ctx.peerId, data as M);
    });

    this.room.onPeerJoin(({ peerId }) => {
      if (this.closed) return;
      this.anyPeerJoined = true;
      if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
      for (const cb of this.joinCbs) cb(peerId);
      void this.inspectIcePath(peerId);
    });

    this.room.onPeerLeave(({ peerId }) => {
      if (this.closed) return;
      for (const cb of this.leaveCbs) cb(peerId);
    });

    if (!opts.isHost) {
      this.discoveryTimer = setTimeout(() => {
        if (!this.closed && !this.anyPeerJoined) {
          this.emitStatus('failed-room');
        }
      }, ROOM_DISCOVERY_TIMEOUT_MS);
    }

    queueMicrotask(() => {
      if (!this.closed) this.emitStatus(opts.isHost ? 'connected' : 'searching');
    });
  }

  private emitStatus(status: TransportStatus, path?: IcePathKind): void {
    for (const cb of this.statusCbs) cb(status, path);
  }

  private async inspectIcePath(peerId: PeerId): Promise<void> {
    try {
      const pc = this.room.getPeers()[peerId]?.connection;
      if (!pc) return;
      pc.addEventListener('iceconnectionstatechange', () => {
        if (pc.iceConnectionState === 'failed') {
          this.emitStatus('failed-nat');
        }
      });
      const stats = await pc.getStats();
      for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const local = stats.get(report.localCandidateId as string) as
            { candidateType?: string } | undefined;
          const remote = stats.get(report.remoteCandidateId as string) as
            { candidateType?: string } | undefined;
          const isRelay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
          this.emitStatus('connected', isRelay ? 'relay' : 'direct');
          return;
        }
      }
    } catch {
      // Ignore stats errors on older browsers.
    }
  }

  send(to: PeerId | 'all', data: M): void {
    if (this.closed) return;
    if (to === 'all') {
      void this.action.send(data as DataPayload);
    } else {
      void this.action.send(data as DataPayload, { target: to });
    }
  }

  onMessage(cb: (from: PeerId, data: M) => void): () => void {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }

  onPeerJoin(cb: (peer: PeerId) => void): () => void {
    this.joinCbs.add(cb);
    return () => this.joinCbs.delete(cb);
  }

  onPeerLeave(cb: (peer: PeerId) => void): () => void {
    this.leaveCbs.add(cb);
    return () => this.leaveCbs.delete(cb);
  }

  onStatus(cb: (status: TransportStatus, path?: IcePathKind) => void): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    await this.room.leave();
    this.emitStatus('closed');
  }
}
