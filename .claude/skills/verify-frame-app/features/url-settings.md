# URL settings

The frame's URL configures what it shows. `lat` and `lon` pick the weather location (and so the clock's timezone), `place` is the label under the clock, and `locale` sets the language of the dates and every label (`pl` is Polish, anything else is English). Without params it shows Warsaw in `en-GB`.

## Sub-features

- `settings-default`: no params gives `Warsaw`, Warsaw weather, and an English date.
- `settings-location`: `lat`/`lon` change the requested coordinates and the timezone.
- `settings-place`: `place` changes `#place` only.
- `settings-locale`: `locale=pl-PL` gives a Polish date, Polish weekday names, and Polish labels and status (`Zaktualizowano HH:MM`).

## How to get to it (user POV)

- Open the app with a query string, for example `http://<host>/?lat=50.06&lon=19.94&place=Kraków&locale=pl-PL`. On the frame, this is the URL the kiosk is pointed at.

## Driving it with cdp.mjs

Preconditions: baseline.

- **Defaults.** Run `node $S/cdp.mjs "$RUN" open / -- wait "document.getElementById('status').textContent.startsWith('Updated')" -- eval "document.getElementById('place').textContent"`. The result is `"Warsaw"`, and the latest `network.log` request has `latitude=52.2297&longitude=21.0122`.
- **Kraków in Polish.** Run `node $S/cdp.mjs "$RUN" open '/?lat=50.06&lon=19.94&place=Krak%C3%B3w&locale=pl-PL' -- wait "document.getElementById('status').textContent.startsWith('Zaktualizowano')" -- eval "[document.getElementById('place').textContent, document.getElementById('date').textContent, document.querySelector('.day-name').textContent]" -- screenshot settings/krakow-pl.png`. The result looks like `["Kraków", "sobota, 21 listopada", "niedz."]`, and `network.log` shows a request with `latitude=50.06&longitude=19.94`.
- **Other timezone.** See [Clock](./clock.md), Timezone.

## Gotchas

- Encode non-ASCII values in the URL (`Krak%C3%B3w`).
- `place` is only a label. It does not geocode, so a wrong `place` with the right `lat`/`lon` still shows the right weather.
- The cache is matched to one decimal place of `lat`/`lon`. Two nearby points share it until the refresh finishes.
- Locale output comes from desktop Chrome's ICU. The frame's WebView 107 may abbreviate weekdays differently.
