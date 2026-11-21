# Clock

The left half of the frame shows the date, a large 24-hour `HH:MM` with smaller seconds, and the place name. It ticks every second and follows the weather location's timezone, not the device's, so it is right even when the frame's clock zone is wrong.

## Sub-features

- `clock-tick`: `#seconds` advances every second and `#time` rolls over on the minute.
- `clock-format`: `#time` is 24-hour `HH:MM`, `#seconds` is two digits, and `#date` is weekday, day and month in the locale.
- `clock-timezone`: once weather has loaded, the time is the location's local time.
- `clock-place`: `#place` shows the configured place name.

## How to get to it (user POV)

- Look at the frame. There is nothing to press.
- Change the location or locale through the URL (see [URL settings](./url-settings.md)).

## Driving it with cdp.mjs

Preconditions: baseline. The status reads `Updated …`.

- **Ticks.** Read the seconds twice, about 2 s apart. Run `node $S/cdp.mjs "$RUN" eval "document.getElementById('seconds').textContent" -- sleep 2100 -- eval "document.getElementById('seconds').textContent"`. The two values differ and are both two digits.
- **Format.** Run `node $S/cdp.mjs "$RUN" eval "[document.getElementById('time').textContent, document.getElementById('date').textContent]"`. The time matches `^\d{2}:\d{2}$`. With `en-GB` the date looks like `Saturday 21 November`.
- **Timezone.** Open a location in another zone. Run `node $S/cdp.mjs "$RUN" open '/?lat=40.71&lon=-74.01&place=New%20York&locale=en-US' -- wait "document.getElementById('status').textContent.startsWith('Updated')" -- eval "[document.getElementById('time').textContent, document.getElementById('date').textContent]"`. Compare with `TZ=America/New_York date +%H:%M`. The hours match (they will not match the Mac's local time). The date reads like `Saturday, November 21`.
- **Proof.** Run `node $S/cdp.mjs "$RUN" screenshot clock/new-york.png -- text clock/new-york.txt`.

## Gotchas

- Before the first weather response arrives (fresh profile, or Open-Meteo blocked with no cache), the clock uses the browser's zone. Wait for `Updated` before asserting the timezone.
- The cache is keyed on `lat`/`lon`, so the zone comes from cached weather until the refresh lands.
- A reading taken at :59 can roll over between two evals. Retry rather than loosening the assertion.
