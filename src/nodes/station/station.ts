import type { Node, NodeDef, NodeInitializer } from 'node-red';
import type {
  ConnectNode,
  NetworkConfig,
  NodeStatusData,
  RuntimeDevice,
  SchedulerDay,
  StationNodeConfig,
} from '@/lib/types';

interface StationNodeRuntime extends Node<NodeDef> {
  controller: ConnectNode | null;
  stationId: string;
  sheduler: SchedulerDay[];
  network: NetworkConfig;
  fixedAddress: string;
  fixedPort: string;
  networkMode: 'auto' | 'manual';
  connectionFlag: boolean;
  registration?: boolean;
  onStatus: (data: NodeStatusData) => void;
  onDeviceReady: (device: RuntimeDevice) => void;
  registerDevice: () => void;
}

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-station.
   * Управляет конкретной станцией: регистрирует устройство в connect-ноде,
   * передаёт параметры подключения, расписание и сетевые настройки.
   */
  function StationNodeConstructor(this: StationNodeRuntime, config: StationNodeConfig): void {
    RED.nodes.createNode(this, config);

    this.controller = RED.nodes.getNode(config.token) as unknown as ConnectNode | null;
    this.stationId = config.station_id;
    this.sheduler = config.sheduler;
    this.network = config.network;
    this.fixedAddress = config.fixedAddress;
    this.fixedPort = config.fixedPort;
    this.networkMode = this.network ? this.network.mode || 'auto' : 'auto';
    this.connectionFlag = config.connectionFlag;
    this.status({});

    if (this.sheduler) {
      this.sheduler.forEach((day: SchedulerDay) => {
        this.debug(JSON.stringify(day));
      });
    }

    /** Обновляет визуальный статус ноды в редакторе */
    this.onStatus = (data: NodeStatusData): void => {
      if (data) {
        this.status({ fill: data.color, shape: 'dot', text: data.text });
      }
    };

    /** Обработчик: при готовности нужного устройства регистрирует его в connect-ноде */
    this.onDeviceReady = (device: RuntimeDevice): void => {
      if (device.id === this.stationId) {
        this.registerDevice();
      }
    };

    /** Отправляет запрос на регистрацию устройства с параметрами подключения, расписания и сети */
    this.registerDevice = (): void => {
      this.debug(`Send registration for ${this.stationId}`);
      const params = {
        connection: this.connectionFlag,
        sheduler: this.sheduler,
        network: { mode: this.networkMode, fixedAddress: this.fixedAddress, fixedPort: this.fixedPort },
      };
      if (!this.controller) return;
      const status = this.controller.registerDevice(this.stationId, this.id, params);
      this.registration = status !== 2 && status !== undefined;
    };

    this.on('close', () => {
      if (this.controller) {
        this.controller.removeListener('deviceReady', this.onDeviceReady);
        this.controller.unregisterDevice(this.stationId, this.id);
      }
    });

    if (this.controller) {
      this.controller.on(`statusUpdate_${this.stationId}`, this.onStatus);
      this.controller.on('deviceReady', this.onDeviceReady);
      this.registerDevice();
    }
  }

  RED.nodes.registerType('yandex-commander-station', StationNodeConstructor);
};

export default nodeInit;
