/**
 * JSON HTTP API under /api. Cookies can only be set over HTTP, so joining and
 * hosting happen here; everything live goes over the WebSocket.
 *
 * Every write requires an allow-listed Origin and a JSON body (CSRF defense on
 * top of SameSite=Strict cookies), bodies are size-limited and schema-checked,
 * and password checks are rate limited with lockouts (SEC-5).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import type { HistoryEntry, RoomSummary, SessionInfo } from '../lib/protocol';
import {
  adminLoginSchema,
  createRoomSchema,
  joinRoomSchema,
  roomAdminSchema,
  roomCode,
} from '../lib/protocol';
import { serverErrors } from '../games/splendor/lib/strings';
import type { AdminSecret } from './admin-secret';
import type { ServerConfig } from './config';
import type { Store } from './db';
import type { RequestContext } from './http-guard';
import { appendSetCookie, isOriginAllowed, readSessionCookie, serializeCookie } from './http-guard';
import type { Logger } from './logger';
import type { Room, RoomManager } from './rooms';
import { FailureLockout, TokenBucket } from './security/rate-limit';
import { hashPassword, verifyPassword } from './security/passwords';
import type { Sessions } from './sessions';
import { SESSION_TTL } from './sessions';

const MAX_BODY_BYTES = 8 * 1024;

export interface ApiDeps {
  config: ServerConfig;
  rooms: RoomManager;
  sessions: Sessions;
  store: Store;
  admin: AdminSecret;
  log: Logger;
  /** Called after a member session is created or a member is removed. */
  onSessionsChanged?: (room: Room) => void;
  /** Tells the host's console about a new room (6.1: print the join link and code). */
  onRoomCreated?: (room: Room) => void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

const err = (status: number, code: keyof typeof serverErrors) => {
  const text = serverErrors[code];
  return new HttpError(status, code, typeof text === 'string' ? text : code);
};

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!type.toLowerCase().startsWith('application/json')) throw err(415, 'BAD_REQUEST');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) throw err(413, 'BAD_REQUEST');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw err(413, 'BAD_REQUEST');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw err(400, 'BAD_REQUEST');
  }
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw err(400, 'BAD_REQUEST');
  return result.data;
}

export function createApi(deps: ApiDeps) {
  const { config, rooms, sessions, store, admin, log } = deps;

  const requests = new TokenBucket(40, 4);
  const ipFailures = new FailureLockout({
    freeAttempts: 5,
    baseLockMs: 30_000,
    maxLockMs: 15 * 60_000,
    forgetAfterMs: 60 * 60_000,
  });
  const roomFailures = new FailureLockout({
    freeAttempts: 20,
    baseLockMs: 60_000,
    maxLockMs: 30 * 60_000,
    forgetAfterMs: 60 * 60_000,
  });
  const adminFailures = new FailureLockout({
    freeAttempts: 5,
    baseLockMs: 60_000,
    maxLockMs: 60 * 60_000,
    forgetAfterMs: 6 * 60 * 60_000,
  });
  // Spends the same time on unknown rooms as on wrong passwords, so codes cannot be probed by timing.
  const dummyHash = hashPassword('splendor-dummy-password');

  function checkLock(lockout: FailureLockout, key: string): void {
    const wait = lockout.retryAfter(key);
    if (wait > 0) {
      const seconds = Math.ceil(wait / 1000);
      throw new HttpError(429, 'LOCKED_OUT', serverErrors.LOCKED_OUT(seconds), seconds);
    }
  }

  function seatSession(req: IncomingMessage, ctx: RequestContext) {
    const session = sessions.resolve(readSessionCookie(req, 'seat', ctx.secure), 'member');
    if (!session?.roomId || !session.memberId) return null;
    const room = rooms.get(session.roomId);
    const member = room && rooms.member(room, session.memberId);
    if (!room || !member || member.open) return null;
    return { session, room, member };
  }

  function isAdmin(req: IncomingMessage, ctx: RequestContext): boolean {
    return sessions.resolve(readSessionCookie(req, 'admin', ctx.secure), 'admin') !== null;
  }

  function requireAdmin(req: IncomingMessage, ctx: RequestContext): void {
    if (!isAdmin(req, ctx)) throw err(401, 'ADMIN_REQUIRED');
  }

  function giveSeat(res: ServerResponse, ctx: RequestContext, room: Room, memberId: string): void {
    const token = sessions.create('member', room.id, memberId);
    appendSetCookie(res, serializeCookie('seat', token, ctx.secure, SESSION_TTL.member / 1000));
  }

  function summary(room: Room): RoomSummary {
    return {
      code: room.code,
      name: room.name,
      status: room.status,
      locked: room.locked,
      players: room.members.filter((m) => m.role === 'player' && !m.open).length,
      maxPlayers: room.settings.maxPlayers,
      spectators: room.members.filter((m) => m.role === 'spectator').length,
      updatedAt: room.updatedAt,
    };
  }

  async function route(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: RequestContext,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    if (method !== 'GET' && !isOriginAllowed(req, config)) throw err(403, 'FORBIDDEN');

    // GET /api/session
    if (method === 'GET' && url.pathname === '/api/session') {
      const seat = seatSession(req, ctx);
      const body: SessionInfo = {
        seat: seat ? { roomCode: seat.room.code, memberId: seat.member.id } : null,
        admin: isAdmin(req, ctx),
      };
      return send(res, 200, body);
    }

    // POST /api/session/leave: forget this browser's seat cookie
    if (method === 'POST' && url.pathname === '/api/session/leave') {
      sessions.revoke(readSessionCookie(req, 'seat', ctx.secure));
      appendSetCookie(res, serializeCookie('seat', '', ctx.secure, 0));
      return send(res, 200, { ok: true });
    }

    // POST /api/admin/login
    if (method === 'POST' && url.pathname === '/api/admin/login') {
      checkLock(adminFailures, `ip:${ctx.ip}`);
      checkLock(adminFailures, 'global');
      const body = parse(adminLoginSchema, await readJson(req));
      if (!(await admin.verify(body.secret))) {
        adminFailures.fail(`ip:${ctx.ip}`);
        adminFailures.fail('global');
        log.warn('admin.login_failed', { ip: ctx.ip });
        throw err(401, 'BAD_ADMIN_SECRET');
      }
      adminFailures.succeed(`ip:${ctx.ip}`);
      const token = sessions.create('admin', null, null);
      appendSetCookie(res, serializeCookie('admin', token, ctx.secure, SESSION_TTL.admin / 1000));
      log.info('admin.login', { ip: ctx.ip });
      return send(res, 200, { ok: true });
    }

    // POST /api/admin/logout
    if (method === 'POST' && url.pathname === '/api/admin/logout') {
      sessions.revoke(readSessionCookie(req, 'admin', ctx.secure));
      appendSetCookie(res, serializeCookie('admin', '', ctx.secure, 0));
      return send(res, 200, { ok: true });
    }

    // GET /api/admin/rooms
    if (method === 'GET' && url.pathname === '/api/admin/rooms') {
      requireAdmin(req, ctx);
      const list = rooms
        .all()
        .map(summary)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return send(res, 200, { rooms: list });
    }

    // POST /api/rooms (host creates a room and takes the first seat)
    if (method === 'POST' && url.pathname === '/api/rooms') {
      requireAdmin(req, ctx);
      const body = parse(createRoomSchema, await readJson(req));
      const created = rooms.create({
        name: body.name,
        passwordHash: await hashPassword(body.password),
        settings: body.settings,
        hostName: body.hostName,
        hostColor: body.hostColor,
      });
      if (!created.ok) throw new HttpError(409, created.code, created.message);
      giveSeat(res, ctx, created.room, created.member.id);
      deps.onRoomCreated?.(created.room);
      return send(res, 201, { code: created.room.code });
    }

    // /api/rooms/:code/(join|lock|close)
    if (parts[0] === 'api' && parts[1] === 'rooms' && parts.length === 4 && method === 'POST') {
      const code = roomCode.safeParse(parts[2]);
      const action = parts[3];

      if (action === 'join') {
        checkLock(ipFailures, ctx.ip);
        const body = parse(joinRoomSchema, await readJson(req));
        const room = code.success ? rooms.findByCode(code.data) : undefined;
        if (room) checkLock(roomFailures, room.id);

        // Already seated in this room: rejoin without the password (FR-5).
        const existing = seatSession(req, ctx);
        if (room && existing && existing.room.id === room.id)
          return send(res, 200, { code: room.code, rejoined: true });

        let ok = false;
        if (room) ok = await verifyPassword(body.password, room.passwordHash);
        else await verifyPassword(body.password, await dummyHash);
        if (!room || !ok) {
          ipFailures.fail(ctx.ip);
          if (room) roomFailures.fail(room.id);
          log.warn('room.join_failed', { ip: ctx.ip, known: Boolean(room) });
          throw err(401, 'BAD_CREDENTIALS');
        }
        ipFailures.succeed(ctx.ip);
        const joined = rooms.join(room, {
          name: body.name,
          color: body.color,
          spectator: body.spectator,
        });
        if (!joined.ok) throw new HttpError(409, joined.code, joined.message);
        giveSeat(res, ctx, room, joined.member.id);
        deps.onSessionsChanged?.(room);
        log.info('room.joined', {
          room: room.id,
          ip: ctx.ip,
          claimed: joined.claimed,
          spectator: body.spectator,
        });
        return send(res, 200, { code: room.code, claimed: joined.claimed });
      }

      const room = code.success ? rooms.findByCode(code.data) : undefined;
      if (action === 'lock') {
        requireAdmin(req, ctx);
        if (!room) throw err(404, 'ROOM_NOT_FOUND');
        const body = parse(roomAdminSchema, await readJson(req));
        rooms.setLocked(room, body.locked ?? !room.locked);
        return send(res, 200, { ok: true, locked: room.locked });
      }
      if (action === 'close') {
        requireAdmin(req, ctx);
        if (!room) throw err(404, 'ROOM_NOT_FOUND');
        rooms.close(room);
        return send(res, 200, { ok: true });
      }
    }

    // GET /api/history (FR-26): anyone holding a seat or the host
    if (method === 'GET' && url.pathname === '/api/history') {
      if (!isAdmin(req, ctx) && !seatSession(req, ctx)) throw err(401, 'UNAUTHORIZED');
      const entries: HistoryEntry[] = store.listHistory(100);
      return send(res, 200, { history: entries });
    }

    send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  }

  return {
    async handle(req: IncomingMessage, res: ServerResponse, ctx: RequestContext): Promise<void> {
      try {
        if (!requests.take(ctx.ip)) throw err(429, 'RATE_LIMITED');
        await route(req, res, ctx);
      } catch (error) {
        if (error instanceof HttpError) {
          if (error.retryAfterSeconds)
            res.setHeader('Retry-After', String(error.retryAfterSeconds));
          return send(res, error.status, { error: { code: error.code, message: error.message } });
        }
        log.error('api.error', { message: error instanceof Error ? error.message : String(error) });
        send(res, 500, { error: { code: 'SERVER_ERROR', message: 'Something went wrong.' } });
      }
    },
    prune(): void {
      requests.prune();
      ipFailures.prune();
      roomFailures.prune();
      adminFailures.prune();
    },
  };
}

export type Api = ReturnType<typeof createApi>;
