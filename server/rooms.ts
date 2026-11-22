/**
 * Server adapter over the platform-agnostic `HostRoomManager`.
 * Kept while the legacy Node/Socket.IO server is still active; removed in Milestone 6.
 */
import type { GameState, GameView } from '../games/splendor/engine';
import type { Room as BaseRoom, RoomEvents as BaseRoomEvents } from '../platform/room/host-room';
import {
  HostRoomManager,
  LIMITS,
  fail,
  type ErrorCode,
  type Member,
  type Result,
} from '../platform/room/host-room';
import type { Logger } from './logger';
import type { Store } from './db';

export { LIMITS, fail };
export type { ErrorCode, Member, Result };
export type Room = BaseRoom<GameState>;
export type RoomEvents = BaseRoomEvents<GameState>;

export class RoomManager extends HostRoomManager<GameState> {
  constructor(store: Store, events: RoomEvents, log: Logger, now: () => number = Date.now) {
    super(store, events, log, now);
  }

  override gameView(room: Room, memberId: string): GameView | null {
    return super.gameView(room, memberId) as GameView | null;
  }
}
