import { describe, expect, it } from 'vitest';
import { preparePayload } from '@/lib/stationHelper';

describe('preparePayload', () => {
  describe('status format', () => {
    it('returns full state as payload', () => {
      const state = { aliceState: 'IDLE', playing: false, volume: 0.5 };
      const result = preparePayload({ output: 'status', homekitFormat: '' }, state);
      expect(result).toEqual({ payload: state });
    });
  });

  describe('homekit speaker', () => {
    it('returns CurrentMediaState=1 when not playing', () => {
      const result = preparePayload({ output: 'homekit', homekitFormat: 'speaker' }, { playing: false });
      expect(result.payload.CurrentMediaState).toBe(1);
    });

    it('returns CurrentMediaState=0 when playing', () => {
      const result = preparePayload({ output: 'homekit', homekitFormat: 'speaker' }, { playing: true });
      expect(result.payload.CurrentMediaState).toBe(0);
    });

    it('defaults to "No Artist - No Track Name" if playerState missing', () => {
      const result = preparePayload({ output: 'homekit', homekitFormat: 'speaker' }, { playing: false });
      expect(result.payload.configuredName).toBe('No Artist - No Track Name');
    });

    it('uses subtitle and title from playerState', () => {
      const result = preparePayload(
        { output: 'homekit', homekitFormat: 'speaker' },
        { playing: true, playerState: { progress: 0, duration: 0, title: 'Track', subtitle: 'Artist' } },
      );
      expect(result.payload.configuredName).toBe('Artist - Track');
    });

    it('truncates configuredName to <=64 chars', () => {
      const longTitle = 'A'.repeat(80);
      const longSubtitle = 'B'.repeat(80);
      const result = preparePayload(
        { output: 'homekit', homekitFormat: 'speaker' },
        { playing: false, playerState: { progress: 0, duration: 0, title: longTitle, subtitle: longSubtitle } },
      );
      expect(result.payload.configuredName.length).toBeLessThanOrEqual(64);
    });
  });

  describe('homekit tv', () => {
    it('returns Active=1 when playing', () => {
      const result = preparePayload({ output: 'homekit', homekitFormat: 'tv' }, { playing: true });
      expect(result).toEqual({ payload: { Active: 1 } });
    });

    it('returns Active=0 when not playing', () => {
      const result = preparePayload({ output: 'homekit', homekitFormat: 'tv' }, { playing: false });
      expect(result).toEqual({ payload: { Active: 0 } });
    });
  });

  it('returns empty object for unknown output format', () => {
    const result = preparePayload({ output: 'unknown', homekitFormat: '' }, { playing: false });
    expect(result).toEqual({});
  });
});
