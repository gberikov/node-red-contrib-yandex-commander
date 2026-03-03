declare const RED: any;
declare const $: any;

function fetchDevices(configNodeId: string, callback: (devices: any[]) => void) {
  const config = RED.nodes.node(configNodeId);
  if (!config) return;
  $.getJSON(`stations/${config.id}`, function (data: any) {
    if (data.devices && data.devices.length > 0) {
      callback(data.devices);
    } else {
      fetchDevicesByToken(config, callback);
    }
  }).fail(function () {
    fetchDevicesByToken(config, callback);
  });
}

function fetchDevicesByToken(config: any, callback: (devices: any[]) => void) {
  const token = (config.credentials && config.credentials.token) || $('#node-config-input-token').val();
  if (!token) return;
  $.ajax({
    url: 'yandex-commander/devices',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ token }),
    success: function (data: any) {
      if (data.devices) callback(data.devices);
    }
  });
}

RED.nodes.registerType('yandex-commander-in', {
  category: 'Yandex Commander',
  color: '#b89fcc',
  defaults: {
    name: { value: '' },
    token: {
      type: 'yandex-commander-connect',
      required: true
    },
    station_id: {
      required: true
    },
    uniqueFlag: {
      value: false
    },
    output: {
      required: true
    },
    homekitFormat: {
      value: 'speaker'
    }
  },
  inputs: 0,
  outputs: 1,
  icon: 'station.png',
  label: function () {
    return this.name || this.station_id;
  },
  paletteLabel: 'yandex in',
  oneditprepare: onOpen
});

/** Инициализация редактора: загружает список устройств и управляет видимостью homekit/unique-настроек */
function onOpen(this: any) {
  const selector = $('#node-input-station_id');
  const currentId = this.station_id;

  function loadDevices() {
    selector.empty();
    fetchDevices($('#node-input-token').val(), function (devices) {
      devices.forEach((device: any) => {
        selector.append(`<option value="${device.id}">${device.name} (${device.id})</option>`);
        $(`#node-input-station_id :contains(${currentId})`).attr('selected', 'selected');
      });
    });
  }

  loadDevices();
  $('#node-input-token').on('change', loadDevices);

  $('#node-input-output').on('change', function () {
    if ($(this).val() == 'homekit') {
      $('#node-unique').show();
      $('#node-homekitFormat').show();
    } else {
      $('#node-unique').hide();
      $('#node-homekitFormat').hide();
    }
  });
}
