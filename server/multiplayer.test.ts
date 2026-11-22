/**
 * End-to-end multiplayer tests against the real server: HTTP API, cookies,
 * Socket.IO, rooms, persistence and redaction. Includes a full 4-player game
 * with a server restart in the middle (sections 3.6 and 8).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRng, LEVELS, legalIntentsForViewer } from '../games/splendor/engine';
import type { GameView } from '../games/splendor/engine';
import { Client, TestServer, waitFor } from './testing/harness';

let servers: TestServer[] = [];
let clients: Client[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  // Stop every server before deleting anything: a restarted server shares its folder.
  for (const s of servers) await s.stop().catch(() => {});
  for (const s of servers) s.cleanup();
  servers = [];
  clients = [];
});

async function setup(names: string[], settings = {}) {
  const server = await new TestServer().start();
  servers.push(server);
  const [host, ...others] = names.map((n) => new Client(server, n));
  clients.push(host!, ...others);
  expect((await host!.loginAdmin()).status).toBe(200);
  const created = await host!.createRoom(settings);
  expect(created.status).toBe(201);
  const code = created.body.code;
  for (const c of others) expect((await c.join(code)).status).toBe(200);
  for (const c of [host!, ...others]) await c.connect();
  return { server, host: host!, others, code, all: [host!, ...others] };
}

/** Server-side truth used to check that no client ever saw hidden cards. */
function hiddenIds(server: TestServer, roomCode: string, viewerId: string): string[] {
  const room = server.server.rooms.findByCode(roomCode)!;
  const state = room.state!;
  const deck = LEVELS.flatMap((l) => state.decks[l]);
  const blind = state.players
    .filter((p) => p.id !== viewerId)
    .flatMap((p) => p.reserved.filter((r) => r.fromDeck).map((r) => r.cardId));
  return [...deck, ...blind, state.seed];
}

describe('rooms over HTTP', () => {
  it('requires the host secret to create rooms', async () => {
    const server = await new TestServer().start();
    servers.push(server);
    const guest = new Client(server, 'Guest');
    expect((await guest.createRoom()).status).toBe(401);
    expect((await guest.loginAdmin('wrong')).status).toBe(401);
    expect((await guest.loginAdmin()).status).toBe(200);
    expect((await guest.createRoom()).status).toBe(201);
  });

  it('rejects writes from foreign origins (CSRF)', async () => {
    const server = await new TestServer().start();
    servers.push(server);
    const guest = new Client(server, 'Guest');
    const res = await guest.api(
      'POST',
      '/api/admin/login',
      { secret: 'x' },
      'https://evil.example',
    );
    expect(res.status).toBe(403);
  });

  it('gives the same answer for wrong passwords and unknown rooms, then locks out', async () => {
    const { server, code } = await setup(['Anna', 'Ben']);
    const intruder = new Client(server, 'Mallory');
    clients.push(intruder);
    const wrong = await intruder.join(code, 'not-the-password');
    const unknown = await intruder.join('ABCDEFGHJK', 'opensesame');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    for (let i = 0; i < 4; i++) await intruder.join(code, 'guess');
    const locked = await intruder.join(code, 'opensesame');
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('lets a seated player rejoin without the password', async () => {
    const { others, code } = await setup(['Anna', 'Ben']);
    const res = await others[0]!.join(code, 'wrong-but-ignored');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rejoined: true });
  });

  it('refuses sockets without a session or from foreign origins', async () => {
    const server = await new TestServer().start();
    servers.push(server);
    const anon = new Client(server, 'Anon');
    await expect(anon.connect()).rejects.toThrow();
    const { host } = await setup(['Anna', 'Ben']);
    await expect(host.connect('https://evil.example')).rejects.toThrow();
  });
});

describe('lobby (FR-3, FR-4)', () => {
  it('starts only when everyone is ready and only by the host', async () => {
    const { host, others } = await setup(['Anna', 'Ben', 'Cleo']);
    expect(host.room?.startBlocker).toMatch(/Ben and Cleo/);
    expect(await others[0]!.emit('host:start', {})).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    await others[0]!.emit('lobby:ready', { ready: true });
    await others[1]!.emit('lobby:ready', { ready: true });
    await waitFor(() => host.room?.startBlocker === null, 2000, 'ready');
    expect(await host.emit('host:start', {})).toEqual({ ok: true });
    await waitFor(() => clients.every((c) => c.view !== null), 2000, 'views');
    expect(host.room?.status).toBe('playing');
  });

  it('kicks a player, revoking their session, and can lock the room', async () => {
    const { server, host, others, code } = await setup(['Anna', 'Ben']);
    const ben = others[0]!;
    const benId = ben.room!.me.memberId;
    expect(await host.emit('host:kick', { memberId: benId })).toEqual({ ok: true });
    await waitFor(() => ben.ended === 'kicked', 2000, 'kick');
    await expect(ben.connect()).rejects.toThrow();

    expect(await host.emit('host:lock', { locked: true })).toEqual({ ok: true });
    const late = new Client(server, 'Late');
    clients.push(late);
    const res = await late.join(code);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'ROOM_LOCKED' } });
  });

  it('validates every message strictly', async () => {
    const { host } = await setup(['Anna', 'Ben']);
    expect(await host.emit('lobby:ready', { ready: 'yes' })).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    });
    expect(await host.emit('lobby:ready', { ready: true, extra: 1 })).toMatchObject({ ok: false });
    expect(await host.emit('chat:send', { text: '<img src=x onerror=alert(1)>' })).toEqual({
      ok: true,
    });
    await waitFor(() => host.chat.some((m) => m.kind === 'text'), 2000, 'chat');
    // Stored and sent as plain text; React renders it as text, never HTML.
    expect(host.chat.find((m) => m.kind === 'text')?.text).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('a full 4-player game (section 8)', () => {
  it('plays to the end with random legal moves, survives a restart, and never leaks hidden cards', async () => {
    const { server, host, others, code, all } = await setup(['Anna', 'Ben', 'Cleo', 'Dario'], {
      spectators: true,
    });
    const watcher = new Client(server, 'Watcher');
    clients.push(watcher);
    expect((await watcher.join(code, 'opensesame', true)).status).toBe(200);
    await watcher.connect();

    for (const c of others) await c.emit('lobby:ready', { ready: true });
    await waitFor(() => host.room?.startBlocker === null, 2000, 'ready');
    expect(await host.emit('host:start', {})).toEqual({ ok: true });
    await waitFor(
      () => all.every((c) => c.view?.version === 0) && watcher.view !== null,
      3000,
      'start',
    );
    expect(watcher.view!.viewerId).toBeNull();

    const rng = createRng('ab'.repeat(32));
    let moves = 0;
    let restarted = false;
    let target = server;

    const checkViews = () => {
      for (const c of [...all, watcher]) {
        const viewer = c.view?.viewerId ?? '';
        const secret = hiddenIds(target, code, viewer);
        for (const json of c.views) {
          for (const id of secret) expect(json.includes(id), `${c.name} saw ${id}`).toBe(false);
        }
        c.views = [];
      }
    };

    while (host.view?.status !== 'finished') {
      const view = host.view as GameView;
      const actor = all.find((c) => c.view?.viewerId === view.currentPlayerId)!;
      await waitFor(() => actor.view!.version === view.version, 3000, 'actor sync');
      const legal = legalIntentsForViewer(actor.view!);
      expect(legal.length).toBeGreaterThan(0);
      const buys = legal.filter((i) => i.type === 'BUY_FACE_UP' || i.type === 'BUY_RESERVED');
      const pool = buys.length > 0 && rng.nextInt(10) < 7 ? buys : legal;
      const intent = pool[rng.nextInt(pool.length)]!;
      const ack = await actor.emit('game:intent', { version: actor.view!.version, intent });
      expect(ack).toEqual({ ok: true });
      moves += 1;
      await waitFor(
        () => all.every((c) => c.view!.version === view.version + 1),
        3000,
        'broadcast',
      );
      checkViews();

      if (!restarted && moves === 25) {
        // Restart the server on the same port with the same database (FR-25).
        restarted = true;
        for (const c of [...all, watcher]) c.close();
        await server.stop();
        target = new TestServer(server.dir);
        await target.start(server.port);
        servers.push(target);
        for (const c of [...all, watcher]) {
          c.server = target;
          await c.connect();
        }
        await waitFor(() => all.every((c) => c.view?.version === 25), 3000, 'restored');
        expect(host.chat.some((m) => m.kind === 'system' && /restarted/.test(m.text))).toBe(true);
      }
      expect(moves).toBeLessThan(1000);
    }

    expect(restarted).toBe(true);
    expect(host.room?.status).toBe('finished');
    expect(host.view!.result!.winners.length).toBeGreaterThan(0);

    // Replaying stale versions is rejected (anti-replay, 5.3).
    const stale = await host.emit('game:intent', { version: 0, intent: { type: 'PASS' } });
    expect(stale.ok).toBe(false);

    // History was recorded (FR-26).
    const history = await host.api<{ history: { players: unknown[] }[] }>('GET', '/api/history');
    expect(history.body.history).toHaveLength(1);
    expect(history.body.history[0]!.players).toHaveLength(4);

    // Play again keeps the same seats (FR-12).
    expect(await host.emit('host:playAgain', {})).toEqual({ ok: true });
    await waitFor(
      () => host.view?.version === 0 && host.view.status === 'playing',
      3000,
      'rematch',
    );
    expect(host.view!.players.map((p) => p.name).sort()).toEqual(['Anna', 'Ben', 'Cleo', 'Dario']);
  }, 120_000);
});

describe('mid-game seats (FR-5)', () => {
  it('opens a removed player seat for a newcomer who takes it over', async () => {
    const { server, host, others, code } = await setup(['Anna', 'Ben']);
    await others[0]!.emit('lobby:ready', { ready: true });
    await waitFor(() => host.room?.startBlocker === null, 2000, 'ready');
    await host.emit('host:start', {});
    await waitFor(() => host.view !== null, 2000, 'start');
    const benId = others[0]!.room!.me.memberId;
    await host.emit('host:kick', { memberId: benId });
    await waitFor(() => host.room!.members.some((m) => m.open), 2000, 'open seat');

    const cleo = new Client(server, 'Cleo');
    clients.push(cleo);
    const res = await cleo.join(code);
    expect(res.body).toMatchObject({ claimed: true });
    await cleo.connect();
    expect(cleo.room!.me.memberId).toBe(benId);
    expect(cleo.view!.viewerId).toBe(benId);
  });
});
