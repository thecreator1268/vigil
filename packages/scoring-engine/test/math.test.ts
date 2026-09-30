import { describe, expect, it } from 'vitest';
import { clamp, linearSlope, mean, median, stddev } from '../src/math.js';

describe('math', () => {
  it('clamp bounds a value', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('mean handles empty and non-empty input', () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3])).toBe(2);
  });

  it('stddev is the sample standard deviation and 0 below two values', () => {
    expect(stddev([])).toBe(0);
    expect(stddev([4])).toBe(0);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('median handles empty, odd and even lengths without mutating input', () => {
    const xs = [3, 1, 2];
    expect(median([])).toBe(0);
    expect(median(xs)).toBe(2);
    expect(xs).toEqual([3, 1, 2]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('linearSlope is the OLS slope, 0 below two points', () => {
    expect(linearSlope([])).toBe(0);
    expect(linearSlope([1])).toBe(0);
    expect(linearSlope([0, 1, 2, 3])).toBeCloseTo(1);
    expect(linearSlope([0.5, 0.4, 0.3, 0.2, 0.1])).toBeCloseTo(-0.1);
    expect(linearSlope([1, 1, 1])).toBe(0);
  });
});
