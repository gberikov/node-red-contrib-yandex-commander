import type { EditorRED } from 'node-red';

declare const RED: EditorRED;
declare const $: JQueryStatic;

interface DeviceSummary {
  id: string;
  name: string;
  platform: string;
  address?: string;
  port?: number;
}

interface DevicesResponse {
  devices: DeviceSummary[];
}

interface ConfigNodeShape {
  id: string;
  credentials?: { token?: string };
}

function fetchDevices(configNodeId: string, callback: (devices: DeviceSummary[]) => void) {
  const config = RED.nodes.node(configNodeId) as unknown as ConfigNodeShape | null;
  if (!config) return;
  $.getJSON(`stations/${config.id}`, (data: DevicesResponse) => {
    if (data.devices && data.devices.length > 0) {
      callback(data.devices);
    } else {
      fetchDevicesByToken(config, callback);
    }
  }).fail(() => {
    fetchDevicesByToken(config, callback);
  });
}

function fetchDevicesByToken(config: ConfigNodeShape, callback: (devices: DeviceSummary[]) => void) {
  const token = config.credentials?.token || $('#node-config-input-token').val();
  if (!token) return;
  $.ajax({
    url: 'yandex-commander/devices',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ token }),
    success: (data: DevicesResponse) => {
      if (data.devices) callback(data.devices);
    },
  });
}

RED.nodes.registerType('yandex-commander-in', {
  category: 'Yandex Commander',
  color: '#b89fcc',
  defaults: {
    name: { value: '' },
    token: {
      type: 'yandex-commander-connect',
      required: true,
    },
    station_id: {
      required: true,
    },
    uniqueFlag: {
      value: false,
    },
    output: {
      required: true,
    },
    homekitFormat: {
      value: 'speaker',
    },
  },
  inputs: 0,
  outputs: 1,
  icon: 'station.png',
  label: function () {
    return this.name || this.station_id;
  },
  paletteLabel: 'yandex in',
  oneditprepare: onOpen,
});

/** Инициализация редактора: загружает список устройств и управляет видимостью homekit/unique-настроек */
function onOpen(this: { station_id: string }) {
  const selector = $('#node-input-station_id');
  const currentId = this.station_id;

  function loadDevices() {
    selector.empty();
    fetchDevices($('#node-input-token').val() as string, (devices) => {
      devices.forEach((device: DeviceSummary) => {
        selector.append(`<option value="${device.id}">${device.name} (${device.id})</option>`);
        $(`#node-input-station_id :contains(${currentId})`).attr('selected', 'selected');
      });
    });
  }

  loadDevices();
  $('#node-input-token').on('change', loadDevices);

  $('#node-input-output').on('change', function (this: HTMLElement) {
    if ($(this).val() === 'homekit') {
      $('#node-unique').show();
      $('#node-homekitFormat').show();
    } else {
      $('#node-unique').hide();
      $('#node-homekitFormat').hide();
    }
  });
}
