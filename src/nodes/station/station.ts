import type { NodeInitializer } from 'node-red';
import type { ConnectNode, NodeStatusData, RuntimeDevice, StationNodeConfig } from '@/lib/types';

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор ноды yandex-commander-station.
   * Управляет конкретной станцией: регистрирует устройство в connect-ноде,
   * передаёт параметры подключения, расписание и сетевые настройки.
   */
  function StationNodeConstructor(this: any, config: StationNodeConfig): void {
    RED.nodes.createNode(this, config);

    this.controller = RED.nodes.getNode(config.token) as ConnectNode | null;
    this.stationId = config.station_id;
    this.sheduler = config.sheduler;
    this.network = config.network;
    this.fixedAddress = config.fixedAddress;
    this.fixedPort = config.fixedPort;
    this.networkMode = this.network ? this.network.mode || 'auto' : 'auto';
    this.connectionFlag = config.connectionFlag;
    this.status({});

    if (this.sheduler) {
      this.sheduler.forEach((day: any) => {
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
