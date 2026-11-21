# Calendar

With a `cal-private` or `cal-business` URL param, a pill in the top-left corner swaps the weather dashboard for a 7-day calendar. Each param is the URL of one Google account's feed (`apps-script/Code.gs` serves it). With both, a selector shows Private, Business, or All, each in its account's colour. The page keeps the last good feed per account in localStorage, so it shows data offline. It also remembers the view and the selection. Without a `cal-` param, the page is the plain weather dashboard.

## Sub-features

- `cal-absent`: no `cal-` param gives no pill, no calendar, and no feed request, even when the saved view is `calendar`.
- `cal-toggle`: the pill reads `Calendar` on the dashboard and `Weather` on the calendar, and a tap swaps the views.
- `cal-select`: **Private**, **Business**, and **All** each show only their events. The selected option is filled with its colour.
- `cal-single`: with one param, the calendar has no selector.
- `cal-persist`: the view and the selection survive a reload (localStorage `calendar-view-v1`).
- `cal-days`: 7 columns `Today`, `Tomorrow`, then a short weekday and day (`Mon 23`). All-day events come first as filled chips, then timed events as `HH:MM title` with a bar in the account colour. An event that runs past midnight shows `to HH:MM` on its last day. An empty day shows `Free`. A full column fades out at the bottom. Titles render as text, never as HTML.
- `cal-zone`: day columns and times follow the weather location's timezone, like the clock.
- `cal-offline`: with every feed unreachable, the cached events stay and `#cal-status` reads `Offline · showing HH:MM data` with class `error`.
- `cal-account-fail`: when one feed fails, the other account still updates. `#cal-status` names the failed account: `Business calendar failed · showing HH:MM data` with a cache, or `Business calendar failed` without one. A malformed feed counts as a failure.
- `cal-retry`: after any failed fetch the page fetches every feed again 60 s later. After a success it waits 10 min.

## How to get to it (user POV)

- Point the frame at a URL with `cal-private=` and `cal-business=` (URL-encoded `/exec` URLs), then tap **Calendar**.
- Tap **Private**, **Business**, or **All** at the top right of the calendar.
- Lose Wi-Fi, or reboot the frame without it.

## Driving it with cdp.mjs

Preconditions: baseline. Generate the fixture feeds first, because their events are dated from today in Europe/Warsaw. `fixtures/make.mjs` writes `private.json`, `business.json` (with 18 events on day 5 to overflow its column), and `malformed.json`. The dev server serves them. Below, day 1 is the `Today` column.

```sh
node .claude/skills/verify-frame-app/fixtures/make.mjs
F=%2F.claude%2Fskills%2Fverify-frame-app%2Ffixtures%2F
Q="/?cal-private=${F}private.json&cal-business=${F}business.json"
D="[...document.querySelectorAll('.cal-day')].map(d => d.querySelector('.cal-day-name').textContent + ': ' + [...d.querySelectorAll('.cal-chip, .cal-event, .cal-free')].map(e => e.textContent).join(' | '))"
ST="[document.getElementById('cal-status').textContent, document.getElementById('cal-status').className]"
```

- **Toggle.** Run `node $S/cdp.mjs "$RUN" open "$Q" -- wait "document.getElementById('cal-status').textContent.startsWith('Updated')" -- screenshot calendar/weather-with-toggle.png -- tap '#view-toggle' -- wait "document.body.dataset.view === 'calendar'" -- screenshot calendar/all.png -- text calendar/all.txt`. The dashboard shows the `Calendar` pill above the date. `all.txt` lists `Private`, `Business`, `All`, the date and time, then 7 days ending in `Updated HH:MM` and `Weather`. `network.log` has a `REQ`/`RESP 200` pair for each fixture.
- **Selector.** Run `node $S/cdp.mjs "$RUN" tap '[data-account=private]' -- wait "document.querySelector('.cal-option.on').dataset.account === 'private'" -- eval "$D" -- screenshot calendar/private.png`, then the same with `business` and `all`. Private has `Gym`, `<b>x</b> & dinner`, `Mum's birthday`, `Ski trip` on days 3 to 5, `Night train` (`23:00` on day 4, `to 01:30` on day 5), and `Dentist`. Business has the two `Standup`s, `Conference` on days 2 and 3, `Interview 1` to `18` on day 5, and `Quarterly planning`. All has both, and day 6 is `Free` in every option.
- **Titles are text.** Run `node $S/cdp.mjs "$RUN" eval "document.querySelectorAll('.cal-events b').length"`. The result is `0`.
- **Overflow.** On **All**, run `node $S/cdp.mjs "$RUN" eval "[...document.querySelectorAll('.cal-day')].map(d => Math.round(d.getBoundingClientRect().bottom))" -- eval "(() => { const e = document.querySelector('.cal-day:nth-child(5) .cal-events'); return [e.scrollHeight, e.clientHeight]; })()"`. Every column ends at `780`, and the fifth list's `scrollHeight` is larger than its `clientHeight`.
- **Persistence.** Select **Business**, then run `node $S/cdp.mjs "$RUN" open "$Q" -- wait "document.getElementById('cal-status').textContent.startsWith('Updated')" -- eval "[document.querySelector('.cal-option.on').textContent, document.body.dataset.view, localStorage.getItem('calendar-view-v1')]"`. The result is `["Business","calendar","{\"view\":\"calendar\",\"selected\":\"business\"}"]`. Tap `#view-toggle` and reload the same way to see the dashboard come back.
- **One account.** Run `node $S/cdp.mjs "$RUN" open "/?cal-private=${F}private.json" -- wait "document.getElementById('cal-status').textContent.startsWith('Updated')" -- eval "document.querySelectorAll('.cal-option').length" -- screenshot calendar/one-account.png`. The result is `0`, and every event has the Private colour.
- **No account.** Run `node $S/cdp.mjs "$RUN" open / -- wait "document.getElementById('status').textContent.startsWith('Updated')" -- eval "[document.body.dataset.view ?? null, getComputedStyle(document.getElementById('view-toggle')).display, getComputedStyle(document.querySelector('.calendar')).display]" -- text calendar/zero-accounts.txt`. The result is `[null,"none","none"]`. With digits masked (`sed -E 's/[0-9]+/N/g'`), `zero-accounts.txt` matches a `text` dump of the page before the calendar existed line for line, apart from a weather label that changed in between. Also, `network.log` has no fixture request after the `open`.
- **Timezone.** Open `"/?lat=40.71&lon=-74.01&place=New%20York&cal-private=${F}private.json&cal-business=${F}business.json"`, show the calendar on **Private**, and eval `$D`. `Gym` reads `01:30`, and `Night train` reads `17:00` on day 4 with no entry on day 5.
- **Offline, cached start.** Run `node $S/cdp.mjs "$RUN" block '*/fixtures/*' -- open "$Q" -- wait "document.getElementById('cal-status').textContent.startsWith('Offline')" -- eval "$ST" -- screenshot calendar/offline-cached-start.png`. The result is `["Offline · showing HH:MM data","status error"]`, the events are still there, and `network.log` has `FAIL … (inspector)` for both fixtures.
- **One feed fails, then the retry.** Run `node $S/cdp.mjs "$RUN" block '*business.json*' -- open "$Q" -- wait "document.getElementById('cal-status').textContent.startsWith('Business')" -- eval "$ST"`. The result is `["Business calendar failed · showing HH:MM data","status error"]`, and the Business events stay. The block ends with that invocation, so then run `node $S/cdp.mjs "$RUN" wait "document.getElementById('cal-status').textContent.startsWith('Updated')" 75000`. `network.log` shows the next pair of fixture requests 60 s after the blocked one.
- **Malformed feed.** Run `node $S/cdp.mjs "$RUN" open "/?cal-private=${F}private.json&cal-business=${F}malformed.json" -- wait "document.getElementById('cal-status').textContent.startsWith('Business')" -- eval "$ST" -- screenshot calendar/business-malformed.png`. The result is `["Business calendar failed","status error"]`, only Private events show, `network.log` has `RESP 200` for `malformed.json`, and `console.log` has `Business calendar: Error: Calendar feed is malformed`.

## Gotchas

- The fixtures are dated when `make.mjs` runs. Run it again after midnight in Warsaw.
- The fixture times are Warsaw wall-clock times, so another `lat`/`lon` moves them. The timezone recipe relies on that.
- `#view-toggle` flips the saved view. Read `document.body.dataset.view` before you tap it, because a reload keeps the last view.
- A tap on the pill or the selector also refreshes the weather, through the page's tap-anywhere listener. A tap never refreshes the calendar.
- The dev server answers a missing fixture path with `index.html` and status 200. The page rejects that as a malformed feed.
- The cache entry for an account is used only when its URL matches, so pointing `cal-business` at a new URL starts it with no cache.
- The calendar's move to a new day at midnight cannot be driven without faking the clock. Report it unproven.
