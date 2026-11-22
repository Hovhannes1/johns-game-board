/**
 * Event logging (SEC-15): JSON lines to a daily file with retention, plus a
 * short console line. Secrets are redacted by key name and IP addresses are
 * truncated, so logs never contain passwords, tokens or full addresses.
 */
import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const SECRET_KEYS = /pass(word)?|secret|token|cookie|authorization|seed/i;

export function maskIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.replace(/\.\d+$/, '.x');
  // IPv6: keep the first three hextets.
  return `${ip.split(':').slice(0, 3).join(':')}::x`;
}

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEYS.test(key)) out[key] = '[redacted]';
    else if (key === 'ip') out[key] = maskIp(String(value));
    else out[key] = value;
  }
  return out;
}

export type Level = 'info' | 'warn' | 'error';

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(options: {
  dir: string | null;
  retainDays?: number;
  quiet?: boolean;
}): Logger {
  const { dir, retainDays = 14, quiet = false } = options;
  if (dir) mkdirSync(dir, { recursive: true });
  let pruned = '';

  const write = (level: Level, event: string, fields: Record<string, unknown> = {}) => {
    const now = new Date();
    const line = { t: now.toISOString(), level, event, ...redact(fields) };
    if (!quiet && level !== 'info')
      console[level === 'warn' ? 'warn' : 'error'](`[${level}] ${event}`, redact(fields));
    if (!dir) return;
    const day = now.toISOString().slice(0, 10);
    try {
      appendFileSync(path.join(dir, `splendor-${day}.log`), `${JSON.stringify(line)}\n`, 'utf8');
      if (pruned !== day) {
        pruned = day;
        // Rotation: keep the newest `retainDays` daily files.
        const files = readdirSync(dir)
          .filter((f) => /^splendor-\d{4}-\d{2}-\d{2}\.log$/.test(f))
          .sort();
        for (const old of files.slice(0, Math.max(0, files.length - retainDays)))
          rmSync(path.join(dir, old));
      }
    } catch {
      // Logging must never take the server down.
    }
  };

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
