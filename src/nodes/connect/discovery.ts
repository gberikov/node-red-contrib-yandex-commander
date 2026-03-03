import mDnsSd from 'node-dns-sd';
import { RuntimeDevice } from '@/lib/types';

type DebugFn = (msg: string) => void;

/**
 * Ищет устройства в локальной сети через mDNS (_yandexio._tcp) и обновляет их адреса/порты.
 * Мутирует device.address / device.port / device.host в массиве.
 */
export async function discoverDevices(deviceList: RuntimeDevice[], debug: DebugFn): Promise<any[]> {
  const result = await mDnsSd.discover({ name: '_yandexio._tcp.local' });
  if (result.length === 0) return result;

  for (const device of deviceList) {
    const networkConfig = device.parameters.network;
    if (networkConfig && networkConfig.mode !== 'auto') continue;

    for (const element of result) {
      const srvRecord = element.packet.answers.find((el: any) => el.type === 'SRV')
        || element.packet.additionals.find((el: any) => el.type === 'SRV');
      const txtRecord = element.packet.answers.find((el: any) => el.type === 'TXT')
        || element.packet.additionals.find((el: any) => el.type === 'TXT');
      if (txtRecord && txtRecord.rdata.deviceId === device.id) {
        device.address = element.address;
        device.port = element.service.port;
        try {
          device.host = srvRecord.rdata.target;
        } catch (e) {
          debug('Error searching hostname in mDNS answer');
        }
      }
    }
  }
  return result;
}

/**
 * Cloud networkInfo fallback: использует IP из cloud API для устройств, не найденных через mDNS.
 * Мутирует device.address / device.port в массиве.
 */
export function applyCloudFallback(deviceList: RuntimeDevice[], debug: DebugFn): void {
  for (const device of deviceList) {
    if (device.address || !device.networkInfo) continue;
    const networkConfig = device.parameters.network;
    if (networkConfig && networkConfig.mode !== 'auto') continue;

    if (device.networkInfo.ip_addresses && device.networkInfo.ip_addresses.length > 0) {
      device.address = device.networkInfo.ip_addresses[0];
      device.port = device.networkInfo.external_port || 1961;
      debug(`${device.id}: Using cloud networkInfo fallback: ${device.address}:${device.port}`);
    }
  }
}
