import type { Node, NodeDef, NodeInitializer, NodeMessage } from 'node-red';
import { preparePayload } from '@/lib/stationHelper';
import type { ConnectNode, DeviceState, InNodeConfig, NodeStatusData } from '@/lib/types';

interface InNodeRuntime extends Node<NodeDef> {
  controller: ConnectNode | null;
  stationId: string;
  output: string;
  uniqueFlag: boolean;
  homekitFormat: string;
  lastMessage: NodeMessage;
  onMessage: (data: DeviceState) => void;
  onStatus: (data: NodeStatusData) => void;
  onClose: () => void;
}

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-in.
   * Автоматически отправляет состояние станции на выход при каждом WS-обновлении.
   * Поддерживает форматы status и homekit, опционально фильтрует дубликаты.
   */
  function InNodeConstructor(this: InNodeRuntime, config: InNodeConfig): void {
    RED.nodes.createNode(this, config);
    const node = this;
    node.controller = RED.nodes.getNode(config.token) as unknown as ConnectNode | null;
    node.stationId = config.station_id;
    node.output = config.output;
    node.uniqueFlag = config.uniqueFlag;
    node.homekitFormat = config.homekitFormat;
    node.lastMessage = {};
    node.status({});

    node.debug(`Node settings: ID: ${node.stationId}, Output Format: ${node.output}, HK: ${node.homekitFormat}`);

    /** Отправляет сообщение на выход ноды; в режиме homekit + uniqueFlag фильтрует дубликаты */
    function sendMessage(message: { payload?: unknown }): void {
      const outMsg = message as NodeMessage;
      if (node.uniqueFlag && node.output === 'homekit') {
        if (JSON.stringify(node.lastMessage.payload) !== JSON.stringify(message.payload)) {
          node.send(outMsg);
          node.lastMessage = outMsg;
          node.debug(`Sent message to Homekit: ${JSON.stringify(message)}`);
        }
      } else {
        node.send(outMsg);
      }
    }

    /** Обработчик WS-сообщения: подготавливает payload и отправляет на выход */
    node.onMessage = (data: DeviceState): void => {
      sendMessage(preparePayload(node, data));
    };

    /** Обновляет визуальный статус ноды в редакторе */
    node.onStatus = (data: NodeStatusData): void => {
      if (data) {
        node.status({ fill: data.color, shape: 'dot', text: data.text });
      }
    };

    /** Отписывается от событий контроллера при удалении ноды */
    node.onClose = (): void => {
      if (node.controller) {
        node.controller.removeListener(`message_${node.stationId}`, node.onMessage);
        node.controller.removeListener(`statusUpdate_${node.stationId}`, node.onStatus);
      }
    };

    if (node.controller) {
      node.onStatus(node.controller.getStatus(node.stationId));
      node.controller.on(`message_${node.stationId}`, node.onMessage);
      node.controller.on(`statusUpdate_${node.stationId}`, node.onStatus);
    }

    node.on('close', node.onClose);
  }

  RED.nodes.registerType('yandex-commander-in', InNodeConstructor);
};

export default nodeInit;
