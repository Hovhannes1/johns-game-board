/**
 * Session tokens (SEC-3). The browser holds a random 256-bit token in an
 * HttpOnly cookie; the server stores only its SHA-256 hash. Sessions slide
 * forward while used, expire when idle, and can be revoked.
 */
import type { SessionKind, Store, StoredSession } from './db';
import { hashToken, newToken } from './security/tokens';

export const SESSION_TTL: Record<SessionKind, number> = {
  member: 3 * 24 * 60 * 60 * 1000,
  admin: 12 * 60 * 60 * 1000,
};

/** Avoid a database write on every request: only persist last-seen this often. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export class Sessions {
  constructor(
    private readonly store: Store,
    private readonly now: () => number = Date.now,
  ) {}

  create(kind: SessionKind, roomId: string | null, memberId: string | null): string {
    const token = newToken();
    const now = this.now();
    this.store.insertSession({
      tokenHash: hashToken(token),
      kind,
      roomId,
      memberId,
      createdAt: now,
      lastSeen: now,
      expiresAt: now + SESSION_TTL[kind],
    });
    return token;
  }

  /** Returns the live session for a raw token, or null if unknown or expired. */
  resolve(token: string | undefined, kind: SessionKind): StoredSession | null {
    if (!token || token.length > 100) return null;
    const hash = hashToken(token);
    const session = this.store.getSession(hash);
    if (!session || session.kind !== kind) return null;
    const now = this.now();
    if (session.expiresAt <= now) {
      this.store.deleteSession(hash);
      return null;
    }
    if (now - session.lastSeen > TOUCH_EVERY_MS) {
      session.lastSeen = now;
      session.expiresAt = now + SESSION_TTL[kind];
      this.store.touchSession(hash, session.lastSeen, session.expiresAt);
    }
    return session;
  }

  revoke(token: string | undefined): void {
    if (token) this.store.deleteSession(hashToken(token));
  }

  revokeMember(roomId: string, memberId: string): void {
    this.store.deleteMemberSessions(roomId, memberId);
  }

  prune(): number {
    return this.store.deleteExpiredSessions(this.now());
  }
}
