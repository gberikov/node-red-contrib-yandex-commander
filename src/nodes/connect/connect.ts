import { NodeInitializer } from 'node-red';
import mDnsSd from 'node-dns-sd';
import WebSocket from 'ws';
import { QuasarApi } from '../../lib/api';
import {
  ConnectNode,
  ConnectNodeConfig,
  RuntimeDevice,
  ReadyDevice,
  NodeStatusData,
  MessageType,
  OutMessage,
  WsPayload,
  RegistrationBufferEntry,
  DeviceParameters,
  SchedulerDay
} from './types';

const nodeInit: NodeInitializer = (RED) => {
  /**
   * Конструктор конфигурационной ноды yandex-commander-connect.
   * Управляет жизненным циклом: получение списка устройств, mDNS-обнаружение,
   * WebSocket-подключения, регистрация станций и отправка команд.
   */
  function ConnectNodeConstructor(this: ConnectNode, config: ConnectNodeConfig): void {
    RED.nodes.createNode(this, config);
    const node: any = this;
    node.token = this.credentials.token;
    node.debugFlag = config.debugFlag;
    node.deviceList = [];
    node.readyList = [];
    node.activeStationList = [];
    node.registrationBuffer = [];

    node.getStatus = getStatus;
    node.sendMessage = sendMessage;
    node.registerDevice = registerDevice;
    node.unregisterDevice = unregisterDevice;

    node.on('stopListening', onStopListening);
    node.on('startPlay', onStartPlay);
    node.on('stopPlay', onStopPlay);
    node.on('setVolume', onSetVolume);
    node.on('deviceReady', onDeviceReady);
    node.setMaxListeners(0);

    const api = new QuasarApi(node.token);

    /** Выводит отладочное сообщение в лог, если включён debugFlag */
    function debugMessage(text: string): void {
      if (node.debugFlag) {
        try {
          node.log(text);
        } catch (error) {
          node.log(String(error));
        }
      }
    }

    /** Проверяет устройства с известным адресом/портом и добавляет их в readyList, если ещё не добавлены */
    function processDeviceList(deviceList: RuntimeDevice[]): void {
      deviceList.forEach((device) => {
        if (device.address && device.port) {
          if (node.readyList.find((item) => item.id === device.id)) {
            // already in ready list, skip
          } else {
            debugMessage(`Ready event for ${device.id}`);
            node.emit('deviceReady', device);
            node.readyList.push({
              name: device.name,
              id: device.id,
              platform: device.platform,
              address: device.address,
              port: device.port,
              host: device.host,
              parameters: device.parameters
            });
            node.emit('refreshHttp', node.activeStationList, node.readyList);
            statusUpdate({ color: 'yellow', text: 'connecting...' }, device);
          }
        }
      });
    }

    /** Запрашивает список устройств из облака, обрабатывает очередь регистрации и запускает mDNS-поиск */
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

        // registration queue processing
        node.deviceList.forEach((device) => {
          if (device.parameters === undefined) {
            device.parameters = {};
          }
          const bufferedEntry = node.registrationBuffer.find((el) => el.id === device.id);
          if (bufferedEntry) {
            const result = registerDevice(bufferedEntry.id, bufferedEntry.manager, bufferedEntry.parameters);
            // keep in buffer if result is 2 (already managed) or undefined
            if (result !== 2 && result !== undefined) {
              // registered successfully
            }
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
          await discoverDevices(node.deviceList);
          processDeviceList(node.deviceList);
        } catch (error) {
          debugMessage(`Error while searching: ${error}`);
        }
      } catch (err: any) {
        debugMessage(String(err));
        if (err.response && err.response.status === 403) {
          node.error('Bad oAuth token');
        }
      }
    }

    /** Ищет устройства в локальной сети через mDNS (_yandexio._tcp) и обновляет их адреса/порты */
    async function discoverDevices(deviceList: RuntimeDevice[]): Promise<void> {
      try {
        const result = await mDnsSd.discover({ name: '_yandexio._tcp.local' });
        node.emit('refreshHttpDNS', result);
        if (result.length !== 0) {
          for (const device of deviceList) {
            result.forEach((element: any) => {
              const networkConfig = device.parameters.network || ({} as any);
              if (networkConfig.mode === 'auto' || JSON.stringify(networkConfig) === '{}') {
                const srvRecord = element.packet.answers.find((el: any) => el.type === 'SRV') || element.packet.additionals.find((el: any) => el.type === 'SRV');
                const txtRecord = element.packet.answers.find((el: any) => el.type === 'TXT') || element.packet.additionals.find((el: any) => el.type === 'TXT');
                if (typeof txtRecord !== 'undefined') {
                  if (txtRecord.rdata.deviceId === device.id) {
                    device.address = element.address;
                    device.port = element.service.port;
                    try {
                      device.host = srvRecord.rdata.target;
                    } catch (e) {
                      debugMessage('Error searching hostname in mDNS answer');
                    }
                  }
                }
              }
            });
          }
        }
      } catch (err) {
        debugMessage(String(err));
      }
    }

    /** Удаляет устройство из списка готовых к подключению (readyList) */
    function removeDevice(readyList: ReadyDevice[], device: RuntimeDevice): void {
      const deviceToRemove = readyList.find((item) => item.id === device.id);
      if (deviceToRemove) {
        debugMessage(`Removing device from list: ${deviceToRemove.id}`);
        readyList.splice(readyList.indexOf(deviceToRemove), 1);
      }
    }

    /** Запрашивает локальный токен (conversationToken) для WebSocket-авторизации устройства */
    async function getLocalToken(device: RuntimeDevice): Promise<void> {
      statusUpdate({ color: 'yellow', text: 'connecting...' }, device);
      try {
        const data = await api.getLocalToken(device.id, device.platform);
        device.token = data.token;
        debugMessage(`${device.id}: Received conversation new token`);
      } catch (err) {
        removeDevice(node.readyList, device);
        debugMessage(`Error while getting conversation token. Check your internet connection. Error text: ${err}`);
        getDevices();
      }
    }

    /** Рассылает обновление статуса подключения устройства подписанным нодам */
    function statusUpdate(status: NodeStatusData, device: RuntimeDevice): void {
      debugMessage(`Status update event: ${JSON.stringify(status)} for ${device.id}`);
      node.emit(`statusUpdate_${device.id}`, status);
    }

    /** Обработчик события deviceReady — инициирует WebSocket-подключение к устройству */
    function onDeviceReady(device: RuntimeDevice): void {
      debugMessage(`Received event devicesListReady for ${device.id}!`);
      connect(device);
    }

    /** Устанавливает WebSocket-соединение: получает токен и вызывает makeConnection. Повторяет попытку при ошибках. */
    function connect(device: RuntimeDevice): void {
      if ((device.connection === true || typeof device.connection === 'undefined') && node.listenerCount(`statusUpdate_${device.id}`) > 0) {
        debugMessage(`Connecting to device ${device.id}. ws is ${device.ws}. Listeners: ${node.listenerCount(`statusUpdate_${device.id}`)}`);
        if (!device.ws) {
          debugMessage('Receiving conversation token...');
          getLocalToken(device)
            .then(() => {
              if (device.address && device.port) {
                makeConnection(device);
              } else {
                debugMessage(`address is ${device.address}, port is ${device.port}`);
              }
            })
            .catch((err) => {
              debugMessage('Error while getting token: ' + err);
            });
        } else {
          if (device.ws.readyState === 3) {
            debugMessage(`ws.state: ${device.ws.readyState}`);
            device.ws = undefined;
            try {
              if (device.address && device.port) {
                getLocalToken(device).then(() => {
                  if (device.address && device.port) {
                    makeConnection(device);
                  } else {
                    debugMessage(`address is ${device.address}, port is ${device.port}`);
                  }
                });
              } else {
                debugMessage(`address is ${device.address}, port is ${device.port}`);
              }
            } catch (error) {
              debugMessage(`Error: ${error}`);
              device.ws = undefined;
              connect(device);
            }
          }
        }
      } else {
        device.timer = setTimeout(connect, 60000, device);
      }
    }

    /**
     * Создаёт WSS-соединение с устройством с использованием TLS-сертификата (glagol).
     * Настраивает обработчики: open (ping, watchdog), message (состояние, планировщик),
     * close (переподключение по коду), error (terminate).
     */
    async function makeConnection(device: RuntimeDevice): Promise<void> {
      if (!device.glagol) {
        debugMessage(`${device.id}: No glagol security data`);
        return;
      }
      const options = {
        key: device.glagol.security.server_private_key,
        cert: device.glagol.security.server_certificate,
        rejectUnauthorized: false
      };
      device.lastState = {};
      debugMessage(`Connecting to wss://${device.address}:${device.port}`);
      device.ws = new WebSocket(`wss://${device.address}:${device.port}`, options as any);
      debugMessage(`${device.id}: Fire connection watchdog for 60 seconds`);
      device.watchDogConn = setTimeout(() => {
        reconnect(device);
      }, 60000);

      device.ws.on('open', function open() {
        debugMessage(`Connected to ${device.address}`);
        sendMessage(device.id, 'command', { payload: 'ping' } as OutMessage);
        statusUpdate({ color: 'green', text: 'connected' }, device);
        debugMessage(`connection of ${device.id} success!`);
        device.waitForListening = false;
        device.playAfterTTS = false;
        device.waitForIdle = false;
        device.watchDog = setTimeout(() => {
          if (typeof device !== 'undefined' && typeof device.ws !== 'undefined') {
            device.ws!.close();
          }
        }, 10000);
        device.pingInterval = setInterval(sendKeepAlive, 1500, device);
        debugMessage(`${device.id}: Kill connection watchdog`);
        clearTimeout(device.watchDogConn!);
        clearTimeout(device.timer!);
      });

      device.ws.on('message', function incoming(data: WebSocket.Data) {
        const dataReceived = JSON.parse(data.toString());
        device.lastState = dataReceived.state;
        device.fullMessage = JSON.stringify(dataReceived);
        node.emit(`message_${device.id}`, device.lastState);

        if (device.lastState.aliceState === 'LISTENING' && device.waitForListening) {
          node.emit('stopListening', device);
        }
        if (device.lastState.aliceState === 'LISTENING' && device.playAfterTTS) {
          node.emit('startPlay', device);
        }
        if (device.lastState.aliceState === 'LISTENING' && device.waitForIdle) {
          node.emit('setVolume', device);
        }

        if (device.lastState.playing && device.lastState.aliceState !== 'LISTENING' && device.parameters.hasOwnProperty('sheduler')) {
          const res = checkScheduler(device, dataReceived.sentTime);
          if (!res[0]) {
            if (device.schedulerFlag || device.schedulerFlag === undefined) {
              node.emit('stopPlay', device, res[1]);
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
        switch (code) {
          case 4000: // invalid token
            debugMessage('Getting new token...');
            connect(device);
            break;
          case 1000:
            debugMessage(`Closed connection code ${code} with reason ${reason}. Reconnecting...`);
            connect(device);
            break;
          case 1006:
            debugMessage(`Lost server, reconnect in 60 seconds...${code} + ${reason}`);
            device.timer = setTimeout(connect, 60000, device);
            break;
          case 10000:
            debugMessage(`Reconnect device reason 10000 ${device.id}`);
            connect(device);
            break;
          default:
            debugMessage(`Closed connection code ${code} with reason ${reason}. Reconnecting in 60 seconds.`);
            device.timer = setTimeout(connect, 60000, device);
            break;
        }
      });

      device.ws.on('error', function error(data: Error) {
        debugMessage(`error: ${data}`);
        if (typeof device !== 'undefined' && typeof device.ws !== 'undefined') {
          device.ws!.terminate();
        }
      });
    }

    /** Переподключение: закрывает активный WS или инициирует новое соединение */
    function reconnect(device: RuntimeDevice): void {
      if (device.ws) {
        if (device.ws.readyState === 1 || device.ws.readyState === 0) {
          debugMessage(`${device.id} device.ws.readyState is ${device.ws.readyState}`);
          device.ws.close();
        } else {
          debugMessage(`New connection to ${device.id}`);
          connect(device);
        }
      } else {
        debugMessage('nothing to reconnect...');
      }
    }

    /**
     * Формирует массив WS-команд по типу сообщения:
     * command — управление воспроизведением (play/stop/next/prev/volume/rewind),
     * voice — текстовая команда Алисе, tts — озвучка текста,
     * homekit — управление через HomeKit (speaker/tv/RemoteKey),
     * raw — прямая отправка payload, stopListening — прерывание прослушивания.
     */
    function buildWsPayload(messageType: MessageType, message: OutMessage, device?: RuntimeDevice): WsPayload[] {
      const commands = ['play', 'stop', 'next', 'prev', 'ping', 'softwareVersion'];
      const extraCommands = ['forward', 'backward', 'volumeup', 'volumedown', 'volume'];

      switch (messageType) {
        case 'command':
          if (commands.includes(message.payload)) {
            return [{ command: message.payload }];
          } else if (extraCommands.includes(message.payload) && device && device.lastState.playerState) {
            const currentPosition = device.lastState.playerState.progress;
            const duration = device.lastState.playerState.duration;
            const currentVolume = device.lastState.volume;
            debugMessage('current volume: ' + currentVolume);
            if (message.payload === 'forward') {
              const targetPosition = currentPosition + 10;
              if (targetPosition < duration) {
                return [{ command: 'rewind', position: targetPosition }];
              } else {
                return buildWsPayload('command', { payload: 'next' } as OutMessage);
              }
            } else if (message.payload === 'backward') {
              const targetPosition = currentPosition - 10;
              if (targetPosition > 0) {
                return [{ command: 'rewind', position: targetPosition }];
              } else {
                return [{ command: 'rewind', position: 0 }];
              }
            } else if (message.payload === 'volumeup') {
              debugMessage(String(currentVolume));
              if (currentVolume < 1.0) {
                return [{ command: 'setVolume', volume: currentVolume + 0.1 }];
              }
            } else if (message.payload === 'volumedown') {
              debugMessage(String(currentVolume));
              if (currentVolume > 0.0) {
                return [{ command: 'setVolume', volume: currentVolume - 0.1 }];
              }
            } else if (message.payload === 'volume') {
              return [{ command: 'setVolume', volume: parseFloat(message.level || '0') }];
            }
            return [{ command: 'softwareVersion' }];
          } else {
            debugMessage(`Bad command ${message.payload}`);
            return [{ command: 'softwareVersion' }];
          }

        case 'voice':
          debugMessage(`Message Voice command: ${message}`);
          return [{ command: 'sendText', text: message.payload }];

        case 'tts': {
          debugMessage(`Message TTS: ${message}`);
          const result: WsPayload[] = [];
          if (message.stopListening && device) {
            device.waitForListening = true;
          }
          if (message.pauseMusic && device && device.lastState.playing) {
            sendMessage(device.id, 'command', { payload: 'stop' } as OutMessage);
            device.playAfterTTS = true;
          }
          if (!message.volume) {
            result.push({
              command: 'serverAction',
              serverActionEventPayload: {
                type: 'server_action',
                name: 'update_form',
                payload: {
                  form_update: {
                    name: 'personal_assistant.scenarios.repeat_after_me',
                    slots: [{ type: 'string', name: 'request', value: message.payload }]
                  },
                  resubmit: true
                }
              }
            });
          } else {
            if (device) {
              device.savedVolumeLevel = device.lastState.volume;
              device.waitForIdle = true;
            }
            result.push(
              { command: 'setVolume', volume: parseFloat(String(message.volume)) },
              {
                command: 'serverAction',
                serverActionEventPayload: {
                  type: 'server_action',
                  name: 'update_form',
                  payload: {
                    form_update: {
                      name: 'personal_assistant.scenarios.repeat_after_me',
                      slots: [{ type: 'string', name: 'request', value: message.payload }]
                    },
                    resubmit: true
                  }
                }
              }
            );
          }
          return result;
        }

        case 'homekit': {
          debugMessage('HAP: ' + JSON.stringify(message) + ' PL: ' + JSON.stringify(message.payload));
          if (message.hap && 'session' in message.hap) {
            let playing = false;
            let id: string | null = null;
            const noTrackPhrase = message.noTrackPhrase;

            if (device && typeof device.lastState !== 'undefined') {
              const lastState = device.lastState;
              if (typeof lastState.playing !== 'undefined') {
                playing = lastState.playing;
              }
              if (typeof lastState.playerState !== 'undefined') {
                if (typeof lastState.playerState.id !== 'undefined') {
                  id = lastState.playerState.id;
                }
              }
            }

            // speaker
            if ('TargetMediaState' in message.payload) {
              const TargetMediaState = message.payload.TargetMediaState;
              if (id) {
                return buildWsPayload('command', { payload: TargetMediaState ? 'stop' : 'play' } as OutMessage);
              } else if (!id && !TargetMediaState && noTrackPhrase) {
                return buildWsPayload('voice', { payload: noTrackPhrase } as OutMessage);
              }
            }

            // tv
            if ('Active' in message.payload) {
              const Active = message.payload.Active;
              if (id) {
                return buildWsPayload('command', { payload: Active ? 'play' : 'stop' } as OutMessage);
              } else if (!id && Active && noTrackPhrase) {
                return buildWsPayload('voice', { payload: noTrackPhrase } as OutMessage);
              }
            }

            // tv + RemoteKey
            if ('RemoteKey' in message.payload) {
              const RemoteKey = message.payload.RemoteKey;
              switch (RemoteKey) {
                case '7':
                  return buildWsPayload('command', { payload: 'forward' } as OutMessage, device);
                case '6':
                  return buildWsPayload('command', { payload: 'backward' } as OutMessage, device);
                case '4':
                  return buildWsPayload('command', { payload: 'next' } as OutMessage);
                case '5':
                  return buildWsPayload('command', { payload: 'prev' } as OutMessage);
                case '11':
                  if (playing) {
                    return buildWsPayload('command', { payload: 'stop' } as OutMessage);
                  } else {
                    if (id) {
                      return buildWsPayload('command', { payload: 'play' } as OutMessage);
                    } else if (!id && noTrackPhrase) {
                      return buildWsPayload('voice', { payload: noTrackPhrase } as OutMessage);
                    }
                  }
              }
            }

            // tv + VolumeSelector
            if ('VolumeSelector' in message.payload) {
              const VolumeSelector = message.payload.VolumeSelector;
              return buildWsPayload('command', { payload: VolumeSelector ? 'volumedown' : 'volumeup' } as OutMessage, device);
            }

            debugMessage('unknown command');
            return buildWsPayload('command', { payload: 'softwareVersion' } as OutMessage);
          } else {
            return buildWsPayload('command', { payload: 'softwareVersion' } as OutMessage);
          }
        }

        case 'raw':
          if (Array.isArray(message.payload)) {
            return message.payload;
          }
          return [message.payload];

        case 'stopListening':
          return [
            {
              command: 'serverAction',
              serverActionEventPayload: {
                type: 'server_action',
                name: 'on_suggest'
              }
            }
          ];
      }
    }

    /** Отправляет сообщение устройству по WebSocket. Возвращает 'ok' при успехе, 'Device offline' или undefined при ошибке. */
    function sendMessage(deviceId: string, messageType: MessageType, message?: OutMessage): string | undefined {
      try {
        const device = findDeviceById(deviceId);
        if (device && device.ws) {
          if (device.ws.readyState === 1) {
            const messages = buildWsPayload(messageType, message || ({} as OutMessage), device);
            for (const m of messages) {
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
        debugMessage(`Error while sending message: ${err}`);
      }
      return undefined;
    }

    /** Проверяет, разрешено ли воспроизведение в текущее время по расписанию. Возвращает [true] если разрешено, [false, phrase] если нет. */
    function checkScheduler(device: RuntimeDevice, timestamp: number): [boolean] | [boolean, string] {
      const schedule: SchedulerDay[] = JSON.stringify(device.parameters) !== '{}' ? device.parameters.sheduler || [] : [];
      const date = new Date(timestamp);
      const currentMinutes = date.getDay() * 1000 + date.getHours() * 60 + date.getMinutes();
      const daySchedule = schedule.find((el) => el.dayNumber === date.getDay());
      if (!daySchedule) return [true];
      const timeMin = daySchedule.dayNumber * 1000 + parseInt(daySchedule.from);
      const timeMax = daySchedule.dayNumber * 1000 + parseInt(daySchedule.to);
      if (currentMinutes >= timeMin && currentMinutes < timeMax) {
        return [true];
      } else {
        return [false, daySchedule.phrase];
      }
    }

    /** Ищет устройство в deviceList по его ID */
    function findDeviceById(id: string): RuntimeDevice | undefined {
      if (node.deviceList) {
        return node.deviceList.find((device) => device.id === id);
      }
      return undefined;
    }

    /** Отправляет keep-alive запрос (softwareVersion) для поддержания WebSocket-соединения */
    function sendKeepAlive(device: RuntimeDevice): void {
      sendMessage(device.id, 'command', { payload: 'softwareVersion' } as OutMessage);
    }

    /** Возвращает текущий статус подключения устройства (connected/connecting/disconnected) */
    function getStatus(id: string): NodeStatusData {
      const device = findDeviceById(id);
      if (device) {
        if (device.ws) {
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
      }
      return { color: 'red', text: 'disconnected' };
    }

    /**
     * Регистрирует ноду-менеджер (station) для управления устройством.
     * Возвращает: 0 — успешная первичная регистрация, 1 — обновление параметров,
     * 2 — устройство уже управляется другой нодой, undefined — устройство не найдено (добавлено в буфер).
     */
    function registerDevice(deviceId: string, nodeId: string, parameters: DeviceParameters): number | undefined {
      const device = findDeviceById(deviceId);
      debugMessage(`Received parameters ${JSON.stringify(parameters)} for station id ${deviceId}`);
      if (device) {
        debugMessage(`Received device id is ${deviceId}, nodeID is ${nodeId}. Current device manager is ${device.manager} with parameters ${JSON.stringify(device.parameters)}`);

        // request from the same management node
        if (device.manager === nodeId) {
          device.parameters = parameters;
          debugMessage(`Device ${device.id} already registered with manager id ${device.manager}. Updating parameters and restart...`);
          reconnect(device);
          return 1;
        }

        // new first registration request
        if (typeof device.manager === 'undefined') {
          device.manager = nodeId;
          device.parameters = parameters;
          debugMessage(`Parameters are: ${JSON.stringify(device.parameters)}`);
          if (device.parameters.network) {
            if (device.mode === 'manual') {
              device.address = undefined;
              device.port = undefined;
            }
            device.mode = device.parameters.network.mode;
            if (device.parameters.network.fixedAddress.length > 0 && device.parameters.network.mode === 'manual') {
              device.address = device.parameters.network.fixedAddress;
            }
            if (device.parameters.network.fixedPort.length > 0 && device.parameters.network.mode === 'manual') {
              device.port = parseInt(device.parameters.network.fixedPort);
            }
            if (device.parameters.network.mode === 'auto') {
              removeDevice(node.readyList, device);
            }
            debugMessage(`Network parameters: ${JSON.stringify(device.parameters.network)}`);
          }
          device.connection = device.parameters.connection !== false;

          debugMessage(`For device ${deviceId} was successfully registered management node with id ${device.manager}`);

          // remove from registration buffer
          const bufferEntry = node.registrationBuffer.find((el) => el.manager === nodeId);
          debugMessage(`Buffer entry is ${bufferEntry}. Current buffer size is ${node.registrationBuffer.length}`);
          if (bufferEntry) {
            node.registrationBuffer.splice(node.registrationBuffer.indexOf(bufferEntry), 1);
            debugMessage(`Element from registration buffer was deleted. Current buffer size is ${node.registrationBuffer.length}`);
          }
          reconnect(device);
          return 0;
        }

        // new registration request when another node is already registered
        if (device.manager !== nodeId) {
          debugMessage(`For device ${deviceId} there is already registered management node with id ${device.manager}`);
          return 2;
        }
      } else {
        // device not found yet - add to buffer
        if (!node.registrationBuffer.find((el) => el.manager === nodeId)) {
          node.registrationBuffer.push({ id: deviceId, manager: nodeId, parameters: parameters });
          debugMessage(`New element in registration buffer. Current buffer size is ${node.registrationBuffer.length}`);
        }
      }
      return undefined;
    }

    /** Снимает регистрацию ноды-менеджера с устройства. Возвращает 0 при успехе, 2 если нода не является менеджером. */
    function unregisterDevice(deviceId: string, nodeId: string): number | undefined {
      const device = findDeviceById(deviceId);
      if (device) {
        if (device.manager === nodeId) {
          device.manager = undefined;
          device.parameters = {};
          debugMessage(`For device ${deviceId} was successfully unregistered management node with id ${device.manager}`);
          return 0;
        } else {
          return 2;
        }
      }
      return undefined;
    }

    /** Обработчик: прекращает режим прослушивания Алисы на устройстве */
    function onStopListening(device: RuntimeDevice): void {
      sendMessage(device.id, 'stopListening');
      device.waitForListening = false;
    }

    /** Обработчик: возобновляет воспроизведение после TTS */
    function onStartPlay(device: RuntimeDevice): void {
      sendMessage(device.id, 'command', { payload: 'play' } as OutMessage);
      device.playAfterTTS = false;
    }

    /** Обработчик: восстанавливает громкость устройства после TTS с изменённой громкостью */
    function onSetVolume(device: RuntimeDevice): void {
      if (device.savedVolumeLevel) {
        sendMessage(device.id, 'raw', {
          payload: {
            command: 'setVolume',
            volume: parseFloat(String(device.savedVolumeLevel))
          }
        } as OutMessage);
      }
      device.waitForIdle = false;
    }

    /** Обработчик: останавливает воспроизведение и опционально озвучивает фразу (из планировщика) */
    function onStopPlay(device: RuntimeDevice, phrase: string): void {
      sendMessage(device.id, 'command', { payload: 'stop' } as OutMessage);
      if (phrase && phrase.length > 0 && device.lastState.aliceState !== 'SPEAKING') {
        sendMessage(device.id, 'tts', { payload: phrase, stopListening: true } as OutMessage);
      }
    }

    /** Обработчик закрытия ноды: очищает интервалы и сбрасывает список устройств */
    function onClose(): void {
      clearInterval(node.interval!);
      node.deviceList = [];
      node.removeListener('deviceReady', onDeviceReady);
    }

    /** Регистрирует HTTP-эндпоинты для получения списка устройств и станций из редактора */
    node.on('refreshHttp', function (activeList: any[], readyList: any[]) {
      RED.httpAdmin.get('/yandexdevices_' + node.id, RED.auth.needsPermission('yandex-commander-connect.read'), function (_req: any, res: any) {
        res.json({ devices: readyList });
      });
      RED.httpAdmin.get('/stations/' + node.id, RED.auth.needsPermission('yandex-commander-connect.read'), function (_req: any, res: any) {
        res.json({ devices: activeList });
      });
    });

    /** Регистрирует HTTP-эндпоинт для получения результатов mDNS-поиска из редактора */
    node.on('refreshHttpDNS', function (dnsList: any[]) {
      RED.httpAdmin.get('/mdns/' + node.id, RED.auth.needsPermission('yandex-commander-connect.read'), function (_req: any, res: any) {
        res.json({ SearchResult: dnsList });
      });
    });

    node.on('close', onClose);

    RED.httpAdmin.get('/station/:id', RED.auth.needsPermission('yandex-commander-connect.read'), function (req: any, res: any) {
      const id = req.params.id;
      const device = findDeviceById(id);
      if (device) {
        res.json({
          id: device.id,
          name: device.name,
          platform: device.platform,
          address: device.address,
          port: device.port,
          manager: device.manager,
          ws: device.ws,
          parameters: device.parameters,
          fullMessage: device.fullMessage
        });
      } else {
        res.json({ error: 'no device found' });
      }
    });

    // main init
    if (typeof node.token !== 'undefined') {
      debugMessage(`Starting server with id ${node.id}`);
      getDevices();
      node.interval = setInterval(getDevices, 60000);
    }
  }

  RED.nodes.registerType('yandex-commander-connect', ConnectNodeConstructor, {
    credentials: { token: { type: 'text' } }
  });
};

export default nodeInit;
