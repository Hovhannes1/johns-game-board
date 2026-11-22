import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameServer } from './app';
import type { GameServer } from './app';
import { loadConfig } from './config';
import { silentLogger } from './logger';
import { freePort, testAdmin } from './testing/harness';

let server: GameServer;
let base = '';
const dir = mkdtempSync(path.join(tmpdir(), 'splendor-art-'));

beforeAll(async () => {
  writeFileSync(path.join(dir, 'cards.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  writeFileSync(path.join(dir, 'secret.txt'), 'nope');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = createGameServer({
    config: loadConfig(['--port', String(port)], {}, dir),
    admin: testAdmin,
    log: silentLogger,
    databaseFile: ':memory:',
    assetsDir: dir,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(port, '127.0.0.1', resolve));
});

afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('illustrated art route', () => {
  it('serves the known images with caching headers', async () => {
    const res = await fetch(`${base}/art/cards.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const etag = res.headers.get('etag')!;
    expect((await res.arrayBuffer()).byteLength).toBe(4);
    const again = await fetch(`${base}/art/cards.jpg`, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('returns 404 for missing art and never serves other files', async () => {
    expect((await fetch(`${base}/art/nobles.jpg`)).status).toBe(404);
    expect((await fetch(`${base}/art/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/art/..%2fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/art/`)).status).toBe(404);
  });

  it('rejects writes', async () => {
    expect((await fetch(`${base}/art/cards.jpg`, { method: 'POST' })).status).toBe(405);
  });
});
