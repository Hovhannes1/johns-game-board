import { describe, expect, it } from 'vitest';
import { BASE_RULES, toTokenCounts } from '@/games/splendor/engine';
import { addGem, canAddGem, removeGem, selectionToIntent } from './selection';

const full = toTokenCounts({ diamond: 4, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 });

describe('gem selection', () => {
  it('maps selections to engine intents', () => {
    expect(selectionToIntent([])).toBeNull();
    expect(selectionToIntent(['ruby', 'ruby'])).toEqual({ type: 'TAKE_TWO', color: 'ruby' });
    expect(selectionToIntent(['ruby', 'onyx'])).toEqual({
      type: 'TAKE_THREE',
      colors: ['ruby', 'onyx'],
    });
  });

  it('allows up to 3 different gems', () => {
    expect(canAddGem(['ruby', 'onyx'], 'diamond', full, BASE_RULES)).toEqual({ ok: true });
    expect(canAddGem(['ruby', 'onyx', 'diamond'], 'emerald', full, BASE_RULES).ok).toBe(false);
  });

  it('allows a pair only on its own and only with 4 in the bank', () => {
    expect(canAddGem(['ruby'], 'ruby', full, BASE_RULES)).toEqual({ ok: true });
    expect(canAddGem(['ruby', 'onyx'], 'ruby', full, BASE_RULES)).toMatchObject({ ok: false });
    expect(canAddGem(['ruby', 'ruby'], 'onyx', full, BASE_RULES)).toMatchObject({ ok: false });
    const low = { ...full, ruby: 3 };
    expect(canAddGem(['ruby'], 'ruby', low, BASE_RULES)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('at least 4'),
    });
  });

  it('does not offer empty piles', () => {
    const empty = { ...full, emerald: 0 };
    expect(canAddGem([], 'emerald', empty, BASE_RULES)).toMatchObject({ ok: false });
  });

  it('adds and removes gems', () => {
    expect(addGem(['ruby'], 'onyx')).toEqual(['ruby', 'onyx']);
    expect(removeGem(['ruby', 'onyx', 'ruby'], 'ruby')).toEqual(['ruby', 'onyx']);
    expect(removeGem(['ruby'], 'onyx')).toEqual(['ruby']);
  });
});
