/**
 * Optional Tailscale discovery: finds this machine's tailnet DNS name so the
 * Serve URL can be allowed and printed automatically (section 6.2). Purely
 * local: runs the installed `tailscale` CLI, never contacts anything else.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface TailscaleInfo {
  dnsName: string;
  url: string;
  online: boolean;
}

function cliCandidates(): string[] {
  const list = ['tailscale'];
  if (process.platform === 'win32') {
    list.unshift(
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
    );
  }
  if (process.platform === 'darwin')
    list.push('/Applications/Tailscale.app/Contents/MacOS/Tailscale');
  return list;
}

function run(file: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: 3000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

/** True when `tailscale serve` already proxies to this port. */
export async function isServing(port: number): Promise<boolean> {
  for (const cli of cliCandidates()) {
    if (path.isAbsolute(cli) && !existsSync(cli)) continue;
    const out = await run(cli, ['serve', 'status', '--json']);
    if (out !== null) return out.includes(`127.0.0.1:${port}`) || out.includes(`localhost:${port}`);
  }
  return false;
}

export async function detectTailscale(): Promise<TailscaleInfo | null> {
  for (const cli of cliCandidates()) {
    if (path.isAbsolute(cli) && !existsSync(cli)) continue;
    const out = await run(cli, ['status', '--json']);
    if (!out) continue;
    try {
      const status = JSON.parse(out) as {
        BackendState?: string;
        Self?: { DNSName?: string; Online?: boolean };
      };
      const dnsName = status.Self?.DNSName?.replace(/\.$/, '');
      if (!dnsName) return null;
      return { dnsName, url: `https://${dnsName}`, online: status.BackendState === 'Running' };
    } catch {
      return null;
    }
  }
  return null;
}
