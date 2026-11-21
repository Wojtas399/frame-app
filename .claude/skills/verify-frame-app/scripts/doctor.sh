#!/bin/sh
# Read-only health check of one verification run. Usage: doctor.sh <RUN>
# Exits 0 only when the instance is ours, up, and serving this checkout.
RUN=${1:?usage: doctor.sh <RUN>}
[ -f "$RUN/state/env" ] || { echo "FAIL no $RUN/state/env (not a launched run, or already cleaned up)"; exit 1; }
. "$RUN/state/env"
fail=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; fail=1; }

ps -p "$VITE_PID" -o command= 2>/dev/null | grep -q -- "--port $APP_PORT" && ok "vite pid $VITE_PID ($MODE) on port $APP_PORT" || bad "vite pid $VITE_PID not running; see $RUN/state/vite.log"
ps -p "$CHROME_PID" -o command= 2>/dev/null | grep -q -- "$RUN/state/profile" && ok "chrome pid $CHROME_PID with this run's profile" || bad "chrome pid $CHROME_PID not running; see $RUN/state/chrome.log"

owner=$(lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)
[ "$owner" = "$VITE_PID" ] && ok "port $APP_PORT owned by our vite" || bad "port $APP_PORT listener is '${owner:-none}', expected $VITE_PID"

curl -fs "$APP_URL" | grep -q '<title>Frame</title>' && ok "$APP_URL serves the Frame page" || bad "$APP_URL does not serve the Frame page"
curl -fs "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null && ok "CDP answers on $CDP_PORT" || bad "CDP not answering on $CDP_PORT"

head=$(git -C "$REPO" rev-parse HEAD)
[ "$head" = "$GIT_SHA" ] && ok "checkout at launch sha ${GIT_SHA%"${GIT_SHA#???????}"}" || bad "HEAD moved since launch ($GIT_SHA -> $head); relaunch"
[ "$MODE" = preview ] && [ "$GIT_DIRTY" = yes ] && echo "note preview build includes uncommitted changes present at launch"

curl -fs -o /dev/null --max-time 5 "https://api.open-meteo.com/v1/forecast?latitude=52.23&longitude=21.01&current=temperature_2m" \
  && ok "Open-Meteo reachable" || bad "Open-Meteo unreachable from this machine; weather features cannot be proven"

st=$(node "$(dirname "$0")/cdp.mjs" "$RUN" eval "document.getElementById('status').textContent" 2>/dev/null)
echo "info page status: ${st:-<unreadable>}"
exit $fail
