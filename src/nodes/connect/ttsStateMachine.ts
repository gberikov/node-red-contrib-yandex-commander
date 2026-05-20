import type { DeviceState } from '@/lib/types';

/**
 * Действия, которые state-machine просит config-ноду выполнить
 * после получения очередного состояния от станции.
 * Передаются обратно как «команды отправить» — сама машина WebSocket не трогает.
 */
export type TtsAction = { type: 'stopListening' } | { type: 'play' } | { type: 'setVolume'; volume: number };

/**
 * Машина состояний для пост-TTS логики на одной станции:
 *
 * 1) При отправке TTS со stopListening — armStopListening(): когда станция
 *    переходит в LISTENING (Алиса ждёт команду после фразы), отправляем
 *    stopListening, чтобы не висел открытый микрофон.
 * 2) При TTS с pauseMusic — armPlayAfterTTS(): после того как Алиса закончила
 *    говорить (LISTENING-фаза), возобновляем воспроизведение.
 * 3) При TTS с временной громкостью — armVolumeRestore(level): после LISTENING
 *    восстанавливаем прежний уровень.
 *
 * Машина не отправляет команды сама — возвращает их списком из handleStateUpdate().
 * Это делает её тестируемой без WebSocket-мока.
 */
export class TtsStateMachine {
  private waitForListening = false;
  private playAfterTTS = false;
  private waitForIdle = false;
  private savedVolumeLevel: number | undefined;

  armStopListening(): void {
    this.waitForListening = true;
  }

  armPlayAfterTTS(): void {
    this.playAfterTTS = true;
  }

  armVolumeRestore(level: number | undefined): void {
    this.waitForIdle = true;
    this.savedVolumeLevel = level;
  }

  /** Сбрасывает все флаги (используется при reconnect — старое состояние неактуально). */
  reset(): void {
    this.waitForListening = false;
    this.playAfterTTS = false;
    this.waitForIdle = false;
    this.savedVolumeLevel = undefined;
  }

  /**
   * Получает свежее состояние от станции, возвращает массив действий.
   * Действия flush'ятся атомарно при каждом LISTENING-переходе.
   */
  handleStateUpdate(state: DeviceState): TtsAction[] {
    if (state.aliceState !== 'LISTENING') return [];

    const actions: TtsAction[] = [];

    if (this.waitForListening) {
      actions.push({ type: 'stopListening' });
      this.waitForListening = false;
    }
    if (this.playAfterTTS) {
      actions.push({ type: 'play' });
      this.playAfterTTS = false;
    }
    if (this.waitForIdle) {
      if (typeof this.savedVolumeLevel === 'number') {
        actions.push({ type: 'setVolume', volume: this.savedVolumeLevel });
      }
      this.waitForIdle = false;
      this.savedVolumeLevel = undefined;
    }

    return actions;
  }
}
