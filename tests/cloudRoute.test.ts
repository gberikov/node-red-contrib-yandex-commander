import { describe, expect, it } from 'vitest';
import { decideCloudRoute } from '@/nodes/connect/cloudRoute';

describe('decideCloudRoute', () => {
  it('routes non-tts types to local regardless of flags', () => {
    expect(decideCloudRoute('command', false, true, true)).toBe('local');
    expect(decideCloudRoute('voice', false, undefined, undefined)).toBe('local');
    expect(decideCloudRoute('raw', false, true, false)).toBe('local');
    expect(decideCloudRoute('homekit', true, undefined, undefined)).toBe('local');
    expect(decideCloudRoute('stopListening', false, true, true)).toBe('local');
    expect(decideCloudRoute('playMusic', false, true, true)).toBe('local');
  });

  it('forces cloud when msg.cloud === true (even if local is open)', () => {
    expect(decideCloudRoute('tts', true, true, false)).toBe('cloud');
  });

  it('uses local when WebSocket is open and msg.cloud is undefined', () => {
    expect(decideCloudRoute('tts', true, undefined, true)).toBe('local');
  });

  it('returns offline when local closed and msg.cloud === false', () => {
    expect(decideCloudRoute('tts', false, false, true)).toBe('offline');
  });

  it('uses cloud when local closed and OUT-node fallback enabled', () => {
    expect(decideCloudRoute('tts', false, undefined, true)).toBe('cloud');
  });

  it('returns offline when local closed and no cloud flag set', () => {
    expect(decideCloudRoute('tts', false, undefined, false)).toBe('offline');
    expect(decideCloudRoute('tts', false, undefined, undefined)).toBe('offline');
  });
});
