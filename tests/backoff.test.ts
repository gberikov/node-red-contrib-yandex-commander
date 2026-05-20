import { describe, expect, it } from 'vitest';
import { nextBackoffMs } from '@/nodes/connect/backoff';

describe('nextBackoffMs', () => {
  it('returns ~5s on first attempt (with fixed jitter at midpoint)', () => {
    const rng = () => 0.5; // jitterFactor = 1 + 0 = 1, no jitter
    expect(nextBackoffMs(1, rng)).toBe(5000);
  });

  it('doubles on each attempt until cap', () => {
    const rng = () => 0.5;
    expect(nextBackoffMs(1, rng)).toBe(5000);
    expect(nextBackoffMs(2, rng)).toBe(10000);
    expect(nextBackoffMs(3, rng)).toBe(20000);
    expect(nextBackoffMs(4, rng)).toBe(40000);
  });

  it('caps at 60s after enough attempts', () => {
    const rng = () => 0.5;
    expect(nextBackoffMs(5, rng)).toBe(60000);
    expect(nextBackoffMs(10, rng)).toBe(60000);
    expect(nextBackoffMs(100, rng)).toBe(60000);
  });

  it('applies negative jitter (rng=0)', () => {
    // jitterFactor = 1 + (0*2 - 1) * 0.25 = 0.75
    expect(nextBackoffMs(1, () => 0)).toBe(3750); // 5000 * 0.75
  });

  it('applies positive jitter (rng=1)', () => {
    // jitterFactor = 1 + (1*2 - 1) * 0.25 = 1.25
    expect(nextBackoffMs(1, () => 1)).toBe(6250); // 5000 * 1.25
  });

  it('enforces minimum 1000ms floor', () => {
    expect(nextBackoffMs(0, () => 0)).toBeGreaterThanOrEqual(1000);
  });
});
