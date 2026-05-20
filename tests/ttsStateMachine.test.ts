import { describe, expect, it } from 'vitest';
import { TtsStateMachine } from '@/nodes/connect/ttsStateMachine';

describe('TtsStateMachine', () => {
  it('produces no actions when armed but state is not LISTENING', () => {
    const m = new TtsStateMachine();
    m.armStopListening();
    expect(m.handleStateUpdate({ aliceState: 'IDLE' })).toEqual([]);
    expect(m.handleStateUpdate({ aliceState: 'SPEAKING' })).toEqual([]);
  });

  it('flushes stopListening on LISTENING transition', () => {
    const m = new TtsStateMachine();
    m.armStopListening();
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([{ type: 'stopListening' }]);
  });

  it('flushes play after TTS on LISTENING', () => {
    const m = new TtsStateMachine();
    m.armPlayAfterTTS();
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([{ type: 'play' }]);
  });

  it('flushes volume restore on LISTENING', () => {
    const m = new TtsStateMachine();
    m.armVolumeRestore(0.5);
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([{ type: 'setVolume', volume: 0.5 }]);
  });

  it('clears the flag after one flush — second LISTENING produces nothing', () => {
    const m = new TtsStateMachine();
    m.armStopListening();
    m.handleStateUpdate({ aliceState: 'LISTENING' });
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([]);
  });

  it('combines all three actions on a single LISTENING transition', () => {
    const m = new TtsStateMachine();
    m.armStopListening();
    m.armPlayAfterTTS();
    m.armVolumeRestore(0.7);
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([
      { type: 'stopListening' },
      { type: 'play' },
      { type: 'setVolume', volume: 0.7 },
    ]);
  });

  it('skips setVolume when armed with undefined level', () => {
    const m = new TtsStateMachine();
    m.armVolumeRestore(undefined);
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([]);
  });

  it('reset() clears all armed flags', () => {
    const m = new TtsStateMachine();
    m.armStopListening();
    m.armPlayAfterTTS();
    m.armVolumeRestore(0.5);
    m.reset();
    expect(m.handleStateUpdate({ aliceState: 'LISTENING' })).toEqual([]);
  });
});
