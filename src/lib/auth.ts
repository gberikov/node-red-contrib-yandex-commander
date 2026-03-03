import axios, { type AxiosResponse } from 'axios';
import crypto from 'node:crypto';

interface AuthSession {
  csrfToken: string;
  trackId: string;
  cookies: string[];
  createdAt: number;
}

const UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function mergeCookies(existing: string[], setCookieHeaders: string | string[] | undefined): string[] {
  if (!setCookieHeaders) return existing;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const map = new Map<string, string>();
  for (const c of existing) {
    const name = c.split('=')[0];
    map.set(name, c);
  }
  for (const raw of headers) {
    const pair = raw.split(';')[0];
    const name = pair.split('=')[0];
    map.set(name, pair);
  }
  return Array.from(map.values());
}

function cookieHeader(cookies: string[]): string {
  return cookies.join('; ');
}

function isCaptchaResponse(response: AxiosResponse): boolean {
  const data = typeof response.data === 'string' ? response.data : '';
  return (
    data.includes('smart-captcha') ||
    data.includes('captcha-container') ||
    data.includes('SmartCaptcha') ||
    data.includes('captcha.yandex') ||
    (response.status === 403 && data.includes('captcha'))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class YandexAuth {
  private sessions = new Map<string, AuthSession>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (now - session.createdAt > 5 * 60 * 1000) {
          this.sessions.delete(id);
        }
      }
    }, 30_000);
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }

  async startQR(): Promise<{ sessionId: string; qrSvg: string }> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.doStartQR();
      } catch (err: any) {
        if (err.message?.includes('captcha') || err.message?.includes('Captcha')) {
          if (attempt < maxAttempts) {
            // Wait before retry: 3s, 6s
            await sleep(attempt * 3000);
            continue;
          }
          throw new Error(
            'Яндекс требует прохождение капчи. Попробуйте повторить через 1-2 минуты. ' +
            'Если ошибка повторяется — откройте passport.yandex.ru в браузере на этом же сервере, ' +
            'пройдите капчу вручную, затем повторите попытку.'
          );
        }
        throw err;
      }
    }

    throw new Error('Unexpected: retries exhausted');
  }

  private async doStartQR(): Promise<{ sessionId: string; qrSvg: string }> {
    // Step 1: GET auth page to obtain csrf_token and initial cookies
    const amResponse = await axios.get('https://passport.yandex.ru/am?app_platform=android', {
      headers: BROWSER_HEADERS,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    if (isCaptchaResponse(amResponse)) {
      throw new Error('Captcha triggered on auth page');
    }

    const amHtml: string = amResponse.data;
    const csrfMatch =
      amHtml.match(/"csrf_token"\s*value="([^"]+)"/) ||
      amHtml.match(/name="csrf_token"[^>]*value="([^"]+)"/) ||
      amHtml.match(/value="([^"]+)"[^>]*name="csrf_token"/) ||
      amHtml.match(/"csrf_token"\s*:\s*"([^"]+)"/);
    if (!csrfMatch) {
      throw new Error('Failed to parse csrf_token from auth page');
    }
    const csrfToken = csrfMatch[1];
    let cookies = mergeCookies([], amResponse.headers['set-cookie']);

    // Step 2: POST to get track_id
    const submitResponse = await axios.post(
      'https://passport.yandex.ru/registration-validations/auth/password/submit',
      new URLSearchParams({
        csrf_token: csrfToken,
        retpath: 'https://passport.yandex.ru/profile',
        with_code: '1',
      }).toString(),
      {
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://passport.yandex.ru',
          'Referer': 'https://passport.yandex.ru/am?app_platform=android',
          Cookie: cookieHeader(cookies),
        },
        maxRedirects: 0,
        validateStatus: () => true,
      },
    );

    if (isCaptchaResponse(submitResponse)) {
      throw new Error('Captcha triggered on submit');
    }

    cookies = mergeCookies(cookies, submitResponse.headers['set-cookie']);
    const submitData = submitResponse.data;

    if (!submitData.track_id) {
      throw new Error(`Failed to obtain track_id`);
    }

    const trackId = submitData.track_id;
    const newCsrf = submitData.csrf_token || csrfToken;

    // Step 3: Fetch the QR code SVG from Yandex
    const qrPageUrl = `https://passport.yandex.ru/auth/magic/code/?track_id=${trackId}`;
    const qrPageResponse = await axios.get(qrPageUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Cookie: cookieHeader(cookies),
        Referer: 'https://passport.yandex.ru/am?app_platform=android',
      },
      maxRedirects: 5,
      validateStatus: () => true,
    });

    if (isCaptchaResponse(qrPageResponse)) {
      throw new Error('Captcha triggered on QR page');
    }

    cookies = mergeCookies(cookies, qrPageResponse.headers['set-cookie']);
    const qrSvg: string = qrPageResponse.data;

    if (!qrSvg || !qrSvg.includes('<svg')) {
      throw new Error('Failed to fetch QR code SVG from Yandex');
    }

    // Step 4: Save session
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      csrfToken: newCsrf,
      trackId,
      cookies,
      createdAt: Date.now(),
    });

    return { sessionId, qrSvg };
  }

  async checkQR(sessionId: string): Promise<{ status: 'pending' | 'ok'; token?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found or expired');
    }

    const statusResponse = await axios.post(
      'https://passport.yandex.ru/auth/new/magic/status/',
      new URLSearchParams({
        csrf_token: session.csrfToken,
        track_id: session.trackId,
      }).toString(),
      {
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: cookieHeader(session.cookies),
        },
        validateStatus: (s) => s < 500,
      },
    );

    session.cookies = mergeCookies(session.cookies, statusResponse.headers['set-cookie']);

    if (statusResponse.data.status !== 'ok') {
      return { status: 'pending' };
    }

    // Status is ok — exchange cookies for tokens
    const token = await this.exchangeTokens(session.cookies);
    this.sessions.delete(sessionId);
    return { status: 'ok', token };
  }

  private async exchangeTokens(cookies: string[]): Promise<string> {
    // Step 1: Get x_token via session cookies
    const xTokenResponse = await axios.post(
      'https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid',
      new URLSearchParams({
        client_id: 'c0ebe342af7d48fbbbfcf2d2eedb8f9e',
        client_secret: 'ad0a908f0aa341a182a37ecd75bc319e',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Ya-Client-Host': 'passport.yandex.ru',
          'Ya-Client-Cookie': cookieHeader(cookies),
          'User-Agent': UA,
        },
      },
    );

    const xToken = xTokenResponse.data.access_token;
    if (!xToken) {
      throw new Error('Failed to obtain x_token');
    }

    // Step 2: Exchange x_token for music_token (OAuth token for Quasar API)
    const musicTokenResponse = await axios.post(
      'https://oauth.mobile.yandex.net/1/token',
      new URLSearchParams({
        grant_type: 'x-token',
        access_token: xToken,
        client_id: '23cabbbdc6cd418abb4b39c32c41195d',
        client_secret: '53bc75238f0c4d08a118e51fe9203300',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
        },
      },
    );

    const musicToken = musicTokenResponse.data.access_token;
    if (!musicToken) {
      throw new Error('Failed to obtain music_token');
    }

    return musicToken;
  }
}
