import type { IncomingMessage } from 'node:http';
import { type Server as HttpsServer, createServer as createHttpsServer } from 'node:https';
import { createRequire } from 'node:module';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WSClient, WebSocketServer } from 'ws';

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUAg96Dir6tjpwZ+bdbKEn+J6mmVkwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDUyMDE3MjcxMloXDTM2MDUx
NzE3MjcxMlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAunwcx22nLwzBJdkKCrOy8SP88p8ltnLidZabCHJLmHmA
DWVzyqD8IIxs861PIhFwdNga26Ye9v638NNuy+aRk3K+TjXJL5WqMEHEfb4Xd9A4
lru8ksElXxfmfmi2zB7IYM5B/mYETkMz1myS43SFJh32Imw4eqgR4AokT2pYMyFk
p+6Bj0JRNR4pzYh0oe05CvJLr33JUgbpuTwooVlBKGJFbR3c+d8YpwHM+g25aNEZ
YdpHhcrRAC+ZM9qcmhL8mycM6Pkovs7CTyQCQNuZHuxHK7Xn3bUYP5gubvelfg8r
iyg/GkaTLwc/hV9jThHY0HChmYtMkZLVlhTmtcKUuQIDAQABo1MwUTAdBgNVHQ4E
FgQU5+lPvY6xqFmIzYEcmZ3eQq0JU2MwHwYDVR0jBBgwFoAU5+lPvY6xqFmIzYEc
mZ3eQq0JU2MwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAZSMa
WauHaaEWCh+S00VrkZOzD5E1vdcrnoFNDF7Zh7Peo5rUw/Jwc0OH5NQJNxpWaKWV
QARFg713q5t8CbCLLQ0yA5w0EGTDSmzcojKTBWmsXbT8u32HVc1aYH8OI4lQ05VJ
MUrllmXS6qgwXRL7NJWcrJK38+9Y1qRX4auy/BBJdNWBNceW9I6NfYhNoIp6r0qa
eipLBHuBaOQN6FHm7L0MwmGFpmIGBuJTpdvMQEfXa4dqhssFsN/pIFr9mglIq3z2
OQXY0JXWU+KWV89srzBC7nSFW5kSdk+1eql3Af/DniEBMoHirCM9AtNBWsRY1Wnn
wIkB5cmT3jcVXRJ/Vg==
-----END CERTIFICATE-----
`;

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6fBzHbacvDMEl
2QoKs7LxI/zynyW2cuJ1lpsIckuYeYANZXPKoPwgjGzzrU8iEXB02Brbph72/rfw
027L5pGTcr5ONckvlaowQcR9vhd30DiWu7ySwSVfF+Z+aLbMHshgzkH+ZgROQzPW
bJLjdIUmHfYibDh6qBHgCiRPalgzIWSn7oGPQlE1HinNiHSh7TkK8kuvfclSBum5
PCihWUEoYkVtHdz53xinAcz6Dblo0Rlh2keFytEAL5kz2pyaEvybJwzo+Si+zsJP
JAJA25ke7EcrtefdtRg/mC5u96V+DyuLKD8aRpMvBz+FX2NOEdjQcKGZi0yRktWW
FOa1wpS5AgMBAAECggEAAfcsa3qvpCqPf5lfxniZ5npBYIJGaLuhwOkHNcnUm6UO
MTX0SDq1pZctT80wFBUYeRbNA6sm0OYi5K4p0QrbVnFDabod5ns+mbcbvdKK10ex
zP7qECbqgKvVEViDsreRV5nc7rQ/D98b9QLccnrIK3xt23OGDd7nH1QkCVU+3D0V
d3EpbjOZtJLE0bzhZyj9NiDDhktuHNHJWvpxDBLgHcNj6y0VCIQLjc57zP8khf0C
HliEqyYtFOH6yDJMWmJHIb0A8xxdrabEffM+XCLrZ8wGpJzfMxngCmdckwY385ZH
hXcKwtvrZ90ebvubBHFJStjJjMrhcKE6jqMIym15IQKBgQD6ABieuxEGkU1Yhd+M
JozzZmM8RqdperqH6T3lgWR5Bm308tdGbiMZAorJaxMNJLfpKeeIvSYxeu1iqzqq
dlvKQXzpYzNz3EqTk8SwIRwsvoHuUdHWKSXX6xm8xpa3nAP+ioFPyqOTmr+/wHLn
qGAMIEBx121WXKK1krFqAa7KiQKBgQC+9c05Ux2XSskqx7mIkjVr3XT32qHIKxgP
n7QhZLu61PUUsSA+rLCTkkqALxq5MFoBe6B20rUHo/8p9dUz8r8Q/T1LadwFfIaJ
0lsJV+JuPflVL66V1qDNhbqVdsseUeH/a11gkdEKl7LGDhrm6+fSYiUbQJ0uQgg8
+IOqHhEssQKBgHzUl3aKydGRtCFDl4APr8nJkjuCvA07LvC2UiXLGjQkNbtdloig
bf4K+ungAT9K2loehnIMoImMbAQco8qCFwtC7/BJjGOJ1+MgodGgdsUQyygIytI4
8aCCz/Mm5hMAYC41UqRY9py5ZI2GttldhbgIUqWFgB7jWot3mAbqmDChAoGBAKqf
O6BVuGHe64Gy9P6nDN51ADcZfWY5wwTqwGr585cLAnRbkyEM8bTZiIGiFPGU10bt
7EFfIWtTSAF46ufApKGMdAD29CVez2NDth3SDbpM24QW15qALCuWqlEz1Gch6Jls
mAFaKHqbcpvuLHFaJUdgdCE2iXq0e2Hm9tXAib3xAoGARCi7Ax/NLy9MI+Q0hfUo
dCjOv434C166p74MzXyk22dZhJnQJ8Y/RXfP6r2TlEwI1C4G74i5S+m3+C0ZEAuD
1eXDSkMXi/HY38LCUtb/l6oTR+mlsD0a39UhPe+Xh27GQdJj6RdFGmxF1RUEDsw8
UAjth0/uCm6q4mDgWFg9RvY=
-----END PRIVATE KEY-----
`;

// Shared mutable state read by hoisted mock factories below.
const mockState = vi.hoisted(() => ({
  devices: [] as unknown[],
  backoffCalls: [] as number[],
}));

vi.mock('@/lib/api', () => {
  class QuasarApi {
    constructor(public token: string) {}
    async getDevices() {
      return { devices: mockState.devices, status: 'ok' };
    }
    async getLocalToken(_id: string, _platform: string) {
      return { token: 'fake-local-token', status: 'ok' };
    }
  }
  return { QuasarApi };
});

vi.mock('node-dns-sd', () => ({
  default: { discover: vi.fn().mockResolvedValue([]) },
}));

// Mock backoff to keep tests fast — we still observe which attempts it was called with.
vi.mock('@/nodes/connect/backoff', () => ({
  nextBackoffMs: vi.fn().mockImplementation((attempt: number) => {
    mockState.backoffCalls.push(attempt);
    return 100;
  }),
}));

// Imports AFTER the vi.mock calls above (vi.mock is hoisted, so order is fine,
// but keeping them grouped here makes the intent clear).
import connectNode from '@/nodes/connect/connect';
import inNode from '@/nodes/in/in';
import outNode from '@/nodes/out/out';
import stationNode from '@/nodes/station/station';
// biome-ignore lint/style/useImportType: helper is runtime
import helper from 'node-red-node-test-helper';

/**
 * pnpm uses strict (isolated) node_modules layout: @node-red/registry isn't a
 * direct sibling of node-red, so node-red-node-test-helper's path-based require
 * fails and leaves _NodePrototype/_settings/_events/_registryUtil unset.
 * We patch them in using transitive resolution from node-red's own scope.
 */
function fixupHelperForPnpm(): void {
  // biome-ignore lint/suspicious/noExplicitAny: helper internals
  const h = helper as any;
  if (h._NodePrototype) return;

  const cjsRequire = createRequire(import.meta.url);
  const nodeRedPkg = cjsRequire.resolve('node-red/package.json');
  const nodeRedRequire = createRequire(nodeRedPkg);

  const runtimePkg = nodeRedRequire.resolve('@node-red/runtime/package.json');
  const runtimeRequire = createRequire(runtimePkg);

  h._registryUtil = runtimeRequire('@node-red/registry/lib/util');

  h._context = nodeRedRequire('@node-red/runtime/lib/nodes/context');
  h.credentials = nodeRedRequire('@node-red/runtime/lib/nodes/credentials');
  h._NodePrototype = nodeRedRequire('@node-red/runtime/lib/nodes/Node').prototype;
  h._settings = h._RED.settings;
  h._events = h._RED.runtime.events;
  h._comms = nodeRedRequire('@node-red/editor-api/lib/editor/comms');

  const nodesPkg = nodeRedRequire.resolve('@node-red/nodes/package.json');
  const nodesRequire = createRequire(nodesPkg);
  h._nodeModules = {
    catch: nodesRequire('@node-red/nodes/core/common/25-catch.js'),
    status: nodesRequire('@node-red/nodes/core/common/25-status.js'),
    complete: nodesRequire('@node-red/nodes/core/common/24-complete.js'),
  };
}

beforeAll(() => {
  fixupHelperForPnpm();
});

interface MockServer {
  port: number;
  wss: WebSocketServer;
  httpsServer: HttpsServer;
  connections: WSClient[];
  /** When true, every incoming upgrade is destroyed before WS handshake completes. */
  destroyOnUpgrade: boolean;
  upgradeAttempts: number;
  close(): Promise<void>;
}

async function startMockWss(): Promise<MockServer> {
  const httpsServer = createHttpsServer({ cert: TEST_CERT, key: TEST_KEY });
  const wss = new WebSocketServer({ noServer: true });
  const connections: WSClient[] = [];
  const state = { destroyOnUpgrade: false, upgradeAttempts: 0 };

  httpsServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    state.upgradeAttempts++;
    if (state.destroyOnUpgrade) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      connections.push(ws as unknown as WSClient);
      wss.emit('connection', ws, req);
    });
  });

  await new Promise<void>((resolve) => httpsServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (httpsServer.address() as AddressInfo).port;

  return {
    port,
    wss,
    httpsServer,
    connections,
    get destroyOnUpgrade() {
      return state.destroyOnUpgrade;
    },
    set destroyOnUpgrade(v: boolean) {
      state.destroyOnUpgrade = v;
    },
    get upgradeAttempts() {
      return state.upgradeAttempts;
    },
    async close() {
      for (const c of connections) {
        try {
          c.terminate();
        } catch {
          // ignore
        }
      }
      wss.close();
      await new Promise<void>((resolve) => httpsServer.close(() => resolve()));
    },
  };
}

function makeDevice(id: string, port: number) {
  return {
    id,
    name: 'Test station',
    platform: 'yandexstation_2',
    glagol: { security: { server_certificate: TEST_CERT, server_private_key: TEST_KEY } },
    networkInfo: {
      ip_addresses: ['127.0.0.1'],
      external_port: port,
      mac_addresses: [],
      ts: 0,
      wifi_ssid: '',
    },
    config: {
      dndMode: { enabled: false, features: { allowIncomingCalls: false } },
      led: { time_visualization: { format: '' } },
      name: 'Test station',
      timezone: { timezone_name: 'UTC' },
      voice_activation: { enabled: true },
    },
    activation_code: 0,
    activation_region: '',
    promocode_activated: false,
    tags: [],
  };
}

function makeFlow(extra: Partial<Record<string, unknown>> = {}) {
  return [
    { id: 'connect1', type: 'yandex-commander-connect' },
    {
      id: 'station1',
      type: 'yandex-commander-station',
      token: 'connect1',
      station_id: 'dev-1',
      network: { mode: 'auto', fixedAddress: '', fixedPort: '' },
      sheduler: [],
      connectionFlag: true,
      fixedAddress: '',
      fixedPort: '',
    },
    {
      id: 'in1',
      type: 'yandex-commander-in',
      token: 'connect1',
      station_id: 'dev-1',
      output: 'status',
      uniqueFlag: false,
      homekitFormat: '',
      wires: [['helper-in']],
    },
    { id: 'helper-in', type: 'helper' },
    {
      id: 'out1',
      type: 'yandex-commander-out',
      token: 'connect1',
      station_id: 'dev-1',
      input: 'command',
      volumeFlag: false,
      volume: 0,
      stopListening: false,
      noTrack: '',
      pauseMusic: false,
      ttsVoice: '',
      ttsEffect: '',
      whisper: false,
      payload: 'payload',
      payloadType: 'msg',
      musicId: '',
      musicType: 'track',
      cloudFallback: false,
    },
    ...Object.values(extra),
  ];
}

const credentials = { connect1: { token: 'fake-oauth-token' } };

async function waitFor(predicate: () => boolean, timeoutMs: number, label = 'predicate'): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timeout (${timeoutMs}ms): ${label}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeEach(() => {
  mockState.devices = [];
  mockState.backoffCalls = [];
});

afterEach(async () => {
  await helper.unload();
});

describe('connect node lifecycle integration', () => {
  it('a) establishes WebSocket connection to mock server within 3s', async () => {
    const server = await startMockWss();
    try {
      mockState.devices = [makeDevice('dev-1', server.port)];

      const upgradePromise = new Promise<void>((resolve) => {
        server.httpsServer.once('upgrade', () => resolve());
      });

      await helper.load([connectNode, stationNode, inNode, outNode], makeFlow(), credentials);

      await Promise.race([
        upgradePromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('no upgrade in 3s')), 3000)),
      ]);

      expect(server.upgradeAttempts).toBeGreaterThanOrEqual(1);
    } finally {
      await server.close();
    }
  });

  it('b) propagates state frame from server to in-node payload', async () => {
    const server = await startMockWss();
    try {
      mockState.devices = [makeDevice('dev-1', server.port)];

      const framePayload = { aliceState: 'IDLE', playing: false };

      server.wss.on('connection', (ws) => {
        ws.send(JSON.stringify({ state: framePayload, sentTime: Date.now() }));
      });

      await helper.load([connectNode, stationNode, inNode, outNode], makeFlow(), credentials);

      // biome-ignore lint/suspicious/noExplicitAny: helper.getNode returns Node
      const helperIn = helper.getNode('helper-in') as any;
      const msg = await new Promise<{ payload: unknown }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no in-node msg in 5s')), 5000);
        helperIn.on('input', (m: { payload: unknown }) => {
          clearTimeout(timer);
          resolve(m);
        });
      });

      expect(msg.payload).toEqual(framePayload);
    } finally {
      await server.close();
    }
  });

  it('c) sends ws command:play when out-node receives play input', async () => {
    const server = await startMockWss();
    try {
      mockState.devices = [makeDevice('dev-1', server.port)];

      const gotPlay = new Promise<{ command: string; [k: string]: unknown }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no play frame in 5s')), 5000);
        server.wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            try {
              const parsed = JSON.parse(data.toString());
              if (parsed.payload?.command === 'play') {
                clearTimeout(timer);
                resolve(parsed.payload);
              }
            } catch {
              // ignore
            }
          });
        });
      });

      await helper.load([connectNode, stationNode, inNode, outNode], makeFlow(), credentials);

      // Wait until ws is OPEN on the server side (so client.isOpen() === true).
      await waitFor(() => server.connections.length > 0, 3000, 'server connection');
      await new Promise((r) => setTimeout(r, 100));

      // biome-ignore lint/suspicious/noExplicitAny: helper.getNode returns Node
      const out = helper.getNode('out1') as any;
      out.receive({ payload: 'play' });

      const payload = await gotPlay;
      expect(payload.command).toBe('play');
    } finally {
      await server.close();
    }
  });

  it('d) reconnects within 2s after server closes with code 4000', async () => {
    const server = await startMockWss();
    try {
      mockState.devices = [makeDevice('dev-1', server.port)];

      let connectionCount = 0;
      server.wss.on('connection', (ws) => {
        connectionCount++;
        if (connectionCount === 1) {
          // First connection: close cleanly with 4000 → triggers IMMEDIATE_RECONNECT_CODES path.
          setTimeout(() => ws.close(4000, 'test-immediate-reconnect'), 50);
        }
      });

      await helper.load([connectNode, stationNode, inNode, outNode], makeFlow(), credentials);

      const start = Date.now();
      await waitFor(() => connectionCount >= 2, 4000, 'second connection');
      const elapsed = Date.now() - start;

      expect(connectionCount).toBeGreaterThanOrEqual(2);
      // From start of helper.load: include connect + first ws-close(50ms) + 500ms immediate timer
      // + new ws connect — comfortably under 2s.
      expect(elapsed).toBeLessThan(2000);
    } finally {
      await server.close();
    }
  });

  it('e) applies exponential backoff: 3 consecutive 1006 closes invoke backoff with attempts 1, 2, 3', async () => {
    const server = await startMockWss();
    try {
      mockState.devices = [makeDevice('dev-1', server.port)];

      // Destroy every upgrade so the client never sees 'open'. Each failure yields
      // a non-immediate close path in connect.ts → scheduleReconnect → nextBackoffMs(attempt).
      server.destroyOnUpgrade = true;

      await helper.load([connectNode, stationNode, inNode, outNode], makeFlow(), credentials);

      await waitFor(() => mockState.backoffCalls.length >= 3, 10000, 'three backoff invocations');

      // Stop the failure mode so any stray reconnect won't keep racing.
      server.destroyOnUpgrade = false;

      // Sanity: attempts are sequential 1, 2, 3 (no 'open' has reset the counter).
      expect(mockState.backoffCalls.slice(0, 3)).toEqual([1, 2, 3]);

      // Independent sanity check on the real backoff formula: attempt 3 produces >= 5s.
      const real = await vi.importActual<typeof import('@/nodes/connect/backoff')>('@/nodes/connect/backoff');
      // Force the worst-case rng (minimum jitter) to confirm the lower bound holds.
      expect(real.nextBackoffMs(3, () => 0)).toBeGreaterThanOrEqual(5000);
    } finally {
      await server.close();
    }
  });
});
