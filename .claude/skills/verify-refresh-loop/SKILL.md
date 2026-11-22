---
name: verify-refresh-loop
description: Exhaustively check frame-app's weather refresh loop (refreshWeather, weatherTimer, tap-to-refresh, retry and 15 min timers in src/main.js) against every order of taps, timer fires and Open-Meteo successes and failures, up to a bound. Use it before and after any change to src/main.js's refresh, timer, cache or status code, or to src/weather.js's fetchWeather, to prove the unattended frame never stops refreshing.
---

# Verify the refresh loop

The frame runs unattended for days, so its most important promise is that it keeps refreshing the weather by itself. This skill checks that promise and two related ones. It does this for every order in which taps, timer fires and request results can happen, not just the orders a test happens to try.

## How it works

`check.mjs` loads the real, unmodified `src/main.js` (with `config.js`, `strings.js`, `weather.js` and `icons.js`) into a fresh Node `vm` context for each path. Only the browser APIs that main.js calls are replaced:

- `setTimeout` and `clearTimeout`: a timer fires only when the checker fires it.
- `fetch`: an Open-Meteo request settles only when the checker settles it. `version.json` always returns the same sha.
- `document`, `localStorage`, `location`: minimal stand-ins.

From page load, it explores every interleaving of four events, breadth first:

- `tap`: the user taps the frame. This is the `click` listener, which calls `refreshWeather`.
- `fire T`: a pending timer fires and calls `refreshWeather`.
- `ok #N`: Open-Meteo request N returns 200.
- `fail #N`: request N fails with a network error.

The default bound is 4 Open-Meteo requests in total. Both start states are covered: no cache, and a cached forecast in `weather-v1`. Every property is checked after every step. Code between two `await`s runs as one step, exactly as it does in the browser.

## Properties

| Property | Plain promise | Harm if broken | Status at sync commit |
| --- | --- | --- | --- |
| `KeepsRefreshing` | Some refresh is always scheduled (a pending timer) or running (a request in flight). | The frame silently freezes on old weather until someone taps it. | **pass** |
| `OneRefreshTimer` | At most one refresh timer is pending. | Duplicate refresh loops send extra Open-Meteo requests. | **known finding** |
| `NewestForecastShown` | Once a newer request's forecast is shown, an older request's forecast never replaces it. | The panel goes back to older weather. | **known finding** |

`expected.json` holds these statuses. The check exits 0 when the result matches it.

### Known findings (current code, not fixed)

1. **Two refresh timers after a quick tap** (`OneRefreshTimer`). The page loads and request #1 starts. The user taps before it returns, and request #2 starts. `clearTimeout(weatherTimer)` clears nothing because no timer exists yet. Request #1 returns and schedules T1. Request #2 returns and schedules T2, overwriting `weatherTimer` without clearing T1. Two 15-minute timers are now pending. In the real browser the loops usually merge again: when T1 fires, its `refreshWeather` clears T2. So the cost is roughly one extra request per overlapping tap or failure. The untimed check cannot show that merge, so treat this as low severity. The fix is `clearTimeout(weatherTimer)` right before each `weatherTimer = setTimeout(…)`. `mutants.json` proves that this fix passes.
2. **Older forecast replaces newer** (`NewestForecastShown`). Request #1 is in flight when the user taps and request #2 starts. #2 returns first and the panel shows it. Then #1 returns and the panel shows #1's older data. The two requests are seconds apart, so the visible difference is usually nil. The fix is to ignore a response when a newer request has started (proved in `mutants.json`).

## Run it

From the repo root (Node ≥ 22, nothing to install):

```sh
.claude/skills/verify-refresh-loop/check.mjs              # about 8 s: properties vs expected.json, exit 0 = no change
.claude/skills/verify-refresh-loop/check.mjs --mutants    # about 20 s: each property still fails on a broken variant and passes on a fixed one
.claude/skills/verify-refresh-loop/check.mjs --max 5      # deeper, about 1.5 min
.claude/skills/verify-refresh-loop/check.mjs --json       # machine-readable result
```

Run both `check.mjs` and `--mutants` on every change that touches the covered code. Output lines are:

- `PASS`: holds as expected.
- `KNOWN`: a finding listed in `expected.json`, printed with its shortest counterexample.
- `NEW`: the result differs from `expected.json`. It is printed with a counterexample, and the exit code is 1.

A counterexample reads as numbered steps in the code's terms: which request started, which timer was scheduled or cleared, and what the panel and `#status` show after each step.

## Reading a NEW result

- **A property now fails.** Read the steps and replay them mentally against `src/main.js`. If the code really does that, it is a real bug the change introduced. Report the steps, and don't weaken the property or edit `expected.json` to hide it.
- **It is a modelling error** if the counterexample needs something the browser cannot do. Examples: a timer firing after `clearTimeout` on it, a request settling twice, or code between two `await`s split into two steps. Also suspect the model when the change added a browser API that the sandbox in `makeWorld` doesn't provide (then you see a thrown `ReferenceError`, not a property result). Fix `check.mjs` in that case.
- **A known finding now passes.** The change fixed it. Confirm with `--mutants`, then set it to `pass` in `expected.json`.
- **`mutant patch not found`.** The code that a mutant patches has changed. Update the `find` strings in `mutants.json` to the new code, keeping each mutant's intent: drop a timer, or the fix variant.

## Coverage record

Sync commit: `498306599731259d57ac135e2e0036f23ccd77f2`

Covered code, by name, in `src/main.js`:

- `refreshWeather`, `weatherTimer`, `WEATHER_EVERY_MS`, `RETRY_MS`
- `loadCached`, `saveCached`, `CACHE_KEY`, and `let weather = loadCached()`
- `setStatus`, `renderClock`, `renderWeather` (the checker reads `.now-temp` back as the forecast shown)
- the startup calls `renderWeather(); refreshWeather();` and `document.addEventListener('click', refreshWeather)`

Also covered: `fetchWeather` in `src/weather.js` (the `res.ok` check and `res.json()`), and `config.lat`/`config.lon` in `src/config.js`, which the cache match uses.

To see whether a change touches this, run `git diff 498306599731259d57ac135e2e0036f23ccd77f2 -- src/main.js src/weather.js src/config.js`. A diff in any name above means rerun the check and reread the model notes. Only move the sync commit forward after you have confirmed that the model notes and the stand-ins in `check.mjs` still describe the code at the new commit, and that both commands give the expected result.

## Scope and assumptions

- **Bounded.** The check covers up to 4 Open-Meteo requests from page load (`--max` raises the bound). Every finding so far shows up within 3 requests.
- **Untimed.** Any pending timer may fire next, whatever its delay. This over-approximates the real clock. It is why `OneRefreshTimer` reports a state that the real timers usually merge out of.
- **Every request eventually settles (an assumption).** `fetchWeather` has no timeout. If the WebView ever leaves a request hanging forever, the loop stops until a tap, and this check cannot see that.
- **Out of scope:** the calendar (`refreshCalendar` and its timer, which the sandbox never starts because `location.search` has no `cal-` param), the 1 s clock tick, the 5-minute `checkVersion` reload (`version.json` is held constant), rendering details beyond which forecast is shown, malformed Open-Meteo bodies, and `localStorage` that throws.
- The DOM, timers and fetch are stand-ins. A pass says the logic in `main.js` is right under these semantics, not that WebView 107 behaves the same. To see the real app, use the `verify-frame-app` skill.

## Files

- `check.mjs`: the checker (properties at the top, stand-ins in `makeWorld`, state merging in `signature`)
- `expected.json`: the baseline status of each property at the sync commit
- `mutants.json`: broken and fixed variants that prove each property can fail and pass
