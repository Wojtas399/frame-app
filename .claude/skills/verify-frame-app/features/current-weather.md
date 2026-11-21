# Current weather

The top-right panel shows an icon for the current conditions (sun or moon by day or night), the temperature, a label such as `Partly cloudy`, today's high and low, and Feels like, Wind, Humidity and Sun (sunrise–sunset).

## Sub-features

- `now-temp`: `.now-temp` shows a rounded temperature with `°`.
- `now-label`: `.now-label` is a readable WMO label (`Unknown` means an unmapped code).
- `now-range`: `.now-range` reads `H n° · L n°` for today.
- `now-details`: four `dt`/`dd` pairs. Wind is `n km/h`, humidity is `n%`, and sun is `HH:MM–HH:MM`.
- `now-icon`: an inline SVG. Day codes use a sun and night codes a moon.

## How to get to it (user POV)

- Look at the top-right panel after the frame loads.

## Driving it with cdp.mjs

Preconditions: baseline. The status reads `Updated …`.

- **Panel content.** Run `node $S/cdp.mjs "$RUN" eval "({temp: document.querySelector('.now-temp').textContent, label: document.querySelector('.now-label').textContent, range: document.querySelector('.now-range').textContent, details: [...document.querySelectorAll('.now-details div')].map(d => d.innerText.replace('\n', ': ')), svg: !!document.querySelector('#now svg')})"`. The temp matches `^-?\d+°$`, the label is not `Unknown`, the range matches `^H -?\d+° · L -?\d+°$`, there are four details in the formats above, and `svg` is `true`.
- **Matches the API.** The temperature matches the latest Open-Meteo response the page saved. Run `node $S/cdp.mjs "$RUN" eval "Math.round(JSON.parse(localStorage.getItem('weather-v1')).current.temperature_2m) + '°' === document.querySelector('.now-temp').textContent"`. The result is `true`.
- **Proof.** Run `node $S/cdp.mjs "$RUN" screenshot now/panel.png -- text now/panel.txt`.

## Gotchas

- Conditions are live. A specific icon or label (snow, storm, night moon) can only be proven when the real weather or time of day produces it. Otherwise report it as unproven. Don't inject fake data.
- `localStorage` is used here as a second, read-only view of the stored response. Don't write to it to force a state.
