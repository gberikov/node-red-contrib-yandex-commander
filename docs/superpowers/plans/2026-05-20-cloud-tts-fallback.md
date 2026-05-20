# Cloud TTS Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cloud TTS fallback so the OUT node can speak through Yandex Quasar's cloud scenarios API when the local Glagol WebSocket is unavailable.

**Architecture:** New `QuasarCloud` class targets `iot.quasar.yandex.ru` with OAuth + CSRF auth. Connect node's `sendMessage` becomes `async` and routes through a pure `decideCloudRoute` helper. Cloud creates/adopts one Yandex scenario per device, then PUT-updates and POST-runs it per TTS call. Opt-in via OUT-node checkbox or `msg.cloud === true`.

**Tech Stack:** TypeScript 6, axios 1.x, vitest 4, Biome, esbuild. Node ≥22. Reference spec: `docs/superpowers/specs/2026-05-20-cloud-tts-fallback-design.md`.

**File map** — locks the decomposition:

| Path | Responsibility |
|---|---|
| `src/lib/quasarCloud.ts` | `QuasarCloud` class + `stripSsml` + `encodeDeviceId`. Cloud HTTP and helpers in one file (~250 lines). |
| `src/nodes/connect/cloudRoute.ts` | Pure `decideCloudRoute(type, localOpen, msgCloud, fallback)` (~20 lines). |
| `tests/quasarCloud.test.ts` | Unit tests for cloud module via `vi.mock('axios')`. |
| `tests/cloudRoute.test.ts` | Unit tests for the routing helper. |
| `src/lib/types.ts` | Type-only changes: `OutMessage`, `OutNodeConfig`, `ConnectNode.sendMessage`. |
| `src/nodes/connect/connect.ts` | Async `sendMessage`, lazy `QuasarCloud` instance, route via helper. |
| `src/nodes/out/out.ts` | Read `cloudFallback`, thread onto OutMessage, await. |
| `src/nodes/out/html/editor.ts` | Add `cloudFallback` default. |
| `src/nodes/out/html/editor.html` | New checkbox in TTS section. |
| `src/nodes/out/locales/*/out.json` (9 files) | Two new label keys. |
| `wiki/ru/Cloud-TTS.md` | New wiki page. |
| `wiki/ru/OUT-Node.md` | Append paragraph + table row. |
| `CHANGELOG.md` | Append bullet under existing `[0.3.0]`. |

---

## Task 1: Routing helper — `decideCloudRoute`

Pure decision-table function. No dependencies, no async, no I/O. Lays the foundation.

**Files:**
- Create: `src/nodes/connect/cloudRoute.ts`
- Test: `tests/cloudRoute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cloudRoute.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decideCloudRoute } from '@/nodes/connect/cloudRoute';

describe('decideCloudRoute', () => {
  it('routes non-tts types to local regardless of flags', () => {
    expect(decideCloudRoute('command', false, true, true)).toBe('local');
    expect(decideCloudRoute('voice', false, undefined, undefined)).toBe('local');
    expect(decideCloudRoute('raw', false, true, false)).toBe('local');
    expect(decideCloudRoute('homekit', true, undefined, undefined)).toBe('local');
    expect(decideCloudRoute('stopListening', false, true, true)).toBe('local');
    expect(decideCloudRoute('playMusic', false, true, true)).toBe('local');
  });

  it('forces cloud when msg.cloud === true (even if local is open)', () => {
    expect(decideCloudRoute('tts', true, true, false)).toBe('cloud');
  });

  it('uses local when WebSocket is open and msg.cloud is undefined', () => {
    expect(decideCloudRoute('tts', true, undefined, true)).toBe('local');
  });

  it('returns offline when local closed and msg.cloud === false', () => {
    expect(decideCloudRoute('tts', false, false, true)).toBe('offline');
  });

  it('uses cloud when local closed and OUT-node fallback enabled', () => {
    expect(decideCloudRoute('tts', false, undefined, true)).toBe('cloud');
  });

  it('returns offline when local closed and no cloud flag set', () => {
    expect(decideCloudRoute('tts', false, undefined, false)).toBe('offline');
    expect(decideCloudRoute('tts', false, undefined, undefined)).toBe('offline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- cloudRoute`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `decideCloudRoute`**

Create `src/nodes/connect/cloudRoute.ts`:

```ts
import type { MessageType } from '@/lib/types';

export type CloudRoute = 'local' | 'cloud' | 'offline';

/**
 * Pure decision table for routing TTS dispatch.
 *
 * Why: keeps the branchy logic out of connect.ts and trivially unit-testable.
 *
 * - Non-TTS message types always go local (cloud only implements TTS).
 * - msg.cloud === true forces cloud (per-message override).
 * - If the local WebSocket is open, prefer local.
 * - msg.cloud === false forbids cloud — offline if local also unavailable.
 * - Otherwise: cloud iff the OUT-node fallback checkbox is on.
 */
export function decideCloudRoute(
  messageType: MessageType,
  localOpen: boolean,
  msgCloud: boolean | undefined,
  cloudFallback: boolean | undefined,
): CloudRoute {
  if (messageType !== 'tts') return 'local';
  if (msgCloud === true) return 'cloud';
  if (localOpen) return 'local';
  if (msgCloud === false) return 'offline';
  if (cloudFallback === true) return 'cloud';
  return 'offline';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- cloudRoute`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/nodes/connect/cloudRoute.ts tests/cloudRoute.test.ts
git commit -m "Add decideCloudRoute helper for TTS routing"
```

---

## Task 2: Cloud helpers — `stripSsml` and `encodeDeviceId`

Two pure functions exported from `src/lib/quasarCloud.ts`. We get them tested before tackling the network class.

**Files:**
- Create: `src/lib/quasarCloud.ts` (skeleton + two helpers)
- Test: `tests/quasarCloud.test.ts`

- [ ] **Step 1: Write the failing tests for `encodeDeviceId`**

Create `tests/quasarCloud.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeDeviceId, stripSsml } from '@/lib/quasarCloud';

describe('encodeDeviceId', () => {
  it('prefixes with "ЯC " and maps hex chars to Cyrillic', () => {
    // 0→о 1→а 2→б 3→в 4→г 5→д 6→е 7→ж 8→з 9→и a→й b→к c→л d→м e→н f→п
    expect(encodeDeviceId('0123456789abcdef')).toBe('ЯC оабвгдежзийклмнп');
  });

  it('handles a realistic device_id', () => {
    expect(encodeDeviceId('abc123')).toBe('ЯC йклабв');
  });

  it('is case-insensitive for hex input', () => {
    expect(encodeDeviceId('ABC123')).toBe('ЯC йклабв');
  });

  it('passes non-hex chars through unchanged', () => {
    expect(encodeDeviceId('ab-12')).toBe('ЯC йк-аб');
  });
});

describe('stripSsml', () => {
  const noop = () => {};

  it('strips a single <speaker voice="..."> tag', () => {
    expect(stripSsml("<speaker voice='alyss'>привет", noop).text).toBe('привет');
  });

  it('strips multiple stacked <speaker ...> wrappers', () => {
    const input = "<speaker is_whisper='true'><speaker effect='megaphone'><speaker voice='alyss'>привет";
    expect(stripSsml(input, noop).text).toBe('привет');
  });

  it('strips <speaker audio="..."> sound tags', () => {
    expect(stripSsml('<speaker audio="alice-sounds-game-win-1.opus"> ура', noop).text).toBe('ура');
  });

  it('strips sil <[NNN]> pause markers', () => {
    expect(stripSsml('смелость sil <[500]> города берёт', noop).text).toBe('смелость города берёт');
  });

  it('strips + stress marks', () => {
    expect(stripSsml('остр+ота', noop).text).toBe('острота');
  });

  it('truncates to 100 chars and reports it', () => {
    const long = 'а'.repeat(150);
    const logged: string[] = [];
    const result = stripSsml(long, (m) => logged.push(m));
    expect(result.text.length).toBe(100);
    expect(result.truncated).toBe(true);
    expect(logged.some((m) => m.includes('truncated'))).toBe(true);
  });

  it('leaves plain text alone', () => {
    expect(stripSsml('привет, мир', noop).text).toBe('привет, мир');
  });

  it('collapses repeated whitespace from stripped sections', () => {
    expect(stripSsml("<speaker voice='alyss'>  привет  ", noop).text).toBe('привет');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- quasarCloud`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `encodeDeviceId` and `stripSsml`**

Create `src/lib/quasarCloud.ts`:

```ts
const HEX_TO_CYR: Record<string, string> = {
  '0': 'о', '1': 'а', '2': 'б', '3': 'в',
  '4': 'г', '5': 'д', '6': 'е', '7': 'ж',
  '8': 'з', '9': 'и', a: 'й', b: 'к',
  c: 'л', d: 'м', e: 'н', f: 'п',
};

const SCENARIO_NAME_PREFIX = 'ЯC ';
const MAX_TTS_LENGTH = 100;

export function encodeDeviceId(deviceId: string): string {
  let encoded = '';
  for (const ch of deviceId.toLowerCase()) {
    encoded += HEX_TO_CYR[ch] ?? ch;
  }
  return SCENARIO_NAME_PREFIX + encoded;
}

export interface StripResult {
  text: string;
  truncated: boolean;
}

export function stripSsml(input: string, debug: (msg: string) => void): StripResult {
  let text = input;
  text = text.replace(/<speaker\b[^>]*>/gi, '');
  text = text.replace(/sil\s*<\[\s*\d+\s*\]>/gi, '');
  text = text.replace(/\+/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  let truncated = false;
  if (text.length > MAX_TTS_LENGTH) {
    debug(`Cloud TTS: text truncated from ${text.length} to ${MAX_TTS_LENGTH} chars`);
    text = text.slice(0, MAX_TTS_LENGTH);
    truncated = true;
  }
  return { text, truncated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- quasarCloud`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quasarCloud.ts tests/quasarCloud.test.ts
git commit -m "Add encodeDeviceId and stripSsml helpers"
```

---

## Task 3: `QuasarCloud` class — happy path with mocked axios

Implements `sendCloudTts` end-to-end against a stubbed `axios.create()` instance. Tests use vitest's `vi.mock('axios')`. We test the uncached happy path first; cache/adopt/retry come in Task 4.

**Files:**
- Modify: `src/lib/quasarCloud.ts`
- Modify: `tests/quasarCloud.test.ts`

- [ ] **Step 1: Add failing happy-path test**

Append to `tests/quasarCloud.test.ts`:

```ts
import { beforeEach, vi } from 'vitest';
import axios from 'axios';
import { QuasarCloud } from '@/lib/quasarCloud';

vi.mock('axios');

interface StubCall {
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
}

function makeAxiosStub() {
  const calls: StubCall[] = [];
  const responses: Array<{ status?: number; data: unknown }> = [];
  const instance = {
    request: vi.fn(async (opts: { method: string; url: string; data?: unknown; headers?: Record<string, string> }) => {
      calls.push({ method: opts.method, url: opts.url, data: opts.data, headers: opts.headers });
      const next = responses.shift();
      if (!next) throw new Error(`unexpected request: ${opts.method} ${opts.url}`);
      if (next.status && next.status >= 400) {
        const err = new Error(`HTTP ${next.status}`) as Error & { response: { status: number; data: unknown } };
        err.response = { status: next.status, data: next.data };
        throw err;
      }
      return { data: next.data, status: next.status ?? 200 };
    }),
  };
  return { instance, calls, responses };
}

describe('QuasarCloud.sendCloudTts', () => {
  let stub: ReturnType<typeof makeAxiosStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    stub = makeAxiosStub();
    vi.mocked(axios.create).mockReturnValue(stub.instance as unknown as ReturnType<typeof axios.create>);
  });

  it('happy path: fetches csrf, lists, creates, updates, runs', async () => {
    // GET /csrf_token → token
    stub.responses.push({ data: { status: 'ok', token: 'csrf-1' } });
    // GET /m/v3/user/scenarios → empty list
    stub.responses.push({ data: { scenarios: [] } });
    // POST /m/v3/user/scenarios → created with id
    stub.responses.push({ data: { scenario_id: 'sc-1' } });
    // PUT scenario → ok
    stub.responses.push({ data: { status: 'ok' } });
    // POST actions → ok
    stub.responses.push({ data: { status: 'ok' } });

    const cloud = new QuasarCloud('oauth-token', () => {});
    await cloud.sendCloudTts('abc123', 'Привет');

    expect(stub.calls).toHaveLength(5);

    expect(stub.calls[0].method).toBe('GET');
    expect(stub.calls[0].url).toBe('/csrf_token');

    expect(stub.calls[1].method).toBe('GET');
    expect(stub.calls[1].url).toBe('/m/v3/user/scenarios');

    expect(stub.calls[2].method).toBe('POST');
    expect(stub.calls[2].url).toBe('/m/v3/user/scenarios');
    expect(stub.calls[2].headers?.['x-csrf-token']).toBe('csrf-1');

    expect(stub.calls[3].method).toBe('PUT');
    expect(stub.calls[3].url).toBe('/m/v3/user/scenarios/sc-1');
    expect(stub.calls[3].headers?.['x-csrf-token']).toBe('csrf-1');

    const putBody = stub.calls[3].data as {
      name: string;
      icon: string;
      triggers: unknown[];
      steps: Array<{
        type: string;
        parameters: { items: Array<{ id: string; type: string; value: { instance: string; value: string } }> };
      }>;
    };
    expect(putBody.name).toBe('ЯC йклабв');
    expect(putBody.icon).toBe('home');
    expect(putBody.triggers).toEqual([]);
    expect(putBody.steps[0].type).toBe('scenarios.steps.actions.v2');
    expect(putBody.steps[0].parameters.items[0]).toEqual({
      id: 'abc123',
      type: 'devices.types.smart_speaker',
      value: { instance: 'phrase_action', value: 'Привет' },
    });

    expect(stub.calls[4].method).toBe('POST');
    expect(stub.calls[4].url).toBe('/m/v3/user/scenarios/sc-1/actions');
  });

  it('passes Authorization: OAuth header on axios.create', async () => {
    stub.responses.push({ data: { status: 'ok', token: 'csrf-1' } });
    stub.responses.push({ data: { scenarios: [] } });
    stub.responses.push({ data: { scenario_id: 'sc-1' } });
    stub.responses.push({ data: { status: 'ok' } });
    stub.responses.push({ data: { status: 'ok' } });

    new QuasarCloud('oauth-token', () => {});
    expect(vi.mocked(axios.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://iot.quasar.yandex.ru',
        headers: expect.objectContaining({ Authorization: 'OAuth oauth-token' }),
      }),
    );
  });

  it('rejects when stripped text is shorter than 2 chars', async () => {
    const cloud = new QuasarCloud('oauth-token', () => {});
    await expect(cloud.sendCloudTts('abc123', '+')).rejects.toThrow(/too short/);
    // No HTTP calls should have happened.
    expect(stub.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pnpm test -- quasarCloud`
Expected: FAIL — `QuasarCloud` not exported.

- [ ] **Step 3: Implement the `QuasarCloud` class**

Append to `src/lib/quasarCloud.ts`:

```ts
import axios, { type AxiosInstance } from 'axios';

const BASE_URL = 'https://iot.quasar.yandex.ru';

interface CsrfResponse {
  status?: string;
  token?: string;
}

interface ScenarioSummary {
  id?: string;
  scenario_id?: string;
  name?: string;
}

interface ScenariosListResponse {
  scenarios?: ScenarioSummary[];
}

interface CreateScenarioResponse {
  id?: string;
  scenario_id?: string;
}

function buildScenarioBody(deviceId: string, text: string) {
  return {
    name: encodeDeviceId(deviceId),
    icon: 'home',
    triggers: [],
    steps: [
      {
        type: 'scenarios.steps.actions.v2',
        parameters: {
          items: [
            {
              id: deviceId,
              type: 'devices.types.smart_speaker',
              value: { instance: 'phrase_action', value: text },
            },
          ],
        },
      },
    ],
  };
}

export class QuasarCloud {
  private instance: AxiosInstance;
  private debug: (msg: string) => void;
  private csrfToken: string | undefined;
  private scenarioCache = new Map<string, string>();

  constructor(token: string, debug: (msg: string) => void = () => {}) {
    this.debug = debug;
    this.instance = axios.create({
      baseURL: BASE_URL,
      responseType: 'json',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `OAuth ${token}`,
      },
    });
  }

  invalidateScenario(deviceId: string): void {
    this.scenarioCache.delete(deviceId);
  }

  async sendCloudTts(deviceId: string, text: string): Promise<void> {
    const stripped = stripSsml(text, this.debug);
    if (stripped.text.length < 2) {
      throw new Error('Cloud TTS: text too short (min 2 chars after stripping SSML)');
    }
    const scenarioId = await this.getOrCreateScenarioId(deviceId);
    await this.csrfRequest(() =>
      this.instance.request({
        method: 'PUT',
        url: `/m/v3/user/scenarios/${scenarioId}`,
        data: buildScenarioBody(deviceId, stripped.text),
        headers: { 'x-csrf-token': this.csrfToken ?? '' },
      }),
    );
    await this.csrfRequest(() =>
      this.instance.request({
        method: 'POST',
        url: `/m/v3/user/scenarios/${scenarioId}/actions`,
        headers: { 'x-csrf-token': this.csrfToken ?? '' },
      }),
    );
  }

  private async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    return await this.fetchCsrf();
  }

  private async fetchCsrf(): Promise<string> {
    const { data } = await this.instance.request<CsrfResponse>({ method: 'GET', url: '/csrf_token' });
    if (!data.token) throw new Error('Cloud TTS: failed to fetch CSRF token');
    this.csrfToken = data.token;
    return data.token;
  }

  /** Runs an HTTP call that requires CSRF, retrying once on 401/403. */
  private async csrfRequest<T>(send: () => Promise<T>): Promise<T> {
    await this.ensureCsrf();
    try {
      return await send();
    } catch (err) {
      if (isAuthError(err)) {
        this.debug('Cloud TTS: CSRF rejected, refetching');
        this.csrfToken = undefined;
        await this.fetchCsrf();
        return await send();
      }
      throw err;
    }
  }

  private async getOrCreateScenarioId(deviceId: string): Promise<string> {
    const cached = this.scenarioCache.get(deviceId);
    if (cached) return cached;
    const expected = encodeDeviceId(deviceId);
    const { data } = await this.instance.request<ScenariosListResponse>({
      method: 'GET',
      url: '/m/v3/user/scenarios',
    });
    const existing = data.scenarios?.find((s) => s.name === expected);
    if (existing) {
      const id = existing.id ?? existing.scenario_id;
      if (id) {
        this.scenarioCache.set(deviceId, id);
        return id;
      }
    }
    const created = await this.csrfRequest(() =>
      this.instance.request<CreateScenarioResponse>({
        method: 'POST',
        url: '/m/v3/user/scenarios',
        data: buildScenarioBody(deviceId, 'ping'),
        headers: { 'x-csrf-token': this.csrfToken ?? '' },
      }),
    );
    const id = created.data.scenario_id ?? created.data.id;
    if (!id) throw new Error('Cloud TTS: scenario create returned no id');
    this.scenarioCache.set(deviceId, id);
    return id;
  }
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error && 'response' in err) {
    const r = (err as Error & { response?: { status?: number } }).response;
    return r?.status === 401 || r?.status === 403;
  }
  return false;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test -- quasarCloud`
Expected: PASS — 15 tests (12 from Task 2 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quasarCloud.ts tests/quasarCloud.test.ts
git commit -m "Add QuasarCloud class with sendCloudTts happy path"
```

---

## Task 4: `QuasarCloud` — cache, adopt, CSRF retry

Adds the remaining behaviour: scenarios cached after first call, adoption of existing AlexxIT scenarios, one-shot CSRF retry on 403.

**Files:**
- Modify: `tests/quasarCloud.test.ts`

(No production-code changes — Task 3's implementation already supports these paths; we're proving it.)

- [ ] **Step 1: Add failing tests**

Append to `tests/quasarCloud.test.ts`:

```ts
describe('QuasarCloud.sendCloudTts caching and retry', () => {
  let stub: ReturnType<typeof makeAxiosStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    stub = makeAxiosStub();
    vi.mocked(axios.create).mockReturnValue(stub.instance as unknown as ReturnType<typeof axios.create>);
  });

  it('caches the scenario id across calls for the same device', async () => {
    // First call: 5 requests as in happy path.
    stub.responses.push({ data: { status: 'ok', token: 'csrf-1' } });
    stub.responses.push({ data: { scenarios: [] } });
    stub.responses.push({ data: { scenario_id: 'sc-1' } });
    stub.responses.push({ data: { status: 'ok' } });
    stub.responses.push({ data: { status: 'ok' } });
    // Second call: only PUT + POST (csrf cached, scenario cached).
    stub.responses.push({ data: { status: 'ok' } });
    stub.responses.push({ data: { status: 'ok' } });

    const cloud = new QuasarCloud('oauth-token', () => {});
    await cloud.sendCloudTts('abc123', 'Один');
    await cloud.sendCloudTts('abc123', 'Два');

    expect(stub.calls).toHaveLength(7);
    expect(stub.calls[5].method).toBe('PUT');
    expect(stub.calls[5].url).toBe('/m/v3/user/scenarios/sc-1');
    expect(stub.calls[6].method).toBe('POST');
    expect(stub.calls[6].url).toBe('/m/v3/user/scenarios/sc-1/actions');
  });

  it('adopts an existing scenario whose name matches the encoded device id', async () => {
    stub.responses.push({ data: { status: 'ok', token: 'csrf-1' } });
    stub.responses.push({
      data: {
        scenarios: [
          { id: 'other-1', name: 'unrelated' },
          { id: 'adopted-1', name: encodeDeviceId('abc123') },
        ],
      },
    });
    // No POST create — straight to PUT + POST actions.
    stub.responses.push({ data: { status: 'ok' } });
    stub.responses.push({ data: { status: 'ok' } });

    const cloud = new QuasarCloud('oauth-token', () => {});
    await cloud.sendCloudTts('abc123', 'Привет');

    expect(stub.calls).toHaveLength(4);
    expect(stub.calls[2].method).toBe('PUT');
    expect(stub.calls[2].url).toBe('/m/v3/user/scenarios/adopted-1');
    expect(stub.calls[3].url).toBe('/m/v3/user/scenarios/adopted-1/actions');
  });

  it('refetches CSRF and retries once on 403 from PUT', async () => {
    stub.responses.push({ data: { status: 'ok', token: 'csrf-stale' } });
    stub.responses.push({ data: { scenarios: [] } });
    stub.responses.push({ data: { scenario_id: 'sc-1' } });
    // PUT 403 → refetch /csrf_token → retry PUT 200.
    stub.responses.push({ status: 403, data: { error: 'csrf' } });
    stub.responses.push({ data: { status: 'ok', token: 'csrf-fresh' } });
    stub.responses.push({ data: { status: 'ok' } });
    stub.responses.push({ data: { status: 'ok' } });

    const cloud = new QuasarCloud('oauth-token', () => {});
    await cloud.sendCloudTts('abc123', 'Привет');

    expect(stub.calls).toHaveLength(7);
    expect(stub.calls[3].method).toBe('PUT');
    expect(stub.calls[3].headers?.['x-csrf-token']).toBe('csrf-stale');
    expect(stub.calls[4].method).toBe('GET');
    expect(stub.calls[4].url).toBe('/csrf_token');
    expect(stub.calls[5].method).toBe('PUT');
    expect(stub.calls[5].headers?.['x-csrf-token']).toBe('csrf-fresh');
  });

  it('does not retry more than once on persistent 403', async () => {
    stub.responses.push({ data: { status: 'ok', token: 'csrf-stale' } });
    stub.responses.push({ data: { scenarios: [] } });
    stub.responses.push({ data: { scenario_id: 'sc-1' } });
    stub.responses.push({ status: 403, data: { error: 'csrf' } }); // PUT #1
    stub.responses.push({ data: { status: 'ok', token: 'csrf-fresh' } }); // refetch
    stub.responses.push({ status: 403, data: { error: 'csrf' } }); // PUT retry — also fails

    const cloud = new QuasarCloud('oauth-token', () => {});
    await expect(cloud.sendCloudTts('abc123', 'Привет')).rejects.toThrow(/HTTP 403/);
    expect(stub.calls).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run tests, verify pass**

Run: `pnpm test -- quasarCloud`
Expected: PASS — 19 tests total. If any fail, the existing implementation in Task 3 has a bug — fix `src/lib/quasarCloud.ts` until green.

- [ ] **Step 3: Commit**

```bash
git add tests/quasarCloud.test.ts
git commit -m "Lock QuasarCloud cache, adopt, and CSRF retry behaviour"
```

---

## Task 5: Type updates in `src/lib/types.ts`

Adjust the public types touched by this feature. No behaviour change yet — this makes the compiler accept Task 6.

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `cloud` and `cloudFallback` to `OutMessage`**

In `src/lib/types.ts`, find the `OutMessage` interface (line ~150) and add two fields just before the closing `}`:

```ts
  /** Идентификатор контента для playMusic (track id, artist id, album id, playlist id, radio id). */
  id?: string;
  /** Тип контента для playMusic. */
  type?: PlayMusicType;
  /** Per-message override: true forces cloud TTS, false forbids cloud, undefined defers to cloudFallback. */
  cloud?: boolean;
  /** Internal: OUT-node "Cloud TTS fallback" checkbox value, threaded into sendMessage. */
  cloudFallback?: boolean;
}
```

- [ ] **Step 2: Add `cloudFallback` to `OutNodeConfig`**

Same file, find `OutNodeConfig` (line ~230) and append:

```ts
  /** Id контента для команды Play Music (track/artist/album/playlist/radio). */
  musicId: string;
  /** Тип контента для команды Play Music. */
  musicType: PlayMusicType;
  /** Use cloud Quasar TTS when the local WebSocket is unavailable. Default false. */
  cloudFallback: boolean;
}
```

- [ ] **Step 3: Change `ConnectNode.sendMessage` to async**

In the same file, find the `ConnectNode` interface and replace the `sendMessage` line:

```ts
// Before
sendMessage: (deviceId: string, messageType: MessageType, message?: OutMessage) => string | undefined;

// After
sendMessage: (deviceId: string, messageType: MessageType, message?: OutMessage) => Promise<string | undefined>;
```

- [ ] **Step 4: Verify typecheck still compiles (expected: errors)**

Run: `pnpm typecheck`
Expected: errors in `src/nodes/connect/connect.ts` (sync return) and `src/nodes/out/out.ts` (not awaiting). These are addressed by Tasks 6 and 7. Confirm errors are limited to those two files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "Type sendMessage as async and add cloud/cloudFallback fields"
```

---

## Task 6: Wire `QuasarCloud` into `connect.sendMessage`

Make the connect node's TTS dispatch async, route via `decideCloudRoute`, and call `QuasarCloud.sendCloudTts` on the cloud branch.

**Files:**
- Modify: `src/nodes/connect/connect.ts`

- [ ] **Step 1: Add imports**

In `src/nodes/connect/connect.ts`, after the existing local imports (around line 23):

```ts
import { QuasarCloud } from '@/lib/quasarCloud';
import { decideCloudRoute } from './cloudRoute';
```

- [ ] **Step 2: Add lazy QuasarCloud instance declaration**

Near the other top-level `const`/`let` declarations inside `ConnectNodeConstructor` (after `let httpRouteRegistered = false;`, around line 62), add:

```ts
let quasarCloud: QuasarCloud | undefined;

function ensureQuasarCloud(): QuasarCloud {
  if (!quasarCloud) {
    node.debug('Initialising QuasarCloud for cloud TTS');
    quasarCloud = new QuasarCloud(node.token, node.debug.bind(node));
  }
  return quasarCloud;
}
```

- [ ] **Step 3: Rewrite `sendMessage` as async with cloud routing**

Replace the existing `sendMessage` function body (currently lines 77-112). Full new function:

```ts
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
```

- [ ] **Step 4: Update internal callers to fire-and-forget**

The two internal callers (`dispatchTtsAction` around line 288 and `applyScheduler` around line 301) call `sendMessage.call(...)` synchronously. Wrap each call with `void` since the return Promise is no longer assignable to anything:

In `dispatchTtsAction`:

```ts
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
```

In `applyScheduler`:

```ts
void sendMessage.call(node, device.id, 'command', { payload: 'stop' } as OutMessage);
if (phrase && phrase.length > 0 && state.aliceState !== 'SPEAKING') {
  void sendMessage.call(node, device.id, 'tts', { payload: phrase, stopListening: true } as OutMessage);
}
```

- [ ] **Step 5: Clear quasarCloud in `onClose`**

In `onClose` (around line 413), add a line near the other cleanups:

```ts
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
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: errors only in `src/nodes/out/out.ts` (not awaiting the now-Promise return). Connect node should compile clean.

- [ ] **Step 7: Run existing tests**

Run: `pnpm test`
Expected: All previously-green tests still pass. Cloud tests pass. Connect node has no tests today, so nothing new here.

- [ ] **Step 8: Commit**

```bash
git add src/nodes/connect/connect.ts
git commit -m "Route TTS through QuasarCloud when local unavailable"
```

---

## Task 7: OUT node runtime — read flag, thread, await

Make the OUT node read `cloudFallback`, propagate `msg.cloud` from input, and await the now-async `sendMessage`.

**Files:**
- Modify: `src/nodes/out/out.ts`

- [ ] **Step 1: Add `cloudFallback` to `OutNodeRuntime`**

In `src/nodes/out/out.ts`, find `OutNodeRuntime` interface (line ~4) and add:

```ts
interface OutNodeRuntime extends Node<NodeDef> {
  config: OutNodeConfig;
  controller: ConnectNode | null;
  input: MessageType;
  stationId: string;
  volumeFlag: boolean;
  volume: number;
  stopListening: boolean;
  noTrackPhrase: string;
  pauseMusic: boolean;
  ttsVoice: string;
  ttsEffect: string;
  whisper: boolean;
  musicId: string;
  musicType: string;
  cloudFallback: boolean;
  onStatus: (data: NodeStatusData) => void;
}
```

- [ ] **Step 2: Add `cloud?: boolean` to `OutInputMessage`**

Just below in the same file:

```ts
interface OutInputMessage extends NodeMessageInFlow {
  volume?: number;
  whisper?: boolean;
  voice?: string;
  effect?: string;
  prevent_listening?: string;
  pause_music?: boolean;
  hap?: { session?: unknown };
  id?: string;
  type?: string;
  cloud?: boolean;
  [key: string]: unknown;
}
```

- [ ] **Step 3: Read `cloudFallback` from config**

In the constructor, after `this.musicType = config.musicType;` (around line 58):

```ts
this.musicType = config.musicType;
this.cloudFallback = !!config.cloudFallback;
this.status({});
```

- [ ] **Step 4: Make the `input` handler async**

Find `this.on('input', (input: OutInputMessage) => {` (around line 68). Replace with:

```ts
this.on('input', async (input: OutInputMessage) => {
```

- [ ] **Step 5: Thread cloud flags onto `data` and await sendMessage**

The handler has three branches: `tts`, `playMusic`, default. The TTS path uses `this.controller.sendMessage(...)` at line ~148. We need to (a) add cloud flags to `data` in the TTS branch before the controller call, and (b) await every controller.sendMessage call. Wrap in try/catch.

Replace the existing `if (this.input === 'tts')` block — specifically, just before the `if (textPayload.length > 0 && this.controller)` line, insert:

```ts
if (this.cloudFallback) data.cloudFallback = true;
if ('cloud' in input) data.cloud = !!input.cloud;
```

Then change every `this.controller.sendMessage(...)` line in the file (three occurrences: TTS, playMusic, else) to be awaited inside try/catch.

Concretely, replace the three controller-call sites:

```ts
// TTS branch
if (textPayload.length > 0 && this.controller) {
  try {
    const result = await this.controller.sendMessage(this.stationId, this.input, data);
    this.debug(
      `Sending data: station: ${this.stationId}, input type: ${this.input}, data: ${JSON.stringify(data)}, result: ${result}`,
    );
  } catch (err) {
    this.error(`sendMessage failed: ${err instanceof Error ? err.message : String(err)}`);
  }
} else {
  this.debug('Nothing to send. Check input and parameters');
}
```

```ts
// playMusic branch
if (id && this.controller) {
  try {
    const result = await this.controller.sendMessage(this.stationId, this.input, data);
    this.debug(
      `Sending data: station: ${this.stationId}, input type: ${this.input}, data: ${JSON.stringify(data)}, result: ${result}`,
    );
  } catch (err) {
    this.error(`sendMessage failed: ${err instanceof Error ? err.message : String(err)}`);
  }
} else {
  this.debug('playMusic: missing id, nothing to send');
}
```

```ts
// default else branch
if (this.controller) {
  try {
    const result = await this.controller.sendMessage(this.stationId, this.input, data);
    this.debug(
      `Sending data: station: ${this.stationId}, input type: ${this.input}, data: ${JSON.stringify(data)}, result: ${result}`,
    );
  } catch (err) {
    this.error(`sendMessage failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Run all tests and lint**

Run: `pnpm test && pnpm lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/nodes/out/out.ts
git commit -m "Make OUT node await async sendMessage and thread cloud flags"
```

---

## Task 8: OUT node editor — checkbox + defaults

Surface the cloud-fallback toggle in the Node-RED editor.

**Files:**
- Modify: `src/nodes/out/html/editor.ts`
- Modify: `src/nodes/out/html/editor.html`

- [ ] **Step 1: Add `cloudFallback` default**

In `src/nodes/out/html/editor.ts`, find the `defaults` block (around line 54) and append:

```ts
defaults: {
  // ...existing entries...
  musicId: {
    value: '',
  },
  musicType: {
    value: 'track',
  },
  cloudFallback: {
    value: false,
  },
},
```

- [ ] **Step 2: Add the checkbox to `editor.html`**

In `src/nodes/out/html/editor.html`, find the last `command_options-tts` row (the `pauseMusic` row, currently at lines 153-159) and append immediately after:

```html
  <div class="form-row command_options command_options-tts">
    <label for="node-input-cloudFallback" class="label label-long">
      <i class="fa fa-cloud"></i>&nbsp;<span data-i18n="label.cloud_fallback"></span>
      <div class="red-ui-debug-msg-type-string" style="font-size: 10px;">msg.cloud</div>
    </label>
    <input type="checkbox" id="node-input-cloudFallback" style="display: inline-block; width: auto; vertical-align: top;">
  </div>
```

- [ ] **Step 3: Build the editor bundle to confirm**

Run: `pnpm build`
Expected: clean build. `build/nodes/out/out.html` should contain the new row (search for `node-input-cloudFallback`).

- [ ] **Step 4: Commit**

```bash
git add src/nodes/out/html/editor.ts src/nodes/out/html/editor.html
git commit -m "Add Cloud TTS fallback checkbox to OUT node editor"
```

---

## Task 9: Locales — 9 files

Add two label keys: `cloud_fallback` (the checkbox label) and `cloud_fallback_hint` (reserved for future tooltip use; consistent with existing pattern of bundling related keys).

Only `ru` and `en-US` get authentic translations. The remaining 7 locales (`de`, `fr`, `ja`, `ko`, `pt-BR`, `zh-CN`, `zh-TW`) mirror `en-US` (matches the `playMusic` precedent — commit `719c766`).

**Files:**
- Modify: `src/nodes/out/locales/{en-US,ru,de,fr,ja,ko,pt-BR,zh-CN,zh-TW}/out.json` (9 files)

- [ ] **Step 1: Add to `ru/out.json`**

In `src/nodes/out/locales/ru/out.json`, in the `"label"` object (after `"music_type"`):

```json
"label": {
  ...
  "music_id": "ID контента",
  "music_type": "Тип контента",
  "cloud_fallback": "Облачный TTS",
  "cloud_fallback_hint": "Использовать облако Яндекса, если станция недоступна по локальной сети"
},
```

- [ ] **Step 2: Add to `en-US/out.json`**

```json
"label": {
  ...
  "music_id": "Music ID",
  "music_type": "Music type",
  "cloud_fallback": "Cloud TTS fallback",
  "cloud_fallback_hint": "Use Yandex cloud when the local WebSocket is unavailable"
},
```

- [ ] **Step 3: Add the same English values to the 7 remaining locale files**

In each of `de`, `fr`, `ja`, `ko`, `pt-BR`, `zh-CN`, `zh-TW`, append the two keys to the `"label"` object with the same English values as `en-US`.

- [ ] **Step 4: Build and verify**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. `build/nodes/out/locales/ru/out.json` should contain `cloud_fallback`.

- [ ] **Step 5: Commit**

```bash
git add src/nodes/out/locales/
git commit -m "Add cloud_fallback locale strings"
```

---

## Task 10: Documentation

Wiki page + CHANGELOG bullet.

**Files:**
- Create: `wiki/ru/Cloud-TTS.md`
- Modify: `wiki/ru/OUT-Node.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Create the wiki page**

Create `wiki/ru/Cloud-TTS.md`:

```markdown
# Cloud TTS

`node-red-contrib-yandex-commander` поддерживает два пути доставки
TTS до колонки: локальный через WebSocket-протокол Glagol и облачный
через Quasar-сценарии Яндекса.

## Когда работает локальный TTS

- Node-RED и станция в одной LAN.
- Станция обнаруживается через mDNS (или указана вручную в Station-ноде).
- WebSocket активен (`connected` в статусе ноды).

Локальный путь поддерживает полный SSML: `<speaker voice='alyss'>`,
`<speaker effect='megaphone'>`, `<speaker is_whisper='true'>`,
`<speaker audio="...">`, `sil <[500]>`, ударения `+`.
Латентность — ~50-150 мс.

## Когда работает облачный TTS

- В Connect-ноде указан валидный OAuth-токен.
- Станция подключена к интернету и к аккаунту Яндекса (видна в
  приложении Яндекс).
- В OUT-ноде включён чекбокс **"Cloud TTS fallback"**, либо в
  сообщении явно передано `msg.cloud = true`.

Облачный путь используется, только если:

- локальный WebSocket недоступен (станция вне LAN, не отвечает), **или**
- в сообщении передано `msg.cloud === true` (принудительно).

`msg.cloud === false` запрещает облачный путь даже при включённом
чекбоксе (используется, чтобы для конкретного сообщения получить
явное `'Device offline'` вместо тихой отправки в облако).

## Как включить

1. Откройте OUT-ноду.
2. В поле **Action** выберите `Synthesize speech from text`.
3. Поставьте галочку **Cloud TTS fallback**.
4. (Опционально) В сообщении задавайте `msg.cloud = true/false` для
   переопределения.

## Ограничения облачного TTS

- **Только plain text.** SSML удаляется: `<speaker …>`, `sil <[…]>`,
  `+` снимаются перед отправкой. Голос/эффект/шёпот игнорируются.
- **Длина 2-100 символов.** Короче 2 — ошибка; длиннее 100 — обрезка
  с предупреждением в debug-логе.
- **`msg.volume`, `msg.whisper`, `msg.voice`, `msg.effect`,
  `msg.prevent_listening`, `msg.pause_music`** не применяются на
  облачном пути — Quasar-сценарий поддерживает только текст фразы.
- **Латентность ~500-1500 мс** — заметно выше локальной.
- **Создаётся сценарий в Quasar-аккаунте.** Имя вида
  `ЯC <закодированный_device_id>`. Виден в приложении Яндекс в
  разделе сценариев. Сценарий используется повторно при каждом
  TTS-вызове (не плодим дубликаты).

## Совместимость с AlexxIT/YandexStation

Имя сценария совпадает со схемой `AlexxIT/YandexStation` (Cyrillic
hex-encoding). Если на вашем аккаунте уже создан такой сценарий
интеграцией AlexxIT, мы его подхватим и не создадим дубликат.

## Диагностика

| Симптом | Причина |
|---|---|
| `Cloud TTS: text too short` | После удаления SSML осталось < 2 символов. |
| `Cloud TTS failed for <id>: ...` | Ошибка от Quasar API. Проверьте OAuth-токен и видимость станции в приложении Яндекс. |
| Тишина (нет ошибок) | Сценарий запустился, но станция офлайн в облаке. |

Логи в Node-RED debug-панели: ищите строки `Cloud TTS` от
connect-ноды.
```

- [ ] **Step 2: Update `wiki/ru/OUT-Node.md`**

In `wiki/ru/OUT-Node.md`, after the existing TTS options table (around line 49 — after the line `Все опции комбинируемы между собой.`) and before the `### Добавление голосу жизни` subsection, insert:

```markdown

### Cloud TTS fallback

Если станция недоступна по локальной сети, TTS можно отправить через
облако Яндекса. Опция доступна только в режиме TTS.

| Опция              | Описание                                                                    | Переопределение |
|--------------------|-----------------------------------------------------------------------------|-----------------|
| Cloud TTS fallback | При недоступности локального WebSocket — отправлять TTS через облако        | `msg.cloud`     |

Подробности и ограничения: [Cloud-TTS](Cloud-TTS).

```

- [ ] **Step 3: Update CHANGELOG**

In `CHANGELOG.md`, inside the existing `## [0.3.0] — 2026-05-20` block's `### Added` section, append a second bullet after the playMusic one:

```markdown
- Cloud TTS fallback for the OUT node. When the local Glagol WebSocket
  is unavailable (station offline, mDNS unreachable, manual
  disconnect), the OUT node can route TTS through the Quasar cloud
  scenarios API. Off by default; enable per-node via the
  "Cloud TTS fallback" checkbox, or per-message via `msg.cloud === true`.
  `msg.cloud === false` forbids cloud for that message even when the
  checkbox is on. Limitations: plain text only (SSML / voice / effect /
  whisper stripped), 2–100 character window, latency ~500–1500 ms, and
  a scenario named `ЯC <encoded_device_id>` is created in the user's
  Quasar account. Compatible with `AlexxIT/YandexStation`-created
  scenarios — we adopt them by name rather than duplicating. See
  `wiki/ru/Cloud-TTS.md`.
```

- [ ] **Step 4: Commit**

```bash
git add wiki/ru/Cloud-TTS.md wiki/ru/OUT-Node.md CHANGELOG.md
git commit -m "Document cloud TTS fallback"
```

---

## Task 11: Final verification

End-to-end gates per the spec's acceptance section.

- [ ] **Step 1: Run the full quality gate**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all four green. Test count ≈ 84 (59 existing + 19 cloud + 6 route).

- [ ] **Step 2: Sanity-check the build output**

```bash
ls build/nodes/out/locales/ru/out.json
ls build/nodes/connect/connect.js
```
Then visually inspect that `build/nodes/connect/connect.js` contains the string `QuasarCloud` (confirms esbuild bundled the new module). On Windows PowerShell:

```powershell
Select-String -Path build/nodes/connect/connect.js -Pattern "QuasarCloud" | Select-Object -First 1
```
Expected: at least one match. If none, `quasarCloud.ts` is not being bundled — investigate `esbuild.mjs`'s entry-point list.

- [ ] **Step 3: Check git status is clean**

Run: `git status`
Expected: no uncommitted changes; branch ahead of master by 10 commits (Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, plus the spec already committed).

- [ ] **Step 4: Verify the test count matches**

Run: `pnpm test`
Expected output mentions ~84 tests passing (existing 59 + 6 cloudRoute + ~19 quasarCloud). If significantly lower, a test file isn't being discovered.

- [ ] **Step 5: Done**

No commit needed for this task — verification only. Plan is complete.

---

## Notes for the implementer

- **Don't run the dev server / Node-RED.** This change has no runtime UI to verify — Node-RED's editor is unit-testable via `pnpm build`'s output, and runtime behaviour is covered by the cloud + route unit tests. No browser flow.
- **If a test fails unexpectedly during Task 4**, the `QuasarCloud` implementation from Task 3 may have a bug. Read the failing assertion carefully — the response sequencing in the test stub is intentional and matches the documented code path. Fix `src/lib/quasarCloud.ts` rather than the test.
- **If `pnpm typecheck` complains in unexpected places** after Task 5, check whether anything outside `connect.ts` and `out.ts` calls `sendMessage`. As of the spec date only those two do, but verify with `grep -r "sendMessage" src/`.
- **Don't add SSML support to the cloud path.** It's a documented non-goal. If the user later asks, that's a separate spec.
- **Don't persist scenarioCache to disk.** Scenarios live on Yandex's side; we re-adopt by name on Node-RED restart, which is fast (one GET).
