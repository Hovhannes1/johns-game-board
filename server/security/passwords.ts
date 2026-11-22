/**
 * Password hashing (SEC-1). argon2id from node:crypto with OWASP's minimum
 * recommended parameters; scrypt is used when argon2 is unavailable. Hashes
 * are self-describing PHC-style strings, so parameters can change later.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const ARGON2 = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 } as const;

type Argon2Fn = (
  algorithm: 'argon2id',
  params: {
    message: string | Buffer;
    nonce: Buffer;
    parallelism: number;
    tagLength: number;
    memory: number;
    passes: number;
  },
  callback: (err: Error | null, key: Buffer) => void,
) => void;

const argon2 = (crypto as unknown as { argon2?: Argon2Fn }).argon2;

function argon2Hash(
  passwordText: string,
  salt: Buffer,
  memory: number,
  passes: number,
  parallelism: number,
) {
  return new Promise<Buffer>((resolve, reject) =>
    argon2!(
      'argon2id',
      {
        message: passwordText,
        nonce: salt,
        parallelism,
        tagLength: ARGON2.tagLength,
        memory,
        passes,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

export const passwordAlgorithm = argon2 ? 'argon2id' : 'scrypt';

export async function hashPassword(passwordText: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  if (argon2) {
    const key = await argon2Hash(
      passwordText,
      salt,
      ARGON2.memory,
      ARGON2.passes,
      ARGON2.parallelism,
    );
    return `$argon2id$v=19$m=${ARGON2.memory},t=${ARGON2.passes},p=${ARGON2.parallelism}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }
  const key = await scrypt(passwordText, salt, SCRYPT.keylen, SCRYPT);
  return `$scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function params(spec: string): Record<string, number> {
  return Object.fromEntries(
    spec.split(',').map((pair) => {
      const [k, v] = pair.split('=');
      return [k, Number(v)];
    }),
  );
}

/** Constant-time verification; false for malformed or unsupported hashes. */
export async function verifyPassword(passwordText: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  try {
    if (parts[1] === 'argon2id' && argon2 && parts.length === 6) {
      const p = params(parts[3]!);
      const salt = Buffer.from(parts[4]!, 'base64url');
      const expected = Buffer.from(parts[5]!, 'base64url');
      const key = await argon2Hash(passwordText, salt, p.m!, p.t!, p.p!);
      return key.length === expected.length && crypto.timingSafeEqual(key, expected);
    }
    if (parts[1] === 'scrypt' && parts.length === 5) {
      const p = params(parts[2]!);
      const salt = Buffer.from(parts[3]!, 'base64url');
      const expected = Buffer.from(parts[4]!, 'base64url');
      const key = await scrypt(passwordText, salt, expected.length, {
        N: p.N!,
        r: p.r!,
        p: p.p!,
        maxmem: SCRYPT.maxmem,
      });
      return crypto.timingSafeEqual(key, expected);
    }
  } catch {
    return false;
  }
  return false;
}
