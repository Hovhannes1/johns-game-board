/**
 * Serves the illustrated art from the `assets/` folder at /art/<name>.jpg.
 * Only the four known files are served: no directory listing, no other
 * paths (SEC-13). Missing files return 404 and the UI falls back to vector art.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const ART_PATH = /^\/art\/(cards|chips|deck|nobles)\.jpg$/;

/** Returns true when the request was an art request (handled here). */
export async function serveArt(
  req: IncomingMessage,
  res: ServerResponse,
  assetsDir: string | undefined,
): Promise<boolean> {
  const pathname = new URL(req.url ?? '/', 'http://local').pathname;
  const match = ART_PATH.exec(pathname);
  if (!match) return false;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return true;
  }
  if (!assetsDir) {
    res.statusCode = 404;
    res.end();
    return true;
  }

  const file = path.join(assetsDir, `${match[1]}.jpg`);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(info.size));
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  }
  return true;
}
