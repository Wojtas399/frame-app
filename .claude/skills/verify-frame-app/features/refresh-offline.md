# Refresh and offline

Tapping anywhere fetches fresh weather right away. The bottom-right status line says when the data was last updated. If the network drops, the frame keeps showing the last data and the status turns red, saying which data time it is showing. After a reboot with no network, the frame starts from the cached forecast instead of a blank screen.

## Sub-features

- `refresh-tap`: a tap anywhere sends a new Open-Meteo request and the status reads `Updated HH:MM`.
- `status-updated`: after a successful load, `#status` is `Updated HH:MM` without class `error`.
- `offline-keep`: if a refresh fails while data is shown, the panels stay and `#status` is `Offline · showing HH:MM data` with class `error`.
- `cached-start`: a fresh load with Open-Meteo unreachable renders the cached forecast for the same `lat`/`lon` and shows the offline status.
- `no-data`: with no cache and no network, `#status` is `Waiting for weather…` and the panels are empty.

## How to get to it (user POV)

- Tap anywhere on the frame.
- Lose Wi-Fi while the frame is running, or reboot it without Wi-Fi.

## Driving it with cdp.mjs

Preconditions: baseline. The status reads `Updated …`.

- **Tap to refresh.** Count the Open-Meteo requests so far, tap a tile, and wait for one more to finish. The status already reads `Updated` before the tap, so waiting on it alone proves nothing. Run `node $S/cdp.mjs "$RUN" screenshot refresh/before.png -- eval "window.__n = performance.getEntriesByType('resource').filter(e => e.name.includes('api.open-meteo.com')).length" -- tap '#days' -- wait "performance.getEntriesByType('resource').filter(e => e.name.includes('api.open-meteo.com')).length > window.__n && document.getElementById('status').textContent.startsWith('Updated')" -- screenshot refresh/after-tap.png`. Then `tail -2 $RUN/evidence/network.log` shows a new `REQ`/`RESP 200` pair for `api.open-meteo.com` timestamped at the tap.
- **Offline keep.** Drop the network and tap. Run `node $S/cdp.mjs "$RUN" offline on -- tap '.clock' -- wait "document.getElementById('status').textContent.startsWith('Offline')" -- eval "[document.getElementById('status').textContent, document.getElementById('status').className, document.querySelectorAll('#hours .hour').length]" -- screenshot refresh/offline.png`. The result is `["Offline · showing HH:MM data", "status error", 8]`, and `network.log` has `FAIL … net::ERR_INTERNET_DISCONNECTED`.
- **Cached start.** Block Open-Meteo and reload. Run `node $S/cdp.mjs "$RUN" block '*api.open-meteo.com*' -- open / -- wait "document.getElementById('status').textContent.startsWith('Offline')" -- eval "document.querySelectorAll('#days .day').length" -- screenshot refresh/cached-start.png`. The result is `5`, and `network.log` has a `FAIL … (inspector)` line.
- **No data.** Use a location with no cache. Run `node $S/cdp.mjs "$RUN" block '*api.open-meteo.com*' -- open '/?lat=1&lon=1' -- wait "document.getElementById('status').textContent === 'Waiting for weather…'" -- eval "document.getElementById('now').children.length" -- screenshot refresh/no-data.png`. The result is `0`.

## Gotchas

- `offline on` also cuts the Vite dev server, so don't `open` while offline. Use `block` for reload journeys.
- `offline` and `block` reset when the `cdp.mjs` invocation ends. Keep the failing step in the same chain.
- After a failure the app retries every 60 s, and after success it refreshes every 15 min. A long chain can see an automatic request in `network.log` that is not from your tap. Match by timestamp.
- The status time is in the location's timezone, not the Mac's.
