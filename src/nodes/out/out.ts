import type { Node, NodeDef, NodeInitializer, NodeMessageInFlow } from 'node-red';
import type { ConnectNode, MessageType, NodeStatusData, OutMessage, OutNodeConfig } from '@/lib/types';

interface OutNodeRuntime extends Node<NodeDef> {
  config: OutNodeConfig;
  controller: ConnectNode | null;
  input: MessageType;
  stationId: string;
  volumeFlag: boolean;
  volume: number;
  stopListening: boolean;
  noTrackPhrase: string;
  pauseMusic: boolean;
  ttsVoice: string;
  ttsEffect: string;
  whisper: boolean;
  onStatus: (data: NodeStatusData) => void;
}

interface OutInputMessage extends NodeMessageInFlow {
  volume?: number;
  whisper?: boolean;
  voice?: string;
  effect?: string;
  prevent_listening?: string;
  pause_music?: boolean;
  hap?: { session?: unknown };
  [key: string]: unknown;
}

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-out.
   * Принимает входящие сообщения и отправляет команды на станцию:
   * tts (озвучка с голосом/эффектами/шёпотом), command, voice, homekit, raw.
   */
  function OutNodeConstructor(this: OutNodeRuntime, config: OutNodeConfig): void {
    RED.nodes.createNode(this, config);

    this.config = config;
    this.controller = RED.nodes.getNode(config.token) as unknown as ConnectNode | null;

    this.input = config.input as MessageType;
    this.stationId = config.station_id;
    this.volumeFlag = config.volumeFlag;
    this.volume = config.volume;
    this.stopListening = config.stopListening;
    this.noTrackPhrase = config.noTrack;
    this.pauseMusic = config.pauseMusic;
    this.ttsVoice = config.ttsVoice;
    this.ttsEffect = config.ttsEffect;
    this.whisper = config.whisper;
    this.status({});

    this.debug(this.stationId);

    /**
     * Обработчик входящего сообщения.
     * Для tts: получает payload из msg/flow/global/str/json, оборачивает в SSML-теги (голос, эффект, шёпот).
     * Для остальных типов: пробрасывает payload и hap напрямую.
     */
    this.on('input', (input: OutInputMessage) => {
      this.debug(`input: ${JSON.stringify(input)}`);

      if (this.stationId) {
        const data: OutMessage = { payload: undefined };

        // apply node's config
        if (this.volumeFlag) data.volume = this.volume / 100;
        if (this.whisper) data.whisper = this.whisper;
        if (this.stopListening) data.stopListening = this.stopListening;
        if (this.noTrackPhrase) data.noTrackPhrase = this.noTrackPhrase;
        if (this.pauseMusic) data.pauseMusic = this.pauseMusic;

        // redefine options from input
        if ('volume' in input && typeof input.volume === 'number') data.volume = input.volume / 100;
        if ('whisper' in input) data.whisper = !!input.whisper;
        if ('voice' in input && typeof input.voice === 'string') this.ttsVoice = input.voice;
        if ('effect' in input && typeof input.effect === 'string') this.ttsEffect = input.effect;
        if ('prevent_listening' in input && typeof input.prevent_listening === 'string')
          data.noTrackPhrase = input.prevent_listening;
        if ('pause_music' in input) data.pauseMusic = !!input.pause_music;

        if (this.input === 'tts') {
          let payload: unknown;
          switch (this.config.payloadType) {
            case 'flow': {
              payload = this.context().flow.get(this.config.payload);
              if (typeof payload === 'undefined') {
                this.debug(`Empty flow context with key ${this.config.payload}`);
              }
              break;
            }
            case 'global': {
              payload = this.context().global.get(this.config.payload);
              if (typeof payload === 'undefined') {
                this.debug(`Empty global context with key ${this.config.payload}`);
              }
              break;
            }
            case 'str': {
              payload = this.config.payload;
              break;
            }
            case 'json': {
              try {
                const arr = JSON.parse(this.config.payload);
                payload = arr[(Math.random() * arr.length) | 0];
              } catch (e) {
                this.debug(`Error on parsing input JSON: ${e}`);
              }
              break;
            }
            case 'msg':
            default: {
              payload = input[this.config.payload];
              break;
            }
          }

          let textPayload: string;
          if (typeof payload !== 'undefined' && payload !== null) {
            // Coerce non-string payloads (numbers, objects) to string so SSML wrapping is safe.
            textPayload = typeof payload === 'string' ? payload : String(payload);
            if (this.ttsVoice) {
              textPayload = `<speaker voice='${this.ttsVoice}'>${textPayload}`;
            }
            if (this.ttsEffect) {
              const effectsArr = this.ttsEffect.split(',');
              for (const effect of effectsArr) {
                textPayload = `<speaker effect='${effect}'>${textPayload}`;
              }
            }
            if (data.whisper) {
              textPayload = `<speaker is_whisper='true'>${textPayload}`;
            }
          } else {
            textPayload = '';
          }
          data.payload = textPayload;

          if (textPayload.length > 0 && this.controller) {
            this.controller.sendMessage(this.stationId, this.input, data);
            this.debug(
              `Sending data: station: ${this.stationId}, input type: ${this.input}, data: ${JSON.stringify(data)}`,
            );
          } else {
            this.debug('Nothing to send. Check input and parameters');
          }
        } else {
          data.payload = input.payload;
          data.hap = input.hap;
          if (this.controller) {
            this.controller.sendMessage(this.stationId, this.input, data);
            this.debug(
              `Sending data: station: ${this.stationId}, input type: ${this.input}, data: ${JSON.stringify(data)}`,
            );
          }
        }
      } else {
        this.debug('node.stationId is empty');
      }
    });

    /** Обновляет визуальный статус ноды в редакторе */
    this.onStatus = (data: NodeStatusData): void => {
      this.debug(`Status: ${JSON.stringify(data)}`);
      if (data) {
        this.status({ fill: data.color, shape: 'dot', text: data.text });
      }
    };

    this.on('close', () => {
      if (this.controller) {
        this.controller.removeListener(`statusUpdate_${this.stationId}`, this.onStatus);
      }
    });

    if (this.controller) {
      this.onStatus(this.controller.getStatus(this.stationId));
      this.controller.on(`statusUpdate_${this.stationId}`, this.onStatus);
    }
  }

  RED.nodes.registerType('yandex-commander-out', OutNodeConstructor);
};

export default nodeInit;
