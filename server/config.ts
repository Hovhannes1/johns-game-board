import { networkInterfaces } from 'node:os';
import path from 'node:path';

export type NetworkMode = 'local' | 'lan';

export interface ServerConfig {
  dev: boolean;
  mode: NetworkMode;
  /** Interface to bind: 127.0.0.1 in local mode (section 6.1). */
  host: string;
  port: number;
  /** Origins allowed to open WebSocket connections and send API writes (SEC-10). */
  allowedOrigins: ReadonlySet<string>;
  /** Host headers accepted for any request; blocks DNS rebinding. */
  allowedHosts: ReadonlySet<string>;
  /** Public Tailscale Funnel traffic is refused unless this is set (SEC-18). */
  allowFunnel: boolean;
  /** Where the database, logs and generated admin secret live. */
  dataDir: string;
  /** Admin secret from the environment (SEC-2); otherwise one is generated. */
  adminSecret: string | null;
}

export type Env = Readonly<Record<string, string | undefined>>;

function flag(args: readonly string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePort(raw: string | undefined): number {
  const port = Number(raw ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return port;
}

export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface!.address);
}

/** Normalizes an origin string (scheme://host[:port]); returns null if invalid. */
export function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function hostsFor(origins: Iterable<string>): Set<string> {
  return new Set([...origins].map((o) => new URL(o).host.toLowerCase()));
}

export function loadConfig(args: readonly string[], env: Env, root = process.cwd()): ServerConfig {
  const dev = flag(args, 'dev');
  const modeRaw = flag(args, 'lan') ? 'lan' : (env.SPLENDOR_MODE ?? 'local');
  if (modeRaw !== 'local' && modeRaw !== 'lan') {
    throw new Error(`SPLENDOR_MODE must be "local" or "lan", got "${modeRaw}"`);
  }
  const mode: NetworkMode = modeRaw;
  const port = parsePort(option(args, 'port') ?? env.SPLENDOR_PORT);
  const host = mode === 'lan' ? '0.0.0.0' : '127.0.0.1';

  const origins = new Set<string>([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (mode === 'lan') for (const ip of lanAddresses()) origins.add(`http://${ip}:${port}`);
  for (const extra of (env.SPLENDOR_ALLOWED_ORIGINS ?? '').split(',')) {
    if (!extra.trim()) continue;
    const origin = normalizeOrigin(extra);
    if (!origin) throw new Error(`Invalid origin in SPLENDOR_ALLOWED_ORIGINS: ${extra}`);
    origins.add(origin);
  }

  const secret = env.SPLENDOR_ADMIN_SECRET?.trim() || null;
  if (secret && secret.length < 12) {
    throw new Error('SPLENDOR_ADMIN_SECRET must be at least 12 characters');
  }

  return {
    dev,
    mode,
    host,
    port,
    allowedOrigins: origins,
    allowedHosts: hostsFor(origins),
    allowFunnel: flag(args, 'funnel') || env.SPLENDOR_ALLOW_FUNNEL === '1',
    dataDir: path.resolve(root, env.SPLENDOR_DATA_DIR ?? 'var'),
    adminSecret: secret,
  };
}

/** Adds origins discovered at runtime (for example the Tailscale Serve URL). */
export function withOrigins(config: ServerConfig, extra: readonly string[]): ServerConfig {
  const origins = new Set(config.allowedOrigins);
  for (const raw of extra) {
    const origin = normalizeOrigin(raw);
    if (origin) origins.add(origin);
  }
  return { ...config, allowedOrigins: origins, allowedHosts: hostsFor(origins) };
}

export function joinUrls(config: ServerConfig): string[] {
  if (config.mode === 'local') return [`http://127.0.0.1:${config.port}`];
  return lanAddresses().map((ip) => `http://${ip}:${config.port}`);
}
