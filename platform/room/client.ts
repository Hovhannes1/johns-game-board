import type { Envelope, HelloPayload, PushEventMap, WelcomePayload } from '@/platform/net/envelope';
import { isEnvelope } from '@/platform/net/envelope';
import type { IcePathKind, PeerId, Transport, TransportStatus } from '@/platform/net/transport';
import type { Ack, ChatMessage, HistoryEntry, RoomView } from './protocol';

export type ClientStatus =
  | 'idle'
  | 'searching'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'needs-join'
  | 'rejected'
  | 'host-paused'
  | 'failed-room'
  | 'failed-nat'
  | 'ended';

export type EndReason = 'kicked' | 'closed' | 'left' | 'expired';

export interface RoomClientCallbacks {
  onStatus?(
    status: ClientStatus,
    info?: { code?: string; message?: string; path?: IcePathKind },
  ): void;
  onRoom?(room: RoomView): void;
  onGame?(view: unknown): void;
  onChatHistory?(messages: ChatMessage[]): void;
  onChatMessage?(message: ChatMessage): void;
  onGameFinished?(entry: HistoryEntry): void;
  onEnded?(reason: EndReason): void;
}

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Client-side room session over any `Transport<Envelope>`.
 * Sends `hello`, pins the first valid host (`hostPeerId` + `hostKey`),
 * provides `send(event, payload): Promise<Ack>` with timeout, and forwards
 * host-pushed state snapshots to the UI store.
 */
export class RoomClient {
  private hostPeerId: PeerId | null = null;
  private hostKey: string | null = null;
  private nextReqId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (ack: Ack) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly unsubs: (() => void)[] = [];
  private closed = false;
  private status: ClientStatus = 'searching';
  private lastHello: HelloPayload;

  constructor(
    private readonly transport: Transport<Envelope>,
    hello: HelloPayload,
    private readonly cb: RoomClientCallbacks,
    private readonly isLocalHost = false,
  ) {
    this.lastHello = hello;

    this.unsubs.push(
      transport.onMessage((from, raw) => {
        if (!isEnvelope(raw) || this.closed) return;
        this.handleEnvelope(from, raw);
      }),
    );

    this.unsubs.push(
      transport.onPeerJoin((peerId) => {
        if (this.closed) return;
        if (!this.hostPeerId || this.hostPeerId === peerId) {
          this.setStatus('connecting');
          this.transport.send(peerId, { k: 'sys', e: 'hello', p: this.lastHello });
        }
      }),
    );

    this.unsubs.push(
      transport.onPeerLeave((peerId) => {
        if (this.closed) return;
        if (peerId === this.hostPeerId && !this.isLocalHost) {
          this.rejectAllPending('HOST_PAUSED', 'Host disconnected.');
          this.setStatus('host-paused');
        }
      }),
    );

    if (transport.onStatus) {
      this.unsubs.push(
        transport.onStatus((ts: TransportStatus, path?: IcePathKind) => {
          if (this.closed) return;
          if (ts === 'searching') this.setStatus('searching');
          else if (ts === 'connecting') this.setStatus('connecting');
          else if (ts === 'failed-room') this.setStatus('failed-room');
          else if (ts === 'failed-nat') this.setStatus('failed-nat');
          else if (ts === 'connected' && path && this.status === 'connected') {
            this.cb.onStatus?.('connected', { path });
          }
        }),
      );
    }

    // Also broadcast hello on start in case a peer was already present.
    queueMicrotask(() => {
      if (this.closed) return;
      this.transport.send('all', { k: 'sys', e: 'hello', p: this.lastHello });
    });
  }

  /** Re-sends hello with join credentials (e.g. after `needs-join` or wrong password). */
  submitJoin(join: NonNullable<HelloPayload['join']>): void {
    this.lastHello = { clientKey: this.lastHello.clientKey, join };
    this.setStatus('connecting');
    this.transport.send(this.hostPeerId ?? 'all', {
      k: 'sys',
      e: 'hello',
      p: this.lastHello,
    });
  }

  send(event: string, payload: unknown): Promise<Ack> {
    if (this.closed || !this.hostPeerId || this.status !== 'connected') {
      return Promise.resolve({
        ok: false,
        error: { code: 'OFFLINE', message: 'Not connected to the room host.' },
      });
    }
    const id = this.nextReqId++;
    return new Promise<Ack>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          ok: false,
          error: { code: 'TIMEOUT', message: 'The host did not answer.' },
        });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      this.transport.send(this.hostPeerId!, { k: 'req', id, e: event, p: payload });
    });
  }

  private setStatus(
    next: ClientStatus,
    info?: { code?: string; message?: string; path?: IcePathKind },
  ): void {
    this.status = next;
    this.cb.onStatus?.(next, info);
  }

  private rejectAllPending(code: string, message: string): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: { code, message } });
      this.pending.delete(id);
    }
  }

  private handleEnvelope(from: PeerId, env: Envelope): void {
    if (env.k === 'sys') {
      if (env.e === 'ping') {
        if (!this.hostPeerId || from === this.hostPeerId) {
          this.transport.send(from, { k: 'sys', e: 'pong', t: env.t });
        }
        return;
      }
      if (env.e === 'welcome') {
        this.handleWelcome(from, env.p);
      }
      return;
    }

    // Ignore all non-welcome messages from peers other than the pinned host.
    if (from !== this.hostPeerId) return;

    if (env.k === 'ack') {
      const entry = this.pending.get(env.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(env.id);
      entry.resolve(env.r);
      return;
    }

    if (env.k === 'evt') {
      const p = env.p as PushEventMap[typeof env.e];
      switch (env.e) {
        case 'room:state':
          this.cb.onRoom?.(p as RoomView);
          break;
        case 'game:view':
          this.cb.onGame?.(p);
          break;
        case 'chat:history':
          this.cb.onChatHistory?.(p as ChatMessage[]);
          break;
        case 'chat:message':
          this.cb.onChatMessage?.(p as ChatMessage);
          break;
        case 'game:finished':
          this.cb.onGameFinished?.(p as HistoryEntry);
          break;
        case 'session:ended': {
          const reason = (p as { reason: EndReason }).reason;
          this.setStatus('ended');
          this.cb.onEnded?.(reason);
          void this.close();
          break;
        }
      }
    }
  }

  private handleWelcome(from: PeerId, welcome: WelcomePayload): void {
    if (!welcome.ok) {
      if (welcome.needsJoin) {
        this.hostPeerId = from;
        this.setStatus('needs-join');
      } else {
        this.setStatus('rejected', { code: welcome.code, message: welcome.message });
      }
      return;
    }

    // Pin the first host that welcomes us; ignore any competing host announcement.
    if (this.hostKey && this.hostKey !== welcome.hostKey) return;
    this.hostPeerId = from;
    this.hostKey = welcome.hostKey;
    this.setStatus('connected');
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.rejectAllPending('CLOSED', 'Connection closed.');
    if (this.hostPeerId) {
      try {
        this.transport.send(this.hostPeerId, { k: 'sys', e: 'bye' });
      } catch {
        // Ignore.
      }
    }
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    await this.transport.close();
  }
}
