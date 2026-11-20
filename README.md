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

Try it on the frame over USB without deploying:

```sh
npm run build && npm run preview -- --port 4173
adb reverse tcp:4173 tcp:4173
adb shell am start -n com.wesbos.homehq/.MainActivity --es url http://localhost:4173/
```

## Deploy

Every push to `main` builds and deploys to GitHub Pages
(`.github/workflows/deploy.yml`). The app checks `version.json` every 5 minutes and reloads
itself when a new version is live, so the frame updates without touching it.

Point the frame at the deployed app once:

```sh
adb shell am start -n com.wesbos.homehq/.MainActivity --es url https://wojtas399.github.io/frame-app/
```

## Settings

URL query parameters override the defaults in `src/config.js`:

| Param | Default | Example |
| --- | --- | --- |
| `lat`, `lon` | Warsaw | `?lat=50.06&lon=19.94` |
| `place` | `Warsaw` | `&place=Kraków` |
| `locale` | `en-GB` | `&locale=pl-PL` |

Tap anywhere to refresh the weather now.
