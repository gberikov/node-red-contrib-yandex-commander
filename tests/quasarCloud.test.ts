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

import axios from 'axios';
import { beforeEach, vi } from 'vitest';
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
