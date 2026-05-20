# Usage examples

## Controlling device playback

There are several ways to control music playback on the stations.

### 1. From Node-RED

Send one of the following strings to the OUT node in Player Command mode: `play`, `stop`, `next`, `prev`, `forward`, `backward`. Examples ship with the plugin!

![simple player](/readme_images/simpleControl.png "simple player")

### 2. From ui-dashboard

Thanks to the [Node-Red on sprut.ai](https://t.me/SprutAI_NodeRED) community for providing the examples.

If the [dashboard](https://flows.nodered.org/node/node-red-dashboard) plugin isn't installed, install it first. Then import the example shipped with this node and the controls will appear at `/ui`.

![player](/readme_images/dashboardPlayer.png "player")
![player flow](/readme_images/dashboardPlayerFlow.png "player flow")

There is another variant from [@twocolors](https://github.com/twocolors), included in the examples. It can be added with a simple flow and looks great :)

![template player](/readme_images/dashboardTemplate.png "template player")
![template player flow](/readme_images/dashboardTemplateFlow.png "template player flow")

### 3. From HomeKit

The IN and GET nodes can output messages already formatted for HomeKit. You can prepare the message yourself, or just enable the relevant option inside the nodes.

It is wise to enable **Unique messages** on the IN node to avoid flooding HomeKit with identical messages.

The [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged) device list includes Smart Speaker. Out of the box, a simple flow lets you toggle playback on/off and display the current track. Requires iOS 14+ or macOS Big Sur+.

> The HomeKit-internal controls **do not work** — they haven't been wired into the HomeKit node yet.

To support older iOS/macOS versions, or to control playback from the built-in **Remote** in Control Center, build a flow on top of the HomeKit TV node, the IN node (in the appropriate format) and the OUT node. The OUT node in HomeKit format understands input from SmartSpeaker, Television, and both at once. Loop protection is built into the OUT node.

![homekit player](/readme_images/homekitPlayer.png "homekit player")
![ios remote](/readme_images/iosRemote.jpeg "ios remote")
