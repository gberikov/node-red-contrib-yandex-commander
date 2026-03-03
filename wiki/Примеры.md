# Примеры использования

## Управление воспроизведением устройства

Есть ряд способов управления воспроизведением музыки на колонках.

### 1. Из Node-RED

В ноду OUT в режиме Player Command надо отправлять в виде строки одну из команд: `play`, `stop`, `next`, `prev`, `forward`, `backward`. Примеры идут вместе с плагином!

![simple player](/readme_images/simpleControl.png "simple player")

### 2. Из ui-dashboard

Благодарю участников сообщества [Node-Red на sprut.ai](https://t.me/SprutAI_NodeRED) за подготовку примеров.

Если плагин с [дашбордом](https://flows.nodered.org/node/node-red-dashboard) не стоит, его надо поставить. После этого импортировать пример из ноды и по адресу `/ui` найдутся элементы управления.

![player](/readme_images/dashboardPlayer.png "player")
![player flow](/readme_images/dashboardPlayerFlow.png "player flow")

Есть еще один вариант от [@twocolors](https://github.com/twocolors), в примерах. Добавляется простым flow и выглядит отлично)

![template player](/readme_images/dashboardTemplate.png "template player")
![template player flow](/readme_images/dashboardTemplateFlow.png "template player flow")

### 3. Из Homekit

Ноды IN и GET имеют возможность выдачи сообщений в готовом для Homekit формате. Можно самостоятельно подготовить сообщение к отправке в Homekit, а можно просто воспользоваться нужной настройкой внутри нод.

Разумным будет установка галки **Unique messages** для IN-ноды, чтобы не заваливать Homekit одинаковыми сообщениями.

В списке устройств [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged) есть Smart Speaker. Из коробки с помощью простого flow можно управлять состоянием вкл-выкл воспроизведения и видеть название трека. Работает только на iOS 14+ или macOS Big Sur+.

> Элементы управления внутри Homekit **не работают**, их еще не завезли в Homekit-ноду.

Если требуется работать на старых версиях iOS/macOS или надо управлять воспроизведением со штатного инструмента **Пульт** из панели управления, то можно собрать flow на базе homekit-нод TV, ноды IN в соответствующем формате и OUT. При этом OUT-нода в Homekit-формате умеет "понимать" вход от SmartSpeaker, Television и обоих вместе. Проверка сообщений на зацикливание встроена в ноду OUT.

![homekit player](/readme_images/homekitPlayer.png "homekit player")
![ios remote](/readme_images/iosRemote.jpeg "ios remote")
