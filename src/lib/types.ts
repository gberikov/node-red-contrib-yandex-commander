import type { Node, NodeDef } from 'node-red';

// ── Node Status ──

export interface NodeStatusData {
  color: string;
  text: string;
}

// ── Scheduler ──

export interface SchedulerDay {
  dayNumber: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  active: boolean;
  from: string; // minutes from midnight as string, e.g. "0", "480", "1440"
  to: string;
  phrase: string;
}

// ── Network ──

export interface NetworkConfig {
  mode: 'auto' | 'manual';
  fixedAddress: string;
  fixedPort: string;
}

// ── Device Registration Parameters ──

export interface DeviceParameters {
  connection?: boolean;
  sheduler?: SchedulerDay[];
  network?: NetworkConfig;
}

// ── Runtime Device (cloud device + identity/state) ──
//
// Per-device transport (WebSocket, watchdog timers) живёт в GlagolClient.
// TTS-флаги (waitForListening, playAfterTTS, savedVolumeLevel) живут в TtsStateMachine.
// schedulerFlag живёт в connect-ноде (Map<deviceId, boolean>).

export interface RuntimeDevice {
  id: string;
  name: string;
  platform: string;
  address?: string;
  port?: number;
  host?: string;
  /** Локальный conversation token, полученный через /glagol/token. */
  token?: string;
  /** Id station-ноды, которая управляет этим устройством. */
  manager?: string;
  parameters: DeviceParameters;
  connection?: boolean;
  mode?: string;
  /** Последнее известное состояние (для get/in нод). */
  lastState: DeviceState;
  /** Сериализованный JSON последнего фрейма (для get/in нод). */
  fullMessage?: string;
  glagol?: {
    security: {
      server_certificate: string;
      server_private_key: string;
    };
  };
  networkInfo?: {
    ip_addresses: string[];
    external_port: number;
  };
}

// ── Ready Device (subset for readyList) ──

export interface ReadyDevice {
  name: string;
  id: string;
  platform: string;
  address?: string;
  port?: number;
  host?: string;
  parameters: DeviceParameters;
}

// ── Active Station (subset for activeStationList) ──

export interface ActiveStation {
  name: string;
  id: string;
  platform: string;
  address?: string;
  port?: number;
}

// ── Registration Buffer Entry ──

export interface RegistrationBufferEntry {
  id: string;
  manager: string;
  parameters: DeviceParameters;
}

// ── WebSocket Message Types ──

export type MessageType = 'command' | 'voice' | 'tts' | 'homekit' | 'raw' | 'stopListening';

export interface WsPayload {
  command: string;
  [key: string]: unknown;
}

export interface WsMessage {
  conversationToken: string;
  id: string;
  payload: WsPayload;
  sentTime: number;
}

export interface WsResponse {
  state: DeviceState;
  sentTime: number;
}

// ── Device State (received from WebSocket) ──

export interface PlayerState {
  progress: number;
  duration: number;
  id?: string;
  title?: string;
  subtitle?: string;
}

export interface DeviceState {
  aliceState?: string;
  playing?: boolean;
  volume?: number;
  playerState?: PlayerState;
  [key: string]: unknown;
}

// ── TTS / Command Message ──
//
// `payload` хранит произвольные пользовательские данные: строку команды/фразы,
// объект homekit или массив RAW-команд. Сужение делается в buildWsPayload через
// runtime-проверки (typeof / Array.isArray / 'X' in payload).
// `hap.session` приходит из HomeKit-моста и не имеет фиксированной формы.

export interface OutMessage {
  payload: unknown;
  volume?: number;
  whisper?: boolean;
  stopListening?: boolean;
  noTrackPhrase?: string;
  pauseMusic?: boolean;
  hap?: { session?: unknown };
  level?: string;
}

// ── Connect Node Interfaces ──

export interface ConnectCredentials {
  token: string;
}

export interface ConnectNodeConfig extends NodeDef {}

/**
 * Публичный интерфейс config-ноды yandex-commander-connect.
 * Используется другими нодами через RED.nodes.getNode(configId) as ConnectNode.
 * Внутренние структуры (registry, scheduler, ws-pool) — closure-локалы и сюда не входят.
 */
export interface ConnectNode extends Node<ConnectCredentials> {
  token: string;
  getStatus: (id: string) => NodeStatusData;
  sendMessage: (deviceId: string, messageType: MessageType, message?: OutMessage) => string | undefined;
  registerDevice: (deviceId: string, nodeId: string, parameters: DeviceParameters) => number | undefined;
  unregisterDevice: (deviceId: string, nodeId: string) => number | undefined;
}

// ── Station Node Interfaces ──

export interface StationNodeConfig extends NodeDef {
  token: string;
  station_id: string;
  sheduler: SchedulerDay[];
  network: NetworkConfig;
  fixedAddress: string;
  fixedPort: string;
  connectionFlag: boolean;
}

// ── Get Node Interfaces ──

export interface GetNodeConfig extends NodeDef {
  token: string;
  station_id: string;
  output: string;
  homekitFormat: string;
}

// ── In Node Interfaces ──

export interface InNodeConfig extends NodeDef {
  token: string;
  station_id: string;
  output: string;
  uniqueFlag: boolean;
  homekitFormat: string;
}

// ── Out Node Interfaces ──

export interface OutNodeConfig extends NodeDef {
  token: string;
  station_id: string;
  input: string;
  volumeFlag: boolean;
  volume: number;
  stopListening: boolean;
  noTrack: string;
  pauseMusic: boolean;
  ttsVoice: string;
  ttsEffect: string;
  whisper: boolean;
  payload: string;
  payloadType: string;
}
