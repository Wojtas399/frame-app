# Forecast strips

Below the clock are two strips. One has the next 8 hours, each with time, icon, temperature and rain chance. The other has the next 5 days starting tomorrow, each with a short weekday, icon, high, low and max rain chance. Rain chances of 30% or more are highlighted.

## Sub-features

- `hours-8`: exactly 8 `.hour` tiles, starting at the hour after the current one, in consecutive hours.
- `days-5`: exactly 5 `.day` tiles, starting tomorrow, in consecutive weekdays.
- `rain-likely`: a `.rain` with a value of 30% or more has class `likely` (shown in blue). Below 30% it does not.
- `day-temps`: each day shows `.hi` ≥ `.lo`.

## How to get to it (user POV)

- Look at the two lower rows of the frame.

## Driving it with cdp.mjs

Preconditions: baseline. The status reads `Updated …`.

- **Hourly.** Run `node $S/cdp.mjs "$RUN" eval "[...document.querySelectorAll('#hours .hour-time')].map(e => e.textContent)"`. There are 8 values `HH:00`, each one hour after the previous (wrapping at midnight). The first is the hour after `#time`'s hour.
- **Daily.** Run `node $S/cdp.mjs "$RUN" eval "[...document.querySelectorAll('#days .day')].map(d => [d.querySelector('.day-name').textContent, parseInt(d.querySelector('.hi').textContent), parseInt(d.querySelector('.lo').textContent)])"`. There are 5 rows, the first is tomorrow's short weekday, and each has hi ≥ lo.
- **Rain highlight.** Run `node $S/cdp.mjs "$RUN" eval "[...document.querySelectorAll('.rain')].every(r => r.classList.contains('likely') === parseInt(r.textContent) >= 30)"`. The result is `true`.
- **Proof.** Run `node $S/cdp.mjs "$RUN" screenshot forecast/strips.png -- text forecast/strips.txt`.

## Gotchas

- If every rain value is below 30% today, the highlight rule is only proven in the negative. Say so instead of claiming `rain-likely` is verified.
- Near midnight the hourly strip legitimately crosses into tomorrow.
