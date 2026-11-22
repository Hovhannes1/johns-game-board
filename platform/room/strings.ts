export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Messages returned by the room host for lobby, session, and action problems. */
export const serverErrors = {
  BAD_REQUEST: 'That request was not valid.',
  BAD_CREDENTIALS: 'Room code or password is incorrect.',
  LOCKED_OUT: (seconds: number) =>
    `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
  RATE_LIMITED: 'Slow down a little and try again.',
  UNAUTHORIZED: 'Please join the room first.',
  ADMIN_REQUIRED: 'Host login required.',
  BAD_ADMIN_SECRET: 'That host secret is not correct.',
  FORBIDDEN: 'Request blocked.',
  ROOM_NOT_FOUND: 'That room no longer exists.',
  ROOM_LOCKED: 'This room is locked. Ask the host to unlock it.',
  ROOM_FULL: 'This room is full.',
  GAME_IN_PROGRESS: 'A game is in progress and no seat is open.',
  SPECTATORS_DISABLED: 'Spectators are not allowed in this room.',
  NAME_TAKEN: 'Someone in this room already uses that name.',
  NOT_HOST: 'Only the host can do that.',
  NOT_IN_LOBBY: 'That is only possible in the lobby.',
  NOT_FINISHED: 'The game is still running.',
  NOT_A_PLAYER: 'Spectators cannot make moves.',
  NO_GAME: 'No game is running.',
  STALE_VERSION: 'The game moved on, so your screen was refreshed. Try again.',
  HOST_CANNOT_LEAVE: 'The host closes the room instead of leaving it.',
  CANNOT_KICK_SELF: 'You cannot remove yourself.',
  MEMBER_NOT_FOUND: 'That person is no longer in the room.',
  TOO_MANY_ROOMS: 'There are too many open rooms. Close one first.',
  startNeedsPlayers: (min: number) => `Waiting for at least ${min} players.`,
  startTooManyPlayers: (max: number) =>
    `This room is set to ${max} players. Remove someone or raise the limit.`,
  startNotReady: (names: string[]) => `Waiting for ${joinList(names)} to be ready.`,
  startOpenSeat: 'A seat is open. Wait for someone to take it, or start a new game from the lobby.',
} as const;

export const systemChat = {
  joined: (name: string) => `${name} joined.`,
  spectating: (name: string) => `${name} is watching.`,
  tookSeat: (name: string, seat: string) => `${name} took over ${seat}'s seat.`,
  left: (name: string) => `${name} left.`,
  removed: (name: string) => `${name} was removed by the host.`,
  started: 'The game has started. Good luck!',
  timedOut: (name: string) => `${name}'s time ran out, so a move was played for them.`,
  skipped: (name: string) => `${name} is disconnected, so a move was played for them.`,
  restored: 'The session was restored. The game continues where it left off.',
  finished: 'The game is over.',
} as const;
