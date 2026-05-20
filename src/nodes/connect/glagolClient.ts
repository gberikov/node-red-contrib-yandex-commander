import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { DeviceState, WsPayload } from '@/lib/types';

const WATCHDOG_FRAME_MS = 10_000;
const WATCHDOG_CONNECT_MS = 10_000;
const PING_INTERVAL_MS = 1_500;

export interface GlagolClientOptions {
  deviceId: string;
  address: string;
  port: number;
  certificate: string;
  privateKey: string;
  conversationToken: string;
  debug?: (msg: string) => void;
}

export interface GlagolFrame {
  state: DeviceState;
  sentTime: number;
  raw: string;
}

export interface GlagolClientEvents {
  open: () => void;
  frame: (frame: GlagolFrame) => void;
  close: (code: number, reason: string) => void;
  error: (err: Error) => void;
}

export interface GlagolClient {
  on<E extends keyof GlagolClientEvents>(event: E, listener: GlagolClientEvents[E]): this;
  emit<E extends keyof GlagolClientEvents>(event: E, ...args: Parameters<GlagolClientEvents[E]>): boolean;
}

/**
 * Транспортный клиент для локального протокола Yandex Glagol.
 *
 * Делает одно WS-подключение к станции (wss://address:port с самоподписанным TLS),
 * пингует её и эмитит входящие фреймы. Сам **не реконнектится** — это делает
 * вызывающая сторона (см. ConnectNode), которая держит счётчик попыток
 * и backoff. Так клиент остаётся pure transport и легко тестируется.
 *
 * Watchdog'и:
 *  - connect-watchdog (10s): если open не наступило — close('connect-timeout')
 *  - frame-watchdog (10s): если фреймы перестали приходить — close('frame-timeout')
 *  - ping каждые 1.5s — softwareVersion-команду
 */
export class GlagolClient extends EventEmitter {
  private ws: WebSocket | undefined;
  private connectWatchdog: ReturnType<typeof setTimeout> | undefined;
  private frameWatchdog: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private closedByUser = false;

  constructor(private opts: GlagolClientOptions) {
    super();
  }

  connect(): void {
    this.closedByUser = false;
    this.cleanup();

    const url = `wss://${this.opts.address}:${this.opts.port}`;
    this.debug(`connecting to ${url}`);

    this.ws = new WebSocket(url, {
      key: this.opts.privateKey,
      cert: this.opts.certificate,
      rejectUnauthorized: false,
    });

    this.connectWatchdog = setTimeout(() => {
      this.debug('connect watchdog fired');
      this.forceClose(4001, 'connect-timeout');
    }, WATCHDOG_CONNECT_MS);

    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data: WebSocket.RawData) => this.onMessage(data));
    this.ws.on('close', (code: number, reason: Buffer) => this.onClose(code, reason));
    this.ws.on('error', (err: Error) => this.onError(err));
  }

  /** Корректное закрытие без последующего reconnect-сигнала. */
  close(): void {
    this.closedByUser = true;
    this.cleanup();
    if (this.ws) {
      const ws = this.ws;
      this.ws = undefined;
      try {
        ws.removeAllListeners();
        // terminate() during CONNECTING aborts the handshake and emits 'error'
        // asynchronously; swallow it so it doesn't surface as unhandled.
        ws.on('error', () => {});
        ws.terminate();
      } catch {
        // ws already closed
      }
    }
  }

  /** Признак, что пользователь закрыл клиент (не нужен reconnect). */
  get isClosedByUser(): boolean {
    return this.closedByUser;
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Отправляет payload. Возвращает true если ws открыт и frame ушёл. */
  send(payload: WsPayload): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const msg = {
      conversationToken: this.opts.conversationToken,
      id: this.opts.deviceId,
      payload,
      sentTime: Date.now(),
    };
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      this.debug(`send failed: ${err}`);
      return false;
    }
  }

  updateConversationToken(token: string): void {
    this.opts.conversationToken = token;
  }

  updateAddress(address: string, port: number): void {
    this.opts.address = address;
    this.opts.port = port;
  }

  private onOpen(): void {
    this.debug('open');
    clearTimeout(this.connectWatchdog);
    this.connectWatchdog = undefined;
    this.armFrameWatchdog();
    this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
    // Initial ping to bootstrap the state
    this.send({ command: 'ping' });
    this.emit('open');
  }

  private onMessage(data: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch (err) {
      this.debug(`frame parse error: ${err}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      this.debug('frame missing or non-object, skipping');
      return;
    }
    const frame = parsed as { state?: DeviceState; sentTime?: number };
    if (!frame.state) {
      this.debug('frame missing state, skipping');
      return;
    }
    this.armFrameWatchdog();
    this.emit('frame', {
      state: frame.state,
      sentTime: frame.sentTime ?? Date.now(),
      raw: data.toString(),
    });
  }

  private onClose(code: number, reason: Buffer): void {
    const reasonStr = reason ? reason.toString() : '';
    this.debug(`close ${code} "${reasonStr}"`);
    this.cleanup();
    this.emit('close', code, reasonStr);
  }

  private onError(err: Error): void {
    this.debug(`error: ${err.message}`);
    this.emit('error', err);
    // Errors don't auto-terminate — close event will fire after.
  }

  private sendPing(): void {
    this.send({ command: 'softwareVersion' });
  }

  private armFrameWatchdog(): void {
    clearTimeout(this.frameWatchdog);
    this.frameWatchdog = setTimeout(() => {
      this.debug('frame watchdog fired');
      this.forceClose(4002, 'frame-timeout');
    }, WATCHDOG_FRAME_MS);
  }

  private forceClose(code: number, reason: string): void {
    if (!this.ws) return;
    try {
      this.ws.close(code, reason);
    } catch {
      try {
        this.ws.terminate();
      } catch {
        // ignore
      }
    }
  }

  private cleanup(): void {
    clearTimeout(this.connectWatchdog);
    clearTimeout(this.frameWatchdog);
    clearInterval(this.pingTimer);
    this.connectWatchdog = undefined;
    this.frameWatchdog = undefined;
    this.pingTimer = undefined;
  }

  private debug(msg: string): void {
    this.opts.debug?.(`[glagol ${this.opts.deviceId}] ${msg}`);
  }
}
