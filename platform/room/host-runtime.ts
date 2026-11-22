import { z } from 'zod';
import { newId } from '@/platform/crypto';
import type { AnyGameModule } from '@/platform/games/types';
import type { Envelope, HelloPayload, PushEventName } from '@/platform/net/envelope';
import { MAX_ENVELOPE_BYTES, envelopeByteLength, isEnvelope } from '@/platform/net/envelope';
import { FailureLockout, TokenBucket } from '@/platform/net/rate-limit';
import type { PeerId, Transport } from '@/platform/net/transport';
import type { HostRoomManager, Result, Room, RoomEvents } from './host-room';
import type { Ack, HistoryEntry, SeatColorId } from './protocol';
import { LIMITS, SEAT_COLOR_IDS, displayName, lobbyMessages } from './protocol';
import { serverErrors } from './strings';

export interface HostMessageRates {
  messages: { capacity: number; perSecond: number };
  chat: { capacity: number; perSecond: number };
}

export const DEFAULT_HOST_RATES: HostMessageRates = {
  messages: { capacity: 20, perSecond: 4 },
  chat: { capacity: 6, perSecond: 0.5 },
};

const helloSchema = z.strictObject({
  clientKey: z.string().min(8).max(128),
  join: z
    .strictObject({
      name: displayName,
      color: z.enum(SEAT_COLOR_IDS),
      spectator: z.boolean(),
      password: z.string().max(LIMITS.passwordMax).optional(),
    })
    .optional(),
});

interface PeerSession {
  transport: Transport<Envelope>;
  peerId: PeerId;
  memberId: string;
  isLocal: boolean;
  lastSeen: number;
  violations: number;
}

const HEARTBEAT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const MAX_VIOLATIONS = 30;

/**
 * Host-side runtime that binds a `HostRoomManager` room to one or more
 * `Transport` instances (e.g. a local loopback for the host UI plus a
 * Trystero or BroadcastChannel transport for remote peers).
 */
export class HostRuntime {
  readonly hostKey = newId('host');
  private readonly peers = new Map<string, PeerSession>(); // key = `${transportId}:${peerId}`
  private readonly clientKeyToMember = new Map<string, string>();
  private readonly transports = new Map<
    Transport<Envelope>,
    { isLocal: boolean; unsubs: (() => void)[] }
  >();
  private readonly messages: TokenBucket;
  private readonly chats: TokenBucket;
  private readonly passwordLockout: FailureLockout;
  private readonly intentEnvelopeSchema: z.ZodType<{ version: number; intent: unknown }>;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private lastFinishedVersion = -1;

  constructor(
    private readonly manager: HostRoomManager,
    private readonly room: Room,
    private readonly game: AnyGameModule,
    private readonly opts: {
      rates?: HostMessageRates;
      now?: () => number;
      hostMemberId: string;
      hostClientKey?: string;
    },
  ) {
    const rates = opts.rates ?? DEFAULT_HOST_RATES;
    const now = opts.now ?? Date.now;
    this.messages = new TokenBucket(rates.messages.capacity, rates.messages.perSecond, now);
    this.chats = new TokenBucket(rates.chat.capacity, rates.chat.perSecond, now);
    this.passwordLockout = new FailureLockout(
      { freeAttempts: 5, baseLockMs: 2_000, maxLockMs: 60_000, forgetAfterMs: 15 * 60_000 },
      now,
    );
    this.intentEnvelopeSchema = z.strictObject({
      version: z.number().int().min(0),
      intent: game.intentSchema,
    });

    if (opts.hostClientKey) {
      this.clientKeyToMember.set(opts.hostClientKey, opts.hostMemberId);
    }

    this.heartbeatTimer = setInterval(() => this.sweepHeartbeats(), HEARTBEAT_MS);
    (this.heartbeatTimer as { unref?: () => void }).unref?.();
  }

  /** Returns `RoomEvents` to pass into `HostRoomManager`. */
  createRoomEvents(): RoomEvents {
    return {
      roomChanged: (r) => {
        if (r.id === this.room.id) this.pushRoomAll();
      },
      gameChanged: (r) => {
        if (r.id === this.room.id) this.pushGameAll();
      },
      chat: (r, message) => {
        if (r.id === this.room.id) this.broadcast('chat:message', message);
      },
      memberRemoved: (r, memberId, reason) => {
        if (r.id !== this.room.id) return;
        for (const [k, s] of this.peers) {
          if (s.memberId !== memberId) continue;
          this.sendEvt(s, 'session:ended', { reason });
          this.peers.delete(k);
        }
        for (const [ck, mid] of this.clientKeyToMember) {
          if (mid === memberId) this.clientKeyToMember.delete(ck);
        }
      },
    };
  }

  attachTransport(transport: Transport<Envelope>, options: { isLocal?: boolean } = {}): void {
    const isLocal = options.isLocal === true;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      transport.onMessage((from, data) => {
        void this.handleMessage(transport, from, data, isLocal);
      }),
    );

    unsubs.push(
      transport.onPeerLeave((peerId) => {
        this.dropPeer(transport, peerId);
      }),
    );

    this.transports.set(transport, { isLocal, unsubs });
  }

  private peerKey(transport: Transport<Envelope>, peerId: PeerId): string {
    return `${transport.selfId}:${peerId}`;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private sendRaw(transport: Transport<Envelope>, to: PeerId, env: Envelope): void {
    transport.send(to, env);
  }

  private sendEvt<K extends PushEventName>(session: PeerSession, event: K, payload: unknown): void {
    this.sendRaw(session.transport, session.peerId, { k: 'evt', e: event, p: payload });
  }

  private broadcast<K extends PushEventName>(event: K, payload: unknown): void {
    for (const s of this.peers.values()) {
      this.sendEvt(s, event, payload);
    }
  }

  private pushRoom(session: PeerSession): void {
    if (!this.manager.member(this.room, session.memberId)) return;
    this.sendEvt(session, 'room:state', this.manager.roomView(this.room, session.memberId));
  }

  private pushRoomAll(): void {
    for (const s of this.peers.values()) this.pushRoom(s);
  }

  private pushGame(session: PeerSession): void {
    const view = this.manager.gameView(this.room, session.memberId);
    if (view) this.sendEvt(session, 'game:view', view);
  }

  private pushGameAll(): void {
    for (const s of this.peers.values()) this.pushGame(s);
    if (this.room.status === 'finished' && this.room.state) {
      const v = this.game.versionOf(this.room.state);
      if (v !== this.lastFinishedVersion) {
        this.lastFinishedVersion = v;
        const summary = this.game.resultOf(this.room.state);
        if (summary) {
          const entry: HistoryEntry = {
            id: newId('h'),
            gameId: this.room.gameId,
            roomName: this.room.name,
            finishedAt: this.now(),
            rounds: summary.rounds,
            reason: summary.reason,
            players: summary.standings,
          };
          this.broadcast('game:finished', entry);
        }
      }
    }
  }

  private dropPeer(transport: Transport<Envelope>, peerId: PeerId): void {
    const key = this.peerKey(transport, peerId);
    const session = this.peers.get(key);
    if (!session) return;
    this.peers.delete(key);
    this.manager.disconnect(this.room, session.memberId);
  }

  private sweepHeartbeats(): void {
    const now = this.now();
    for (const session of [...this.peers.values()]) {
      if (session.isLocal) continue;
      if (now - session.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        this.dropPeer(session.transport, session.peerId);
        continue;
      }
      this.sendRaw(session.transport, session.peerId, { k: 'sys', e: 'ping', t: now });
    }
  }

  private handleMessage(
    transport: Transport<Envelope>,
    from: PeerId,
    data: unknown,
    isLocal: boolean,
  ): void {
    if (envelopeByteLength(data) > MAX_ENVELOPE_BYTES || !isEnvelope(data)) return;

    const key = this.peerKey(transport, from);
    const existing = this.peers.get(key);
    if (existing) existing.lastSeen = this.now();

    if (data.k === 'sys') {
      if (data.e === 'ping') {
        this.sendRaw(transport, from, { k: 'sys', e: 'pong', t: data.t });
        return;
      }
      if (data.e === 'pong') return;
      if (data.e === 'bye') {
        this.dropPeer(transport, from);
        return;
      }
      if (data.e === 'hello') {
        this.handleHello(transport, from, data.p, isLocal);
      }
      return;
    }

    if (data.k !== 'req') return;
    if (!existing) {
      this.sendRaw(transport, from, {
        k: 'ack',
        id: data.id,
        r: { ok: false, error: { code: 'UNAUTHORIZED', message: serverErrors.UNAUTHORIZED } },
      });
      return;
    }

    this.handleReq(existing, data.id, data.e, data.p);
  }

  private handleHello(
    transport: Transport<Envelope>,
    from: PeerId,
    rawPayload: unknown,
    isLocal: boolean,
  ): void {
    if (isLocal) {
      const key = this.peerKey(transport, from);
      const session: PeerSession = {
        transport,
        peerId: from,
        memberId: this.opts.hostMemberId,
        isLocal: true,
        lastSeen: this.now(),
        violations: 0,
      };
      this.peers.set(key, session);
      this.manager.connect(this.room, this.opts.hostMemberId);
      this.sendRaw(transport, from, {
        k: 'sys',
        e: 'welcome',
        p: {
          ok: true,
          memberId: this.opts.hostMemberId,
          hostKey: this.hostKey,
          gameId: this.room.gameId,
          claimed: false,
        },
      });
      this.pushRoom(session);
      this.pushGame(session);
      this.sendEvt(session, 'chat:history', this.room.chat);
      return;
    }

    const parsed = helloSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.sendRaw(transport, from, {
        k: 'sys',
        e: 'welcome',
        p: { ok: false, code: 'BAD_REQUEST', message: serverErrors.BAD_REQUEST },
      });
      return;
    }

    const { clientKey, join } = parsed.data as HelloPayload;
    let memberId = this.clientKeyToMember.get(clientKey);
    let claimed = false;

    const existingMember = memberId ? this.manager.member(this.room, memberId) : undefined;
    if (!existingMember || existingMember.open) {
      memberId = undefined;
    }

    if (!memberId) {
      if (!join) {
        this.sendRaw(transport, from, {
          k: 'sys',
          e: 'welcome',
          p: {
            ok: false,
            code: 'NEEDS_JOIN',
            message: serverErrors.UNAUTHORIZED,
            needsJoin: true,
          },
        });
        return;
      }

      if (this.room.passwordHash) {
        const retryMs = this.passwordLockout.retryAfter(from);
        if (retryMs > 0) {
          const secs = Math.ceil(retryMs / 1000);
          this.sendRaw(transport, from, {
            k: 'sys',
            e: 'welcome',
            p: { ok: false, code: 'LOCKED_OUT', message: serverErrors.LOCKED_OUT(secs) },
          });
          return;
        }
        if ((join.password ?? '') !== this.room.passwordHash) {
          this.passwordLockout.fail(from);
          this.sendRaw(transport, from, {
            k: 'sys',
            e: 'welcome',
            p: { ok: false, code: 'BAD_CREDENTIALS', message: serverErrors.BAD_CREDENTIALS },
          });
          return;
        }
        this.passwordLockout.succeed(from);
      }

      const joined = this.manager.join(this.room, {
        name: join.name,
        color: join.color as SeatColorId,
        spectator: join.spectator,
      });
      if (!joined.ok) {
        this.sendRaw(transport, from, {
          k: 'sys',
          e: 'welcome',
          p: { ok: false, code: joined.code, message: joined.message },
        });
        return;
      }
      memberId = joined.member.id;
      claimed = joined.claimed;
      this.clientKeyToMember.set(clientKey, memberId);
    }

    const key = this.peerKey(transport, from);
    const session: PeerSession = {
      transport,
      peerId: from,
      memberId,
      isLocal: false,
      lastSeen: this.now(),
      violations: 0,
    };
    this.peers.set(key, session);
    this.manager.connect(this.room, memberId);
    this.sendRaw(transport, from, {
      k: 'sys',
      e: 'welcome',
      p: {
        ok: true,
        memberId,
        hostKey: this.hostKey,
        gameId: this.room.gameId,
        claimed,
      },
    });
    this.pushRoom(session);
    this.pushGame(session);
    this.sendEvt(session, 'chat:history', this.room.chat);
  }

  private handleReq(session: PeerSession, id: number, event: string, payload: unknown): void {
    const reply = (ack: Ack) =>
      this.sendRaw(session.transport, session.peerId, { k: 'ack', id, r: ack });

    if (!session.isLocal) {
      const bucket = event.startsWith('chat:') ? this.chats : this.messages;
      if (!bucket.take(session.peerId)) {
        session.violations += 1;
        if (session.violations > MAX_VIOLATIONS) {
          this.dropPeer(session.transport, session.peerId);
        }
        return reply({
          ok: false,
          error: { code: 'RATE_LIMITED', message: serverErrors.RATE_LIMITED },
        });
      }
    }

    const me = session.memberId;
    const isHost = this.manager.member(this.room, me)?.isHost === true;
    const notHost: Result = { ok: false, code: 'NOT_HOST', message: serverErrors.NOT_HOST };

    let result: Result;
    try {
      if (event === 'game:intent') {
        const parsed = this.intentEnvelopeSchema.safeParse(payload);
        if (!parsed.success) {
          return reply({
            ok: false,
            error: { code: 'BAD_REQUEST', message: serverErrors.BAD_REQUEST },
          });
        }
        result = this.manager.act(this.room, me, parsed.data.version, parsed.data.intent);
      } else if (event in lobbyMessages) {
        const schema = lobbyMessages[event as keyof typeof lobbyMessages];
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          return reply({
            ok: false,
            error: { code: 'BAD_REQUEST', message: serverErrors.BAD_REQUEST },
          });
        }
        const data = parsed.data as Record<string, unknown>;
        switch (event as keyof typeof lobbyMessages) {
          case 'lobby:ready':
            result = this.manager.setReady(this.room, me, data.ready as boolean);
            break;
          case 'lobby:leave': {
            result = this.manager.leave(this.room, me);
            if (result.ok) {
              this.sendEvt(session, 'session:ended', { reason: 'left' });
              this.dropPeer(session.transport, session.peerId);
            }
            break;
          }
          case 'host:start':
            result = this.manager.start(this.room, me);
            break;
          case 'host:kick':
            result = this.manager.kick(this.room, me, data.memberId as string);
            break;
          case 'host:lock':
            result = isHost ? this.manager.setLocked(this.room, data.locked as boolean) : notHost;
            break;
          case 'host:settings':
            result = this.manager.updateSettings(this.room, me, data.settings as Room['settings']);
            break;
          case 'host:playAgain':
            result = this.manager.playAgain(this.room, me);
            break;
          case 'host:close':
            if (!isHost) result = notHost;
            else {
              this.manager.close(this.room);
              result = { ok: true };
            }
            break;
          case 'chat:send':
            result = this.manager.say(this.room, me, 'text', data.text as string);
            break;
          case 'chat:emote':
            result = this.manager.say(this.room, me, 'emote', data.emote as string);
            break;
        }
      } else {
        return reply({
          ok: false,
          error: { code: 'BAD_REQUEST', message: serverErrors.BAD_REQUEST },
        });
      }
    } catch {
      return reply({
        ok: false,
        error: { code: 'SERVER_ERROR', message: 'Something went wrong.' },
      });
    }

    if (result.ok) {
      reply({ ok: true });
    } else {
      reply({ ok: false, error: { code: result.code, message: result.message } });
      if (result.code === 'STALE_VERSION') this.pushGame(session);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeatTimer);
    for (const [transport, info] of this.transports) {
      for (const unsub of info.unsubs) unsub();
      await transport.close();
    }
    this.transports.clear();
    this.peers.clear();
  }
}
