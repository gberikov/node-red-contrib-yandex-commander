import { EditorNodeProperties, EditorRED } from 'node-red';

interface ConnectEditorNodeProperties extends EditorNodeProperties {
  debug: boolean;
}

interface ConnectEditorNodeCredentials {
  token: string;
}

declare const RED: EditorRED;

RED.nodes.registerType<ConnectEditorNodeProperties, ConnectEditorNodeCredentials>('yandex-commander-connect', {
  category: 'config',
  credentials: { token: { type: 'text' } },
  defaults: {
    name: { value: '' },
    debugFlag: { value: false }
  },
  label: function () {
    return this.name || 'YandexCommanderConnect';
  },
  oneditprepare: function () {
    const node = this;

    $('#oauth-button').on('click', function () {
      const username = ($('#oauth-username').val() as string) || '';
      const password = ($('#oauth-password').val() as string) || '';
      const captcha_key = ($('#oauth-captcha_key').val() as string) || '';
      const captcha_answer = ($('#oauth-captcha_answer').val() as string) || '';

      getOAuthToken(username, password, captcha_key, captcha_answer);
    });
  }
});

/**
 * Получает OAuth-токен Яндекса по логину и паролю.
 * Поддерживает CAPTCHA: при необходимости показывает картинку и повторяет запрос с ответом.
 */
function getOAuthToken(username: string, password: string, captcha_key: string, captcha_answer: string) {
  const oauthBaseUrl = 'https://oauth.yandex.com';
  const url = `${oauthBaseUrl}/token`;
  const clientId = '23cabbbdc6cd418abb4b39c32c41195d';
  const clientSecret = '53bc75238f0c4d08a118e51fe9203300';

  $('#oauth-status').show();
  $('#oauth-status').html('Waiting ...').css('color', 'black');
  $('#oauth-captcha').hide();
  $('#oauth-captcha_key, #oauth-captcha_answer').val('');

  if (!username || !password) {
    $('#oauth-status').html('Empty username or password').css('color', 'red');
    return;
  }

  let data: any = {
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: username,
    password: password
  };

  if (captcha_key && captcha_answer) {
    data = { ...data, captcha_key, captcha_answer };
  }

  $.post(url, data)
    .done(function (res: any) {
      if (res.access_token) {
        $('#oauth-status').html('Success').css('color', 'black');
        $('#node-config-input-token').val(res.access_token);
        $('#oauth-username, #oauth-password').val('');
      }
    })
    .fail(function (res: any) {
      if (res.responseJSON.error_description.match(/not valid/gi)) {
        const str = `${res.responseJSON.error_description} (more <a href='https://github.com/AlexxIT/YandexStation/issues/103' target='_blank'>issues/103</a>)`;
        $('#oauth-status').html(str).css('color', 'red');
      } else if (res.responseJSON.error_description.match(/CAPTCHA/gi)) {
        const str = `<img src='${res.responseJSON.x_captcha_url}'>`;
        $('#oauth-status').html(str);
        $('#oauth-captcha').show();
        $('#oauth-captcha_key').val(res.responseJSON.x_captcha_key);
      } else if (res.responseJSON.error_description) {
        $('#oauth-status').html(res.responseJSON.error_description).css('color', 'red');
      }
    });
}
