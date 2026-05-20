import axios, { type AxiosInstance } from 'axios';

const HEX_TO_CYR: Record<string, string> = {
  '0': 'о',
  '1': 'а',
  '2': 'б',
  '3': 'в',
  '4': 'г',
  '5': 'д',
  '6': 'е',
  '7': 'ж',
  '8': 'з',
  '9': 'и',
  a: 'й',
  b: 'к',
  c: 'л',
  d: 'м',
  e: 'н',
  f: 'п',
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
    await this.ensureCsrf();
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
