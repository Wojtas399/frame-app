# frame-app

A clock, weather, and calendar dashboard for a 10.1" 1280×800 photo frame (Wozinsky WRC-32, Android 6,
WebView 107) running the [Home HQ kiosk](https://github.com/wesbos/photo-frame-dashboard/tree/main/dashboard/kiosk).

Weather comes from [Open-Meteo](https://open-meteo.com/), which needs no API key. The clock
uses the weather location's timezone, so it is correct even if the frame's own timezone is wrong.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
```

## Debug on the frame

With the frame on USB and on the same Wi-Fi as the Mac:

```sh
npm run frame
```

This points the frame at the Mac's Vite dev server: saving a file updates the frame within
seconds. Chrome DevTools for the page are at `chrome://inspect/#devices` in Chrome on the Mac
(console, network, element inspector, screencast). Ctrl+C stops the server; the frame keeps the
last page until it is pointed somewhere else.

## Settings

URL query parameters override the defaults in `src/config.js`:

| Param | Default | Example |
| --- | --- | --- |
| `lat`, `lon` | Warsaw | `?lat=50.06&lon=19.94` |
| `place` | `Warsaw` | `&place=Kraków` |
| `locale` | `en-GB` | `&locale=pl-PL` |
| `cal-private` | none | `&cal-private=<URL-encoded /exec URL>` |
| `cal-business` | none | `&cal-business=<URL-encoded /exec URL>` |

Tap anywhere to refresh the weather now.

## Calendar

The frame can show the next 7 days from two Google accounts, Private and Business. Each account
serves its events as JSON from its own Google Apps Script web app. Without a `cal-` param, the
frame shows only the weather dashboard.

Set up each account once:

1. Sign in to Google as that account and open [script.google.com](https://script.google.com).
2. Click **New project**, replace the code in the editor with [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. Click **Deploy** > **New deployment**, and select the type **Web app**.
4. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then click **Deploy**.
5. Authorise the script to read your calendar.
6. Copy the **Web app** URL. It ends in `/exec`.
7. URL-encode the URL with `node -p 'encodeURIComponent(process.argv[1])' '<URL>'`.
8. Add the result to the frame's URL as `cal-private=` for the Private account or `cal-business=` for the Business account.

Anyone who has an `/exec` URL can read that calendar. Keep the URLs in the frame's URL only, never
in this repository.

A Google Workspace admin can block **Anyone** access. If the Business account does not offer
**Anyone** under **Who has access**, ask the admin to allow it. Until then, the frame can show the
Private account only.

The script reads the account's default calendar. To add other calendars, put their IDs in
`CALENDAR_IDS` at the top of the script. Google Calendar shows a calendar's ID under
**Settings and sharing** > **Integrate calendar**. After you change the script, click **Deploy** >
**Manage deployments**, edit the deployment, and select **New version**. The `/exec` URL stays the same.

Tap **Calendar** in the top-left corner to switch to the calendar, and **Weather** to switch back.
With both accounts set, a selector at the top shows **Private**, **Business**, or **All**. The frame
remembers the view and the selection. It fetches the calendars every 10 minutes and keeps showing the
last data when it is offline.
