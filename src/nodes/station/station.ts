import { NodeInitializer } from 'node-red';
import { StationNodeConfig, ConnectNode, NodeStatusData, RuntimeDevice } from '@/lib/types';

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-station.
   * Управляет конкретной станцией: регистрирует устройство в connect-ноде,
   * передаёт параметры подключения, расписание и сетевые настройки.
   */
  function StationNodeConstructor(this: any, config: StationNodeConfig): void {
    RED.nodes.createNode(this, config);
    const node = this;
    node.controller = RED.nodes.getNode(config.token) as ConnectNode | null;
    node.stationId = config.station_id;
    node.sheduler = config.sheduler;
    node.network = config.network;
    node.fixedAddress = config.fixedAddress;
    node.fixedPort = config.fixedPort;
    node.networkMode = node.network ? node.network.mode || 'auto' : 'auto';
    node.connectionFlag = config.connectionFlag;
    node.status({});

    if (node.sheduler) {
      node.sheduler.forEach((day: any) => {
        node.debug(JSON.stringify(day));
      });
    }

    /** Обновляет визуальный статус ноды в редакторе */
    node.onStatus = function (data: NodeStatusData): void {
      if (data) {
        node.status({ fill: data.color, shape: 'dot', text: data.text });
      }
    };

    /** Обработчик: при готовности нужного устройства регистрирует его в connect-ноде */
    node.onDeviceReady = function (device: RuntimeDevice): void {
      if (device.id === node.stationId) {
        node.registerDevice();
      }
    };

    /** Отправляет запрос на регистрацию устройства с параметрами подключения, расписания и сети */
    node.registerDevice = function (): void {
      node.debug(`Send registration for ${node.stationId}`);
      const params = {
        connection: node.connectionFlag,
        sheduler: node.sheduler,
        network: { mode: node.networkMode, fixedAddress: node.fixedAddress, fixedPort: node.fixedPort }
      };
      const status = node.controller.registerDevice(node.stationId, node.id, params);
      node.registration = status !== 2 && status !== undefined;
    };

    node.on('close', () => {
      if (node.controller) {
        node.controller.removeListener('deviceReady', node.onDeviceReady);
        node.controller.unregisterDevice(node.stationId, node.id);
      }
    });

    if (node.controller) {
      node.controller.on(`statusUpdate_${node.stationId}`, node.onStatus);
      node.controller.on('deviceReady', node.onDeviceReady);
      node.registerDevice();
    }
  }

  RED.nodes.registerType('yandex-commander-station', StationNodeConstructor);
};

export default nodeInit;
