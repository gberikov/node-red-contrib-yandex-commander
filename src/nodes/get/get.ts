import type { Node, NodeDef, NodeInitializer, NodeMessage, NodeMessageInFlow } from 'node-red';
import { preparePayload as buildPayload } from '@/lib/stationHelper';
import type { ConnectNode, DeviceState, GetNodeConfig, NodeStatusData } from '@/lib/types';

interface GetNodeRuntime extends Node<NodeDef> {
  controller: ConnectNode | null;
  output: string;
  stationId: string;
  homekitFormat: string;
  lastState: DeviceState;
  onStatus: (data: NodeStatusData) => void;
  onInput: (msg: NodeMessageInFlow) => void;
  onMessage: (message: DeviceState) => void;
  onClose: () => void;
}

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-get.
   * По входящему сообщению возвращает текущее состояние станции
   * в формате status (полный объект) или homekit (speaker/tv).
   */
  function GetNodeConstructor(this: GetNodeRuntime, config: GetNodeConfig): void {
    RED.nodes.createNode(this, config);
    const node = this;
    node.controller = RED.nodes.getNode(config.token) as unknown as ConnectNode | null;
    node.output = config.output;
    node.stationId = config.station_id;
    node.homekitFormat = config.homekitFormat;
    node.lastState = {};
    node.status({});

    /** Преобразует состояние устройства в payload нужного формата и прикрепляет к входящему сообщению */
    function preparePayload(message: DeviceState, inputMsg: NodeMessage): NodeMessage {
      const prepared = buildPayload(node, message);
      if (typeof prepared.payload !== 'undefined') {
        inputMsg.payload = prepared.payload;
      }
      return inputMsg;
    }

    /** Обновляет визуальный статус ноды в редакторе */
    node.onStatus = (data: NodeStatusData): void => {
      if (data) {
        node.status({ fill: data.color, shape: 'dot', text: data.text });
      }
    };

    /** Обработчик входящего сообщения: отдаёт текущее состояние станции или пробрасывает msg */
    node.onInput = (msg: NodeMessageInFlow): void => {
      node.debug(`current state: ${JSON.stringify(node.lastState)}`);
      if ('aliceState' in node.lastState) {
        node.send(preparePayload(node.lastState, msg));
      } else {
        node.send(msg);
      }
    };

    /** Обработчик WS-сообщения: сохраняет последнее состояние устройства */
    node.onMessage = (message: DeviceState): void => {
      node.lastState = message;
    };

    /** Отписывается от событий контроллера при удалении ноды */
    node.onClose = (): void => {
      if (node.controller) {
        node.controller.removeListener(`message_${node.stationId}`, node.onMessage);
        node.controller.removeListener(`statusUpdate_${node.stationId}`, node.onStatus);
      }
    };

    node.on('input', node.onInput);
    node.on('close', node.onClose);

    if (node.controller) {
      node.onStatus(node.controller.getStatus(node.stationId));
      node.controller.on(`message_${node.stationId}`, node.onMessage);
      node.controller.on(`statusUpdate_${node.stationId}`, node.onStatus);
    }
  }

  RED.nodes.registerType('yandex-commander-get', GetNodeConstructor);
};

export default nodeInit;
