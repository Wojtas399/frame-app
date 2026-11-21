---
name: verify-frame-app
description: Launch and drive the frame-app clock, weather and calendar dashboard (a single-page web app for a 1280x800 photo frame) in an isolated headless Chrome, and capture screenshots, page text, and network and console logs as proof. Use it to confirm a change to the clock, weather panels, calendar view, URL settings, tap-to-refresh, offline fallback or auto-update works in the real app, not just in a build.
---

# Verify frame-app

frame-app is one page (`index.html` + `src/`) that shows a clock, current weather, 8 hourly and 5 daily forecasts from Open-Meteo (live, no API key). With `cal-` URL params it also has a 7-day calendar view, fed by fixture files in `fixtures/` here. Its user inputs are a tap anywhere (refreshes the weather), the calendar's view pill and account selector, and URL query params. The real target is a WebView 107 kiosk on an Android photo frame. This skill drives desktop Chrome at the same 1280x800 viewport instead. Reaching the physical frame needs `npm run frame` with the frame on USB (adb), which agents cannot assume. Say so when a change depends on WebView 107 behaviour.

All helpers live in `.claude/skills/verify-frame-app/scripts/`. Run them from the repo root:

```sh
S=.claude/skills/verify-frame-app/scripts
```

## Launch

```sh
$S/launch.sh dev        # Vite dev server on the working tree (most features)
$S/launch.sh preview    # vite build + vite preview of the build (auto-update needs this)
```

Each launch gets its own run dir, free ports, and a fresh Chrome profile (empty localStorage), so several runs can go side by side and none touches the user's `npm run dev` on 5173. It runs `npm ci` itself if `node_modules` is missing. It is ready when it prints `ready: …` and then `RUN=<dir>` as its last line. Before printing that, it has loaded the page in Chrome and waited for the status line to read `Updated HH:MM`, which means a live Open-Meteo fetch succeeded and rendered. Capture the run dir:

```sh
OUT=$($S/launch.sh dev) && RUN=${OUT##*RUN=}
```

Runs go under `~/.cache/verify-frame-app/<timestamp>-<pid>/` (override with `VERIFY_FRAME_ROOT`). Chrome defaults to `/Applications/Google Chrome.app` (override with `CHROME`). A non-zero exit means not ready. The message names the log to read (`$RUN/state/vite.log`, `chrome.log`, `build.log`). Run cleanup anyway.

## Doctor

```sh
$S/doctor.sh "$RUN"
```

Read-only. It checks that the vite and Chrome PIDs from this run are alive, that the app port is owned by our vite, that the page serves `<title>Frame</title>`, that CDP answers, that `HEAD` has not moved since launch, and that Open-Meteo is reachable. It also prints the page's status line. It exits non-zero on any `FAIL`. Run it first whenever a drive step behaves oddly. A `FAIL` on Open-Meteo means weather features cannot be proven from this machine. Report that rather than mocking around it.

## Drive

```sh
node $S/cdp.mjs "$RUN" <command> [args] -- <command> [args] -- ...
```

Commands run in order over one CDP session:

| Command | Does |
| --- | --- |
| `open <path\|url>` | navigate (path relative to the app, e.g. `'/?place=Kraków'`), wait for load |
| `wait <js-expr> [ms]` | poll until truthy (default 10000 ms). Use this, not `sleep`, to wait for state. Wait for a change, not for a state that was already true |
| `eval <js-expr>` | print the JSON value. For reading DOM state only, never to call app functions |
| `tap <css>` | real mouse press and release at the element's centre (the user's tap) |
| `text [file]` | `innerText` of the page, which is the visible view |
| `screenshot <file>` | 1280x800 PNG |
| `offline on\|off` | emulate the frame losing Wi-Fi |
| `block <pattern>` | fail matching requests, e.g. `'*api.open-meteo.com*'` |
| `sleep <ms>` | fixed pause (only when proving a timer) |

`offline` and `block` last only for that one invocation, so chain them with the steps that need them. Relative file paths land in `$RUN/evidence/`.

Stable handles (ids from `index.html` and classes `src/main.js` renders):

- `#date`, `#time`, `#seconds`, `#place`: the clock
- `#now`: current conditions. Inside it are `.now-temp`, `.now-label`, `.now-range` and `.now-details` (Feels like, Wind, Humidity, Sun)
- `#hours .hour` (8 of them): `.hour-time`, `.hour-temp`, `.rain` (`.rain.likely` when ≥30%)
- `#days .day` (5 of them, starting tomorrow): `.day-name`, `.day-temps .hi`, `.day-temps .lo`, `.rain`
- `#status`: `Updated HH:MM`, `Offline · showing HH:MM data` or `Waiting for weather…`. It has class `error` when not updated
- localStorage key `weather-v1`: the cached Open-Meteo response
- `#view-toggle`: the pill that swaps views. It reads `Calendar` or `Weather`, and it is hidden without a `cal-` param. `document.body.dataset.view` is `weather` or `calendar`, and unset without a `cal-` param
- `#cal-accounts .cal-option[data-account=private|business|all]`: the selector (only with both params). The selected one has class `on`
- `#cal-date`, `#cal-time`: the calendar header
- `#cal-days .cal-day` (7 of them, starting today): `.cal-day-name`, then `.cal-events` holding `.cal-chip` (all-day), `.cal-event` with `.cal-event-time` (timed), or `.cal-free`. Each event's `style` sets `--c` to its account colour
- `#cal-status`: `Updated HH:MM`, `Offline · showing HH:MM data`, `<Account> calendar failed[ · showing HH:MM data]` or `Waiting for calendar…`. It has class `error` when not updated
- localStorage keys `calendar-v1` (the last good feed per account) and `calendar-view-v1` (`{ view, selected }`)

Example (tap to refresh, then the frame loses Wi-Fi):

```sh
N="performance.getEntriesByType('resource').filter(e => e.name.includes('api.open-meteo.com')).length"
node $S/cdp.mjs "$RUN" screenshot refresh/before.png -- eval "window.__n = $N" \
  -- tap '#days' -- wait "$N > window.__n && document.getElementById('status').textContent.startsWith('Updated')" \
  -- offline on -- tap '.clock' -- wait "document.getElementById('status').textContent.startsWith('Offline')" \
  -- text refresh/offline.txt -- screenshot refresh/offline.png
```

The feature map in [`features/README.md`](features/README.md) has the recipe for each feature. Read it before proving one, and cover every entry point it lists.

## Evidence

Everything goes to `$RUN/evidence/`, which survives cleanup:

- your screenshots and `text` dumps, in a subfolder per feature
- `network.log`: every Open-Meteo, `version.json` and calendar feed request, its status, and any failure (`net::ERR_INTERNET_DISCONNECTED`, `blockedReason`). Appended automatically
- `console.log`: console messages and uncaught page errors. Appended automatically

Proof standards:

- Drive the real user path: a `tap`, a URL with query params, a new build. Never call `refreshWeather()` or write the DOM from `eval`.
- Capture the action and the result: a before and an after screenshot or text, plus the `network.log` lines that show the request the action caused.
- Check side effects next to the pixels. A refresh must add an Open-Meteo `REQ`/`RESP` pair. A cache claim must show `weather-v1` in localStorage (`eval "localStorage.getItem('weather-v1') !== null"`).
- Weather is live. Assert structure and consistency (8 hours, 5 days, a status that matches what happened), not specific temperatures.
- `offline` and `block` stand in for the frame's Wi-Fi dropping, which is a real production boundary. Don't intercept Open-Meteo to inject fake forecasts. If a journey needs specific weather (snow, storms), say it can't be forced live and report it unproven.
- Check `console.log` for `EXCEPTION` lines. In dev, `[vite] connecting…` lines and a `TypeError: Failed to fetch` while offline are expected.

## Cleanup

```sh
$S/cleanup.sh "$RUN"
```

It stops only the vite and Chrome PIDs this run recorded, after confirming each command line still belongs to this run. It then deletes `$RUN/state` (profile, build, logs) and prints the evidence path it kept. It never kills by name. Run it after every launch, including failed ones. To get rid of old evidence, the user can delete `~/.cache/verify-frame-app/<run>`.

## Helpers

- `scripts/launch.sh [dev|preview]`: start the instance, print `RUN=`
- `scripts/doctor.sh <RUN>`: read-only health check
- `scripts/cdp.mjs <RUN> <cmd> …`: drive and capture (Node ≥ 22 for the built-in `WebSocket`)
- `scripts/cleanup.sh <RUN>`: tear down, keep evidence
