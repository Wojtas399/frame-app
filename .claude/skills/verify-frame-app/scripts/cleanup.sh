#!/bin/sh
# Stop the processes one run started and delete its scratch state. Keeps $RUN/evidence.
# Usage: cleanup.sh <RUN>
RUN=${1:?usage: cleanup.sh <RUN>}
[ -f "$RUN/state/env" ] || { echo "nothing to clean in $RUN"; exit 0; }
. "$RUN/state/env"

stop() { # pid, string its command line must contain
  if ps -p "$1" -o command= 2>/dev/null | grep -q -- "$2"; then
    kill "$1"
    i=0; while kill -0 "$1" 2>/dev/null && [ $i -lt 25 ]; do sleep 0.2; i=$((i + 1)); done
    kill -0 "$1" 2>/dev/null && kill -9 "$1"
    echo "stopped pid $1"
  fi
}
stop "$CHROME_PID" "$RUN/state/profile"
stop "$VITE_PID" "--port $APP_PORT"

rm -rf "$RUN/state"
echo "evidence kept at $RUN/evidence"
ls -1 "$RUN/evidence" 2>/dev/null
