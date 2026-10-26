import { describe, expect, it } from 'vitest';
import { counterDecreased } from '../src/counter.js';

describe('counterDecreased', () => {
  it('a synced passkey reporting 0 every time is never flagged', () => {
    expect(counterDecreased(0, 0)).toBe(false);
  });

  it('going from 0 to any non-zero value is never flagged (first real increment)', () => {
    expect(counterDecreased(0, 5)).toBe(false);
  });

  it('a normal increase is never flagged', () => {
    expect(counterDecreased(5, 6)).toBe(false);
  });

  it('a non-zero decrease IS flagged', () => {
    expect(counterDecreased(5, 3)).toBe(true);
  });

  it('staying the same non-zero value IS flagged (a replayed/cloned assertion)', () => {
    expect(counterDecreased(5, 5)).toBe(true);
  });

  it('dropping back to 0 from non-zero is never flagged — treated as a device reporting zero going forward, not as a decrease', () => {
    expect(counterDecreased(5, 0)).toBe(false);
  });
});
