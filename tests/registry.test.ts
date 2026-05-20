import { describe, expect, it } from 'vitest';
import type { RuntimeDevice } from '@/lib/types';
import { DeviceRegistry } from '@/nodes/connect/registry';

function makeDevice(id: string, overrides: Partial<RuntimeDevice> = {}): RuntimeDevice {
  return {
    id,
    name: `Station-${id}`,
    platform: 'yandexstation',
    parameters: {},
    lastState: {},
    ...overrides,
  };
}

describe('DeviceRegistry', () => {
  it('upsert + get round-trip', () => {
    const r = new DeviceRegistry();
    const d = makeDevice('abc');
    r.upsert(d);
    expect(r.get('abc')).toBe(d);
    expect(r.size).toBe(1);
  });

  it('replaceAll clears previous content', () => {
    const r = new DeviceRegistry();
    r.upsert(makeDevice('a'));
    r.upsert(makeDevice('b'));
    r.replaceAll([makeDevice('c')]);
    expect(r.size).toBe(1);
    expect(r.get('a')).toBeUndefined();
    expect(r.get('c')).toBeDefined();
  });

  it('ready() returns only devices with address+port', () => {
    const r = new DeviceRegistry();
    r.upsert(makeDevice('a', { address: '10.0.0.1', port: 1961 }));
    r.upsert(makeDevice('b'));
    r.upsert(makeDevice('c', { address: '10.0.0.2' })); // no port
    const ready = r.ready();
    expect(ready).toHaveLength(1);
    expect(ready[0]?.id).toBe('a');
  });

  it('active() returns all devices regardless of address', () => {
    const r = new DeviceRegistry();
    r.upsert(makeDevice('a', { address: '10.0.0.1', port: 1961 }));
    r.upsert(makeDevice('b'));
    expect(r.active()).toHaveLength(2);
  });

  it('isReady() respects address+port', () => {
    const r = new DeviceRegistry();
    r.upsert(makeDevice('a', { address: '10.0.0.1', port: 1961 }));
    r.upsert(makeDevice('b'));
    expect(r.isReady('a')).toBe(true);
    expect(r.isReady('b')).toBe(false);
    expect(r.isReady('nonexistent')).toBe(false);
  });

  it('clear() empties the registry', () => {
    const r = new DeviceRegistry();
    r.upsert(makeDevice('a'));
    r.clear();
    expect(r.size).toBe(0);
  });

  it('all() returns a snapshot, not a live view', () => {
    const r = new DeviceRegistry();
    r.upsert(makeDevice('a'));
    const snapshot = r.all();
    r.upsert(makeDevice('b'));
    expect(snapshot).toHaveLength(1);
  });
});
