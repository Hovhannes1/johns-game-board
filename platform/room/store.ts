import type { HistoryEntry } from './protocol';

export interface RoomRecord {
  id: string;
  code: string;
  name: string;
  passwordHash: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface RoomStore {
  allRooms(): RoomRecord[];
  saveRoom(room: RoomRecord): void;
  deleteRoom(id: string): void;
  addHistory(entry: HistoryEntry): void;
  listHistory(limit?: number): HistoryEntry[];
}

export interface RoomLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export const noopLogger: RoomLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const consoleLogger: RoomLogger = {
  info: (event, fields) => console.info(`[room] ${event}`, fields ?? ''),
  warn: (event, fields) => console.warn(`[room] ${event}`, fields ?? ''),
  error: (event, fields) => console.error(`[room] ${event}`, fields ?? ''),
};
