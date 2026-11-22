/**
 * Entry point: boots Next.js and the game server on one port (section 5.1).
 * Binds to 127.0.0.1 unless LAN mode is requested (6.1).
 *
 *   npm run dev            development with hot reload
 *   npm run host           production build + start (prints the join link)
 *   npm run start -- --lan expose on the local network
 */
// No telemetry or third-party calls (SEC-14). Must be set before Next loads.
process.env.NEXT_TELEMETRY_DISABLED = '1';

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdminSecret } from './admin-secret';
import { createGameServer } from './app';
import { joinUrls, loadConfig, withOrigins } from './config';
import { createLogger } from './logger';
import { detectTailscale, isServing } from './tailscale';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

let config = loadConfig(process.argv.slice(2), process.env, root);
const tailscale = await detectTailscale();
if (tailscale) config = withOrigins(config, [tailscale.url]);

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  console.warn('Warning: running as root. Run the game server as a normal user (SEC-13).');
}

const log = createLogger({ dir: path.join(config.dataDir, 'logs') });
const admin = await loadAdminSecret(config);

const { default: next } = await import('next');
const app = next({
  dev: config.dev,
  dir: root,
  hostname: config.host,
  port: config.port,
  ...(config.dev ? { turbopack: true } : {}),
});
await app.prepare();

const publicBase = tailscale?.url ?? joinUrls(config)[0]!;

const server = createGameServer({
  config,
  admin,
  log,
  databaseFile: path.join(config.dataDir, 'splendor.sqlite'),
  nextRequest: app.getRequestHandler(),
  nextUpgrade: config.dev ? app.getUpgradeHandler() : undefined,
  assetsDir: path.join(root, 'assets'),
  onRoomCreated: (room) => {
    console.log(`Room "${room.name}" is open. Code: ${room.code}`);
    console.log(`  Invite link: ${publicBase}/join/${room.code} (share the password separately)`);
  },
});

server.httpServer.listen(config.port, config.host, async () => {
  log.info('server.started', { mode: config.mode, port: config.port, funnel: config.allowFunnel });
  const line = (s = '') => console.log(s);
  line();
  line(`Splendor Online is running in ${config.mode} mode${config.dev ? ' (dev)' : ''}.`);
  for (const url of joinUrls(config)) line(`  This machine:  ${url}  (host page: ${url}/host)`);
  if (tailscale) {
    line(`  Friends:       ${tailscale.url}`);
    if (!tailscale.online) {
      line('  Tailscale is not connected. Start the Tailscale app so friends can reach you.');
    } else if (!(await isServing(config.port))) {
      line(
        `  Tailscale Serve is not forwarding to this port yet. Run: tailscale serve --bg ${config.port}`,
      );
    }
  } else {
    line('  Tailscale not detected; friends cannot reach this machine yet (see docs/hosting.md).');
  }
  if (config.allowFunnel) line('  Public Tailscale Funnel traffic is ALLOWED (--funnel).');
  if (admin.generated) {
    line();
    line('  Host secret (shown once, save it now):');
    line(`    ${admin.generated}`);
    line('  Lost it? Run `npm run admin:reset` and restart for a new one.');
  } else if (admin.source === 'file') {
    line('  Host secret: the one printed on first run (stored hashed in var/admin-secret.hash).');
  }
  line();
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);
  void server
    .close()
    .then(() => app.close())
    .finally(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
