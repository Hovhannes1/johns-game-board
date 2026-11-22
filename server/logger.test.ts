import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, maskIp } from './logger';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('logger (SEC-15)', () => {
  it('masks IP addresses', () => {
    expect(maskIp('100.64.12.34')).toBe('100.64.12.x');
    expect(maskIp('::ffff:127.0.0.1')).toBe('127.0.0.x');
    expect(maskIp('fd7a:115c:a1e0:ab12::1')).toBe('fd7a:115c:a1e0::x');
    expect(maskIp(undefined)).toBe('unknown');
  });

  it('redacts secrets and keeps a bounded number of daily files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'splendor-log-'));
    dirs.push(dir);
    for (let d = 1; d <= 5; d++) writeFileSync(path.join(dir, `splendor-2020-01-0${d}.log`), '');
    const log = createLogger({ dir, retainDays: 3, quiet: true });
    log.warn('room.join_failed', {
      ip: '100.64.1.2',
      password: 'hunter2',
      token: 'abc',
      seed: 'ff',
      room: 'r_1',
    });
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(3);
    const today = readFileSync(path.join(dir, files.at(-1)!), 'utf8');
    expect(today).toContain('"ip":"100.64.1.x"');
    expect(today).toContain('"room":"r_1"');
    for (const secret of ['hunter2', '"abc"', '"ff"']) expect(today).not.toContain(secret);
  });
});
