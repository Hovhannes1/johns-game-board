/**
 * Realtime layer (Socket.IO). Authenticates every socket with the seat cookie,
 * validates every message with a strict schema, rate-limits per socket, and
 * pushes each member their own redacted view after every change (5.3, FR-20).
 */
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { Ack, ClientEvent, ServerEvents } from '../lib/protocol';
import { clientMessages } from '../lib/protocol';
import { serverErrors } from '../games/splendor/lib/strings';
import type { ServerConfig } from './config';
import { guardRequest, isOriginAllowed, readSessionCookie } from './http-guard';
import type { Logger } from './logger';
import type { Room, RoomEvents, RoomManager } from './rooms';
import { TokenBucket } from './security/rate-limit';
import type { Sessions } from './sessions';

/** Largest inbound message accepted, in bytes (SEC-6). Game intents are tiny. */
export const MAX_MESSAGE_BYTES = 8 * 1024;
export const SOCKET_PATH = '/socket.io/';

export const SOCKET_LIMITS = {
  maxConnections: 200,
  maxPerIp: 16,
  /** Disconnect sockets that keep hammering past their rate limit. */
  maxViolations: 30,
} as const;

interface SocketData {
  roomId: string;
  memberId: string;
  ip: string;
  violations: number;
}

type GameSocket = Socket<Record<string, never>, ServerEvents, Record<string, never>, SocketData>;

export interface Realtime {
  io: Server;
  events: RoomEvents;
  close(): Promise<void>;
}

export interface MessageRates {
  /** Burst size and sustained messages per second, per socket. */
  messages: { capacity: number; perSecond: number };
  chat: { capacity: number; perSecond: number };
}

export const DEFAULT_RATES: MessageRates = {
  messages: { capacity: 20, perSecond: 4 },
  chat: { capacity: 6, perSecond: 0.5 },
};

export function attachRealtime(
  httpServer: HttpServer,
  config: ServerConfig,
  deps: { rooms: () => RoomManager; sessions: Sessions; log: Logger; rates?: MessageRates },
): Realtime {
  const { sessions, log } = deps;
  const rates = deps.rates ?? DEFAULT_RATES;
  const io = new Server<Record<string, never>, ServerEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      path: SOCKET_PATH,
      serveClient: false,
      // WebSocket only: no long-polling fallback, so every handshake carries an Origin.
      transports: ['websocket'],
      maxHttpBufferSize: MAX_MESSAGE_BYTES,
      connectTimeout: 10_000,
      pingInterval: 20_000,
      pingTimeout: 20_000,
      // Leave other upgrade requests (Next.js dev HMR) to their own handlers.
      destroyUpgrade: false,
      // No `cors` option: cross-origin access stays closed by default.
      allowRequest: (req, callback) => {
        const guard = guardRequest(req, config);
        if (!guard.ok || !isOriginAllowed(req, config)) return callback('Forbidden', false);
        if (connections >= SOCKET_LIMITS.maxConnections) return callback('Server busy', false);
        if ((perIp.get(guard.ctx.ip) ?? 0) >= SOCKET_LIMITS.maxPerIp)
          return callback('Too many connections', false);
        callback(null, true);
      },
    },
  );

  let connections = 0;
  const perIp = new Map<string, number>();
  const socketsByRoom = new Map<string, Set<GameSocket>>();
  const messages = new TokenBucket(rates.messages.capacity, rates.messages.perSecond);
  const chats = new TokenBucket(rates.chat.capacity, rates.chat.perSecond);

  const rooms = () => deps.rooms();

  function socketsOf(room: Room): Set<GameSocket> {
    return socketsByRoom.get(room.id) ?? new Set();
  }

  function pushRoom(room: Room, socket?: GameSocket): void {
    const targets = socket ? [socket] : socketsOf(room);
    for (const s of targets) {
      if (!rooms().member(room, s.data.memberId)) continue;
      s.emit('room:state', rooms().roomView(room, s.data.memberId));
    }
  }

  function pushGame(room: Room, socket?: GameSocket): void {
    const targets = socket ? [socket] : socketsOf(room);
    for (const s of targets) {
      const view = rooms().gameView(room, s.data.memberId);
      if (view) s.emit('game:view', view);
    }
  }

  const events: RoomEvents = {
    roomChanged: (room) => pushRoom(room),
    gameChanged: (room) => pushGame(room),
    chat: (room, message) => {
      for (const s of socketsOf(room)) s.emit('chat:message', message);
    },
    memberRemoved: (room, memberId, reason) => {
      sessions.revokeMember(room.id, memberId);
      for (const s of [...socketsOf(room)]) {
        if (s.data.memberId !== memberId) continue;
        s.emit('session:ended', { reason });
        s.disconnect(true);
      }
    },
  };

  // Authenticate the handshake with the seat cookie (SEC-3).
  io.use((socket, next) => {
    const guard = guardRequest(socket.request, config);
    if (!guard.ok) return next(new Error('FORBIDDEN'));
    const token = readSessionCookie(socket.request, 'seat', guard.ctx.secure);
    const session = sessions.resolve(token, 'member');
    const room = session?.roomId ? rooms().get(session.roomId) : undefined;
    const member = room && session?.memberId ? rooms().member(room, session.memberId) : undefined;
    if (!session || !room || !member || member.open) return next(new Error('UNAUTHORIZED'));
    // The page asks for a specific room; a seat in a different room does not count.
    const wanted = (socket.handshake.auth as { room?: unknown } | undefined)?.room;
    if (typeof wanted === 'string' && wanted.toUpperCase() !== room.code)
      return next(new Error('UNAUTHORIZED'));
    socket.data = { roomId: room.id, memberId: member.id, ip: guard.ctx.ip, violations: 0 };
    next();
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as GameSocket;
    const room = rooms().get(socket.data.roomId);
    if (!room) return socket.disconnect(true);

    connections += 1;
    perIp.set(socket.data.ip, (perIp.get(socket.data.ip) ?? 0) + 1);
    const set = socketsByRoom.get(room.id) ?? new Set<GameSocket>();
    set.add(socket);
    socketsByRoom.set(room.id, set);

    rooms().connect(room, socket.data.memberId);
    pushRoom(room, socket);
    pushGame(room, socket);
    socket.emit('chat:history', room.chat);

    socket.on('disconnect', () => {
      connections -= 1;
      const n = (perIp.get(socket.data.ip) ?? 1) - 1;
      if (n > 0) perIp.set(socket.data.ip, n);
      else perIp.delete(socket.data.ip);
      set.delete(socket);
      const live = rooms().get(room.id);
      if (live) rooms().disconnect(live, socket.data.memberId);
    });

    /** Validated, rate-limited handler with an acknowledgement (SEC-6, SEC-8). */
    function on<E extends ClientEvent>(
      event: E,
      handler: (
        payload: ReturnType<(typeof clientMessages)[E]['parse']>,
        live: Room,
      ) => { ok: true } | { ok: false; code: string; message: string },
    ): void {
      socket.on(event as string, (payload: unknown, ack: unknown) => {
        const reply = typeof ack === 'function' ? (ack as (a: Ack) => void) : () => {};
        const bucket = event.startsWith('chat:') ? chats : messages;
        if (!bucket.take(`${socket.id}`)) {
          socket.data.violations += 1;
          if (socket.data.violations > SOCKET_LIMITS.maxViolations) {
            log.warn('socket.flood', { ip: socket.data.ip });
            socket.disconnect(true);
          }
          return reply({
            ok: false,
            error: { code: 'RATE_LIMITED', message: serverErrors.RATE_LIMITED },
          });
        }
        const parsed = clientMessages[event].safeParse(payload);
        if (!parsed.success) {
          return reply({
            ok: false,
            error: { code: 'BAD_REQUEST', message: serverErrors.BAD_REQUEST },
          });
        }
        const live = rooms().get(socket.data.roomId);
        if (!live)
          return reply({
            ok: false,
            error: { code: 'ROOM_NOT_FOUND', message: serverErrors.ROOM_NOT_FOUND },
          });
        try {
          const result = handler(parsed.data as never, live);
          if (result.ok) reply({ ok: true });
          else {
            reply({ ok: false, error: { code: result.code, message: result.message } });
            // A stale client gets a fresh view so it can retry.
            if (result.code === 'STALE_VERSION') pushGame(live, socket);
          }
        } catch (error) {
          log.error('socket.handler_error', {
            event,
            message: error instanceof Error ? error.message : String(error),
          });
          reply({ ok: false, error: { code: 'SERVER_ERROR', message: 'Something went wrong.' } });
        }
      });
    }

    const me = () => socket.data.memberId;
    const isHost = (live: Room) => rooms().member(live, me())?.isHost === true;
    const notHost = { ok: false as const, code: 'NOT_HOST', message: serverErrors.NOT_HOST };

    on('lobby:ready', (p, live) => rooms().setReady(live, me(), p.ready));
    on('lobby:leave', (_p, live) => {
      const result = rooms().leave(live, me());
      if (result.ok) events.memberRemoved(live, me(), 'left');
      return result;
    });
    on('host:start', (_p, live) => rooms().start(live, me()));
    on('host:kick', (p, live) => rooms().kick(live, me(), p.memberId));
    on('host:lock', (p, live) => (isHost(live) ? rooms().setLocked(live, p.locked) : notHost));
    on('host:settings', (p, live) => rooms().updateSettings(live, me(), p.settings));
    on('host:playAgain', (_p, live) => rooms().playAgain(live, me()));
    on('host:close', (_p, live) => {
      if (!isHost(live)) return notHost;
      rooms().close(live);
      socketsByRoom.delete(live.id);
      return { ok: true };
    });
    on('game:intent', (p, live) => rooms().act(live, me(), p.version, p.intent));
    on('chat:send', (p, live) => rooms().say(live, me(), 'text', p.text));
    on('chat:emote', (p, live) => rooms().say(live, me(), 'emote', p.emote));
  });

  return {
    io,
    events,
    close: () =>
      new Promise<void>((resolve) => {
        void io.close(() => resolve());
      }),
  };
}
