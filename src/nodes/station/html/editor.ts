declare const RED: any;
declare const $: any;

RED.nodes.registerType('yandex-commander-station', {
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
    connectionFlag: {
      value: true
    },
    sheduler: {
      value: []
    },
    network: {
      value: {}
    },
    fixedAddress: {
      validate: function (this: any, address: string) {
        if (!Object.hasOwn(this.network, 'mode')) {
          return true;
        } else if (this.network.mode === 'auto') {
          return true;
        } else if (this.network.mode === 'manual') {
          return !!address.match(/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/);
        }
      }
    },
    fixedPort: {
      validate: function (this: any, port: string) {
        if (!Object.hasOwn(this.network, 'mode')) {
          return true;
        } else if (this.network.mode === 'auto') {
          return true;
        } else if (this.network.mode === 'manual') {
          return !!Number(port);
        }
      }
    },
    phrase: {
      value: ''
    }
  },
  inputs: 0,
  outputs: 0,
  icon: 'station.png',
  label: function () {
    return this.name || this.station_id;
  },
  paletteLabel: 'Station',
  oneditprepare: onOpen,
  oneditsave: onSave
});

/** Получает список устройств: сначала пробует per-node endpoint, при неудаче — статический POST */
function fetchDevices(configNodeId: string, callback: (devices: any[]) => void) {
  const config = RED.nodes.node(configNodeId);
  if (!config) return;
  $.getJSON(`stations/${config.id}`, (data: any) => {
    if (data.devices && data.devices.length > 0) {
      callback(data.devices);
    } else {
      fetchDevicesByToken(config, callback);
    }
  }).fail(() => {
    fetchDevicesByToken(config, callback);
  });
}

function fetchDevicesByToken(config: any, callback: (devices: any[]) => void) {
  const token = config.credentials?.token || $('#node-config-input-token').val();
  if (!token) return;
  $.ajax({
    url: 'yandex-commander/devices',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ token }),
    success: (data: any) => {
      if (data.devices) callback(data.devices);
    }
  });
}

/**
 * Обновляет выпадающий список станций из API connect-ноды.
 * Привязана к window, чтобы HTML-атрибут onclick="onRefresh()" нашёл функцию
 * после IIFE-бандлинга esbuild'ом.
 */
(window as any).onRefresh = function onRefresh() {
  const selector = $('#node-input-station_id');
  const currentId = selector.data('station_id');

  selector.empty();
  fetchDevices($('#node-input-token').val(), (devices: any[]) => {
    devices.forEach((device: any) => {
      selector.append(`<option value="${device.id}">${device.name} (${device.id})</option>`);
      $(`#node-input-station_id option[value=${currentId}]`).attr('selected', true);
      const addrPlaceholder = currentId === device.id && device.address ? device.address : '0.0.0.0';
      const portPlaceholder = currentId === device.id && device.port ? device.port : '1961';
      $('#node-input-fixedAddress').attr('placeholder', addrPlaceholder);
      $('#node-input-fixedPort').attr('placeholder', portPlaceholder);
    });
  });
};

/** Инициализация редактора: загружает список станций, заполняет расписание и сетевые настройки */
function onOpen(this: any) {
  const config = RED.nodes.node($('#node-input-token').val());
  const selector = $('#node-input-station_id');
  selector.empty();
  const currentId = this.station_id;
  selector.data('station_id', currentId);

  function loadDevices() {
    selector.empty();
    fetchDevices($('#node-input-token').val(), (devices) => {
      devices.forEach((device: any) => {
        selector.append(`<option value="${device.id}">${device.name} (${device.id})</option>`);
        $(`#node-input-station_id :contains(${currentId})`).attr('selected', true);
        currentId === device.id && device.address ? $('#node-input-fixedAddress').attr('placeholder', device.address) : $('#node-input-fixedAddress').attr('placeholder', '0.0.0.0');
        currentId === device.id && device.port ? $('#node-input-fixedPort').attr('placeholder', device.port) : $('#node-input-fixedPort').attr('placeholder', '1961');
      });
    });
  }

  loadDevices();

  $('#node-input-token').on('change', loadDevices);

  $('#node-input-station_id').on('change', () => {
    const selectedId = $('#node-input-station_id').val();
    if (selectedId) {
      fetchDevices($('#node-input-token').val(), (devices) => {
        const device = devices.find((dev: any) => dev.id === selectedId);
        if (device) {
          $('#node-input-fixedAddress').attr('placeholder', device.address || '0.0.0.0');
          $('#node-input-fixedPort').attr('placeholder', device.port || '1961');
        }
      });
    }
  });

  // fill time selectors from 00:00 to 24:00
  const times: Record<string, string> = {};
  for (let i = 0; i <= 1440; i += 15) {
    let hours: string = String(Math.floor(i / 60));
    let minutes: string = String(i % 60);
    hours = Number(hours) < 10 ? `0${hours}` : hours;
    minutes = Number(minutes) < 10 ? `0${minutes}` : minutes;
    times[i] = `${hours}:${minutes}`;
  }
  const sheduler = this.sheduler || [];

  $('.sheduler-block').each(function (this: any, i: number, block: any) {
    const currentDaySchedule = i === 6 ? sheduler.find((el: any) => el.dayNumber === 0) : sheduler.find((el: any) => el.dayNumber === i + 1);
    const activeFlag = !currentDaySchedule ? true : currentDaySchedule.active;
    const startTime = !currentDaySchedule ? '0' : currentDaySchedule.from;
    const endTime = !currentDaySchedule ? '1440' : currentDaySchedule.to;
    const checkbox = $(block).children().first();
    const fromSelect = $(block).children('select').first();
    const toSelect = $(block).children('select').last();
    $(checkbox).prop('checked', activeFlag);
    $.each(times, (key: string, value: string) => {
      $(fromSelect).append(`<option value="${key}">${value}</option>`);
      $(toSelect).append(`<option value="${key}">${value}</option>`);
    });
    $(`#${fromSelect.attr('id')} option:last`).remove();
    $(`#${toSelect.attr('id')} option:first`).remove();
    $(`#${fromSelect.attr('id')} option[value=${startTime}]`).attr('selected', true);
    $(`#${toSelect.attr('id')} option[value=${endTime}]`).attr('selected', true);

    if (checkbox.prop('checked')) {
      $(fromSelect).prop('disabled', false);
      $(toSelect).prop('disabled', false);
    } else {
      $(fromSelect).prop('disabled', true);
      $(toSelect).prop('disabled', true);
    }
    $(checkbox).on('change', () => {
      if (checkbox.prop('checked')) {
        $(fromSelect).prop('disabled', false);
        $(toSelect).prop('disabled', false);
      } else {
        $(fromSelect).prop('disabled', true);
        $(toSelect).prop('disabled', true);
      }
    });
  });

  $('.status-button-group').on('click', function (this: any) {
    $('.status-button-group').removeClass('selected');
    $(this).addClass('selected');
  });

  const currentStatus = this.connectionFlag;
  if (currentStatus === true || typeof currentStatus === 'undefined') {
    $('#buttonEnabled').addClass('selected');
  } else {
    $('#buttonDisabled').addClass('selected');
  }

  const currentMode = this.network ? this.network.mode : 'auto';
  if (currentMode === 'auto' || typeof currentMode === 'undefined') {
    $('#autoButton').addClass('selected');
    $('#address-block').hide();
  } else {
    $('#manualButton').addClass('selected');
    $('#address-block').show();
  }

  $('.ip-button-group').on('click', function (this: any) {
    $('.ip-button-group').removeClass('selected');
    $(this).addClass('selected');
    const pressedButtonId = $(this).attr('id');
    if (pressedButtonId === 'autoButton') {
      $('#address-block').hide();
    } else if (pressedButtonId === 'manualButton') {
      $('#address-block').show();
      const selectedId = $('#node-input-station_id').val();
      if (selectedId && config) {
        $.getJSON(`yandexdevices_${config.id}`, (data: any) => {
          const device = data.devices.find((dev: any) => dev.id === selectedId);
          $('#node-input-fixedAddress').attr('placeholder', device.address);
          $('#node-input-fixedPort').attr('placeholder', device.port);
        });
      }
    }
  });
}

/** Сохранение: собирает расписание, сетевые настройки и флаг подключения из UI */
function onSave(this: any) {
  const sheduler: any[] = [];
  $('.sheduler-block').each(function (this: any, i: number, block: any) {
    const scheduleDay: any = {};
    const checkbox = $(block).children().first();
    const fromSelect = $(block).children('select').first();
    const toSelect = $(block).children('select').last();
    const activeFlag = checkbox.is(':checked');
    const startTime = activeFlag ? fromSelect.val() : '0';
    const endTime = activeFlag ? toSelect.val() : '1440';
    const phrase = $('#node-input-phrase').val();
    scheduleDay.active = activeFlag;
    scheduleDay.from = startTime;
    scheduleDay.to = endTime;
    scheduleDay.phrase = phrase;
    scheduleDay.dayNumber = i === 6 ? 0 : i + 1;
    sheduler.push(scheduleDay);
  });
  this.sheduler = sheduler;

  // Network mode is consumed by the runtime via the top-level `fixedAddress`/`fixedPort`
  // fields (see station.ts:49). The `network` config holds only the mode flag.
  this.network = { mode: $('#autoButton').hasClass('selected') ? 'auto' : 'manual' };

  if ($('#buttonEnabled').hasClass('selected')) {
    this.connectionFlag = true;
  } else {
    this.connectionFlag = false;
  }
}
