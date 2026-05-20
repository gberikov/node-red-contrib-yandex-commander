import { NodeInitializer } from 'node-red';
import WebSocket from 'ws';
import { QuasarApi } from '@/lib/api';
import { YandexAuth } from '@/lib/auth';
import {
  ConnectNode,
  ConnectNodeConfig,
  RuntimeDevice,
  ReadyDevice,
  NodeStatusData,
  MessageType,
  OutMessage,
  DeviceParameters,
  RegistrationBufferEntry
} from './types';
import { buildWsPayload } from './wsPayload';
import { checkScheduler } from './scheduler';
import { discoverDevices, applyCloudFallback } from './discovery';

const nodeInit: NodeInitializer = (RED) => {
  function ConnectNodeConstructor(this: ConnectNode, config: ConnectNodeConfig): void {
    RED.nodes.createNode(this, config);
    this.token = this.credentials.token;
    this.deviceList = [];
    this.readyList = [];
    this.activeStationList = [];
    this.registrationBuffer = [];

    this.getStatus = getStatus.bind(this);
    this.sendMessage = sendMessage.bind(this);
    this.registerDevice = registerDevice.bind(this);
    this.unregisterDevice = unregisterDevice.bind(this);
    this.setMaxListeners(0);

    const node = this;
    const api = new QuasarApi(node.token);

    // HTTP route data — updated in-place, route registered once
    let httpDevicesData: ReadyDevice[] = [];
    let httpRouteRegistered = false;

    function registerHttpRoute(): void {
      if (httpRouteRegistered) return;
      httpRouteRegistered = true;

      RED.httpAdmin.get(`/stations/${node.id}`, RED.auth.needsPermission('yandex-commander-connect.read'), function (_req: any, res: any) {
        res.json({ devices: httpDevicesData });
      });
    }

    function processDeviceList(deviceList: RuntimeDevice[]): void {
      deviceList.forEach((device) => {
        if (device.address && device.port) {
          if (!node.readyList.find((item) => item.id === device.id)) {
            node.debug(`Ready event for ${device.id}`);
            node.readyList.push({
              name: device.name,
              id: device.id,
              platform: device.platform,
              address: device.address,
              port: device.port,
              host: device.host,
              parameters: device.parameters
            });
            // Update HTTP data and ensure route exists
            httpDevicesData = node.readyList;
            registerHttpRoute();
            statusUpdate({ color: 'yellow', text: 'connecting...' }, device);
            connect(device);
          }
        }
      });
    }

    async function getDevices(): Promise<void> {
      try {
        const data = await api.getDevices();
        if (node.deviceList.length === 0) {
          node.deviceList = data.devices.map((d: any) => ({
            ...d,
            parameters: d.parameters || {},
            lastState: {}
          }));
        }
        node.activeStationList = [];

        node.deviceList.forEach((device) => {
          if (device.parameters === undefined) {
            device.parameters = {};
          }
          const bufferedEntry = node.registrationBuffer.find((el) => el.id === device.id);
          if (bufferedEntry) {
            registerDevice.call(node, bufferedEntry.id, bufferedEntry.manager, bufferedEntry.parameters);
          }
          node.activeStationList.push({
            name: device.name,
            id: device.id,
            platform: device.platform,
            address: device.address,
            port: device.port
          });
        });

        processDeviceList(node.deviceList);

        try {
          const mdnsResult = await discoverDevices(node.deviceList, node.debug.bind(node));
          registerHttpRoute();
        } catch (error) {
          node.debug(`Error while searching: ${error}`);
        }

        applyCloudFallback(node.deviceList, node.debug.bind(node));
        processDeviceList(node.deviceList);
      } catch (err: any) {
        node.debug(String(err));
        if (err.response && err.response.status === 403) {
          node.error('Bad oAuth token');
        }
      }
    }

    function removeDevice(readyList: ReadyDevice[], device: RuntimeDevice): void {
      const deviceToRemove = readyList.find((item) => item.id === device.id);
      if (deviceToRemove) {
        node.debug(`Removing device from list: ${deviceToRemove.id}`);
        readyList.splice(readyList.indexOf(deviceToRemove), 1);
      }
    }

    async function getLocalToken(device: RuntimeDevice): Promise<void> {
      statusUpdate({ color: 'yellow', text: 'connecting...' }, device);
      try {
        const data = await api.getLocalToken(device.id, device.platform);
        device.token = data.token;
        node.debug(`${device.id}: Received conversation new token`);
      } catch (err) {
        removeDevice(node.readyList, device);
        node.debug(`Error while getting conversation token. Check your internet connection. Error text: ${err}`);
        getDevices();
      }
    }

    function statusUpdate(status: NodeStatusData, device: RuntimeDevice): void {
      node.debug(`Status update event: ${JSON.stringify(status)} for ${device.id}`);
      node.emit(`statusUpdate_${device.id}`, status);
    }

    function shouldConnect(device: RuntimeDevice): boolean {
      return (device.connection === true || typeof device.connection === 'undefined')
        && node.listenerCount(`statusUpdate_${device.id}`) > 0;
    }

    function connect(device: RuntimeDevice): void {
      if (!shouldConnect(device)) {
        device.timer = setTimeout(connect, 60000, device);
        return;
      }
      if (device.ws && device.ws.readyState !== 3) return;
      device.ws = undefined;
      getLocalToken(device)
        .then(() => {
          if (device.address && device.port) {
            makeConnection(device);
          } else {
            node.debug(`address is ${device.address}, port is ${device.port}`);
          }
        })
        .catch((err) => {
          node.debug(`Error: ${err}`);
        });
    }

    async function makeConnection(device: RuntimeDevice): Promise<void> {
      if (!device.glagol) {
        node.debug(`${device.id}: No glagol security data`);
        return;
      }
      const options = {
        key: device.glagol.security.server_private_key,
        cert: device.glagol.security.server_certificate,
        rejectUnauthorized: false
      };
      device.lastState = {};
      node.debug(`Connecting to wss://${device.address}:${device.port}`);
      device.ws = new WebSocket(`wss://${device.address}:${device.port}`, options as any);
      node.debug(`${device.id}: Fire connection watchdog for 60 seconds`);
      device.watchDogConn = setTimeout(() => {
        reconnect(device);
      }, 60000);

      device.ws.on('open', function open() {
        node.debug(`Connected to ${device.address}`);
        sendMessage.call(node, device.id, 'command', { payload: 'ping' } as OutMessage);
        statusUpdate({ color: 'green', text: 'connected' }, device);
        node.debug(`connection of ${device.id} success!`);
        device.waitForListening = false;
        device.playAfterTTS = false;
        device.waitForIdle = false;
        device.watchDog = setTimeout(() => {
          if (typeof device !== 'undefined' && typeof device.ws !== 'undefined') {
            device.ws!.close();
          }
        }, 10000);
        device.pingInterval = setInterval(sendKeepAlive, 1500, device);
        node.debug(`${device.id}: Kill connection watchdog`);
        clearTimeout(device.watchDogConn!);
        clearTimeout(device.timer!);
      });

      device.ws.on('message', function incoming(data: WebSocket.Data) {
        let dataReceived: any;
        try {
          dataReceived = JSON.parse(data.toString());
        } catch (err) {
          node.debug(`${device.id}: Failed to parse incoming WS frame: ${err}`);
          return;
        }
        if (!dataReceived || typeof dataReceived !== 'object' || !dataReceived.state) {
          node.debug(`${device.id}: WS frame missing state, skipping`);
          return;
        }
        device.lastState = dataReceived.state;
        device.fullMessage = JSON.stringify(dataReceived);
        node.emit(`message_${device.id}`, device.lastState);

        // Inline TTS side-effect handlers (were separate event listeners)
        if (device.lastState.aliceState === 'LISTENING') {
          if (device.waitForListening) {
            sendMessage.call(node, device.id, 'stopListening');
            device.waitForListening = false;
          }
          if (device.playAfterTTS) {
            sendMessage.call(node, device.id, 'command', { payload: 'play' } as OutMessage);
            device.playAfterTTS = false;
          }
          if (device.waitForIdle) {
            if (device.savedVolumeLevel) {
              sendMessage.call(node, device.id, 'raw', {
                payload: {
                  command: 'setVolume',
                  volume: parseFloat(String(device.savedVolumeLevel))
                }
              } as OutMessage);
            }
            device.waitForIdle = false;
          }
        }

        // Scheduler check
        if (device.lastState.playing && device.lastState.aliceState !== 'LISTENING' && device.parameters.sheduler) {
          const res = checkScheduler(device.parameters, dataReceived.sentTime);
          if (!res[0]) {
            if (device.schedulerFlag || device.schedulerFlag === undefined) {
              // Inline stopPlay handler
              sendMessage.call(node, device.id, 'command', { payload: 'stop' } as OutMessage);
              if (res[1] && res[1].length > 0 && device.lastState.aliceState !== 'SPEAKING') {
                sendMessage.call(node, device.id, 'tts', { payload: res[1], stopListening: true } as OutMessage);
              }
              device.schedulerFlag = false;
              setTimeout(() => {
                device.schedulerFlag = true;
              }, 5000);
            }
          }
        }

        clearTimeout(device.watchDog!);
        device.watchDog = setTimeout(() => {
          device.ws!.close();
        }, 10000);
      });

      device.ws.on('close', function close(code: number, reason: Buffer) {
        statusUpdate({ color: 'red', text: 'disconnected' }, device);
        device.lastState = {};
        clearTimeout(device.watchDog!);
        clearTimeout(device.watchDogConn!);
        clearInterval(device.pingInterval!);
        device.pingInterval = undefined;
        const reasonStr = reason ? reason.toString() : '';
        // Codes that allow immediate reconnect; everything else backs off 60s.
        const immediateReconnect = code === 4000 || code === 1000 || code === 10000;
        if (immediateReconnect) {
          node.debug(`${device.id}: closed (code ${code}, reason "${reasonStr}"). Reconnecting...`);
          connect(device);
        } else {
          node.debug(`${device.id}: closed (code ${code}, reason "${reasonStr}"). Reconnecting in 60s.`);
          device.timer = setTimeout(connect, 60000, device);
        }
      });

      device.ws.on('error', function error(data: Error) {
        node.debug(`error: ${data}`);
        if (typeof device !== 'undefined' && typeof device.ws !== 'undefined') {
          device.ws!.terminate();
        }
      });
    }

    function reconnect(device: RuntimeDevice): void {
      if (device.ws) {
        if (device.ws.readyState === 1 || device.ws.readyState === 0) {
          node.debug(`${device.id} device.ws.readyState is ${device.ws.readyState}`);
          device.ws.close();
        } else {
          node.debug(`New connection to ${device.id}`);
          connect(device);
        }
      } else {
        node.debug('nothing to reconnect...');
      }
    }

    function sendMessage(this: ConnectNode, deviceId: string, messageType: MessageType, message?: OutMessage): string | undefined {
      try {
        const device = findDeviceById(deviceId);
        if (device && device.ws) {
          if (device.ws.readyState === 1) {
            const result = buildWsPayload(messageType, message || ({} as OutMessage), device.lastState, node.debug.bind(node));

            // Apply TTS side-effects to device
            if (result.waitForListening) device.waitForListening = true;
            if (result.playAfterTTS) device.playAfterTTS = true;
            if (result.waitForIdle) {
              device.waitForIdle = true;
              device.savedVolumeLevel = result.savedVolumeLevel;
            }
            // Send stop before TTS if pauseMusic was requested
            if (result.needsStop) {
              const stopData = {
                conversationToken: device.token,
                id: device.id,
                payload: { command: 'stop' },
                sentTime: Date.now()
              };
              device.ws.send(JSON.stringify(stopData));
            }

            for (const m of result.payloads) {
              const data = {
                conversationToken: device.token,
                id: device.id,
                payload: m,
                sentTime: Date.now()
              };
              device.ws.send(JSON.stringify(data));
            }
            return 'ok';
          } else {
            return 'Device offline';
          }
        }
      } catch (err) {
        node.debug(`Error while sending message: ${err}`);
      }
      return undefined;
    }

    function findDeviceById(id: string): RuntimeDevice | undefined {
      if (node.deviceList) {
        return node.deviceList.find((device) => device.id === id);
      }
      return undefined;
    }

    function sendKeepAlive(device: RuntimeDevice): void {
      sendMessage.call(node, device.id, 'command', { payload: 'softwareVersion' } as OutMessage);
    }

    function getStatus(this: ConnectNode, id: string): NodeStatusData {
      const device = findDeviceById(id);
      if (device && device.ws) {
        switch (device.ws.readyState) {
          case 0:
            return { color: 'yellow', text: 'connecting...' };
          case 1:
            return { color: 'green', text: 'connected' };
          case 2:
            return { color: 'red', text: 'disconnecting' };
          case 3:
            return { color: 'red', text: 'disconnected' };
          default:
            return { color: 'red', text: 'disconnected' };
        }
      }
      return { color: 'red', text: 'disconnected' };
    }

    function registerDevice(this: ConnectNode, deviceId: string, nodeId: string, parameters: DeviceParameters): number | undefined {
      const device = findDeviceById(deviceId);
      node.debug(`Received parameters ${JSON.stringify(parameters)} for station id ${deviceId}`);
      if (device) {
        node.debug(`Received device id is ${deviceId}, nodeID is ${nodeId}. Current device manager is ${device.manager} with parameters ${JSON.stringify(device.parameters)}`);

        if (device.manager === nodeId) {
          device.parameters = parameters;
          node.debug(`Device ${device.id} already registered with manager id ${device.manager}. Updating parameters and restart...`);
          reconnect(device);
          return 1;
        }

        if (typeof device.manager === 'undefined') {
          device.manager = nodeId;
          device.parameters = parameters;
          node.debug(`Parameters are: ${JSON.stringify(device.parameters)}`);
          if (device.parameters.network) {
            const net = device.parameters.network;
            if (device.mode === 'manual') {
              device.address = undefined;
              device.port = undefined;
            }
            device.mode = net.mode;
            if (net.mode === 'manual') {
              if (net.fixedAddress && net.fixedAddress.length > 0) {
                device.address = net.fixedAddress;
              }
              if (net.fixedPort && net.fixedPort.length > 0) {
                device.port = parseInt(net.fixedPort, 10);
              }
            } else if (net.mode === 'auto') {
              removeDevice(node.readyList, device);
            }
            node.debug(`Network parameters: ${JSON.stringify(net)}`);
          }
          device.connection = device.parameters.connection !== false;

          node.debug(`For device ${deviceId} was successfully registered management node with id ${device.manager}`);

          const bufferEntry = node.registrationBuffer.find((el) => el.manager === nodeId);
          node.debug(`Buffer entry is ${bufferEntry}. Current buffer size is ${node.registrationBuffer.length}`);
          if (bufferEntry) {
            node.registrationBuffer.splice(node.registrationBuffer.indexOf(bufferEntry), 1);
            node.debug(`Element from registration buffer was deleted. Current buffer size is ${node.registrationBuffer.length}`);
          }
          reconnect(device);
          return 0;
        }

        if (device.manager !== nodeId) {
          node.debug(`For device ${deviceId} there is already registered management node with id ${device.manager}`);
          return 2;
        }
      } else {
        if (!node.registrationBuffer.find((el) => el.manager === nodeId)) {
          node.registrationBuffer.push({ id: deviceId, manager: nodeId, parameters: parameters });
          node.debug(`New element in registration buffer. Current buffer size is ${node.registrationBuffer.length}`);
        }
      }
      return undefined;
    }

    function unregisterDevice(this: ConnectNode, deviceId: string, nodeId: string): number | undefined {
      const device = findDeviceById(deviceId);
      if (device) {
        if (device.manager === nodeId) {
          node.debug(`For device ${deviceId} was successfully unregistered management node with id ${device.manager}`);
          device.manager = undefined;
          device.parameters = {};
          return 0;
        } else {
          return 2;
        }
      }
      return undefined;
    }

    function onClose(): void {
      clearInterval(node.interval!);
      for (const device of node.deviceList) {
        clearTimeout(device.watchDog!);
        clearTimeout(device.watchDogConn!);
        clearTimeout(device.timer!);
        clearInterval(device.pingInterval!);
        if (device.ws) {
          // Remove listeners so the close handler doesn't trigger a reconnect.
          device.ws.removeAllListeners();
          try {
            device.ws.terminate();
          } catch (err) {
            node.debug(`${device.id}: error terminating ws on close: ${err}`);
          }
          device.ws = undefined;
        }
      }
      node.deviceList = [];
      node.readyList = [];
      node.activeStationList = [];
    }

    node.on('close', onClose);

    // main init
    if (typeof node.token !== 'undefined') {
      node.debug(`Starting server with id ${node.id}`);
      getDevices();
      node.interval = setInterval(getDevices, 60000);
    }
  }

  // Static endpoint: fetch devices on-demand using a provided token (works before deploy)
  RED.httpAdmin.post('/yandex-commander/devices', RED.auth.needsPermission('yandex-commander-connect.read'), async function (req: any, res: any) {
    const token = req.body && req.body.token;
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }
    try {
      const api = new QuasarApi(token);
      const data = await api.getDevices();
      const devices = data.devices.map((d: any) => ({
        id: d.id,
        name: d.name,
        platform: d.platform
      }));
      res.json({ devices });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch devices' });
    }
  });

  // QR-code authorization endpoints
  const yandexAuth = new YandexAuth();

  RED.httpAdmin.post('/yandex-commander/auth/qr', RED.auth.needsPermission('yandex-commander-connect.read'), async function (_req: any, res: any) {
    try {
      const result = await yandexAuth.startQR();
      res.json(result);
    } catch (err: any) {
      const message = err.response
        ? `${err.message} — ${err.response.status} ${JSON.stringify(err.response.data).substring(0, 200)}`
        : err.message;
      RED.log.error(`[yandex-commander] QR auth error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  RED.httpAdmin.post('/yandex-commander/auth/qr/status', RED.auth.needsPermission('yandex-commander-connect.read'), async function (req: any, res: any) {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    try {
      const result = await yandexAuth.checkQR(sessionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  RED.nodes.registerType('yandex-commander-connect', ConnectNodeConstructor, {
    credentials: { token: { type: 'text' } }
  });
};

export default nodeInit;
