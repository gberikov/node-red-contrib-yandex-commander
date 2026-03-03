# Нода IN

Ставится на старте flow и автоматически отправляет данные о текущем статусе колонки в "сыром" формате и Homekit.

## Full status Message ("сырой" формат)

Выдает данные без преобразования, то есть в том виде, в каком они получены от устройства. Структура сообщения:

```json
{
    "aliceState": "IDLE",
    "canStop": false,
    "hdmi": {
        "capable": true,
        "present": false
    },
    "playerState": {
        "duration": 180.91,
        "extra": {
            "coverURI": "avatars.yandex.net/get-music-content/2383988/de45408f.a.9039208-1/%%",
            "stateType": "music"
        },
        "hasNext": true,
        "hasPause": false,
        "hasPlay": false,
        "hasPrev": true,
        "hasProgressBar": true,
        "liveStreamText": "",
        "progress": 20,
        "showPlayer": true,
        "subtitle": "Крематорий",
        "title": "Мусорный ветер"
    },
    "playing": false,
    "timeSinceLastVoiceActivity": 30454,
    "volume": 0
}
```

Сообщения от устройства могут приходить по несколько штук в секунду, поэтому стоит подумать о необходимости поставить штатную ноду **RBE**, чтобы фильтровать дубликаты по контенту (название трека `payload.playerState.title`, имя исполнителя `payload.playerState.subtitle`).

## HomeKit formatted

Внутри выполняется преобразование выдаваемого формата под HomeKit и ноду можно стыковать прямо с homekit-нодой, в результате чего значительно упрощается flow. Юзкейсы можно найти в разделе [Примеры](Примеры).

Для homekit formatted выдачи имеются опции:
- **Unique messages** — отправляются только уникальные сообщения, без дубликатов.
- **Homekit format** — выбор вывода под разные устройства — Smart Speaker и Television. В [примерах использования](Примеры) описаны сценарии.

### Структура сообщения — Smart Speaker:

```json
{"CurrentMediaState": 0, "ConfiguredName": "International String Trio - Tarantella"}
```

### Структура сообщения — Television:

```json
{"Active": 1}
```

При использовании устройства Television появляется возможность использования "пульта" на iOS.
