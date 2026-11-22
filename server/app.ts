/**
 * Wires the game server together: HTTP guard, JSON API, Socket.IO, rooms,
 * sessions and housekeeping. Next.js is optional so tests can run the real
 * server without building the UI.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AdminSecret } from './admin-secret';
import { createApi } from './api';
import { serveArt } from './art';
import type { ServerConfig } from './config';
import { Store } from './db';
import { applyTransportHeaders, guardRequest, sendText } from './http-guard';
import type { Logger } from './logger';
import { attachRealtime, SOCKET_PATH } from './realtime';
import type { MessageRates } from './realtime';
import type { Room, RoomEvents } from './rooms';
import { RoomManager } from './rooms';
import { Sessions } from './sessions';

export interface GameServerOptions {
  config: ServerConfig;
  admin: AdminSecret;
  log: Logger;
  /** SQLite file path, or ':memory:' for tests. */
  databaseFile: string;
  nextRequest?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  nextUpgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>;
  housekeepingMs?: number;
  /** Per-socket message limits; tests that play at machine speed raise them. */
  rates?: MessageRates;
  onRoomCreated?: (room: Room) => void;
  /** Folder with the illustrated art (cards.jpg, chips.jpg, deck.jpg, nobles.jpg). */
  assetsDir?: string;
}

export function createGameServer(options: GameServerOptions) {
  const { config, admin, log } = options;
  const store = new Store(options.databaseFile);
  const sessions = new Sessions(store);

  const httpServer = createServer({
    maxHeaderSize: 16 * 1024,
    requestTimeout: 30_000,
    headersTimeout: 15_000,
  });
  httpServer.keepAliveTimeout = 10_000;

  // Rooms and realtime depend on each other; events are bound after both exist.
  let roomEvents: RoomEvents | null = null;
  const forward: RoomEvents = {
    roomChanged: (r) => roomEvents?.roomChanged(r),
    gameChanged: (r) => roomEvents?.gameChanged(r),
    chat: (r, m) => roomEvents?.chat(r, m),
    memberRemoved: (r, id, reason) => roomEvents?.memberRemoved(r, id, reason),
  };
  const rooms = new RoomManager(store, forward, log);
  const realtime = attachRealtime(httpServer, config, {
    rooms: () => rooms,
    sessions,
    log,
    rates: options.rates,
  });
  roomEvents = realtime.events;
  rooms.load();

  const api = createApi({
    config,
    rooms,
    sessions,
    store,
    admin,
    log,
    onRoomCreated: options.onRoomCreated,
  });

  httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
    // Socket.IO answers its own path; everything else goes through the guard.
    if (req.url?.startsWith(SOCKET_PATH)) return;
    const guard = guardRequest(req, config);
    if (!guard.ok) return sendText(res, guard.status, guard.reason);
    applyTransportHeaders(res, guard.ctx);
    if (req.url?.startsWith('/api/')) return void api.handle(req, res, guard.ctx);
    void (async () => {
      if (await serveArt(req, res, options.assetsDir)) return;
      if (!options.nextRequest) return sendText(res, 404, 'Not found');
      await options.nextRequest(req, res);
    })().catch((error: unknown) => {
      log.error('request_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.startsWith(SOCKET_PATH)) return; // handled by Socket.IO
    const guard = guardRequest(req, config);
    if (guard.ok && options.nextUpgrade) return void options.nextUpgrade(req, socket, head);
    socket.destroy();
  });

  const housekeeping = setInterval(
    () => {
      const expired = sessions.prune();
      const closed = rooms.cleanup();
      api.prune();
      if (expired || closed)
        log.info('housekeeping', { expiredSessions: expired, closedRooms: closed });
    },
    options.housekeepingMs ?? 10 * 60_000,
  );
  housekeeping.unref();

  return {
    httpServer,
    rooms,
    store,
    async close(): Promise<void> {
      clearInterval(housekeeping);
      rooms.shutdown();
      await realtime.close();
      await new Promise<void>((resolve) => {
        if (!httpServer.listening) return resolve();
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
      store.close();
    },
  };
}

export type GameServer = ReturnType<typeof createGameServer>;
