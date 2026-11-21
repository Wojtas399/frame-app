# Auto-update

Every build writes a new `version.json`. The page checks it at load and then every 5 minutes, and reloads itself when the version changes, so a new deployment reaches the frame without anyone touching it.

## Sub-features

- `version-check`: `version.json` is fetched at load and every 5 minutes, with cache-busting `?t=`.
- `version-reload`: when the served `sha` differs from the one first seen, the page reloads.
- `version-stable`: an unchanged `sha` never reloads the page.

## How to get to it (user POV)

- Deploy a new build to wherever the frame loads from, then wait.

## Driving it with cdp.mjs

Preconditions: a run launched with `$S/launch.sh preview`. `curl -s "$(grep ^APP_URL= $RUN/state/env | cut -d= -f2)version.json"` prints `{"sha":"…"}`.

- **Mark the page.** Set a marker that a reload would wipe. Run `node $S/cdp.mjs "$RUN" eval "window.__beforeDeploy = true"`.
- **Deploy.** Publish a new build into the served dir. Run `(cd "$(grep ^REPO= $RUN/state/env | cut -d= -f2)" && node node_modules/vite/bin/vite.js build --outDir "$RUN/state/dist" --emptyOutDir)`. The served `version.json` now has a new `sha`.
- **Reload happens.** Wait up to one check interval. Run `node $S/cdp.mjs "$RUN" wait "!window.__beforeDeploy && document.getElementById('status').textContent.startsWith('Updated')" 330000 -- screenshot auto-update/after-deploy.png`. It exits 0, and `network.log` shows a `version.json` `RESP 200` just before a fresh Open-Meteo request.
- **Stable.** Without rebuilding, run `node $S/cdp.mjs "$RUN" eval "window.__stable = true" -- sleep 310000 -- eval "window.__stable === true"`. The result is `true`.

## Gotchas

- Only `preview` mode serves a real `version.json`. In `dev`, Vite answers the request with the HTML page, the JSON parse fails silently, and the page never reloads.
- The check runs every 5 minutes from page load, so a proof takes up to about 5½ minutes. Don't shorten it with fake timers.
- The window marker is only a way to detect the reload. It does not change app behaviour.
- `--emptyOutDir` briefly removes files while `vite preview` serves them. A check landing in that window fails silently and the next one picks up the change.
