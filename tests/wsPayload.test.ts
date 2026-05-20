import { describe, expect, it, vi } from 'vitest';
import type { DeviceState, OutMessage } from '@/lib/types';
import { buildWsPayload } from '@/nodes/connect/wsPayload';

const noop = () => {};

function call(type: Parameters<typeof buildWsPayload>[0], message: Partial<OutMessage>, state?: DeviceState) {
  return buildWsPayload(type, message as OutMessage, state, noop);
}

describe('buildWsPayload', () => {
  describe('command', () => {
    for (const cmd of ['play', 'stop', 'next', 'prev', 'ping', 'softwareVersion']) {
      it(`passes through "${cmd}"`, () => {
        expect(call('command', { payload: cmd }).payloads).toEqual([{ command: cmd }]);
      });
    }

    it('forward adds 10s to current position', () => {
      const state: DeviceState = { playerState: { progress: 30, duration: 120 } };
      const result = call('command', { payload: 'forward' }, state);
      expect(result.payloads).toEqual([{ command: 'rewind', position: 40 }]);
    });

    it('forward overflowing duration jumps to next track', () => {
      const state: DeviceState = { playerState: { progress: 115, duration: 120 } };
      const result = call('command', { payload: 'forward' }, state);
      expect(result.payloads).toEqual([{ command: 'next' }]);
    });

    it('backward subtracts 10s, clamped to 0', () => {
      const state: DeviceState = { playerState: { progress: 5, duration: 120 } };
      expect(call('command', { payload: 'backward' }, state).payloads).toEqual([{ command: 'rewind', position: 0 }]);
    });

    it('volumeup increments by 0.1', () => {
      const state: DeviceState = { volume: 0.4, playerState: { progress: 0, duration: 0 } };
      expect(call('command', { payload: 'volumeup' }, state).payloads).toEqual([
        { command: 'setVolume', volume: expect.closeTo(0.5, 5) },
      ]);
    });

    it('volumeup at 1.0 is no-op (returns softwareVersion)', () => {
      const state: DeviceState = { volume: 1.0, playerState: { progress: 0, duration: 0 } };
      expect(call('command', { payload: 'volumeup' }, state).payloads).toEqual([{ command: 'softwareVersion' }]);
    });

    it('volumedown decrements by 0.1', () => {
      const state: DeviceState = { volume: 0.4, playerState: { progress: 0, duration: 0 } };
      expect(call('command', { payload: 'volumedown' }, state).payloads).toEqual([
        { command: 'setVolume', volume: expect.closeTo(0.3, 5) },
      ]);
    });

    it('volume sets explicit level from msg.level', () => {
      const state: DeviceState = { playerState: { progress: 0, duration: 0 } };
      expect(call('command', { payload: 'volume', level: '0.75' }, state).payloads).toEqual([
        { command: 'setVolume', volume: 0.75 },
      ]);
    });

    it('unknown command falls back to softwareVersion', () => {
      const result = buildWsPayload('command', { payload: 'nonsense' } as OutMessage, undefined, vi.fn());
      expect(result.payloads).toEqual([{ command: 'softwareVersion' }]);
    });
  });

  describe('voice', () => {
    it('wraps text in sendText command', () => {
      expect(call('voice', { payload: 'turn on the lights' }).payloads).toEqual([
        { command: 'sendText', text: 'turn on the lights' },
      ]);
    });
  });

  describe('tts', () => {
    it('emits serverAction with repeat_after_me', () => {
      const result = call('tts', { payload: 'hello there' });
      expect(result.payloads).toHaveLength(1);
      const p = result.payloads[0] as any;
      expect(p.command).toBe('serverAction');
      expect(p.serverActionEventPayload.payload.form_update.slots[0].value).toBe('hello there');
    });

    it('sets waitForListening when stopListening is requested', () => {
      const result = call('tts', { payload: 'x', stopListening: true });
      expect(result.waitForListening).toBe(true);
    });

    it('arms playAfterTTS + needsStop when pauseMusic is set and device is playing', () => {
      const state: DeviceState = { playing: true };
      const result = call('tts', { payload: 'x', pauseMusic: true }, state);
      expect(result.needsStop).toBe(true);
      expect(result.playAfterTTS).toBe(true);
    });

    it('does not need stop when device is idle', () => {
      const state: DeviceState = { playing: false };
      const result = call('tts', { payload: 'x', pauseMusic: true }, state);
      expect(result.needsStop).toBeUndefined();
      expect(result.playAfterTTS).toBeUndefined();
    });

    it('arms waitForIdle and prepends setVolume when msg.volume is provided', () => {
      const state: DeviceState = { volume: 0.4 };
      const result = call('tts', { payload: 'x', volume: 0.9 }, state);
      expect(result.waitForIdle).toBe(true);
      expect(result.savedVolumeLevel).toBe(0.4);
      expect(result.payloads).toHaveLength(2);
      expect((result.payloads[0] as any).command).toBe('setVolume');
      expect((result.payloads[1] as any).command).toBe('serverAction');
    });
  });

  describe('raw', () => {
    it('passes a single payload through', () => {
      const result = call('raw', { payload: { command: 'custom' } });
      expect(result.payloads).toEqual([{ command: 'custom' }]);
    });

    it('passes an array of payloads through', () => {
      const result = call('raw', { payload: [{ command: 'a' }, { command: 'b' }] });
      expect(result.payloads).toEqual([{ command: 'a' }, { command: 'b' }]);
    });
  });

  describe('playMusic', () => {
    it('emits playMusic command for a track id', () => {
      const result = call('playMusic', { id: '44731403', type: 'track' });
      expect(result.payloads).toEqual([{ command: 'playMusic', id: '44731403', type: 'track' }]);
    });

    it('emits playMusic command for a playlist id', () => {
      const result = call('playMusic', { id: '44731403:1234556', type: 'playlist' });
      expect(result.payloads).toEqual([{ command: 'playMusic', id: '44731403:1234556', type: 'playlist' }]);
    });

    it('emits playMusic command for a radio id', () => {
      const result = call('playMusic', { id: 'detskoe', type: 'radio' });
      expect(result.payloads).toEqual([{ command: 'playMusic', id: 'detskoe', type: 'radio' }]);
    });
  });

  describe('stopListening', () => {
    it('emits on_suggest serverAction', () => {
      const result = call('stopListening', {});
      expect(result.payloads).toHaveLength(1);
      const p = result.payloads[0] as any;
      expect(p.command).toBe('serverAction');
      expect(p.serverActionEventPayload.name).toBe('on_suggest');
    });
  });
});
