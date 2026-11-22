# frame-app verification map

This directory is the maintained source for verifying what a viewer of the frame sees and does. Read this index, then use the matching feature file as the recipe. `S`, `RUN` and the commands come from [`../SKILL.md`](../SKILL.md).

## Baseline preconditions

- A run started with `$S/launch.sh dev` (or `preview` where a feature says so), with `RUN` captured from its last line.
- `$S/doctor.sh "$RUN"` exits 0, which includes Open-Meteo being reachable.
- The page has a fresh profile. Its localStorage starts empty and the default location is Warsaw (`52.2297, 21.0122`, locale `en-GB`).
- Never drive an instance this run did not launch, and never drive the user's own `npm run dev` on port 5173.

## Driving conventions

- Every action goes through `node $S/cdp.mjs "$RUN" …`. Chain steps that need `offline` or `block` into one invocation.
- Wait for state with `wait <expr>`, never a fixed `sleep`, except when the thing being proven is a timer.
- Read state through the ids and classes listed in SKILL.md. Never call app functions from `eval`.
- Weather values are live. Assert counts, formats and consistency between panels, not numbers.

## Proof and skip reporting

- Save evidence under `$RUN/evidence/<feature>/`: a before and after screenshot or `text` dump for each action, plus the relevant `network.log` lines.
- Name the feature ID and entry point next to each artifact you report.
- If a journey cannot be reached (Open-Meteo down, no frame on USB, weather condition not occurring today), report the command you tried and the unmet precondition. Do not substitute a different path.

## Feature entry contract

Each feature file has an H1 and a one-paragraph description, then four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with cdp.mjs`, `Gotchas`.

## Features

- [Clock](./clock.md): time, seconds and date in the weather location's timezone and the chosen locale.
- [Current weather](./current-weather.md): the conditions panel with icon, temperature, H/L and details.
- [Forecast strips](./forecast.md): 8 hourly and 5 daily tiles, rain-likely highlighting.
- [Refresh and offline](./refresh-offline.md): tap to refresh, status line, offline fallback, cached start.
- [URL settings](./url-settings.md): `lat`, `lon`, `place`, `locale` query params.
- [Location](./location.md): tap the place name, search a city, and pick it as the weather location.
- [Auto-update](./auto-update.md): the page reloads itself when a new build is deployed (preview mode only).
- [Calendar](./calendar.md): the view pill, the Month, Week and Day switcher, the Private, Business and All selector, the month grid, 7 day columns, the day timeline, and the calendar's offline and failure statuses.

Not drivable by this skill: the on-frame debug loop (`npm run frame`) needs the physical frame on USB and Wi-Fi.
