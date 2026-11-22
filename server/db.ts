/**
 * Local persistence (FR-25, FR-26) on Node's built-in SQLite (node:sqlite),
 * which avoids a native add-on. Rooms (including each game's seed and action
 * log) are written after every accepted action so games survive restarts.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { HistoryEntry } from '../lib/protocol';

export interface StoredRoom {
  id: string;
  code: string;
  name: string;
  passwordHash: string;
  /** JSON-serializable room data (settings, members, game record). */
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

export type SessionKind = 'admin' | 'member';

export interface StoredSession {
  tokenHash: string;
  kind: SessionKind;
  roomId: string | null;
  memberId: string | null;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
}

const SCHEMA_VERSION = 1;

export class Store {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;',
    );
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('admin', 'member')),
        room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
        member_id TEXT,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_member ON sessions (room_id, member_id);
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        room_name TEXT NOT NULL,
        finished_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING')
      .run('schema_version', String(SCHEMA_VERSION));
  }

  // -- rooms ---------------------------------------------------------------

  allRooms(): StoredRoom[] {
    const rows = this.db.prepare('SELECT * FROM rooms').all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      passwordHash: String(r.password_hash),
      data: JSON.parse(String(r.data)),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    }));
  }

  saveRoom(room: StoredRoom): void {
    this.db
      .prepare(
        `INSERT INTO rooms (id, code, name, password_hash, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(
        room.id,
        room.code,
        room.name,
        room.passwordHash,
        JSON.stringify(room.data),
        room.createdAt,
        room.updatedAt,
      );
  }

  deleteRoom(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE room_id = ?').run(id);
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  }

  // -- sessions ------------------------------------------------------------

  getSession(tokenHash: string): StoredSession | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as
      Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      tokenHash: String(r.token_hash),
      kind: r.kind as SessionKind,
      roomId: r.room_id === null ? null : String(r.room_id),
      memberId: r.member_id === null ? null : String(r.member_id),
      createdAt: Number(r.created_at),
      lastSeen: Number(r.last_seen),
      expiresAt: Number(r.expires_at),
    };
  }

  insertSession(s: StoredSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (token_hash, kind, room_id, member_id, created_at, last_seen, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.tokenHash, s.kind, s.roomId, s.memberId, s.createdAt, s.lastSeen, s.expiresAt);
  }

  touchSession(tokenHash: string, lastSeen: number, expiresAt: number): void {
    this.db
      .prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?')
      .run(lastSeen, expiresAt, tokenHash);
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  deleteMemberSessions(roomId: string, memberId: string): void {
    this.db
      .prepare('DELETE FROM sessions WHERE room_id = ? AND member_id = ?')
      .run(roomId, memberId);
  }

  deleteExpiredSessions(now: number): number {
    const result = this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    return Number(result.changes);
  }

  // -- history -------------------------------------------------------------

  addHistory(entry: HistoryEntry): void {
    this.db
      .prepare('INSERT INTO history (id, room_name, finished_at, data) VALUES (?, ?, ?, ?)')
      .run(entry.id, entry.roomName, entry.finishedAt, JSON.stringify(entry));
  }

  listHistory(limit = 100): HistoryEntry[] {
    const rows = this.db
      .prepare('SELECT data FROM history ORDER BY finished_at DESC LIMIT ?')
      .all(limit) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as HistoryEntry);
  }

  close(): void {
    this.db.close();
  }
}
