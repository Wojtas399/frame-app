# Night mode

A **Night** pill (`Noc` in Polish) sits in the top-left corner, right of the view pill, in every view and also without `cal-` params. A tap on it blacks out the screen and shows only the time (`HH:MM`, no seconds, no date) in dim grey in the middle. Between 22:00 and 06:00 in the weather location's timezone, the page does the same by itself after 2 minutes without a tap. A tap anywhere wakes it and, through the tap-anywhere listener, refreshes the weather. At night a woken frame dims again after 2 more idle minutes. Outside those hours it never dims by itself.

## Sub-features

- `night-manual`: a tap on `#night-button` sets `data-night` on `body` and shows `#night`. That tap does not refresh the weather.
- `night-screen`: `#night` is black (`rgb(0, 0, 0)`) with `#night-time` in `rgb(69, 74, 85)`. Everything else is hidden, so a `text` dump is only `HH:MM`.
- `night-wake`: a tap anywhere removes `data-night`, the view the frame was in comes back, and an Open-Meteo forecast request follows.
- `night-auto`: between 22:00 and 06:00 in the weather location's timezone, 2 minutes after the last tap (a `pointerdown` anywhere, dialogs included), `data-night` is set by itself and any open dialog closes.
- `night-day`: from 06:00 to 22:00 the page never sets `data-night` by itself.

## How to get to it (user POV)

- Tap **Night** at the top left.
- Leave the frame alone at night for 2 minutes.
- Tap anywhere on the dim screen.

## Driving it with cdp.mjs

Preconditions: baseline. For the calendar view, the fixtures and `$Q` from [calendar.md](./calendar.md).

```sh
N="performance.getEntriesByType('resource').filter(e => e.name.includes('api.open-meteo.com/v1/forecast')).length"
ST="[document.body.hasAttribute('data-night'), Math.round(performance.now() / 1000), document.getElementById('time').textContent, document.getElementById('place').textContent]"
```

- **Manual, dashboard.** Run `node $S/cdp.mjs "$RUN" open '/?locale=pl-PL' -- wait "document.getElementById('status').textContent.startsWith('Zaktualizowano')" -- eval "window.__n = $N" -- tap '#night-button' -- wait "document.body.hasAttribute('data-night')" -- eval "$N - window.__n" -- screenshot night/weather-night.png -- text night/weather-night.txt -- tap '#night' -- wait "!document.body.hasAttribute('data-night') && $N > window.__n && document.getElementById('status').textContent.startsWith('Zaktualizowano')" -- screenshot night/weather-woken.png`. The first eval is `0`, `weather-night.txt` is one line `HH:MM`, and `network.log` has a forecast `REQ`/`RESP 200` pair at the waking tap.
- **Manual, calendar.** The same from `open "$Q"` with the calendar shown (`document.body.dataset.view === 'calendar'`, tap `#view-toggle` first if not) and `Updated` in the waits. After the waking tap the view is still `calendar`.
- **Placement.** Eval `['#night-button', '#view-toggle', '.now', '.date', '.cal-spans'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON())` in each view. The pill ends left of `.cal-spans` and above `.date`, and without a `cal-` param it sits at `left: 38`.
- **Auto at night.** Pick a city where it is now between 22:00 and 06:00 through the [location](./location.md) picker (Tokyo is UTC+9, so 13:00–21:00 UTC), then run `node $S/cdp.mjs "$RUN" sleep 105000 -- eval "$ST" -- wait "document.body.hasAttribute('data-night')" 30000 -- eval "$ST" -- screenshot night/auto.png -- tap '#night' -- wait "!document.body.hasAttribute('data-night')" -- eval "window.__w = performance.now()" -- sleep 105000 -- eval "document.body.hasAttribute('data-night')" -- wait "document.body.hasAttribute('data-night')" 30000 -- eval "Math.round((performance.now() - window.__w) / 1000)"`. The first `$ST` is `false` at about 105 s after the picker's reload, the second `true` at about 120 s, the third eval `false`, and the last about `120`.
- **Never by day.** Pick a city where it is now between 06:00 and 22:00, then run `node $S/cdp.mjs "$RUN" sleep 150000 -- eval "$ST"`. The result starts with `false`.

## Gotchas

- `performance.now()` restarts at the picker's reload, which is also when the idle clock starts, so it measures the idle time directly.
- Any `tap`, `type` or `open` restarts the 2 minutes. `eval`, `wait`, `sleep`, `text` and `screenshot` do not touch the page.
- Before the first weather response the hours follow the browser's timezone, as the clock does.
- The `location-v1` the picker saves outlives the run's reloads, so pick Warsaw again or launch a fresh run before other recipes.
- An open dialog closing on auto dim cannot be seen in practice, because every dialog closes itself after a minute without a tap, before the 2 minutes are up.
