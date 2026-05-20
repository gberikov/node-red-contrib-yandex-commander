import type { EditorNodeProperties, EditorRED } from 'node-red';

interface ConnectEditorNodeProperties extends EditorNodeProperties {}

interface ConnectEditorNodeCredentials {
  token: string;
}

declare const RED: EditorRED;

RED.nodes.registerType<ConnectEditorNodeProperties, ConnectEditorNodeCredentials>('yandex-commander-connect', {
  category: 'config',
  credentials: { token: { type: 'text' } },
  defaults: {
    name: { value: '' },
  },
  label: function () {
    return this.name || 'YandexCommanderConnect';
  },
  oneditprepare: () => {
    $('#qr-button').on('click', startQRAuth);
  },
});

let activePollInterval: ReturnType<typeof setInterval> | null = null;
let activePollTimeout: ReturnType<typeof setTimeout> | null = null;

function cleanupPolling() {
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
  if (activePollTimeout) {
    clearTimeout(activePollTimeout);
    activePollTimeout = null;
  }
}

function resetUI() {
  cleanupPolling();
  $('#qr-container').hide().empty();
  $('#qr-button').prop('disabled', false);
}

async function startQRAuth() {
  cleanupPolling();
  $('#qr-button').prop('disabled', true);
  $('#qr-container').hide().empty();
  $('#qr-status').show().html(RED._('yandex-commander-connect.qr.initializing')).css('color', 'black');

  try {
    const res: any = await $.post('/yandex-commander/auth/qr');

    // Display the SVG QR code from Yandex directly
    $('#qr-container').show().html(res.qrSvg);
    $('#qr-status').html(RED._('yandex-commander-connect.qr.scan_prompt'));

    // Poll status every 2 seconds
    activePollInterval = setInterval(async () => {
      try {
        const status: any = await $.post('/yandex-commander/auth/qr/status', { sessionId: res.sessionId });
        if (status.status === 'ok') {
          cleanupPolling();
          $('#node-config-input-token').val(status.token);
          $('#qr-container').hide();
          $('#qr-status').html(RED._('yandex-commander-connect.qr.token_received')).css('color', 'green');
          $('#qr-button').prop('disabled', false);
        }
      } catch {
        resetUI();
        $('#qr-status').html(RED._('yandex-commander-connect.qr.status_error')).css('color', 'red');
      }
    }, 2000);

    // 5 minute timeout
    activePollTimeout = setTimeout(() => {
      resetUI();
      $('#qr-status').html(RED._('yandex-commander-connect.qr.timeout')).css('color', 'red');
    }, 300000);
  } catch (err: any) {
    const msg = err?.responseJSON?.error || RED._('yandex-commander-connect.qr.unknown_error');
    const isCaptcha = msg.includes('капчи') || msg.includes('captcha') || msg.includes('Captcha');

    let html = `<span style="color: red;">${msg}</span>`;
    if (isCaptcha) {
      html += `<br><br><button type="button" id="qr-retry" class="red-ui-button" style="margin-top: 4px;">${RED._('yandex-commander-connect.qr.retry')}</button>`;
    }

    $('#qr-status').html(html);
    $('#qr-button').prop('disabled', false);

    if (isCaptcha) {
      $('#qr-retry').on('click', startQRAuth);
    }
  }
}
