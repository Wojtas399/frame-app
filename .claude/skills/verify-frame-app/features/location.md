# Location

The place name under the clock is a button with a pin. A tap opens a dialog near the top of the screen with a search field. Typing at least two letters searches Open-Meteo's geocoding API and lists up to six places with their region and country. A tap on a place saves it in localStorage and reloads the page, so the weather, the clock's timezone and the label all follow it. The saved place beats the `lat`, `lon` and `place` URL params.

## Sub-features

- `location-open`: a tap on `#place` opens `#location-picker` with the field focused and empty, and does not refresh the weather.
- `location-search`: typing searches after a 300 ms pause, in the locale's language. Fewer than two letters clears the list. Only the latest query's answer is shown.
- `location-states`: a list of `.location-result` rows, `No places found`, or `Search failed` when the geocoding API is unreachable.
- `location-pick`: a tap on a row saves `{ name, lat, lon }` in `location-v1` and reloads. `#place` reads the new name and the forecast request uses its coordinates.
- `location-precedence`: a saved location beats `lat`, `lon` and `place` in the URL.
- `location-close`: **Close**, a tap on the backdrop, or a minute without typing closes the dialog. None of these taps refresh the weather.

## How to get to it (user POV)

- Tap the place name under the clock, type a city, and tap it in the list.

## Driving it with cdp.mjs

Preconditions: baseline. Use `locale=pl-PL` so the geocoder returns `Kraków` with its accent (in English it returns `Krakow`).

```sh
F="performance.getEntriesByType('resource').filter(e => e.name.includes('api.open-meteo.com/v1/forecast')).length"
R="document.getElementById('location-results').innerText"
```

- **Open and search.** Run `node $S/cdp.mjs "$RUN" open '/?locale=pl-PL' -- wait "document.getElementById('status').textContent.startsWith('Zaktualizowano')" -- eval "window.__f = $F" -- tap '#place' -- wait "document.getElementById('location-picker').open" -- eval "document.activeElement.id" -- type '#location-search' 'Krak' -- wait "document.querySelectorAll('.location-result').length > 0" -- eval "[...document.querySelectorAll('.location-result')].map(r => r.innerText.replace('\n', ' | '))" -- eval "$F - window.__f" -- screenshot location/results.png`. The focus is `"location-search"`, the first row is `Kraków | Województwo małopolskie, Polska`, and the forecast count grew by `0`. `network.log` has one `geocoding-api.open-meteo.com/v1/search?name=Krak…&language=pl` request.
- **Pick.** Run `node $S/cdp.mjs "$RUN" eval "window.__before = true" -- tap '.location-result[data-place="0"]' -- wait "!window.__before && document.getElementById('place').textContent === 'Kraków' && document.getElementById('status').textContent.startsWith('Zaktualizowano')" 15000 -- eval "localStorage.getItem('location-v1')" -- screenshot location/after.png`. `location-v1` holds `Kraków` with `lat` 50.06…, and the newest forecast request in `network.log` has `latitude=50.06…`.
- **Precedence.** Run `node $S/cdp.mjs "$RUN" open '/?lat=52.2297&lon=21.0122&place=Warszawa&locale=pl-PL' -- wait "document.getElementById('status').textContent.startsWith('Zaktualizowano')" -- eval "document.getElementById('place').textContent"`. The result is `"Kraków"`, and the forecast request still has `latitude=50.06…`.
- **No places, debounce, Close.** Run `node $S/cdp.mjs "$RUN" tap '#place' -- wait "document.getElementById('location-picker').open" -- type '#location-search' 'Qx' -- type '#location-search' 'zqzq' -- wait "$R !== ''" -- eval "$R" -- tap '#location-close' -- wait "!document.getElementById('location-picker').open"`. The result is `"Nie znaleziono miejsc"`, and `network.log` has one search request for `Qxzqzq`, none for `Qx`.
- **Search failed, backdrop.** Run `node $S/cdp.mjs "$RUN" block '*geocoding-api*' -- tap '#place' -- wait "document.getElementById('location-picker').open" -- type '#location-search' 'Gdańsk' -- wait "$R !== ''" -- eval "$R" -- tap '#days' -- wait "!document.getElementById('location-picker').open"`. The result is `"Błąd wyszukiwania"`. `#days` lies outside the dialog, so the tap lands on the backdrop. `network.log` has no forecast request at any of these taps.

## Gotchas

- `network.log` and `performance` match `api.open-meteo.com` inside `geocoding-api.open-meteo.com` too. Count forecasts with `api.open-meteo.com/v1/forecast`.
- `location-v1` outlives reloads for the rest of the run, so URL-param recipes run after this one still show the picked place. Launch a fresh run for them.
- Search results are live. Assert that `Kraków` is among them, not the exact list.
- The Android soft keyboard cannot be shown in desktop Chrome. The dialog sits near the top so the keyboard should not cover it, which is unproven until checked on the frame.
