import type { ActiveStation, ReadyDevice, RuntimeDevice } from '@/lib/types';

/**
 * Единый реестр устройств для config-ноды.
 * Заменяет четыре параллельных массива (deviceList, readyList, activeStationList) —
 * остальные «списки» становятся вычисляемыми проекциями.
 *
 * Источник правды — Map<id, RuntimeDevice>. Каждое устройство хранится один раз;
 * статус «готово к подключению» определяется наличием address+port.
 */
export class DeviceRegistry {
  private readonly devices = new Map<string, RuntimeDevice>();

  /** Полностью заменяет содержимое реестра (используется при первичной загрузке cloud-списка). */
  replaceAll(list: RuntimeDevice[]): void {
    this.devices.clear();
    for (const d of list) {
      this.devices.set(d.id, d);
    }
  }

  /** Добавляет или обновляет устройство. */
  upsert(device: RuntimeDevice): void {
    this.devices.set(device.id, device);
  }

  /** Возвращает устройство по id. */
  get(id: string): RuntimeDevice | undefined {
    return this.devices.get(id);
  }

  /** Все устройства (для итерации). */
  all(): RuntimeDevice[] {
    return Array.from(this.devices.values());
  }

  /** Размер реестра. */
  get size(): number {
    return this.devices.size;
  }

  /** Устройства, готовые к WebSocket-подключению (есть address и port). */
  ready(): ReadyDevice[] {
    const result: ReadyDevice[] = [];
    for (const d of this.devices.values()) {
      if (d.address && d.port) {
        result.push({
          name: d.name,
          id: d.id,
          platform: d.platform,
          address: d.address,
          port: d.port,
          host: d.host,
          parameters: d.parameters,
        });
      }
    }
    return result;
  }

  /** Краткая проекция для отдачи в HTTP /stations/{id}. */
  active(): ActiveStation[] {
    return Array.from(this.devices.values(), (d) => ({
      name: d.name,
      id: d.id,
      platform: d.platform,
      address: d.address,
      port: d.port,
    }));
  }

  /** True если устройство присутствует и имеет address+port. */
  isReady(id: string): boolean {
    const d = this.devices.get(id);
    return !!(d && d.address && d.port);
  }

  /** Очищает реестр (на close). */
  clear(): void {
    this.devices.clear();
  }
}
