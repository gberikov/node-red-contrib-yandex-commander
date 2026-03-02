declare const RED: any;
declare const $: any;

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
    debugFlag: {
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
  paletteLabel: 'Yandex IN',
  oneditprepare: onOpen
});

/** Инициализация редактора: загружает список устройств и управляет видимостью homekit/unique-настроек */
function onOpen(this: any) {
  const config = RED.nodes.node($('#node-input-token').val());
  const selector = $('#node-input-station_id');
  selector.empty();
  const currentId = this.station_id;
  $.getJSON('yandexdevices_' + config.id, function (data: any) {
    data.devices.forEach((device: any) => {
      selector.append(`<option value="${device.id}">${device.name}(${device.id})</option>`);
      $(`#node-input-station_id :contains(${currentId})`).attr('selected', 'selected');
    });
  });
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
