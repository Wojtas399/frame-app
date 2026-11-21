#!/bin/sh
# Start an isolated frame-app instance plus a headless Chrome at the frame's 1280x800 size.
# Usage: launch.sh [dev|preview]
#   dev      Vite dev server on the working tree (default).
#   preview  `vite build` into the run dir, then `vite preview` of that build (needed for version.json).
# Prints `RUN=<dir>` on its last line. Pass that dir to cdp.mjs, doctor.sh and cleanup.sh.
set -eu
MODE=${1:-dev}
case "$MODE" in dev|preview) ;; *) echo "usage: launch.sh [dev|preview]" >&2; exit 2 ;; esac

SCRIPTS=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPTS/../../../.." && pwd)
ROOT=${VERIFY_FRAME_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/verify-frame-app}
RUN="$ROOT/$(date +%Y%m%d-%H%M%S)-$$"
STATE="$RUN/state"
mkdir -p "$STATE/profile" "$RUN/evidence"

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }

free_port() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
APP_PORT=$(free_port)
CDP_PORT=$(free_port)

cd "$REPO"
[ -f node_modules/vite/bin/vite.js ] || npm ci >"$STATE/npm.log" 2>&1

VITE="node $REPO/node_modules/vite/bin/vite.js"
if [ "$MODE" = preview ]; then
  $VITE build --outDir "$STATE/dist" --emptyOutDir >"$STATE/build.log" 2>&1
  nohup $VITE preview --host 127.0.0.1 --port "$APP_PORT" --strictPort --outDir "$STATE/dist" >"$STATE/vite.log" 2>&1 &
else
  nohup $VITE --host 127.0.0.1 --port "$APP_PORT" --strictPort >"$STATE/vite.log" 2>&1 &
fi
VITE_PID=$!

nohup "$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$STATE/profile" \
  --window-size=1280,800 --hide-scrollbars --no-first-run --no-default-browser-check \
  --disable-background-networking about:blank >"$STATE/chrome.log" 2>&1 &
CHROME_PID=$!

cat >"$STATE/env" <<EOF
MODE=$MODE
REPO=$REPO
APP_URL=http://127.0.0.1:$APP_PORT/
APP_PORT=$APP_PORT
CDP_PORT=$CDP_PORT
VITE_PID=$VITE_PID
CHROME_PID=$CHROME_PID
GIT_SHA=$(git rev-parse HEAD)
GIT_DIRTY=$(git status --porcelain | grep -qv '^?? .claude/' && echo yes || echo no)
EOF

# Server up: the page HTML is served.
i=0
until curl -fs "http://127.0.0.1:$APP_PORT/" 2>/dev/null | grep -q '<title>Frame</title>'; do
  i=$((i + 1)); [ $i -lt 100 ] || { echo "vite never served the page; see $STATE/vite.log" >&2; exit 1; }
  sleep 0.2
done
# Chrome up: CDP answers.
i=0
until curl -fs "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -lt 100 ] || { echo "chrome CDP never answered; see $STATE/chrome.log" >&2; exit 1; }
  sleep 0.2
done
# Usable: the real dashboard loaded weather from Open-Meteo and says so.
node "$SCRIPTS/cdp.mjs" "$RUN" open / -- wait "document.getElementById('status').textContent.startsWith('Updated')" 20000 >/dev/null \
  || { echo "dashboard did not reach 'Updated' status; run doctor.sh $RUN" >&2; exit 1; }

echo "ready: $MODE at http://127.0.0.1:$APP_PORT/ (CDP $CDP_PORT)"
echo "RUN=$RUN"
