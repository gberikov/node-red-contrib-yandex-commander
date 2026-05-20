# RAW-команды

Полный справочник JSON-команд, которые можно отправлять через ноду OUT в режиме RAW Command.

## 1. Перемотка на позицию (в секундах)
```json
{
    "command": "rewind",
    "position": 120
}
```

## 2. Продолжить воспроизведение
```json
{
    "command": "play"
}
```

## 3. Остановка воспроизведения
```json
{
    "command": "stop"
}
```

## 4. Предыдущий трек
```json
{
    "command": "prev"
}
```

## 5. Следующий трек
```json
{
    "command": "next"
}
```

## 6. Включить исполнителя по ID
```json
{
    "command": "playMusic",
    "id": "2",
    "type": "artist"
}
```

## 7. Включить трек по ID
```json
{
    "command": "playMusic",
    "id": "44731403",
    "type": "track"
}
```

## 8. Включить плейлист по ID
```json
{
    "command": "playMusic",
    "id": "44731403:1234556",
    "type": "playlist"
}
```

## 9. Установка громкости (диапазон 0–1)
```json
{
    "command": "setVolume",
    "volume": 0.2
}
```

## 10. Включить радио
```json
{
    "command": "playRadio",
    "id": "detskoe"
}
```

## 11. Режим повтора
Значения: `"One"` / `"All"` / `"None"`
```json
{
    "command": "repeat",
    "mode": "One"
}
```

## 12. Режим вразброс (shuffle)
Срабатывает, когда есть очередь треков (включен плейлист, альбом, артист).
```json
{
    "command": "shuffle",
    "enable": true
}
```

## 13. Режим индикации Алисы
Принудительно включить: `"LISTENING"` / `"BUSY"` / `"IDLE"`
```json
{
    "command": "showAliceVisualState",
    "aliceStateName": "LISTENING",
    "recognizedPhrase": ""
}
```

## 14. Отправить текст для TTS
> **Больше не работает!**
```json
{
    "command": "sendText",
    "text": "Повторяй за мной 'Текст'"
}
```

## 15. Отправить голосовую команду
```json
{
    "command": "sendText",
    "text": "Включи музыку"
}
```

## 16. Прервать "слушание" после TTS
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "on_suggest"
    }
}
```

## 17. TTS со спецэффектами (raw режим)
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "update_form",
        "payload": {
            "form_update": {
                "name": "personal_assistant.scenarios.repeat_after_me",
                "slots": [
                    {
                        "type": "string",
                        "name": "request",
                        "value": "<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак"
                    }
                ]
            },
            "resubmit": true
        }
    }
}
```

### Модификаторы для поля `value`

**Изменение голоса** ([документация](https://cloud.yandex.com/en-ru/docs/speechkit/tts/voices)):
```
<speaker voice='kostya'>смелость sil <[500]> город+а берёт
```

Поддерживаемые голоса: jane, oksana, omazh, zahar, ermil, levitan, ermilov, silaerkan, kolya, kostya, nastya, sasha, nick, erkanyavas, zhenya, tanya, anton_samokhvalov, tatyana_abramova, voicesearch, ermil_with_tuning, robot, dude, zombie, smoky, alyss, nick.
([Источник](https://github.com/tayanov/Yandex-tts-speechkit-FIX/blob/master/custom_components/yandextts/tts.py))

**Настройка генерации речи** ([документация](https://yandex.ru/dev/dialogs/alice/doc/speech-tuning-docpage/)):
```
смелость sil <[500]> город+а берёт
```

**Наложение эффектов на голос** ([документация](https://yandex.ru/dev/dialogs/alice/doc/speech-effects-docpage/)):
```
<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак
```

**Библиотека звуков** ([документация](https://yandex.ru/dev/dialogs/alice/doc/sounds-docpage/)):
```
<speaker audio='alice-sounds-game-win-1.opus'>У вас получилось!
```

**Шепот:**
```
<speaker is_whisper="true">Я говорю тихо-тихо!
```

**Совмещение эффектов:**
```
<speaker voice='kostya' audio='alice-sounds-game-win-1.opus' effect='megaphone'>добро пожаловать
```

## 18. Приветствие как в автомобиле
Кратко скажет погоду и пробки.
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "update_form",
        "payload": {
            "form_update": {
                "name": "personal_assistant.automotive.greeting"
            },
            "resubmit": true
        }
    }
}
```

## 19. Bluetooth вкл/выкл

**Включить:**
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "update_form",
        "payload": {
            "form_update": {
                "name": "personal_assistant.scenarios.bluetooth_on"
            },
            "resubmit": true
        }
    }
}
```

**Выключить:**
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "update_form",
        "payload": {
            "form_update": {
                "name": "personal_assistant.scenarios.bluetooth_off"
            },
            "resubmit": true
        }
    }
}
```

## Пример: несколько RAW-команд в одном сообщении

Остановить проигрывание музыки и сказать текст громкостью 0.8:

```json
[
    {"command": "stop"},
    {
        "command": "serverAction",
        "serverActionEventPayload": {
            "type": "server_action",
            "name": "on_suggest"
        }
    },
    {"command": "setVolume", "volume": 0.8},
    {
        "command": "serverAction",
        "serverActionEventPayload": {
            "type": "server_action",
            "name": "update_form",
            "payload": {
                "form_update": {
                    "name": "personal_assistant.scenarios.repeat_after_me",
                    "slots": [
                        {
                            "type": "string",
                            "name": "request",
                            "value": "<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак"
                        }
                    ]
                },
                "resubmit": true
            }
        }
    }
]
```
