import axios, { type AxiosInstance } from 'axios';
import type { DevicesResponse } from './api/device';

export interface LocalTokenResponse {
  token: string;
  status: string;
}

/** Клиент для работы с Yandex Quasar API (управление Яндекс Станциями) */
export class QuasarApi {
  private instance: AxiosInstance;

  /** Создаёт экземпляр API-клиента с авторизацией по OAuth-токену */
  constructor(token: string) {
    this.instance = axios.create({
      baseURL: 'https://quasar.yandex.net/glagol',
      responseType: 'json',
      headers: {
        'Content-type': 'application/json',
        Authorization: `OAuth ${token}`,
      },
    });
  }

  /** Получает список всех устройств пользователя из облака Яндекса */
  public async getDevices(): Promise<DevicesResponse> {
    return await this.query<DevicesResponse>('GET', '/device_list');
  }

  /** Получает локальный токен для WebSocket-соединения с конкретным устройством */
  public async getLocalToken(deviceId: string, platform: string): Promise<LocalTokenResponse> {
    return await this.query<LocalTokenResponse>('GET', `/token?device_id=${deviceId}&platform=${platform}`);
  }

  /** Выполняет HTTP-запрос к Quasar API и возвращает типизированный ответ */
  private async query<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, data?: unknown): Promise<T> {
    const options = { method, url, data };
    try {
      const { data: response } = await this.instance.request<T>(options);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  }
}
