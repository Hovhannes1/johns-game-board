import { randomKey } from '@/platform/crypto';
import { isBroadcastMode } from '@/platform/net/factory';
import type { HistoryEntry } from './protocol';
import type { RoomRecord, RoomStore } from './store';

const DB_NAME = 'johns-game-board';
const DB_VERSION = 1;
const ROOMS_STORE = 'rooms';
const HISTORY_STORE = 'history';

const CLIENT_KEY_PREFIX = 'jgb:clientKey:';
const CLIENT_HISTORY_KEY = 'jgb:history';
const memoryKeys = new Map<string, string>();

/**
 * Stable per-room identity stored in localStorage so refreshing a browser tab
 * lets a player rejoin their seat without re-entering the room password.
 */
export function getOrCreateClientKey(roomCode: string): string {
  const key = `${CLIENT_KEY_PREFIX}${roomCode.toUpperCase()}`;
  try {
    if (typeof window !== 'undefined') {
      const storage = isBroadcastMode() ? window.sessionStorage : window.localStorage;
      if (storage) {
        const existing = storage.getItem(key);
        if (existing) return existing;
        const created = randomKey();
        storage.setItem(key, created);
        return created;
      }
    }
  } catch {
    // Fall back to memory if storage is blocked.
  }
  const existing = memoryKeys.get(key);
  if (existing) return existing;
  const created = randomKey();
  memoryKeys.set(key, created);
  return created;
}

export function saveClientHistory(entry: HistoryEntry): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const current = loadClientHistory();
    if (current.some((e) => e.id === entry.id)) return;
    const next = [entry, ...current].slice(0, 100);
    window.localStorage.setItem(CLIENT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors.
  }
}

export function loadClientHistory(): HistoryEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(CLIENT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROOMS_STORE)) {
        db.createObjectStore(ROOMS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Synchronous `RoomStore` facade backed by an in-memory cache that hydrates
 * from IndexedDB on `open()` and flushes writes asynchronously.
 */
export class BrowserRoomStore implements RoomStore {
  private db: IDBDatabase | null = null;
  private readonly rooms = new Map<string, RoomRecord>();
  private history: HistoryEntry[] = [];

  async open(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      this.db = await openDb();
      const [rooms, history] = await Promise.all([
        readAll<RoomRecord>(this.db, ROOMS_STORE),
        readAll<HistoryEntry>(this.db, HISTORY_STORE),
      ]);
      this.rooms.clear();
      for (const r of rooms) this.rooms.set(r.id, r);
      this.history = history.sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 100);
    } catch {
      this.db = null;
    }
  }

  allRooms(): RoomRecord[] {
    return [...this.rooms.values()];
  }

  saveRoom(room: RoomRecord): void {
    const copy = structuredClone(room);
    this.rooms.set(room.id, copy);
    if (!this.db) return;
    try {
      const tx = this.db.transaction(ROOMS_STORE, 'readwrite');
      tx.objectStore(ROOMS_STORE).put(copy);
    } catch {
      // Ignore write failures in private browsing.
    }
  }

  deleteRoom(id: string): void {
    this.rooms.delete(id);
    if (!this.db) return;
    try {
      const tx = this.db.transaction(ROOMS_STORE, 'readwrite');
      tx.objectStore(ROOMS_STORE).delete(id);
    } catch {
      // Ignore.
    }
  }

  addHistory(entry: HistoryEntry): void {
    const copy = structuredClone(entry);
    this.history = [copy, ...this.history.filter((e) => e.id !== entry.id)].slice(0, 100);
    saveClientHistory(copy);
    if (!this.db) return;
    try {
      const tx = this.db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).put(copy);
    } catch {
      // Ignore.
    }
  }

  listHistory(limit = 100): HistoryEntry[] {
    return this.history.slice(0, limit);
  }
}
