import { describe, expect, it } from 'vitest';
import { checkScheduler } from '@/nodes/connect/scheduler';

function ts(year: number, month: number, day: number, hour: number, minute: number): number {
  return new Date(year, month - 1, day, hour, minute, 0).getTime();
}

describe('checkScheduler', () => {
  it('returns [true] when no schedule is configured', () => {
    expect(checkScheduler({}, ts(2026, 5, 20, 14, 0))).toEqual([true]);
  });

  it('returns [true] when no entry for the current day', () => {
    // 2026-05-20 is a Wednesday (day 3). Configure schedule only for Friday (day 5).
    const params = {
      sheduler: [{ dayNumber: 5, active: true, from: '480', to: '1080', phrase: 'silence' }],
    };
    expect(checkScheduler(params, ts(2026, 5, 20, 14, 0))).toEqual([true]);
  });

  it('returns [true] when current time is inside the allowed window', () => {
    // Wednesday (day 3), 14:00 = 840 min. Allowed window 480..1080.
    const params = {
      sheduler: [{ dayNumber: 3, active: true, from: '480', to: '1080', phrase: 'quiet please' }],
    };
    expect(checkScheduler(params, ts(2026, 5, 20, 14, 0))).toEqual([true]);
  });

  it('returns [false, phrase] when current time is outside the window', () => {
    // Wednesday, 22:00 = 1320 min. Window 480..1080.
    const params = {
      sheduler: [{ dayNumber: 3, active: true, from: '480', to: '1080', phrase: 'quiet please' }],
    };
    expect(checkScheduler(params, ts(2026, 5, 20, 22, 0))).toEqual([false, 'quiet please']);
  });

  it('treats the upper bound as exclusive (1080 = 18:00 — not allowed at 18:00)', () => {
    const params = {
      sheduler: [{ dayNumber: 3, active: true, from: '480', to: '1080', phrase: 'p' }],
    };
    expect(checkScheduler(params, ts(2026, 5, 20, 18, 0))).toEqual([false, 'p']);
  });

  it('treats the lower bound as inclusive (480 = 08:00 — allowed at 08:00)', () => {
    const params = {
      sheduler: [{ dayNumber: 3, active: true, from: '480', to: '1080', phrase: 'p' }],
    };
    expect(checkScheduler(params, ts(2026, 5, 20, 8, 0))).toEqual([true]);
  });
});
