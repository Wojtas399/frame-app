#!/bin/sh
# Run the app from this Mac's dev server on the frame, with live reload and Chrome DevTools.
# Needs the frame on USB (adb) and on the same Wi-Fi as this Mac. Ctrl+C to stop.
# Calendar feed URLs come from the gitignored .env (CAL_PRIVATE, CAL_BUSINESS).
set -eu
cd "$(dirname "$0")/.."
PORT=5173
IP="$(ipconfig getifaddr en0 || ipconfig getifaddr en1)"
CAL_PRIVATE=""
CAL_BUSINESS=""
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
QUERY="$(node -e '
  const q = new URLSearchParams();
  if (process.argv[1]) q.set("cal-private", process.argv[1]);
  if (process.argv[2]) q.set("cal-business", process.argv[2]);
  const s = q.toString();
  console.log(s ? `?${s}` : "");
' "$CAL_PRIVATE" "$CAL_BUSINESS")"
URL="http://$IP:$PORT/$QUERY"

adb get-state >/dev/null
# debug=true enables chrome://inspect for the page; any later launch without it turns that off.
adb shell "am start -n com.wesbos.homehq/.MainActivity --es url '$URL' --ez debug true" >/dev/null
echo "Frame -> http://$IP:$PORT/${QUERY:+ (with calendar feeds from .env)}"
echo "DevTools: open chrome://inspect/#devices in Chrome on this Mac"
exec npx vite --host 0.0.0.0 --port "$PORT" --strictPort
