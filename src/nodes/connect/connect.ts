import type { Request, Response } from 'express';
import type { NodeInitializer } from 'node-red';
import { QuasarApi } from '@/lib/api';
import type { Device } from '@/lib/api/device';
import { YandexAuth } from '@/lib/auth';
import { QuasarCloud } from '@/lib/quasarCloud';
import type {
  ConnectNode,
  ConnectNodeConfig,
  DeviceParameters,
  DeviceState,
  MessageType,
  NodeStatusData,
  OutMessage,
  RegistrationBufferEntry,
  RuntimeDevice,
  WsPayload,
} from '@/lib/types';
import { nextBackoffMs } from './backoff';
import { decideCloudRoute } from './cloudRoute';
import { applyCloudFallback, discoverDevices } from './discovery';
import { GlagolClient } from './glagolClient';
import { DeviceRegistry } from './registry';
import { checkScheduler } from './scheduler';
import { TtsStateMachine } from './ttsStateMachine';
import { buildWsPayload } from './wsPayload';

interface AxiosLikeError extends Error {
  response?: { status?: number; data?: unknown };
}

function isAxiosLikeError(err: unknown): err is AxiosLikeError {
  return err instanceof Error && 'response' in err;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const DEVICES_REFRESH_MS = 60_000;
const SCHEDULER_GRACE_MS = 5_000;
/** Close-коды, после которых имеет смысл реконнектиться сразу без backoff. */
const IMMEDIATE_RECONNECT_CODES = new Set([1000, 4000, 10000]);

const nodeInit: NodeInitializer = (RED) => {
  function ConnectNodeConstructor(this: ConnectNode, config: ConnectNodeConfig): void {
    RED.nodes.createNode(this, config);
    this.token = this.credentials.token;
    this.setMaxListeners(0);

    const node = this;
    const api = new QuasarApi(node.token);
    const registry = new DeviceRegistry();
    const glagolClients = new Map<string, GlagolClient>();
    const ttsMachines = new Map<string, TtsStateMachine>();
    const schedulerFlags = new Map<string, boolean>();
    const reconnectAttempts = new Map<string, number>();
    const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const registrationBuffer: RegistrationBufferEntry[] = [];

    let getDevicesInterval: ReturnType<typeof setInterval> | undefined;
    let httpRouteRegistered = false;
    let quasarCloud: QuasarCloud | undefined;

    function ensureQuasarCloud(): QuasarCloud {
      if (!quasarCloud) {
        node.debug('Initialising QuasarCloud for cloud TTS');
        quasarCloud = new QuasarCloud(node.token, node.debug.bind(node));
      }
      return quasarCloud;
    }

    // ── Public API (bound below) ────────────────────────────────────────────

    function statusUpdate(deviceId: string, status: NodeStatusData): void {
      node.debug(`Status update: ${JSON.stringify(status)} for ${deviceId}`);
      node.emit(`statusUpdate_${deviceId}`, status);
    }

    function getStatus(this: ConnectNode, id: string): NodeStatusData {
      const client = glagolClients.get(id);
      if (!client) return { color: 'red', text: 'disconnected' };
      if (client.isOpen()) return { color: 'green', text: 'connected' };
      return { color: 'yellow', text: 'connecting...' };
    }

    async function sendMessage(
      this: ConnectNode,
      deviceId: string,
      messageType: MessageType,
      message?: OutMessage,
    ): Promise<string | undefined> {
      const device = registry.get(deviceId);
      if (!device) return undefined;

      const client = glagolClients.get(deviceId);
      const localOpen = !!client?.isOpen();
      const msg = message ?? ({} as OutMessage);

      const route = decideCloudRoute(messageType, localOpen, msg.cloud, msg.cloudFallback);

      if (route === 'offline') return 'Device offline';

      if (route === 'cloud') {
        try {
          const text = typeof msg.payload === 'string' ? msg.payload : String(msg.payload ?? '');
          await ensureQuasarCloud().sendCloudTts(deviceId, text);
          return 'ok-cloud';
        } catch (err) {
          node.error(`Cloud TTS failed for ${deviceId}: ${errMessage(err)}`);
          return undefined;
        }
      }

      // route === 'local' — original path.
      if (!client?.isOpen()) return 'Device offline';
      try {
        const result = buildWsPayload(messageType, msg, device.lastState, node.debug.bind(node));

        const tts = ensureTtsMachine(deviceId);
        if (result.waitForListening) tts.armStopListening();
        if (result.playAfterTTS) tts.armPlayAfterTTS();
        if (result.waitForIdle) tts.armVolumeRestore(result.savedVolumeLevel);

        if (result.needsStop) {
          client.send({ command: 'stop' });
        }
        for (const payload of result.payloads) {
          client.send(payload);
        }
        return 'ok';
      } catch (err) {
        node.debug(`Error while sending message: ${err}`);
        return undefined;
      }
    }

    function registerDevice(
      this: ConnectNode,
      deviceId: string,
      nodeId: string,
      parameters: DeviceParameters,
    ): number | undefined {
      const device = registry.get(deviceId);
      node.debug(`Register request: device=${deviceId} nodeId=${nodeId} params=${JSON.stringify(parameters)}`);

      if (!device) {
        if (!registrationBuffer.find((el) => el.manager === nodeId)) {
          registrationBuffer.push({ id: deviceId, manager: nodeId, parameters });
          node.debug(`Buffered registration (size=${registrationBuffer.length})`);
        }
        return undefined;
      }

      if (device.manager === nodeId) {
        device.parameters = parameters;
        applyParametersToDevice(device);
        node.debug(`Re-register for ${deviceId}, reconnecting`);
        scheduleReconnect(deviceId, true);
        return 1;
      }

      if (typeof device.manager !== 'undefined') {
        node.debug(`Device ${deviceId} is already managed by ${device.manager}`);
        return 2;
      }

      device.manager = nodeId;
      device.parameters = parameters;
      applyParametersToDevice(device);

      const idx = registrationBuffer.findIndex((el) => el.manager === nodeId);
      if (idx !== -1) registrationBuffer.splice(idx, 1);

      node.debug(`Registered manager ${nodeId} for ${deviceId}`);
      scheduleReconnect(deviceId, true);
      return 0;
    }

    function unregisterDevice(this: ConnectNode, deviceId: string, nodeId: string): number | undefined {
      const device = registry.get(deviceId);
      if (!device) return undefined;
      if (device.manager !== nodeId) return 2;
      device.manager = undefined;
      device.parameters = {};
      return 0;
    }

    node.getStatus = getStatus.bind(node);
    node.sendMessage = sendMessage.bind(node);
    node.registerDevice = registerDevice.bind(node);
    node.unregisterDevice = unregisterDevice.bind(node);

    // ── Device lifecycle ────────────────────────────────────────────────────

    function applyParametersToDevice(device: RuntimeDevice): void {
      const net = device.parameters.network;
      if (net) {
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
        }
      }
      device.connection = device.parameters.connection !== false;
    }

    function ensureTtsMachine(deviceId: string): TtsStateMachine {
      let m = ttsMachines.get(deviceId);
      if (!m) {
        m = new TtsStateMachine();
        ttsMachines.set(deviceId, m);
      }
      return m;
    }

    function shouldConnect(device: RuntimeDevice): boolean {
      const enabled = device.connection === true || typeof device.connection === 'undefined';
      const hasListener = node.listenerCount(`statusUpdate_${device.id}`) > 0;
      const hasAddress = !!device.address && !!device.port;
      return enabled && hasListener && hasAddress;
    }

    async function kickoffConnection(device: RuntimeDevice): Promise<void> {
      if (!shouldConnect(device)) {
        node.debug(`${device.id}: skip connect (not eligible)`);
        scheduleReconnect(device.id);
        return;
      }
      const existing = glagolClients.get(device.id);
      if (existing?.isOpen()) return;

      statusUpdate(device.id, { color: 'yellow', text: 'connecting...' });

      try {
        const tokenResp = await api.getLocalToken(device.id, device.platform);
        device.token = tokenResp.token;
        node.debug(`${device.id}: got local conversation token`);
      } catch (err) {
        node.debug(`${device.id}: getLocalToken failed: ${err}`);
        scheduleReconnect(device.id);
        return;
      }

      if (!device.glagol) {
        node.debug(`${device.id}: no glagol security data — cannot connect`);
        scheduleReconnect(device.id);
        return;
      }
      if (!device.address || !device.port || !device.token) return;

      // Tear down any previous client for this device.
      const prev = glagolClients.get(device.id);
      if (prev) prev.close();

      const client = new GlagolClient({
        deviceId: device.id,
        address: device.address,
        port: device.port,
        certificate: device.glagol.security.server_certificate,
        privateKey: device.glagol.security.server_private_key,
        conversationToken: device.token,
        debug: (m) => node.debug(m),
      });
      glagolClients.set(device.id, client);

      client.on('open', () => {
        reconnectAttempts.delete(device.id);
        device.lastState = {};
        ensureTtsMachine(device.id).reset();
        statusUpdate(device.id, { color: 'green', text: 'connected' });
      });

      client.on('frame', (frame) => {
        device.lastState = frame.state;
        device.fullMessage = frame.raw;
        node.emit(`message_${device.id}`, frame.state);

        // TTS post-fx
        const actions = ensureTtsMachine(device.id).handleStateUpdate(frame.state);
        for (const action of actions) {
          dispatchTtsAction(device.id, action);
        }

        // Scheduler
        applyScheduler(device, frame.state, frame.sentTime);
      });

      client.on('close', (code, _reason) => {
        device.lastState = {};
        statusUpdate(device.id, { color: 'red', text: 'disconnected' });
        if (client.isClosedByUser) return;
        const immediate = IMMEDIATE_RECONNECT_CODES.has(code);
        scheduleReconnect(device.id, immediate);
      });

      client.on('error', (err) => {
        node.debug(`${device.id}: ws error: ${err.message}`);
      });

      client.connect();
    }

    function dispatchTtsAction(deviceId: string, action: { type: string; volume?: number }): void {
      const client = glagolClients.get(deviceId);
      if (!client?.isOpen()) return;
      if (action.type === 'stopListening') {
        void sendMessage.call(node, deviceId, 'stopListening');
      } else if (action.type === 'play') {
        void sendMessage.call(node, deviceId, 'command', { payload: 'play' } as OutMessage);
      } else if (action.type === 'setVolume' && typeof action.volume === 'number') {
        const payload: WsPayload = { command: 'setVolume', volume: action.volume };
        void sendMessage.call(node, deviceId, 'raw', { payload } as OutMessage);
      }
    }

    function applyScheduler(device: RuntimeDevice, state: DeviceState, sentTime: number): void {
      if (!device.parameters.sheduler) return;
      if (!state.playing) return;
      if (state.aliceState === 'LISTENING') return;
      const [allowed, phrase] = checkScheduler(device.parameters, sentTime);
      if (allowed) return;
      const flag = schedulerFlags.get(device.id);
      if (flag === false) return;
      void sendMessage.call(node, device.id, 'command', { payload: 'stop' } as OutMessage);
      if (phrase && phrase.length > 0 && state.aliceState !== 'SPEAKING') {
        void sendMessage.call(node, device.id, 'tts', { payload: phrase, stopListening: true } as OutMessage);
      }
      schedulerFlags.set(device.id, false);
      setTimeout(() => schedulerFlags.set(device.id, true), SCHEDULER_GRACE_MS);
    }

    function scheduleReconnect(deviceId: string, immediate = false): void {
      const existing = reconnectTimers.get(deviceId);
      if (existing) clearTimeout(existing);
      const device = registry.get(deviceId);
      if (!device) return;

      if (immediate) {
        reconnectAttempts.delete(deviceId);
        reconnectTimers.set(
          deviceId,
          setTimeout(() => {
            reconnectTimers.delete(deviceId);
            kickoffConnection(device);
          }, 500),
        );
        return;
      }
      const attempt = (reconnectAttempts.get(deviceId) ?? 0) + 1;
      reconnectAttempts.set(deviceId, attempt);
      const delay = nextBackoffMs(attempt);
      node.debug(`${deviceId}: reconnect attempt ${attempt} in ${delay}ms`);
      reconnectTimers.set(
        deviceId,
        setTimeout(() => {
          reconnectTimers.delete(deviceId);
          kickoffConnection(device);
        }, delay),
      );
    }

    // ── Cloud devices fetch + processing ────────────────────────────────────

    function registerHttpRoute(): void {
      if (httpRouteRegistered) return;
      httpRouteRegistered = true;
      RED.httpAdmin.get(
        `/stations/${node.id}`,
        RED.auth.needsPermission('yandex-commander-connect.read'),
        (_req: Request, res: Response) => {
          res.json({ devices: registry.ready() });
        },
      );
    }

    function processReadyDevices(): void {
      for (const device of registry.all()) {
        if (!device.address || !device.port) continue;
        const client = glagolClients.get(device.id);
        if (client?.isOpen()) continue;
        if (reconnectTimers.has(device.id)) continue;
        statusUpdate(device.id, { color: 'yellow', text: 'connecting...' });
        kickoffConnection(device);
      }
    }

    async function getDevices(): Promise<void> {
      try {
        const data = await api.getDevices();
        if (registry.size === 0) {
          const initial: RuntimeDevice[] = data.devices.map(
            (d: Device): RuntimeDevice => ({
              ...d,
              parameters: {},
              lastState: {},
            }),
          );
          registry.replaceAll(initial);
        }

        for (const device of registry.all()) {
          if (!device.parameters) device.parameters = {};
          const buffered = registrationBuffer.find((el) => el.id === device.id);
          if (buffered) {
            registerDevice.call(node, buffered.id, buffered.manager, buffered.parameters);
          }
        }

        try {
          await discoverDevices(registry.all(), node.debug.bind(node));
        } catch (err) {
          node.debug(`mDNS discover error: ${errMessage(err)}`);
        }
        applyCloudFallback(registry.all(), node.debug.bind(node));

        registerHttpRoute();
        processReadyDevices();
      } catch (err) {
        node.debug(errMessage(err));
        if (isAxiosLikeError(err) && err.response?.status === 403) {
          node.error('Bad oAuth token');
        }
      }
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────

    function onClose(): void {
      if (getDevicesInterval) clearInterval(getDevicesInterval);
      for (const timer of reconnectTimers.values()) clearTimeout(timer);
      reconnectTimers.clear();
      for (const client of glagolClients.values()) {
        try {
          client.close();
        } catch (err) {
          node.debug(`error closing client: ${err}`);
        }
      }
      glagolClients.clear();
      ttsMachines.clear();
      schedulerFlags.clear();
      reconnectAttempts.clear();
      registry.clear();
      quasarCloud = undefined;
    }

    node.on('close', onClose);

    // ── Main init ──────────────────────────────────────────────────────────

    if (typeof node.token !== 'undefined') {
      node.debug(`Starting connect node ${node.id}`);
      getDevices();
      getDevicesInterval = setInterval(getDevices, DEVICES_REFRESH_MS);
    }
  }

  // ── Static HTTP endpoints (admin only) ────────────────────────────────────

  RED.httpAdmin.post(
    '/yandex-commander/devices',
    RED.auth.needsPermission('yandex-commander-connect.read'),
    async (req: Request, res: Response) => {
      const token = (req.body as { token?: string } | undefined)?.token;
      if (!token) {
        res.status(400).json({ error: 'Token is required' });
        return;
      }
      try {
        const api = new QuasarApi(token);
        const data = await api.getDevices();
        const devices = data.devices.map((d: Device) => ({
          id: d.id,
          name: d.name,
          platform: d.platform,
        }));
        res.json({ devices });
      } catch (err) {
        res.status(500).json({ error: errMessage(err) || 'Failed to fetch devices' });
      }
    },
  );

  const yandexAuth = new YandexAuth();

  RED.httpAdmin.post(
    '/yandex-commander/auth/qr',
    RED.auth.needsPermission('yandex-commander-connect.read'),
    async (_req: Request, res: Response) => {
      try {
        const result = await yandexAuth.startQR();
        res.json(result);
      } catch (err) {
        const baseMessage = errMessage(err);
        const message =
          isAxiosLikeError(err) && err.response
            ? `${baseMessage} — ${err.response.status} ${JSON.stringify(err.response.data).substring(0, 200)}`
            : baseMessage;
        RED.log.error(`[yandex-commander] QR auth error: ${message}`);
        res.status(500).json({ error: message });
      }
    },
  );

  RED.httpAdmin.post(
    '/yandex-commander/auth/qr/status',
    RED.auth.needsPermission('yandex-commander-connect.read'),
    async (req: Request, res: Response) => {
      const { sessionId } = (req.body as { sessionId?: string } | undefined) ?? {};
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      try {
        const result = await yandexAuth.checkQR(sessionId);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: errMessage(err) });
      }
    },
  );

  RED.nodes.registerType('yandex-commander-connect', ConnectNodeConstructor, {
    credentials: { token: { type: 'text' } },
  });
};

export default nodeInit;
