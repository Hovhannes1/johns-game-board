/**
 * All user-facing UI text in one place (section 4.3) so translation can be
 * added later. Rule-violation messages live in engine/errors.ts.
 */
import type { GameEndReason, Level, TokenColor } from '@/games/splendor/engine';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const levels = { 1: 'Level I', 2: 'Level II', 3: 'Level III' } as const satisfies Record<
  Level,
  string
>;

export const strings = {
  appName: 'Splendor Online',
  tagline: 'Gem trading among friends, in the spirit of the Renaissance.',
  connection: {
    connecting: 'Connecting to the game server...',
    connected: 'Connected to the game server',
    disconnected: 'Not connected to the game server',
  },

  home: {
    hotseat: 'Play on this device',
    hotseatHint: 'Hot-seat: 2 to 4 players share one screen.',
    online: 'Play online with friends',
    onlineHint: 'Rooms and invites are coming in the next milestone.',
  },

  gems: {
    diamond: 'diamond',
    sapphire: 'sapphire',
    emerald: 'emerald',
    ruby: 'ruby',
    onyx: 'onyx',
    gold: 'gold',
  } satisfies Record<TokenColor, string>,
  /** Plain color names, used alongside gem names for clarity. */
  gemColors: {
    diamond: 'white',
    sapphire: 'blue',
    emerald: 'green',
    ruby: 'red',
    onyx: 'black',
    gold: 'yellow',
  } satisfies Record<TokenColor, string>,
  levels,
  levelNumerals: { 1: 'I', 2: 'II', 3: 'III' } satisfies Record<Level, string>,

  setup: {
    title: 'New hot-seat game',
    intro: 'Everyone plays on this screen. Hand the device over after each turn.',
    playerCount: 'Number of players',
    playerName: (n: number) => `Player ${n} name`,
    defaultName: (n: number) => `Player ${n}`,
    firstPlayer: 'First player',
    firstRandom: 'Random',
    firstListed: 'First in the list',
    start: 'Start game',
    resume: 'Resume saved game',
    nameRequired: 'Every player needs a name.',
    nameUnique: 'Names must be different.',
    back: 'Back to home',
  },

  table: {
    round: (n: number) => `Round ${n}`,
    turnOf: (name: string) => `${name}'s turn`,
    yourTurn: 'Your turn',
    finalRound: 'Final round',
    startingPlayer: 'First player',
    prestige: 'prestige',
    points: (n: number) => `${n} ${plural(n, 'point')}`,
    tokensHeld: (n: number, max: number) => `${n}/${max} tokens`,
    reserved: 'Reserved',
    nobles: 'Nobles',
    bonuses: 'Cards',
    noCards: 'No cards yet',
    showCards: 'Show cards',
    hideCards: 'Hide cards',
    bonusSummary: (cards: number, reserved: number, nobles: number) =>
      `${cards} ${plural(cards, 'card')}, ${reserved} reserved, ${nobles} ${plural(nobles, 'noble')}`,
    settings: 'Settings',
    skipToBoard: 'Skip to the board',
    supply: 'Bank',
    market: 'Development cards',
    log: 'Game log',
    rules: 'Rules',
    exit: 'Leave game',
    showResults: 'Show results',
    deckLabel: (level: Level, count: number) =>
      `${levels[level]} deck, ${count} ${plural(count, 'card')} left`,
    emptySlot: 'Empty slot',
    hiddenReserve: (level: Level) => `Hidden ${levels[level]} card`,
    phase: {
      action: 'Take gems, buy a card, or reserve one.',
      returnTokens: (n: number) => `Return ${n} ${plural(n, 'token')} to get back to 10.`,
      chooseNoble: 'Several nobles want to visit. Choose one.',
      waiting: (name: string) => `Waiting for ${name}.`,
    },
    rejected: (message: string) => `That move was not accepted: ${message}`,
  },

  tokens: {
    take: (gem: string, inSupply: number) => `Take ${gem}, ${inSupply} in the bank`,
    goldHint: 'Gold is only gained by reserving a card.',
    selected: 'Selected',
    removeSelected: (gem: string) => `Put back ${gem}`,
    clear: 'Clear',
    confirm: 'Take gems',
    pickHint: 'Pick 3 different gems, or 2 of the same gem when 4 or more are in the bank.',
    maxThree: 'You can take at most 3 gems.',
    pairIsFull: 'Two of the same gem is a full turn.',
    pairWithOthers: 'Two of the same gem cannot be combined with other gems.',
    noneLeft: (gem: string) => `No ${gem} left in the bank.`,
    pairNeedsFour: (gem: string, min: number) =>
      `Two ${gem} can only be taken when at least ${min} are in the bank.`,
    ready: 'Ready to take these gems.',
  },

  card: {
    describe: (level: Level, bonus: string, points: number, cost: string) =>
      `${levels[level]} ${bonus} card, ${points} prestige, costs ${cost}`,
    title: (level: Level, bonus: string) => `${levels[level]} ${bonus} card`,
    buy: 'Buy',
    reserve: 'Reserve',
    reserveGold: 'You also take 1 gold.',
    reserveNoGold: 'No gold is left, so you take none.',
    youPay: 'You pay',
    free: 'Free with your bonuses',
    close: 'Close',
    affordable: 'You can buy this card',
    deckReserveTitle: (level: Level) => `Reserve from the ${levels[level]} deck`,
    deckReserveBody: 'Take the top card without revealing it to the other players.',
  },

  returnTokens: {
    title: 'Too many tokens',
    body: (n: number) => `You may hold 10 tokens. Choose ${n} to return to the bank.`,
    chosen: (n: number, of: number) => `${n} of ${of} chosen`,
    confirm: 'Return tokens',
    add: (gem: string, held: number) => `Return a ${gem}, you hold ${held}`,
  },

  nobles: {
    title: 'A noble visits',
    body: 'You qualify for more than one noble. Only one can visit this turn.',
    choose: (name: string) => `Welcome ${name}`,
    describe: (name: string, needs: string) => `${name}, 3 prestige, requires ${needs} bonuses`,
  },

  pass: {
    label: 'Pass',
    body: 'You have no legal move this turn.',
  },

  endGame: {
    title: 'Game over',
    winner: (name: string, points: number) => `${name} wins with ${points} prestige.`,
    fewestCards: (name: string, points: number, cards: number) =>
      `Tied on ${points} prestige. ${name} wins with the fewest development cards (${cards}).`,
    shared: (names: string, points: number) =>
      `${names} tie on ${points} prestige and cards, and share the victory.`,
    stalemate: 'No one had a legal move left, so the game ended early.',
    rank: 'Rank',
    player: 'Player',
    prestige: 'Prestige',
    cards: 'Cards',
    nobles: 'Nobles',
    turns: 'Turns',
    gemsTaken: 'Gems taken',
    rounds: (n: number) => `${n} ${plural(n, 'round')} played.`,
    playAgain: 'Play again',
    newGame: 'New setup',
    viewBoard: 'View final board',
  },

  exitConfirm: {
    title: 'Leave this game?',
    body: 'The game will be discarded.',
    confirm: 'Leave game',
    cancel: 'Keep playing',
  },

  log: {
    tookTokens: (name: string, list: string) => `${name} took ${list}.`,
    reservedFaceUp: (name: string, card: string) => `${name} reserved a ${card}`,
    reservedBlind: (name: string, level: string, card: string | null) =>
      card
        ? `${name} reserved a ${card} from the deck`
        : `${name} reserved a ${level} card from the deck`,
    withGold: ' and took 1 gold.',
    noGold: '. No gold was left.',
    bought: (name: string, card: string, payment: string, fromReserve: boolean) =>
      `${name} bought ${fromReserve ? 'their reserved' : 'a'} ${card} for ${payment}.`,
    forFree: 'nothing',
    returned: (name: string, list: string) => `${name} returned ${list}.`,
    noble: (name: string, noble: string) => `${noble} visited ${name} (+3 prestige).`,
    passed: (name: string) => `${name} had no legal move and passed.`,
    finalRound: (name: string, points: number) =>
      `${name} reached ${points} prestige. This is the final round.`,
    gameEnded: (reason: GameEndReason, winners: string) =>
      reason === 'stalemate'
        ? `No legal moves remain. Game over: ${winners}.`
        : `Game over: ${winners}.`,
    winnersList: (names: string[]) =>
      names.length === 1 ? `${names[0]} wins` : `${joinList(names)} share the victory`,
    empty: 'Moves will appear here.',
  },

  preferences: {
    title: 'Settings',
    sound: 'Sound effects',
    motion: 'Animations',
    motionSystem: 'Follow system setting',
    motionReduce: 'Reduced (no movement)',
    motionFull: 'Full',
    art: 'Artwork',
    artVector: 'Minimal (vector)',
    artImages: 'Illustrated (images)',
    close: 'Done',
  },

  rules: {
    title: 'How to play',
    sections: [
      {
        heading: 'Goal',
        body: 'Collect gems, buy development cards and attract nobles. The first player to reach 15 prestige triggers the final round; the highest score then wins. Ties go to the player with fewer development cards.',
      },
      {
        heading: 'On your turn, do one thing',
        body: 'Take 3 gems of different colors. Or take 2 gems of the same color, if at least 4 of that color are in the bank. Or reserve a card (face up, or blind from the top of a deck) and take 1 gold. Or buy a face-up card or one of your reserved cards.',
      },
      {
        heading: 'Paying for cards',
        body: 'Each card you own gives a permanent 1-gem discount of its color. Gold replaces any missing gem. The game works out the cheapest payment and shows it before you confirm.',
      },
      {
        heading: 'Limits',
        body: 'You may hold at most 10 tokens at the end of your turn and at most 3 reserved cards. Reserved cards can only leave your hand by being bought.',
      },
      {
        heading: 'Nobles',
        body: 'At the end of your turn, a noble visits if your card bonuses meet its requirement (tokens do not count). Each noble is worth 3 prestige; only one can visit per turn.',
      },
      {
        heading: 'Fewer gems left',
        body: 'When fewer than 3 colors remain in the bank, take one gem of each remaining color. If you have no legal move at all, you pass.',
      },
    ],
    close: 'Close',
  },
} as const;

/** Online play: hosting, joining, lobby, chat (FR-1..FR-6, FR-14). */
export const online = {
  home: {
    join: 'Join a room',
    joinHint: 'Enter the room code from your host.',
    codeLabel: 'Room code',
    go: 'Continue',
    host: 'Host a game',
    hostHint: 'Create a password-protected room for friends.',
    history: 'Past games',
    badCode: 'Room codes are 10 letters and digits.',
  },
  host: {
    title: 'Host',
    loginTitle: 'Host login',
    loginBody: 'Enter the host secret printed in the server console the first time it started.',
    secretLabel: 'Host secret',
    login: 'Log in',
    logout: 'Log out',
    createTitle: 'Create a room',
    roomName: 'Room name',
    roomPassword: 'Room password (6+ characters)',
    yourName: 'Your name',
    yourColor: 'Your color',
    create: 'Create room',
    roomsTitle: 'Rooms on this server',
    noRooms: 'No rooms yet.',
    open: 'Open',
    copyInvite: 'Copy invite link',
    copied: 'Copied',
    lock: 'Lock',
    unlock: 'Unlock',
    close: 'Close room',
    closeConfirmTitle: 'Close this room?',
    closeConfirmBody: 'Everyone is disconnected and the game is discarded.',
    players: (n: number, max: number) => `${n}/${max} players`,
    spectators: (n: number) => `${n} watching`,
    status: { lobby: 'In lobby', playing: 'Playing', finished: 'Finished' },
    locked: 'Locked',
  },
  settings: {
    title: 'Settings',
    maxPlayers: 'Players',
    turnTimer: 'Turn timer',
    timerOff: 'Off',
    seconds: (n: number) => `${n} s`,
    seatOrder: 'Seat order',
    seatRandom: 'Random',
    seatJoined: 'As joined',
    firstPlayer: 'First player',
    firstRandom: 'Random',
    firstSeat: 'First seat',
    spectators: 'Allow spectators',
    disconnectSkip: 'Auto-play a disconnected player after',
    never: 'Never (wait)',
    save: 'Save settings',
    saved: 'Settings saved.',
  },
  join: {
    title: (name: string) => `Join ${name}`,
    titleGeneric: 'Join a room',
    password: 'Room password',
    name: 'Your name',
    color: 'Your color',
    spectator: 'Join as a spectator (watch only)',
    submit: 'Join',
    back: 'Back to home',
  },
  lobby: {
    code: 'Room code',
    invite: 'Invite link',
    copy: 'Copy',
    copied: 'Copied',
    players: 'Players',
    spectators: 'Spectators',
    host: 'Host',
    you: 'You',
    ready: 'Ready',
    notReady: 'Not ready',
    offline: 'Offline',
    imReady: "I'm ready",
    notReadyButton: 'Not ready yet',
    start: 'Start game',
    remove: 'Remove',
    removeLabel: (name: string) => `Remove ${name} from the room`,
    lock: 'Lock room',
    unlock: 'Unlock room',
    lockedNote: 'Locked: nobody new can join.',
    close: 'Close room',
    leave: 'Leave room',
    waitingForHost: 'Waiting for the host to start the game.',
    watching: 'You are watching this room.',
    openSeat: 'Open seat',
  },
  chat: {
    title: 'Chat',
    placeholder: 'Say something',
    send: 'Send',
    emotes: 'Quick reactions',
    empty: 'No messages yet.',
    label: 'Chat message',
  },
  table: {
    offline: 'Offline',
    timeLeft: (s: number) => `${s}s left`,
    waitingForHost: 'Waiting for the host to start another game.',
    exitTitle: 'Leave the table?',
    exitBody: 'Your seat stays yours. Come back from this browser any time to continue.',
    exitConfirm: 'Leave table',
  },
  connection: {
    connecting: 'Connecting...',
    reconnecting: 'Connection lost. Reconnecting...',
  },
  ended: {
    kicked: 'The host removed you from this room.',
    closed: 'The host closed this room.',
    left: 'You left the room.',
    expired: 'Your session expired. Join again to continue.',
    home: 'Back to home',
  },
  history: {
    title: 'Past games',
    empty: 'No finished games yet.',
    needSession: 'Join a room or log in as host to see past games.',
    room: 'Room',
    date: 'Finished',
    rounds: 'Rounds',
    results: 'Results',
    stalemate: 'ended early',
  },
} as const;

/** Messages the server sends back for room and session problems. */
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
  restored: 'The server restarted. The game continues where it left off.',
  finished: 'The game is over.',
} as const;

export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
