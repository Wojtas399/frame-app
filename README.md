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

## Debug on the frame

With the frame on USB and on the same Wi-Fi as the Mac:

```sh
npm run frame
```

This points the frame at the Mac's Vite dev server: saving a file updates the frame within
seconds. Chrome DevTools for the page are at `chrome://inspect/#devices` in Chrome on the Mac
(console, network, element inspector, screencast). Ctrl+C stops the server; the frame keeps the
last page until it is pointed somewhere else.

## Settings

URL query parameters override the defaults in `src/config.js`:

| Param | Default | Example |
| --- | --- | --- |
| `lat`, `lon` | Warsaw | `?lat=50.06&lon=19.94` |
| `place` | `Warsaw` | `&place=Kraków` |
| `locale` | `en-GB` | `&locale=pl-PL` |

Tap anywhere to refresh the weather now.
