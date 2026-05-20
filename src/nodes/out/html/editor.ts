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

RED.nodes.registerType('yandex-commander-out', {
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
    input: {
      value: 'command',
      required: true,
    },
    payload: {
      value: 'payload',
    },
    payloadType: {
      value: 'msg',
    },
    volume: {},
    volumeFlag: {
      value: false,
    },
    stopListening: {
      value: true,
    },
    pauseMusic: {
      value: false,
    },
    noTrack: {},
    whisper: {
      value: false,
    },
    ttsVoice: {
      value: null,
    },
    ttsEffect: {
      value: null,
      required: false,
    },
    musicId: {
      value: '',
    },
    musicType: {
      value: 'track',
    },
  },
  inputs: 1,
  outputs: 0,
  icon: 'station.png',
  label: function () {
    return this.name || this.station_id;
  },
  paletteLabel: 'yandex out',
  oneditprepare: onOpen,
});

/** Инициализация редактора: настраивает typedInput для payload/effect, загружает устройства, управляет видимостью секций */
function onOpen(this: { station_id: string }) {
  const command = $('#node-input-input').val();

  $('#node-input-payload').typedInput({
    types: ['msg', 'str', 'flow', 'global', 'json'],
    default: 'msg',
    value: 'payload',
    typeField: $('#node-input-payloadType'),
  });

  $('#node-input-ttsEffect').typedInput({
    type: 'ttsEffect',
    types: [
      {
        value: 'ttsEffect',
        multiple: false,
        options: [
          { value: '', label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.none') },
          {
            value: 'behind_the_wall',
            label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.behind_the_wall'),
          },
          { value: 'hamster', label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.hamster') },
          {
            value: 'megaphone',
            label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.megaphone'),
          },
          {
            value: 'pitch_down',
            label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.pitch_down'),
          },
          {
            value: 'psychodelic',
            label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.psychodelic'),
          },
          { value: 'pulse', label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.pulse') },
          {
            value: 'train_announce',
            label: RED._('node-red-contrib-yandex-commander/yandex-commander-out:effect.train_announce'),
          },
        ],
      },
    ],
  });

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

  $('.command_options').hide();
  $(`.command_options-${command}`).show();

  $('#node-input-input').on('change', function (this: HTMLElement) {
    $('.command_options').hide();
    $(`.command_options-${$(this).val()}`).show();

    if ($(this).val() === 'tts') {
      if ($('#node-input-volumeFlag').prop('checked')) {
        $('#node-input-volume').show();
        $('#range-label').show();
      }
    }
  });

  $('#node-input-volumeFlag').on('change', function (this: HTMLElement) {
    if ($('#node-input-input').val() === 'tts' && $(this).prop('checked')) {
      $('#node-input-volume').show();
      $('#range-label').show();
    } else if ($('#node-input-input').val() === 'tts' && !$(this).prop('checked')) {
      $('#node-input-volume').hide();
      $('#range-label').hide();
    }
  });

  $('#node-input-volume').on('change', () => {
    $('#volume-level').text(`${parseFloat($('#node-input-volume').val() as string)}`);
  });
}
