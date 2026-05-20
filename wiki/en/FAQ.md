# FAQ

**Q: How do I get an OAuth token?**

A: One option — https://music-yandex-bot.ru
- Enter your login and password
- A "Go to bot" button appears — do NOT click it; copy its link instead
- Everything after `&start=` in the link is the token

---

**Q: How do I get the track artwork?**

A: The artwork URL is available inside the status message: `payload.playerState.extra.coverURI`

Prefix it with `https://` and replace `%%` at the end with the size you need, e.g. `600x600`:

```
https://avatars.yandex.net/get-music-content/2383988/de45408f.a.9039208-1/600x600
```

---

**Q: How do I find a station's ID?**

This is useful for distinguishing between multiple stations.

A: Yandex app on your phone → Devices → Device management → Select the station → Additional information

---

**Q: Why doesn't the track title in HomeKit update right after switching tracks?**

A: This is expected. The track is displayed via the device name, and name changes in HomeKit have the lowest priority — they're updated only after statuses and states.

---

**Q: The HomeKit controls are greyed out and don't work**

A: When using the Smart Speaker device type — correct, they don't work there. If someone manages to make them active, please open an issue so others can benefit.

An alternative is the TV device type paired with a remote, which behaves like an AppleTV. There is an example inside [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged).

---

**Q: After starting Node-RED, the device(s) are not visible**

A: This happens when no devices are found on the network. The zeroconf protocol used for discovery returns inconsistent results — one search in five can finish with no devices.

The fix is simple — wait a couple of minutes; a repeat search will pick up the missing devices.

---

**Q: How do I import an example shipped with the node?**

A: In the Node-RED menu choose **Import**, then **Examples**. The plugin's folder contains all the examples.

---

The station control commands were taken from [here](https://documenter.getpostman.com/view/525400/SWLfd8et?version=latest#37dc6369-9a03-4ea2-a678-c8770f21b6cb). Thanks to the author.
