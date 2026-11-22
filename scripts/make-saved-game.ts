/**
 * Dev helper: writes a hot-seat save (zustand persist format) after random
 * moves, for screenshots and manual testing. Paste the output into
 * localStorage key "splendor-hotseat" to load it.
 *
 *   npx tsx scripts/make-saved-game.ts <players> <maxMoves> <seedByte> <outFile> [stopAt]
 *
 * stopAt: returnTokens | chooseNoble | finished (stop as soon as it happens).
 */
import { writeFileSync } from 'node:fs';
import { basePack } from '../games/splendor/data';
import { actionsFromLog, applyAction, createGame, createRng } from '../games/splendor/engine';
import { randomAction } from '../games/splendor/engine/testing/random-play';

const [playersArg, movesArg, seedArg, out, stopAt] = process.argv.slice(2);
const players = Number(playersArg ?? 3);
const maxMoves = Number(movesArg ?? 40);
const seed = (seedArg ?? '5a').padStart(2, '0').slice(0, 2).repeat(32);
const seats = ['Anna', 'Ben', 'Cleo', 'Dario']
  .slice(0, players)
  .map((name, i) => ({ id: `p${i + 1}`, name }));

const rng = createRng(seed);
let state = createGame({ players: seats, pack: basePack, startingPlayerIndex: 0 }, seed);
const reached = () =>
  stopAt === 'finished' ? state.status === 'finished' : state.phase.kind === stopAt;

for (let i = 0; i < (stopAt ? 5000 : maxMoves) && state.status === 'playing' && !reached(); i++) {
  const result = applyAction(state, randomAction(state, rng, 0.8));
  if (!result.ok) throw new Error(result.error.message);
  state = result.state;
}

const saved = { seats, startingPlayerIndex: 0, seed, actions: actionsFromLog(state) };
const json = JSON.stringify({ state: { saved }, version: 1 });
if (out) writeFileSync(out, json, 'utf8');
else process.stdout.write(json);
console.error(`${state.version} moves, status ${state.status}, phase ${state.phase.kind}`);
