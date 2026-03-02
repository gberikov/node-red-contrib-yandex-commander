import { NodeInitializer } from 'node-red';
import { OutNodeConfig, ConnectNode, NodeStatusData } from '@/lib/types';

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-out.
   * Принимает входящие сообщения и отправляет команды на станцию:
   * tts (озвучка с голосом/эффектами/шёпотом), command, voice, homekit, raw.
   */
  function OutNodeConstructor(this: any, config: OutNodeConfig): void {
    RED.nodes.createNode(this, config);
    const node = this;
    node.config = config;
    node.controller = RED.nodes.getNode(config.token) as ConnectNode | null;

    node.input = config.input;
    node.stationId = config.station_id;
    node.volumeFlag = config.volumeFlag;
    node.volume = config.volume;
    node.stopListening = config.stopListening;
    node.noTrackPhrase = config.noTrack;
    node.pauseMusic = config.pauseMusic;
    node.ttsVoice = config.ttsVoice;
    node.ttsEffect = config.ttsEffect;
    node.whisper = config.whisper;
    node.status({});

    node.debug(node.stationId);

    /**
     * Обработчик входящего сообщения.
     * Для tts: получает payload из msg/flow/global/str/json, оборачивает в SSML-теги (голос, эффект, шёпот).
     * Для остальных типов: пробрасывает payload и hap напрямую.
     */
    node.on('input', (input: any) => {
      node.debug(`input: ${JSON.stringify(input)}`);

      if (node.stationId) {
        const data: any = {};

        // apply node's config
        if (node.volumeFlag) data.volume = node.volume / 100;
        if (node.whisper) data.whisper = node.whisper;
        if (node.stopListening) data.stopListening = node.stopListening;
        if (node.noTrackPhrase) data.noTrackPhrase = node.noTrackPhrase;
        if (node.pauseMusic) data.pauseMusic = node.pauseMusic;

        // redefine options from input
        if ('volume' in input) data.volume = input.volume / 100;
        if ('whisper' in input) data.whisper = !!input.whisper;
        if ('voice' in input) node.ttsVoice = input.voice;
        if ('effect' in input) node.ttsEffect = input.effect;
        if ('prevent_listening' in input) data.noTrackPhrase = input.prevent_listening;
        if ('pause_music' in input) data.pauseMusic = input.pause_music;

        if ('tts' === node.input) {
          let payload: any;
          switch (node.config.payloadType) {
            case 'flow': {
              payload = node.context().flow.get(node.config.payload);
              if (typeof payload === 'undefined') {
                node.debug(`Empty flow context with key ${node.config.payload}`);
              }
              break;
            }
            case 'global': {
              payload = node.context().global.get(node.config.payload);
              if (typeof payload === 'undefined') {
                node.debug(`Empty global context with key ${node.config.payload}`);
              }
              break;
            }
            case 'str': {
              payload = node.config.payload;
              break;
            }
            case 'json': {
              try {
                const arr = JSON.parse(node.config.payload);
                payload = arr[(Math.random() * arr.length) | 0];
              } catch (e) {
                node.debug(`Error on parsing input JSON: ${e}`);
              }
              break;
            }
            case 'msg':
            default: {
              payload = input[node.config.payload];
              break;
            }
          }

          if (typeof payload !== 'undefined') {
            data.payload = payload;
            if (node.ttsVoice) {
              data.payload = `<speaker voice='${node.ttsVoice}'>${data.payload}`;
            }
            if (node.ttsEffect) {
              const effectsArr = node.ttsEffect.split(',');
              for (const effect of effectsArr) {
                data.payload = `<speaker effect='${effect}'>${data.payload}`;
              }
            }
            if (data.whisper) {
              data.payload = `<speaker is_whisper='${data.whisper}'>${data.payload}`;
            }
          } else {
            data.payload = '';
          }

          if (data.payload.length > 0) {
            node.controller.sendMessage(node.stationId, node.input, data);
            node.debug(`Sending data: station: ${node.stationId}, input type: ${node.input}, data: ${JSON.stringify(data)}`);
          } else {
            node.debug('Nothing to send. Check input and parameters');
          }
        } else {
          data.payload = input.payload;
          data.hap = input.hap;
          node.controller.sendMessage(node.stationId, node.input, data);
          node.debug(`Sending data: station: ${node.stationId}, input type: ${node.input}, data: ${JSON.stringify(data)}`);
        }
      } else {
        node.debug('node.stationId is empty');
      }
    });

    /** Обновляет визуальный статус ноды в редакторе */
    node.onStatus = function (data: NodeStatusData): void {
      node.debug(`Status: ${JSON.stringify(data)}`);
      if (data) {
        node.status({ fill: data.color, shape: 'dot', text: data.text });
      }
    };

    node.on('close', () => {
      if (node.controller) {
        node.controller.removeListener(`statusUpdate_${node.stationId}`, node.onStatus);
      }
    });

    if (node.controller) {
      node.onStatus(node.controller.getStatus(node.stationId));
      node.controller.on(`statusUpdate_${node.stationId}`, node.onStatus);
    }
  }

  RED.nodes.registerType('yandex-commander-out', OutNodeConstructor);
};

export default nodeInit;
