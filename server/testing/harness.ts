/**
 * Test harness: runs the real game server (API + Socket.IO, no Next.js) on a
 * free port, and drives it like browsers would (cookies, Origin headers).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { GameView } from '../../engine';
import type { Ack, ChatMessage, RoomView } from '../../lib/protocol';
import { DEFAULT_SETTINGS } from '../../lib/protocol';
import type { RoomSettings } from '../../lib/protocol';
import type { AdminSecret } from '../admin-secret';
import { createGameServer } from '../app';
import type { GameServer } from '../app';
import type { MessageRates } from '../realtime';
import { loadConfig } from '../config';
import { silentLogger } from '../logger';

export const ADMIN_SECRET = 'test-admin-secret-123';

export const testAdmin: AdminSecret = {
  verify: async (s) => s === ADMIN_SECRET,
  generated: null,
  source: 'env',
};

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export class TestServer {
  server!: GameServer;
  port = 0;

  constructor(
    readonly dir = mkdtempSync(path.join(tmpdir(), 'splendor-test-')),
    /** Bots play at machine speed, far above the human-paced production limits. */
    readonly rates: MessageRates = {
      messages: { capacity: 1000, perSecond: 1000 },
      chat: { capacity: 50, perSecond: 50 },
    },
  ) {}

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get dbFile(): string {
    return path.join(this.dir, 'test.sqlite');
  }

  async start(port?: number): Promise<this> {
    this.port = port ?? (await freePort());
    const config = loadConfig(['--port', String(this.port)], {}, this.dir);
    this.server = createGameServer({
      config,
      admin: testAdmin,
      log: silentLogger,
      databaseFile: this.dbFile,
      housekeepingMs: 60_000,
      rates: this.rates,
    });
    await new Promise<void>((resolve) =>
      this.server.httpServer.listen(this.port, '127.0.0.1', resolve),
    );
    return this;
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  cleanup(): void {
    try {
      rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Windows can hold SQLite files briefly after close; temp dirs are cleaned by the OS.
    }
  }
}

/** A browser-like client: keeps cookies and sends the right Origin. */
export class Client {
  cookies = new Map<string, string>();
  socket: Socket | null = null;
  room: RoomView | null = null;
  view: GameView | null = null;
  views: string[] = [];
  chat: ChatMessage[] = [];
  ended: string | null = null;

  constructor(
    public server: TestServer,
    public name: string,
  ) {}

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async api<T = unknown>(method: string, url: string, body?: unknown, origin = this.server.origin) {
    const res = await fetch(`${this.server.origin}${url}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        origin,
        cookie: this.cookieHeader(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const index = pair!.indexOf('=');
      const key = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (/Max-Age=0/.test(raw)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const json = (await res.json()) as T;
    return { status: res.status, body: json, headers: res.headers };
  }

  async loginAdmin(secret = ADMIN_SECRET) {
    return this.api('POST', '/api/admin/login', { secret });
  }

  async createRoom(settings: Partial<RoomSettings> = {}, password = 'opensesame') {
    const res = await this.api<{ code: string }>('POST', '/api/rooms', {
      name: 'Friday game',
      password,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      hostName: this.name,
      hostColor: 'brass',
    });
    return res;
  }

  async join(code: string, password = 'opensesame', spectator = false) {
    return this.api<{ code?: string; error?: { code: string } }>(
      'POST',
      `/api/rooms/${code}/join`,
      {
        password,
        name: this.name,
        color: 'teal',
        spectator,
      },
    );
  }

  connect(origin = this.server.origin): Promise<void> {
    this.socket?.disconnect();
    return new Promise((resolve, reject) => {
      const socket = io(this.server.origin, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { cookie: this.cookieHeader(), origin },
        timeout: 5000,
      });
      this.socket = socket;
      socket.on('room:state', (room: RoomView) => {
        this.room = room;
        resolve();
      });
      socket.on('game:view', (view: GameView) => {
        this.view = view;
        this.views.push(JSON.stringify(view));
      });
      socket.on('chat:history', (messages: ChatMessage[]) => (this.chat = messages));
      socket.on('chat:message', (message: ChatMessage) => this.chat.push(message));
      socket.on('session:ended', (info: { reason: string }) => (this.ended = info.reason));
      socket.on('connect_error', (error) => reject(error));
    });
  }

  emit(event: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve) => this.socket!.emit(event, payload, (ack: Ack) => resolve(ack)));
  }

  close(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export async function waitFor(
  check: () => boolean,
  timeoutMs = 5000,
  label = 'condition',
): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
