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

To show the calendar, put the feed URLs (see [Calendar](#calendar)) in a `.env` file in the repo
root. It is gitignored, so the URLs stay on this Mac:

```sh
CAL_PRIVATE='https://script.google.com/macros/s/…/exec'
CAL_BUSINESS='https://script.google.com/macros/s/…/exec'
```

Keep the single quotes, and leave out a line for an account you don't use. `npm run frame` adds them to the frame's URL as
`cal-private` and `cal-business`.

`npm run frame` shows the frame in Polish (`locale=pl-PL`). For English, add `LOCALE='en-GB'` to `.env`.

## Settings

URL query parameters override the defaults in `src/config.js`:

| Param | Default | Example |
| --- | --- | --- |
| `lat`, `lon` | Warsaw | `?lat=50.06&lon=19.94` |
| `place` | `Warsaw` | `&place=Kraków` |
| `locale` | `en-GB` | `&locale=pl-PL` |
| `cal-private` | none | `&cal-private=<URL-encoded /exec URL>` |
| `cal-business` | none | `&cal-business=<URL-encoded /exec URL>` |

`locale` sets the language of the dates and the labels. `pl` gives Polish text and any other language gives English.
The labels live in `src/strings.js`.

Tap the place name under the clock to change the weather location. Type at least two letters of a city,
then tap it in the list. The frame remembers the choice, and it beats the `lat`, `lon` and `place` params.

Tap anywhere to refresh the weather now.

Tap **Night** in the top-left corner to black out the screen and show only the time in dim grey. Between 22:00
and 06:00 in the weather location's timezone, the frame does this by itself after 2 minutes without a tap.
Tap anywhere to wake it, which also refreshes the weather.

## Calendar

The frame can show this month, the next 7 days, or today from two Google accounts, Private and Business. Each account
serves its events as JSON from its own Google Apps Script web app. Without a `cal-` param, the
frame shows only the weather dashboard.

Set up each account once:

1. Sign in to Google as that account and open [script.google.com](https://script.google.com).
2. Click **New project**, replace the code in the editor with [`apps-script/Code.gs`](apps-script/Code.gs), and save.
   In **Project Settings**, tick **Show "appsscript.json" manifest file in editor**, then replace that file with
   [`apps-script/appsscript.json`](apps-script/appsscript.json). It limits the script to reading your calendar.
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
A deployment made before the script sent each event's location and description needs a **New version** the
same way, or the frame shows events without them. A deployment made before the script took a start date
sends 14 days from today, so the month view shows no past events and stops after two weeks until you deploy a
new version.

Each event shows in its calendar's colour from Google Calendar, so you can tell the calendars apart.
To change a colour, change it in Google Calendar. The frame picks it up at the next fetch. A script
deployed before this change sends no colours, and the frame shows its events in the account colour
until you deploy a new version.

Tap **Calendar** in the top-left corner to switch to the calendar, and **Weather** to switch back.
Tap **Month**, **Week**, or **Day** at the top to see this month's grid, the 7 days from today, or today's
hours. With both accounts set, a selector next to it shows **Private**, **Business**, or **All**. The frame
remembers the view, the span, and the selection. It fetches the calendars every 10 minutes and keeps showing the
last data when it is offline.

Tap an event to see its time, account, location, and description. Tap outside it or **Close** to go back. It
also closes by itself after a minute.
