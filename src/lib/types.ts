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

// ── Runtime Device (extends cloud device with runtime fields) ──

export interface RuntimeDevice {
  id: string;
  name: string;
  platform: string;
  address?: string;
  port?: number;
  host?: string;
  token?: string;
  manager?: string;
  parameters: DeviceParameters;
  connection?: boolean;
  mode?: string;
  ws?: import('ws') | undefined;
  lastState: Record<string, any>;
  fullMessage?: string;
  waitForListening?: boolean;
  playAfterTTS?: boolean;
  waitForIdle?: boolean;
  savedVolumeLevel?: number;
  schedulerFlag?: boolean;
  watchDog?: ReturnType<typeof setTimeout>;
  watchDogConn?: ReturnType<typeof setTimeout>;
  timer?: ReturnType<typeof setTimeout>;
  pingInterval?: ReturnType<typeof setInterval>;
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
  [key: string]: any;
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
  [key: string]: any;
}

// ── TTS / Command Message ──

export interface OutMessage {
  payload: any;
  volume?: number;
  whisper?: boolean;
  stopListening?: boolean;
  noTrackPhrase?: string;
  pauseMusic?: boolean;
  hap?: { session?: any };
  level?: string;
}

// ── Connect Node Interfaces ──

export interface ConnectCredentials {
  token: string;
}

export interface ConnectNodeConfig extends NodeDef {}

export interface ConnectNode extends Node<ConnectCredentials> {
  token: string;
  deviceList: RuntimeDevice[];
  readyList: ReadyDevice[];
  activeStationList: ActiveStation[];
  registrationBuffer: RegistrationBufferEntry[];
  interval?: ReturnType<typeof setInterval>;
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
