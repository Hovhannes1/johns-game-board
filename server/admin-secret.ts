/**
 * Host/admin secret (SEC-2). Taken from SPLENDOR_ADMIN_SECRET when set;
 * otherwise generated on first run, printed once, and stored only as an
 * argon2id hash in the data directory.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from './config';
import { hashPassword, verifyPassword } from './security/passwords';
import { safeEqual } from './security/tokens';

export interface AdminSecret {
  verify(candidate: string): Promise<boolean>;
  /** The freshly generated secret, to print once; null otherwise. */
  generated: string | null;
  source: 'env' | 'file';
}

export const ADMIN_SECRET_FILE = 'admin-secret.hash';

export async function loadAdminSecret(config: ServerConfig): Promise<AdminSecret> {
  if (config.adminSecret) {
    const expected = config.adminSecret;
    return { verify: async (c) => safeEqual(c, expected), generated: null, source: 'env' };
  }
  const file = path.join(config.dataDir, ADMIN_SECRET_FILE);
  let generated: string | null = null;
  if (!existsSync(file)) {
    generated = randomBytes(18).toString('base64url');
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(file, `${await hashPassword(generated)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  const hash = readFileSync(file, 'utf8').trim();
  return { verify: (c) => verifyPassword(c, hash), generated, source: 'file' };
}
