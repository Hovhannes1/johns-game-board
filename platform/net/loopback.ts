import type { PeerId, Transport, TransportStatus } from './transport';

type MsgCb<M> = (from: PeerId, data: M) => void;
type PeerCb = (peer: PeerId) => void;
type StatusCb = (status: TransportStatus) => void;

class MemoryPeer<M> implements Transport<M> {
  readonly msgCbs = new Set<MsgCb<M>>();
  readonly joinCbs = new Set<PeerCb>();
  readonly leaveCbs = new Set<PeerCb>();
  readonly statusCbs = new Set<StatusCb>();
  closed = false;

  constructor(
    readonly selfId: PeerId,
    private readonly hub: MemoryHub<M>,
  ) {}

  send(to: PeerId | 'all', data: M): void {
    if (this.closed) return;
    const copy = structuredClone(data);
    this.hub.deliver(this.selfId, to, copy);
  }

  onMessage(cb: MsgCb<M>): () => void {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }

  onPeerJoin(cb: PeerCb): () => void {
    this.joinCbs.add(cb);
    return () => this.joinCbs.delete(cb);
  }

  onPeerLeave(cb: PeerCb): () => void {
    this.leaveCbs.add(cb);
    return () => this.leaveCbs.delete(cb);
  }

  onStatus(cb: StatusCb): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.hub.remove(this.selfId);
  }
}

/**
 * In-memory multi-peer hub for Vitest and host loopback.
 * Delivers messages on microtasks so senders cannot observe re-entrant state.
 */
export class MemoryHub<M = unknown> {
  private readonly peers = new Map<PeerId, MemoryPeer<M>>();

  join(peerId: PeerId): Transport<M> {
    if (this.peers.has(peerId)) {
      throw new Error(`Duplicate peerId in MemoryHub: ${peerId}`);
    }
    const peer = new MemoryPeer<M>(peerId, this);
    const existing = [...this.peers.values()];
    this.peers.set(peerId, peer);

    queueMicrotask(() => {
      if (peer.closed) return;
      for (const cb of peer.statusCbs) cb('connected');
      for (const other of existing) {
        if (other.closed) continue;
        for (const cb of other.joinCbs) cb(peerId);
        for (const cb of peer.joinCbs) cb(other.selfId);
      }
    });
    return peer;
  }

  deliver(from: PeerId, to: PeerId | 'all', data: M): void {
    queueMicrotask(() => {
      if (to === 'all') {
        for (const [id, peer] of this.peers) {
          if (id === from || peer.closed) continue;
          for (const cb of peer.msgCbs) cb(from, structuredClone(data));
        }
        return;
      }
      const target = this.peers.get(to);
      if (!target || target.closed) return;
      for (const cb of target.msgCbs) cb(from, data);
    });
  }

  remove(peerId: PeerId): void {
    this.peers.delete(peerId);
    for (const peer of this.peers.values()) {
      if (peer.closed) continue;
      for (const cb of peer.leaveCbs) cb(peerId);
    }
  }
}

/** Creates an isolated 2-peer loopback pair for host UI ↔ HostRuntime in the same tab. */
export function createLoopbackPair<M = unknown>(
  hostPeerId = 'host-local',
  clientPeerId = 'client-local',
): { host: Transport<M>; client: Transport<M> } {
  const hub = new MemoryHub<M>();
  return {
    host: hub.join(hostPeerId),
    client: hub.join(clientPeerId),
  };
}
