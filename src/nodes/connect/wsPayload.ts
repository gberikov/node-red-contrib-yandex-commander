import type { DeviceState, MessageType, OutMessage, WsPayload } from '@/lib/types';

type DebugFn = (msg: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface WsPayloadResult {
  payloads: WsPayload[];
  /** Флаг: нужно ожидать LISTENING и прекратить прослушивание */
  waitForListening?: boolean;
  /** Флаг: после TTS возобновить воспроизведение (pauseMusic) */
  playAfterTTS?: boolean;
  /** Флаг: после TTS восстановить громкость */
  waitForIdle?: boolean;
  /** Уровень громкости для восстановления */
  savedVolumeLevel?: number;
  /** Нужно предварительно отправить stop (pauseMusic) */
  needsStop?: boolean;
}

/**
 * Формирует массив WS-команд по типу сообщения.
 * Чистая функция — не мутирует device, не вызывает sendMessage.
 * Побочные эффекты описываются флагами в результате.
 */
export function buildWsPayload(
  messageType: MessageType,
  message: OutMessage,
  deviceState: DeviceState | undefined,
  debug: DebugFn,
): WsPayloadResult {
  const commands = ['play', 'stop', 'next', 'prev', 'ping', 'softwareVersion'];
  const extraCommands = ['forward', 'backward', 'volumeup', 'volumedown', 'volume'];

  switch (messageType) {
    case 'command': {
      const payload = typeof message.payload === 'string' ? message.payload : '';
      if (commands.includes(payload)) {
        return { payloads: [{ command: payload }] };
      }
      if (extraCommands.includes(payload) && deviceState && deviceState.playerState) {
        const currentPosition = deviceState.playerState.progress;
        const duration = deviceState.playerState.duration;
        const currentVolume = deviceState.volume || 0;
        debug(`current volume: ${currentVolume}`);

        if (payload === 'forward') {
          const targetPosition = currentPosition + 10;
          if (targetPosition < duration) {
            return { payloads: [{ command: 'rewind', position: targetPosition }] };
          }
          return buildWsPayload('command', { payload: 'next' } as OutMessage, deviceState, debug);
        }
        if (payload === 'backward') {
          const targetPosition = currentPosition - 10;
          return { payloads: [{ command: 'rewind', position: Math.max(targetPosition, 0) }] };
        }
        if (payload === 'volumeup') {
          debug(String(currentVolume));
          if (currentVolume < 1.0) {
            return { payloads: [{ command: 'setVolume', volume: currentVolume + 0.1 }] };
          }
          return { payloads: [{ command: 'softwareVersion' }] };
        }
        if (payload === 'volumedown') {
          debug(String(currentVolume));
          if (currentVolume > 0.0) {
            return { payloads: [{ command: 'setVolume', volume: currentVolume - 0.1 }] };
          }
          return { payloads: [{ command: 'softwareVersion' }] };
        }
        if (payload === 'volume') {
          return { payloads: [{ command: 'setVolume', volume: parseFloat(message.level || '0') }] };
        }
        return { payloads: [{ command: 'softwareVersion' }] };
      }
      debug(`Bad command ${payload}`);
      return { payloads: [{ command: 'softwareVersion' }] };
    }

    case 'voice':
      debug(`Message Voice command: ${JSON.stringify(message)}`);
      return { payloads: [{ command: 'sendText', text: String(message.payload ?? '') }] };

    case 'tts': {
      debug(`Message TTS: ${message}`);
      const result: WsPayloadResult = { payloads: [] };

      if (message.stopListening) {
        result.waitForListening = true;
      }
      if (message.pauseMusic && deviceState && deviceState.playing) {
        result.needsStop = true;
        result.playAfterTTS = true;
      }

      const ttsPayload: WsPayload = {
        command: 'serverAction',
        serverActionEventPayload: {
          type: 'server_action',
          name: 'update_form',
          payload: {
            form_update: {
              name: 'personal_assistant.scenarios.repeat_after_me',
              slots: [{ type: 'string', name: 'request', value: message.payload }],
            },
            resubmit: true,
          },
        },
      };

      if (message.volume) {
        result.savedVolumeLevel = deviceState?.volume;
        result.waitForIdle = true;
        result.payloads.push({ command: 'setVolume', volume: parseFloat(String(message.volume)) }, ttsPayload);
      } else {
        result.payloads.push(ttsPayload);
      }
      return result;
    }

    case 'homekit': {
      debug(`HAP: ${JSON.stringify(message)} PL: ${JSON.stringify(message.payload)}`);
      if (message.hap && 'session' in message.hap && isRecord(message.payload)) {
        const hapPayload = message.payload;
        let playing = false;
        let id: string | null = null;
        const noTrackPhrase = message.noTrackPhrase;

        if (deviceState) {
          if (typeof deviceState.playing !== 'undefined') {
            playing = deviceState.playing;
          }
          if (deviceState.playerState && typeof deviceState.playerState.id !== 'undefined') {
            id = deviceState.playerState.id;
          }
        }

        // speaker
        if ('TargetMediaState' in hapPayload) {
          const TargetMediaState = hapPayload.TargetMediaState;
          if (id) {
            return buildWsPayload(
              'command',
              { payload: TargetMediaState ? 'stop' : 'play' } as OutMessage,
              deviceState,
              debug,
            );
          } else if (!id && !TargetMediaState && noTrackPhrase) {
            return buildWsPayload('voice', { payload: noTrackPhrase } as OutMessage, deviceState, debug);
          }
        }

        // tv
        if ('Active' in hapPayload) {
          const Active = hapPayload.Active;
          if (id) {
            return buildWsPayload('command', { payload: Active ? 'play' : 'stop' } as OutMessage, deviceState, debug);
          } else if (!id && Active && noTrackPhrase) {
            return buildWsPayload('voice', { payload: noTrackPhrase } as OutMessage, deviceState, debug);
          }
        }

        // tv + RemoteKey
        if ('RemoteKey' in hapPayload) {
          const RemoteKey = hapPayload.RemoteKey;
          switch (RemoteKey) {
            case '7':
              return buildWsPayload('command', { payload: 'forward' } as OutMessage, deviceState, debug);
            case '6':
              return buildWsPayload('command', { payload: 'backward' } as OutMessage, deviceState, debug);
            case '4':
              return buildWsPayload('command', { payload: 'next' } as OutMessage, deviceState, debug);
            case '5':
              return buildWsPayload('command', { payload: 'prev' } as OutMessage, deviceState, debug);
            case '11':
              if (playing) {
                return buildWsPayload('command', { payload: 'stop' } as OutMessage, deviceState, debug);
              } else if (id) {
                return buildWsPayload('command', { payload: 'play' } as OutMessage, deviceState, debug);
              } else if (noTrackPhrase) {
                return buildWsPayload('voice', { payload: noTrackPhrase } as OutMessage, deviceState, debug);
              }
          }
        }

        // tv + VolumeSelector
        if ('VolumeSelector' in hapPayload) {
          const VolumeSelector = hapPayload.VolumeSelector;
          return buildWsPayload(
            'command',
            { payload: VolumeSelector ? 'volumedown' : 'volumeup' } as OutMessage,
            deviceState,
            debug,
          );
        }

        debug('unknown command');
        return buildWsPayload('command', { payload: 'softwareVersion' } as OutMessage, deviceState, debug);
      }
      return buildWsPayload('command', { payload: 'softwareVersion' } as OutMessage, deviceState, debug);
    }

    case 'raw':
      if (Array.isArray(message.payload)) {
        return { payloads: message.payload as WsPayload[] };
      }
      return { payloads: [message.payload as WsPayload] };

    case 'stopListening':
      return {
        payloads: [
          {
            command: 'serverAction',
            serverActionEventPayload: {
              type: 'server_action',
              name: 'on_suggest',
            },
          },
        ],
      };
  }
}
