import { newId } from '@/platform/crypto';
import type { PeerId, Transport, TransportStatus } from './transport';

type Wire<M> =
  | { type: 'join'; from: PeerId }
  | { type: 'welcome-peer'; from: PeerId; to: PeerId }
  | { type: 'leave'; from: PeerId }
  | { type: 'msg'; from: PeerId; to: PeerId | 'all'; data: M };

/**
 * Same-origin multi-tab transport backed by BroadcastChannel.
 * Used for offline local multi-tab testing and deterministic Playwright e2e.
 */
export class BroadcastChannelTransport<M = unknown> implements Transport<M> {
  readonly selfId: PeerId;
  private readonly channel: BroadcastChannel;
  private readonly knownPeers = new Set<PeerId>();
  private readonly msgCbs = new Set<(from: PeerId, data: M) => void>();
  private readonly joinCbs = new Set<(peer: PeerId) => void>();
  private readonly leaveCbs = new Set<(peer: PeerId) => void>();
  private readonly statusCbs = new Set<(status: TransportStatus) => void>();
  private closed = false;

  constructor(channelName: string, selfId: PeerId = newId('bc')) {
    this.selfId = selfId;
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event: MessageEvent<Wire<M>>) => {
      const msg = event.data;
      if (!msg || msg.from === this.selfId || this.closed) return;
      if (msg.type === 'join') {
        this.addPeer(msg.from);
        this.channel.postMessage({
          type: 'welcome-peer',
          from: this.selfId,
          to: msg.from,
        } satisfies Wire<M>);
      } else if (msg.type === 'welcome-peer') {
        if (msg.to === this.selfId) this.addPeer(msg.from);
      } else if (msg.type === 'leave') {
        if (this.knownPeers.delete(msg.from)) {
          for (const cb of this.leaveCbs) cb(msg.from);
        }
      } else if (msg.type === 'msg') {
        if (msg.to === 'all' || msg.to === this.selfId) {
          this.addPeer(msg.from);
          for (const cb of this.msgCbs) cb(msg.from, msg.data);
        }
      }
    };

    // Announce presence on next microtask so callers can attach listeners first.
    queueMicrotask(() => {
      if (this.closed) return;
      for (const cb of this.statusCbs) cb('connected');
      this.channel.postMessage({ type: 'join', from: this.selfId } satisfies Wire<M>);
    });
  }

  private addPeer(peer: PeerId): void {
    if (this.knownPeers.has(peer)) return;
    this.knownPeers.add(peer);
    for (const cb of this.joinCbs) cb(peer);
  }

  send(to: PeerId | 'all', data: M): void {
    if (this.closed) return;
    this.channel.postMessage({ type: 'msg', from: this.selfId, to, data } satisfies Wire<M>);
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

  onStatus(cb: (status: TransportStatus) => void): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.channel.postMessage({ type: 'leave', from: this.selfId } satisfies Wire<M>);
    } catch {
      // Ignore if channel already closed.
    }
    this.channel.close();
  }
}
