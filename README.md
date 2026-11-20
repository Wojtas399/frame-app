# frame-app

A clock and weather dashboard for a 10.1" 1280×800 photo frame (Wozinsky WRC-32, Android 6,
WebView 107) running the [Home HQ kiosk](https://github.com/wesbos/photo-frame-dashboard/tree/main/dashboard/kiosk).

Weather comes from [Open-Meteo](https://open-meteo.com/), which needs no API key. The clock
uses the weather location's timezone, so it is correct even if the frame's own timezone is wrong.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
```

## Hosting on the home network

The app is served from a Mac on the same Wi-Fi as the frame; it is not on the internet.

```sh
npm run build                 # writes dist/, including version.json
scripts/install-server.sh     # serves dist/ on port 8080 at every login (log: ~/Library/Logs/frame-app.log)
```

Point the frame at the Mac once (use the Mac's current IP):

```sh
adb shell am start -n com.wesbos.homehq/.MainActivity --es url http://192.168.100.6:8080/
```

**Updating:** run `npm run build`. The server picks up the new `dist/` straight away, and the
app checks `version.json` every 5 minutes and reloads itself when it changes.

**Keep in mind:**

- The Mac must be awake. While it sleeps the frame keeps showing the last page it loaded,
  but cannot reload.
- The frame uses the Mac's IP address (Android 6 cannot resolve `.local` names). Reserve the
  IP for the Mac in the router's DHCP settings so it doesn't change.
- `scripts/install-server.sh --uninstall` removes the background service. If you switch Node
  versions with nvm, run the install script again.

## Settings

URL query parameters override the defaults in `src/config.js`:

| Param | Default | Example |
| --- | --- | --- |
| `lat`, `lon` | Warsaw | `?lat=50.06&lon=19.94` |
| `place` | `Warsaw` | `&place=Kraków` |
| `locale` | `en-GB` | `&locale=pl-PL` |

Tap anywhere to refresh the weather now.
