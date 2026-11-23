/**
 * Generic room, lobby, and authoritative game host.
 *
 * Pure TypeScript with no Node-only APIs so it runs identically in a browser
 * host tab or in Node tests. Talks to the outside world only through
 * `RoomStore`, `RoomEvents`, and `RoomLogger`.
 */
import { cryptoShuffle, newId, newRoomCode, newSeed } from '@/platform/crypto';
import type { AnyGameModule, GameRecord } from '@/platform/games/types';
import { getGameModule } from '@/platform/games/registry';
import type {
  ChatMessage,
  HistoryEntry,
  MemberRole,
  MemberView,
  RoomSettings,
  RoomStatus,
  RoomView,
  SeatColorId,
} from './protocol';
import { SEAT_COLOR_IDS } from './protocol';
import type { RoomLogger, RoomStore } from './store';
import { serverErrors, systemChat } from './strings';

export interface Member {
  id: string;
  name: string;
  color: SeatColorId;
  role: MemberRole;
  isHost: boolean;
  ready: boolean;
  joinedAt: number;
  /** Player removed mid-game: the seat waits for someone to take it over. */
  open: boolean;
}

export interface RoomData {
  gameId?: string;
  settings: RoomSettings;
  locked: boolean;
  status: RoomStatus;
  members: Member[];
  game: GameRecord | null;
}

export interface Room<State = unknown> extends RoomData {
  gameId: string;
  id: string;
  code: string;
  name: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  // Runtime only:
  state: State | null;
  connections: Map<string, number>;
  disconnectedAt: Map<string, number>;
  openedAt: Map<string, number>;
  chat: ChatMessage[];
  turnStartedAt: number;
  turnOwner: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  deadline: number | null;
  lastActivity: number;
}

export interface RoomEvents<State = unknown> {
  roomChanged(room: Room<State>): void;
  gameChanged(room: Room<State>): void;
  chat(room: Room<State>, message: ChatMessage): void;
  memberRemoved(room: Room<State>, memberId: string, reason: 'kicked' | 'closed' | 'left'): void;
}

export type ErrorCode = keyof typeof serverErrors;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; code: string; message: string };

export function fail(
  code: ErrorCode,
  message?: string,
): { ok: false; code: string; message: string } {
  const text = serverErrors[code];
  return { ok: false, code, message: message ?? (typeof text === 'string' ? text : code) };
}

export const LIMITS = {
  maxRooms: 20,
  maxSpectators: 8,
  chatHistory: 100,
  /** An open seat (player removed mid-game) is auto-played after this long. */
  openSeatSkipMs: 15_000,
  idleLobbyMs: 6 * 60 * 60 * 1000,
  idleGameMs: 3 * 24 * 60 * 60 * 1000,
} as const;

export class HostRoomManager<State = unknown> {
  private readonly rooms = new Map<string, Room<State>>();
  private readonly byCode = new Map<string, Room<State>>();

  constructor(
    private readonly store: RoomStore,
    private readonly events: RoomEvents<State>,
    private readonly log: RoomLogger,
    private readonly now: () => number = Date.now,
    private readonly resolveGame: (gameId: string) => AnyGameModule | undefined = getGameModule,
  ) {}

  private gameOf(room: Room<State>) {
    const mod = this.resolveGame(room.gameId);
    if (!mod) throw new Error(`Unknown game module: ${room.gameId}`);
    return mod;
  }

  // ---------------------------------------------------------------------------
  // Loading and saving
  // ---------------------------------------------------------------------------

  /** Restores rooms after a restart; in-progress games are rebuilt by replay. */
  load(): void {
    for (const stored of this.store.allRooms()) {
      const data = stored.data as RoomData;
      const room = this.hydrate({
        ...data,
        gameId: data.gameId ?? 'splendor',
        id: stored.id,
        code: stored.code,
        name: stored.name,
        passwordHash: stored.passwordHash,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
      });
      if (data.game && data.status !== 'lobby') {
        try {
          room.state = this.gameOf(room).replay(data.game) as State;
          if (room.status === 'playing') this.systemMessage(room, systemChat.restored);
        } catch (error) {
          this.log.error('room.restore_failed', { room: room.id, message: String(error) });
          room.status = 'lobby';
          room.game = null;
        }
      }
      this.index(room);
      this.schedule(room);
    }
    this.log.info('rooms.loaded', { count: this.rooms.size });
  }

  private hydrate(
    base: RoomData &
      Pick<Room, 'id' | 'code' | 'name' | 'passwordHash' | 'createdAt' | 'updatedAt'> & {
        gameId: string;
      },
  ): Room<State> {
    return {
      ...base,
      state: null,
      connections: new Map(),
      disconnectedAt: new Map(),
      openedAt: new Map(),
      chat: [],
      turnStartedAt: this.now(),
      turnOwner: null,
      timer: null,
      deadline: null,
      lastActivity: this.now(),
    };
  }

  private index(room: Room<State>): void {
    this.rooms.set(room.id, room);
    this.byCode.set(room.code, room);
  }

  private persist(room: Room<State>): void {
    room.updatedAt = this.now();
    room.lastActivity = room.updatedAt;
    const data: RoomData = {
      gameId: room.gameId,
      settings: room.settings,
      locked: room.locked,
      status: room.status,
      members: room.members,
      game: room.game,
    };
    this.store.saveRoom({
      id: room.id,
      code: room.code,
      name: room.name,
      passwordHash: room.passwordHash,
      data,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    });
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  get(id: string): Room<State> | undefined {
    return this.rooms.get(id);
  }

  findByCode(code: string): Room<State> | undefined {
    return this.byCode.get(code);
  }

  all(): Room<State>[] {
    return [...this.rooms.values()];
  }

  member(room: Room<State>, memberId: string): Member | undefined {
    return room.members.find((m) => m.id === memberId);
  }

  private players(room: Room<State>): Member[] {
    return room.members.filter((m) => m.role === 'player');
  }

  // ---------------------------------------------------------------------------
  // Creating and joining
  // ---------------------------------------------------------------------------

  private validateSettings(
    mod: AnyGameModule,
    settings: RoomSettings,
  ): Result<{ settings: RoomSettings }> {
    if (!mod.options) {
      if (settings.gameOptions && Object.keys(settings.gameOptions).length > 0) {
        return fail('BAD_SETTINGS');
      }
      return { ok: true, settings };
    }
    const merged = { ...mod.options.defaults, ...(settings.gameOptions ?? {}) };
    const parsed = mod.options.schema.safeParse(merged);
    if (!parsed.success) return fail('BAD_SETTINGS');
    return { ok: true, settings: { ...settings, gameOptions: parsed.data } };
  }

  create(input: {
    gameId?: string;
    code?: string;
    name: string;
    passwordHash: string;
    settings: RoomSettings;
    hostName: string;
    hostColor: SeatColorId;
  }): Result<{ room: Room<State>; member: Member }> {
    if (this.rooms.size >= LIMITS.maxRooms) return fail('TOO_MANY_ROOMS');
    const gameId = input.gameId ?? 'splendor';
    const mod = this.resolveGame(gameId);
    if (!mod) return fail('BAD_SETTINGS');
    const checked = this.validateSettings(mod, input.settings);
    if (!checked.ok) return checked;
    let code = input.code ?? newRoomCode();
    while (this.byCode.has(code)) code = newRoomCode();
    const now = this.now();
    const host: Member = {
      id: newId('m'),
      name: input.hostName,
      color: input.hostColor,
      role: 'player',
      isHost: true,
      ready: true,
      joinedAt: now,
      open: false,
    };
    const room = this.hydrate({
      gameId,
      id: newId('r'),
      code,
      name: input.name,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
      settings: checked.settings,
      locked: false,
      status: 'lobby',
      members: [host],
      game: null,
    });
    this.index(room);
    this.persist(room);
    this.log.info('room.created', { room: room.id, maxPlayers: input.settings.maxPlayers });
    return { ok: true, room, member: host };
  }

  /** Seats a new person (password already verified by the caller). */
  join(
    room: Room<State>,
    input: { name: string; color: SeatColorId; spectator: boolean },
  ): Result<{ member: Member; claimed: boolean }> {
    if (room.locked) return fail('ROOM_LOCKED');
    const nameTaken = room.members.some(
      (m) => !m.open && m.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    );
    if (nameTaken) return fail('NAME_TAKEN');

    if (room.status === 'playing' && !input.spectator) {
      // Mid-game, a newcomer can only take over a seat the host opened.
      const open = room.members.find((m) => m.open);
      if (open) {
        open.open = false;
        room.openedAt.delete(open.id);
        this.systemMessage(room, systemChat.tookSeat(input.name, open.name));
        this.persist(room);
        this.schedule(room);
        this.events.roomChanged(room);
        return { ok: true, member: open, claimed: true };
      }
      return fail('GAME_IN_PROGRESS');
    }

    if (input.spectator) {
      if (!room.settings.spectators) return fail('SPECTATORS_DISABLED');
      if (room.members.filter((m) => m.role === 'spectator').length >= LIMITS.maxSpectators) {
        return fail('ROOM_FULL');
      }
    } else if (this.players(room).length >= room.settings.maxPlayers) {
      return fail('ROOM_FULL');
    }

    const taken = new Set(room.members.map((m) => m.color));
    const color = taken.has(input.color)
      ? (SEAT_COLOR_IDS.find((c) => !taken.has(c)) ?? input.color)
      : input.color;
    const member: Member = {
      id: newId('m'),
      name: input.name,
      color,
      role: input.spectator ? 'spectator' : 'player',
      isHost: false,
      ready: false,
      joinedAt: this.now(),
      open: false,
    };
    room.members.push(member);
    this.systemMessage(
      room,
      input.spectator ? systemChat.spectating(member.name) : systemChat.joined(member.name),
    );
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true, member, claimed: false };
  }

  // ---------------------------------------------------------------------------
  // Presence
  // ---------------------------------------------------------------------------

  connect(room: Room<State>, memberId: string): void {
    room.connections.set(memberId, (room.connections.get(memberId) ?? 0) + 1);
    room.disconnectedAt.delete(memberId);
    room.lastActivity = this.now();
    this.schedule(room);
    this.events.roomChanged(room);
  }

  disconnect(room: Room<State>, memberId: string): void {
    const left = (room.connections.get(memberId) ?? 1) - 1;
    if (left > 0) {
      room.connections.set(memberId, left);
      return;
    }
    room.connections.delete(memberId);
    room.disconnectedAt.set(memberId, this.now());
    this.schedule(room);
    this.events.roomChanged(room);
  }

  isConnected(room: Room<State>, memberId: string): boolean {
    return (room.connections.get(memberId) ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Lobby actions
  // ---------------------------------------------------------------------------

  setReady(room: Room<State>, memberId: string, ready: boolean): Result {
    const member = this.member(room, memberId);
    if (!member) return fail('MEMBER_NOT_FOUND');
    if (room.status === 'playing') return fail('NOT_IN_LOBBY');
    member.ready = member.isHost || ready;
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  leave(room: Room<State>, memberId: string): Result {
    const member = this.member(room, memberId);
    if (!member) return fail('MEMBER_NOT_FOUND');
    if (member.isHost) return fail('HOST_CANNOT_LEAVE');
    if (room.status === 'playing' && member.role === 'player') return fail('NOT_IN_LOBBY');
    room.members = room.members.filter((m) => m.id !== memberId);
    this.systemMessage(room, systemChat.left(member.name));
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  kick(room: Room<State>, hostId: string, memberId: string): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    if (hostId === memberId) return fail('CANNOT_KICK_SELF');
    const member = this.member(room, memberId);
    if (!member || member.open) return fail('MEMBER_NOT_FOUND');
    if (room.status === 'playing' && member.role === 'player') {
      // The engine keeps its seat; the seat opens for someone else and is auto-played meanwhile.
      member.open = true;
      member.ready = false;
      room.openedAt.set(member.id, this.now());
    } else {
      room.members = room.members.filter((m) => m.id !== memberId);
    }
    room.connections.delete(memberId);
    this.events.memberRemoved(room, memberId, 'kicked');
    this.systemMessage(room, systemChat.removed(member.name));
    this.persist(room);
    this.schedule(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  setLocked(room: Room<State>, locked: boolean): Result {
    room.locked = locked;
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  updateSettings(room: Room<State>, hostId: string, settings: RoomSettings): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    if (room.status === 'playing') return fail('NOT_IN_LOBBY');
    const checked = this.validateSettings(this.gameOf(room), settings);
    if (!checked.ok) return checked;
    room.settings = checked.settings;
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  /** Why the game cannot start yet, or null. */
  startBlocker(room: Room<State>): string | null {
    if (room.status === 'playing') return serverErrors.NOT_IN_LOBBY;
    const mod = this.gameOf(room);
    const players = this.players(room);
    if (players.length < mod.minPlayers) return serverErrors.startNeedsPlayers(mod.minPlayers);
    if (players.length > room.settings.maxPlayers) {
      return serverErrors.startTooManyPlayers(room.settings.maxPlayers);
    }
    const waiting = players.filter((m) => !m.ready && !m.isHost).map((m) => m.name);
    if (room.status === 'lobby' && waiting.length > 0) return serverErrors.startNotReady(waiting);
    return null;
  }

  start(room: Room<State>, hostId: string): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    const blocker = this.startBlocker(room);
    if (blocker) return { ok: false, code: 'CANNOT_START', message: blocker };

    const mod = this.gameOf(room);
    const joined = [...this.players(room)].sort((a, b) => a.joinedAt - b.joinedAt);
    const seated = room.settings.seatOrder === 'random' ? cryptoShuffle(joined) : joined;
    const record: GameRecord = {
      seats: seated.map((m) => ({ id: m.id, name: m.name })),
      ...(room.settings.firstPlayer === 'firstSeat' ? { startingPlayerIndex: 0 } : {}),
      ...(room.settings.gameOptions ? { options: room.settings.gameOptions } : {}),
      seed: newSeed(),
      actions: [],
    };
    room.game = record;
    room.state = mod.create(
      {
        players: record.seats,
        ...(record.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: record.startingPlayerIndex }),
        ...(record.options === undefined ? {} : { options: record.options }),
      },
      record.seed,
    ) as State;
    room.status = 'playing';
    for (const m of room.members) m.ready = m.isHost;
    room.turnOwner = null;
    this.systemMessage(room, systemChat.started);
    this.persist(room);
    this.log.info('game.started', { room: room.id, players: record.seats.length });
    this.schedule(room);
    this.events.roomChanged(room);
    this.events.gameChanged(room);
    return { ok: true };
  }

  /** Same room, same seats, fresh game. */
  playAgain(room: Room<State>, hostId: string): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    if (room.status !== 'finished') return fail('NOT_FINISHED');
    for (const m of room.members) m.ready = true;
    room.status = 'lobby';
    return this.start(room, hostId);
  }

  close(room: Room<State>): void {
    if (room.timer) clearTimeout(room.timer);
    for (const m of room.members) this.events.memberRemoved(room, m.id, 'closed');
    this.rooms.delete(room.id);
    this.byCode.delete(room.code);
    this.store.deleteRoom(room.id);
    this.log.info('room.closed', { room: room.id });
  }

  // ---------------------------------------------------------------------------
  // Game actions
  // ---------------------------------------------------------------------------

  /**
   * Applies a player's intent. `version` must match the current game version,
   * which rejects replays and out-of-order messages.
   */
  act(room: Room<State>, memberId: string, version: number, intent: unknown): Result {
    if (!room.state || room.status !== 'playing') return fail('NO_GAME');
    const member = this.member(room, memberId);
    if (!member || member.role !== 'player' || member.open) return fail('NOT_A_PLAYER');
    const mod = this.gameOf(room);
    if (version !== mod.versionOf(room.state)) return fail('STALE_VERSION');
    const result = mod.apply(room.state, memberId, intent);
    if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
    this.commit(room, result.state as State);
    return { ok: true };
  }

  private commit(room: Room<State>, next: State): void {
    const mod = this.gameOf(room);
    room.state = next;
    // Record the engine's normalized copy of the action, never the raw client payload.
    const last = mod.lastAction(next);
    if (last) room.game!.actions.push(last);
    if (mod.statusOf(next) === 'finished') {
      room.status = 'finished';
      // Seats opened mid-game have nobody behind them; drop them before the next game.
      room.members = room.members.filter((m) => !m.open);
      room.openedAt.clear();
      this.recordHistory(room, next);
      this.systemMessage(room, systemChat.finished);
      this.log.info('game.finished', {
        room: room.id,
        reason: mod.resultOf(next)?.reason,
      });
    }
    this.persist(room);
    this.schedule(room);
    this.events.gameChanged(room);
    this.events.roomChanged(room);
  }

  /** Plays safe moves until the current player's turn is over (timer or auto-skip). */
  private autoplay(room: Room<State>, reason: 'timer' | 'disconnected' | 'open'): void {
    const mod = this.gameOf(room);
    const state = room.state;
    if (!state || room.status !== 'playing') return;
    const owner = mod.currentPlayer(state);
    if (!owner) return;
    const startKey = mod.turnKey?.(state) ?? owner.id;
    for (let i = 0; i < 6 && room.state && mod.statusOf(room.state) === 'playing'; i++) {
      const current = mod.currentPlayer(room.state);
      const currentKey = mod.turnKey?.(room.state) ?? current?.id ?? null;
      if (!current || current.id !== owner.id || (i > 0 && currentKey !== startKey)) break;
      const intent = mod.autoIntent(room.state, owner.id);
      if (!intent) break;
      const result = mod.apply(room.state, owner.id, intent);
      if (!result.ok) {
        this.log.error('autoplay.rejected', { room: room.id, code: result.error.code });
        break;
      }
      this.commit(room, result.state as State);
    }
    if (reason !== 'open') {
      this.systemMessage(
        room,
        reason === 'timer' ? systemChat.timedOut(owner.name) : systemChat.skipped(owner.name),
      );
    }
    this.log.info('game.autoplay', { room: room.id, reason });
  }

  /** Arms the soonest of: turn timer, disconnected-player skip, open-seat skip. */
  schedule(room: Room<State>): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = null;
    const state = room.state;
    if (!state || room.status !== 'playing') return;
    const mod = this.gameOf(room);
    // With no player connected the table simply waits: nothing plays itself.
    const anyoneHere = mod.playersOf(state).some((p) => this.isConnected(room, p.id));
    if (!anyoneHere) return;

    const current = mod.currentPlayer(state)?.id;
    if (!current) return;
    const turnKey = mod.turnKey?.(state) ?? current;
    if (room.turnOwner !== turnKey) {
      room.turnOwner = turnKey;
      room.turnStartedAt = this.now();
    }
    const member = this.member(room, current);
    const candidates: { at: number; reason: 'timer' | 'disconnected' | 'open' }[] = [];
    if (room.settings.turnTimer > 0) {
      candidates.push({ at: room.turnStartedAt + room.settings.turnTimer * 1000, reason: 'timer' });
    }
    if (member?.open) {
      const since = Math.max(room.turnStartedAt, room.openedAt.get(current) ?? 0);
      candidates.push({ at: since + LIMITS.openSeatSkipMs, reason: 'open' });
    } else if (room.settings.disconnectSkip > 0 && !this.isConnected(room, current)) {
      const since = Math.max(
        room.turnStartedAt,
        room.disconnectedAt.get(current) ?? room.turnStartedAt,
      );
      candidates.push({ at: since + room.settings.disconnectSkip * 1000, reason: 'disconnected' });
    }
    if (candidates.length === 0) return;
    const next = candidates.reduce((a, b) => (b.at < a.at ? b : a));
    room.deadline = next.at;
    room.timer = setTimeout(
      () => this.autoplay(room, next.reason),
      Math.max(0, next.at - this.now()),
    );
    (room.timer as { unref?: () => void }).unref?.();
  }

  /** Re-checks the active deadline (used on browser tab wake / visibilitychange). */
  checkDeadlines(room: Room<State>): void {
    if (room.deadline !== null && this.now() >= room.deadline) {
      this.schedule(room);
    }
  }

  private recordHistory(room: Room<State>, state: unknown): void {
    const result = this.gameOf(room).resultOf(state);
    if (!result) return;
    const entry: HistoryEntry = {
      id: newId('h'),
      gameId: room.gameId,
      roomName: room.name,
      finishedAt: this.now(),
      rounds: result.rounds,
      reason: result.reason,
      players: result.standings,
    };
    this.store.addHistory(entry);
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  say(room: Room<State>, memberId: string, kind: 'text' | 'emote', text: string): Result {
    const member = this.member(room, memberId);
    if (!member || member.open) return fail('MEMBER_NOT_FOUND');
    this.pushChat(room, {
      id: newId('c'),
      memberId,
      name: member.name,
      color: member.color,
      kind,
      text,
      at: this.now(),
    });
    return { ok: true };
  }

  private systemMessage(room: Room<State>, text: string): void {
    this.pushChat(room, {
      id: newId('c'),
      memberId: 'system',
      name: '',
      color: null,
      kind: 'system',
      text,
      at: this.now(),
    });
  }

  private pushChat(room: Room<State>, message: ChatMessage): void {
    room.chat.push(message);
    if (room.chat.length > LIMITS.chatHistory)
      room.chat.splice(0, room.chat.length - LIMITS.chatHistory);
    room.lastActivity = this.now();
    this.events.chat(room, message);
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  roomView(room: Room<State>, memberId: string): RoomView {
    const me = this.member(room, memberId)!;
    const members: MemberView[] = room.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      role: m.role,
      isHost: m.isHost,
      ready: m.ready,
      connected: this.isConnected(room, m.id),
      open: m.open,
    }));
    return {
      code: room.code,
      name: room.name,
      status: room.status,
      locked: room.locked,
      settings: room.settings,
      members,
      me: { memberId: me.id, role: me.role, isHost: me.isHost },
      startBlocker: me.isHost ? this.startBlocker(room) : null,
      turnDeadline: room.deadline,
      serverNow: this.now(),
    };
  }

  /** Players see their own redacted view; spectators see the public one. */
  gameView(room: Room<State>, memberId: string): unknown {
    if (!room.state) return null;
    const mod = this.gameOf(room);
    const member = this.member(room, memberId);
    const seated =
      member?.role === 'player' && mod.playersOf(room.state).some((p) => p.id === memberId);
    return mod.viewFor(room.state, seated ? memberId : null);
  }

  // ---------------------------------------------------------------------------
  // Housekeeping
  // ---------------------------------------------------------------------------

  /** Closes rooms nobody has used for a long time. */
  cleanup(): number {
    const now = this.now();
    let closed = 0;
    for (const room of this.all()) {
      if (room.connections.size > 0) continue;
      const idle = now - room.lastActivity;
      const limit = room.status === 'playing' ? LIMITS.idleGameMs : LIMITS.idleLobbyMs;
      if (idle > limit) {
        this.close(room);
        closed += 1;
      }
    }
    return closed;
  }

  shutdown(): void {
    for (const room of this.rooms.values()) if (room.timer) clearTimeout(room.timer);
  }
}
