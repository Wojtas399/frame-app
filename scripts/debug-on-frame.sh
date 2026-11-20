#!/bin/sh
# Run the app from this Mac's dev server on the frame, with live reload and Chrome DevTools.
# Needs the frame on USB (adb) and on the same Wi-Fi as this Mac. Ctrl+C to stop.
set -eu
cd "$(dirname "$0")/.."
PORT=5173
IP="$(ipconfig getifaddr en0 || ipconfig getifaddr en1)"
URL="http://$IP:$PORT/"

adb get-state >/dev/null
# debug=true enables chrome://inspect for the page; any later launch without it turns that off.
adb shell am start -n com.wesbos.homehq/.MainActivity --es url "$URL" --ez debug true >/dev/null
echo "Frame -> $URL"
echo "DevTools: open chrome://inspect/#devices in Chrome on this Mac"
exec npx vite --host 0.0.0.0 --port "$PORT" --strictPort
