# RAW commands

Complete reference for the JSON commands that can be sent through the OUT node in RAW Command mode.

> **Tip:** the `playMusic` command (items 6–8) has also been available without RAW mode since 0.3.0 — see the [Play Music](OUT-Node#play-music) section of the OUT node.

## 1. Seek to position (in seconds)
```json
{
    "command": "rewind",
    "position": 120
}
```

## 2. Resume playback
```json
{
    "command": "play"
}
```

## 3. Stop playback
```json
{
    "command": "stop"
}
```

## 4. Previous track
```json
{
    "command": "prev"
}
```

## 5. Next track
```json
{
    "command": "next"
}
```

## 6. Play artist by ID
```json
{
    "command": "playMusic",
    "id": "2",
    "type": "artist"
}
```

## 7. Play track by ID
```json
{
    "command": "playMusic",
    "id": "44731403",
    "type": "track"
}
```

## 8. Play playlist by ID
```json
{
    "command": "playMusic",
    "id": "44731403:1234556",
    "type": "playlist"
}
```

## 9. Set volume (range 0–1)
```json
{
    "command": "setVolume",
    "volume": 0.2
}
```

## 10. Play radio
```json
{
    "command": "playRadio",
    "id": "detskoe"
}
```

## 11. Repeat mode
Values: `"One"` / `"All"` / `"None"`
```json
{
    "command": "repeat",
    "mode": "One"
}
```

## 12. Shuffle mode
Takes effect when there is a queue (playlist, album, or artist).
```json
{
    "command": "shuffle",
    "enable": true
}
```

## 13. Alice visual state
Force the state: `"LISTENING"` / `"BUSY"` / `"IDLE"`
```json
{
    "command": "showAliceVisualState",
    "aliceStateName": "LISTENING",
    "recognizedPhrase": ""
}
```

## 14. Send text for TTS
> **No longer works!**
```json
{
    "command": "sendText",
    "text": "Повторяй за мной 'Текст'"
}
```

## 15. Send a voice command
```json
{
    "command": "sendText",
    "text": "Включи музыку"
}
```

## 16. Interrupt "listening" after TTS
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "on_suggest"
    }
}
```

## 17. TTS with special effects (raw mode)
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

### Modifiers for the `value` field

**Voice selection** ([documentation](https://cloud.yandex.com/en-ru/docs/speechkit/tts/voices)):
```
<speaker voice='kostya'>смелость sil <[500]> город+а берёт
```

Supported voices: jane, oksana, omazh, zahar, ermil, levitan, ermilov, silaerkan, kolya, kostya, nastya, sasha, nick, erkanyavas, zhenya, tanya, anton_samokhvalov, tatyana_abramova, voicesearch, ermil_with_tuning, robot, dude, zombie, smoky, alyss, nick.
([Source](https://github.com/tayanov/Yandex-tts-speechkit-FIX/blob/master/custom_components/yandextts/tts.py))

**Speech tuning** ([documentation](https://yandex.ru/dev/dialogs/alice/doc/speech-tuning-docpage/)):
```
смелость sil <[500]> город+а берёт
```

**Voice effects** ([documentation](https://yandex.ru/dev/dialogs/alice/doc/speech-effects-docpage/)):
```
<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак
```

**Sound library** ([documentation](https://yandex.ru/dev/dialogs/alice/doc/sounds-docpage/)):
```
<speaker audio='alice-sounds-game-win-1.opus'>У вас получилось!
```

**Whisper:**
```
<speaker is_whisper="true">Я говорю тихо-тихо!
```

**Combining effects:**
```
<speaker voice='kostya' audio='alice-sounds-game-win-1.opus' effect='megaphone'>добро пожаловать
```

## 18. Car-style greeting
Briefly reports the weather and traffic.
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

## 19. Bluetooth on/off

**On:**
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

**Off:**
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

## Example: multiple RAW commands in a single message

Stop the music and speak a phrase at volume 0.8:

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
