import type { DeviceState } from './types';

interface StationNode {
  output: string;
  homekitFormat: string;
}

interface PreparedPayload {
  payload?: any;
}

/**
 * Формирует payload в зависимости от формата вывода (status / homekit).
 * Для homekit поддерживает форматы "speaker" (CurrentMediaState) и "tv" (Active).
 */
export function preparePayload(node: StationNode, message: DeviceState): PreparedPayload {
  if (node.output === 'status') {
    return { payload: message };
  }

  if (node.output === 'homekit') {
    let playing = false;
    if (typeof message.playing !== 'undefined') {
      playing = message.playing;
    }

    if (node.homekitFormat === 'speaker') {
      let subtitle = 'No Artist';
      let title = 'No Track Name';

      if (typeof message.playerState !== 'undefined') {
        const playerState = message.playerState;
        if (typeof playerState.subtitle !== 'undefined') {
          subtitle = playerState.subtitle;
        }
        if (typeof playerState.title !== 'undefined') {
          title = playerState.title;
        }
      }

      let configuredName = `${subtitle} - ${title}`;
      if (configuredName.length > 64) {
        configuredName = title.length <= 64 ? title : `${title.substr(0, 61)}...`;
      }

      return {
        payload: {
          CurrentMediaState: playing ? 0 : 1,
          configuredName: configuredName
        }
      };
    } else if (node.homekitFormat === 'tv') {
      return {
        payload: {
          Active: playing ? 1 : 0
        }
      };
    }
  }

  return {};
}
