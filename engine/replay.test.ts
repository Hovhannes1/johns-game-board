import { describe, expect, it } from 'vitest';
import { basePack } from '../data';
import { actionsFromLog, applyAction, createRng, replayGame } from './index';
import type { GameState } from './index';
import { newGame, SEED, seats } from './testing/helpers';
import { playRandomGame } from './testing/random-play';

const config = { players: seats(3), pack: basePack, startingPlayerIndex: 0 };

describe('serialization and replay (FR-17)', () => {
  const finished = playRandomGame(newGame(3), createRng('42'.repeat(32)));

  it('plays a full game headlessly', () => {
    expect(finished.status).toBe('finished');
    expect(finished.result?.winners.length).toBeGreaterThan(0);
    expect(finished.log).toHaveLength(finished.version);
  });

  it('replays the action log to an identical state', () => {
    const replayed = replayGame(config, SEED, actionsFromLog(finished));
    expect(replayed).toEqual(finished);
  });

  it('survives a JSON round trip mid-game and continues identically', () => {
    let partial: GameState | undefined;
    playRandomGame(newGame(3), createRng('42'.repeat(32)), {
      onStep: (s) => {
        if (s.version === 20) partial = s;
      },
    });
    const restored = JSON.parse(JSON.stringify(partial)) as GameState;
    expect(restored).toEqual(partial);
    const nextAction = actionsFromLog(finished)[20]!;
    const a = applyAction(partial!, nextAction);
    const b = applyAction(restored, nextAction);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.state).toEqual(a.state);
  });

  it('rejects a tampered log', () => {
    const actions = actionsFromLog(finished);
    actions[0] = { ...actions[0]!, playerId: 'p2' };
    expect(() => replayGame(config, SEED, actions)).toThrow(/Replay failed at action 1/);
  });

  it('never mutates the input state', () => {
    const state = newGame(2);
    const snapshot = structuredClone(state);
    applyAction(state, { type: 'TAKE_THREE', colors: ['ruby', 'onyx', 'emerald'], playerId: 'p1' });
    applyAction(state, { type: 'TAKE_TWO', color: 'gold' as 'ruby', playerId: 'p1' });
    expect(state).toEqual(snapshot);
  });

  it('increments the version once per accepted action', () => {
    const state = newGame(2);
    const rejected = applyAction(state, { type: 'PASS', playerId: 'p1' });
    expect(rejected.ok).toBe(false);
    const accepted = applyAction(state, { type: 'TAKE_TWO', color: 'ruby', playerId: 'p1' });
    expect(accepted.ok && accepted.state.version).toBe(1);
    expect(accepted.ok && accepted.entry.seq).toBe(1);
  });
});
