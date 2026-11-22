import './style.css';
import { config, accounts, t } from './config.js';
import { fetchWeather, describe } from './weather.js';
import { icon } from './icons.js';
import {
  ALL,
  addDays,
  addMonths,
  calEvents,
  covers,
  dayKey,
  dayLayout,
  daysAhead,
  eventsOnDay,
  feedWindow,
  fetchFeed,
  isFeed,
  minuteOf,
  monthDays,
  plainText,
  selectEvents,
  selectionOptions,
  windowOf,
} from './calendar.js';

const WEATHER_EVERY_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const VERSION_EVERY_MS = 5 * 60 * 1000;
const CACHE_KEY = 'weather-v1';
const CALENDAR_EVERY_MS = 10 * 60 * 1000;
const FEEDS_KEY = 'calendar-v1';
const PREFS_KEY = 'calendar-view-v1';
const DETAILS_MS = 60 * 1000;
// After this long without a tap, a calendar moved to other dates comes back to today.
const NAV_IDLE_MS = 2 * 60 * 1000;

const $ = (id) => document.getElementById(id);
let weather = loadCached();

// The frame's own timezone may be wrong, so the clock follows the weather location's timezone.
const timeZone = () => weather?.timezone;

function fmt(options, date = new Date()) {
  return new Intl.DateTimeFormat(config.locale, { timeZone: timeZone(), ...options }).format(date);
}

const hm = (date) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, date);
const longDate = (date, zone = timeZone()) => fmt({ weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }, date);

function renderClock() {
  const now = new Date();
  $('time').textContent = $('cal-time').textContent = hm(now);
  $('seconds').textContent = fmt({ second: '2-digit' }, now).padStart(2, '0');
  $('date').textContent = longDate(now);
}

const deg = (t) => `${Math.round(t)}°`;
// Open-Meteo returns local wall-clock strings like "2026-11-20T17:00".
const hhmm = (s) => s.slice(11, 16);
const weekday = (isoDate) =>
  new Intl.DateTimeFormat(config.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T12:00Z`));

function renderWeather() {
  if (!weather) return;
  const { current: c, hourly: h, daily: d } = weather;
  const now = describe(c.weather_code);

  $('place').textContent = config.place;
  $('now').innerHTML = `
    <div class="now-main">
      ${icon(now.icon, c.is_day === 1)}
      <div class="now-temp">${deg(c.temperature_2m)}</div>
    </div>
    <div class="now-label">${now.label}</div>
    <div class="now-range">${t.high} ${deg(d.temperature_2m_max[0])} · ${t.low} ${deg(d.temperature_2m_min[0])}</div>
    <dl class="now-details">
      <div><dt>${t.feelsLike}</dt><dd>${deg(c.apparent_temperature)}</dd></div>
      <div><dt>${t.wind}</dt><dd>${Math.round(c.wind_speed_10m)} km/h</dd></div>
      <div><dt>${t.humidity}</dt><dd>${c.relative_humidity_2m}%</dd></div>
      <div><dt>${t.sun}</dt><dd>${hhmm(d.sunrise[0])}–${hhmm(d.sunset[0])}</dd></div>
    </dl>`;

  const start = Math.max(0, h.time.indexOf(`${c.time.slice(0, 13)}:00`)) + 1;
  $('hours').innerHTML = h.time
    .slice(start, start + 8)
    .map((t, j) => {
      const i = start + j;
      const rain = h.precipitation_probability[i];
      return `<div class="hour">
        <div class="hour-time">${hhmm(t)}</div>
        ${icon(describe(h.weather_code[i]).icon, h.is_day[i] === 1)}
        <div class="hour-temp">${deg(h.temperature_2m[i])}</div>
        <div class="rain ${rain >= 30 ? 'likely' : ''}">${rain}%</div>
      </div>`;
    })
    .join('');

  $('days').innerHTML = d.time
    .slice(1, 6)
    .map((day, j) => {
      const i = j + 1;
      const rain = d.precipitation_probability_max[i];
      return `<div class="day">
        <div class="day-name">${weekday(day)}</div>
        ${icon(describe(d.weather_code[i]).icon)}
        <div class="day-temps"><span class="hi">${deg(d.temperature_2m_max[i])}</span><span class="lo">${deg(d.temperature_2m_min[i])}</span></div>
        <div class="rain ${rain >= 30 ? 'likely' : ''}">${rain}%</div>
      </div>`;
    })
    .join('');
}

function setStatus(text, isError = false, id = 'status') {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('error', isError);
}

let weatherTimer;
async function refreshWeather() {
  clearTimeout(weatherTimer);
  try {
    weather = await fetchWeather(config);
    saveCached(weather);
    renderClock();
    renderWeather();
    setStatus(t.updated(hm()));
    weatherTimer = setTimeout(refreshWeather, WEATHER_EVERY_MS);
  } catch (err) {
    console.error(err);
    setStatus(weather ? `${t.offline} · ${t.showing(hhmm(weather.current.time))}` : t.waitingWeather, true);
    weatherTimer = setTimeout(refreshWeather, RETRY_MS);
  }
}

function loadCached() {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY));
    return w && w.latitude.toFixed(1) === config.lat.toFixed(1) && w.longitude.toFixed(1) === config.lon.toFixed(1) ? w : null;
  } catch {
    return null;
  }
}

function saveCached(w) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {}
}

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const options = selectionOptions(accounts);
const colorOf = Object.fromEntries(accounts.map((a) => [a.id, a.color]));
const noon = (key) => new Date(`${key}T12:00Z`);
const utcFmt = (options) => new Intl.DateTimeFormat(config.locale, { timeZone: 'UTC', ...options });
// shift moves today by n spans, days lists the days a span shows from that anchor, title names them.
const SPANS = {
  month: {
    label: t.month,
    render: monthHtml,
    shift: (today, n) => (n ? addMonths(today, n) : today),
    days: monthDays,
    title: (anchor) => utcFmt({ month: 'long', year: 'numeric' }).format(noon(anchor)),
  },
  week: {
    label: t.week,
    render: weekHtml,
    shift: (today, n) => addDays(today, 7 * n),
    days: (anchor) => daysAhead(anchor, 7),
    title: (anchor) => utcFmt({ day: 'numeric', month: 'long' }).formatRange(noon(anchor), noon(addDays(anchor, 6))),
  },
  day: { label: t.day, render: dayHtml, shift: addDays, days: (anchor) => [anchor], title: (anchor) => dayDate(anchor) },
};
const feeds = loadFeeds();
const prefs = loadPrefs();
// How many spans the calendar is moved from today. Not saved, so a reload shows today.
let offset = 0;
// The fetched feeds, which cover every span around today, then the other date ranges fetched on demand, by `from/days`.
const home = { events: feeds };
const ranges = new Map();
let homeStatus = ['', false];

function loadFeeds() {
  const saved = load(FEEDS_KEY);
  return Object.fromEntries(accounts.filter((a) => saved?.[a.id]?.url === a.url && isFeed(saved[a.id].events)).map((a) => [a.id, saved[a.id]]));
}

function loadPrefs() {
  const saved = load(PREFS_KEY);
  return {
    view: saved?.view === 'calendar' ? 'calendar' : 'weather',
    selected: options.some((o) => o.id === saved?.selected) ? saved.selected : ALL,
    span: Object.hasOwn(SPANS, saved?.span) ? saved.span : 'week',
  };
}

function showView() {
  document.body.dataset.view = prefs.view;
  $('view-toggle').textContent = prefs.view === 'calendar' ? t.weather : t.calendar;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dayName = (key, today) =>
  key === today ? t.today : key === addDays(today, 1) ? t.tomorrow : utcFmt({ weekday: 'short', day: 'numeric' }).format(noon(key));

const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 153;
};

function eventAttrs(e, style = '') {
  const c = e.color ?? colorOf[e.account];
  return `data-event="${shown.indexOf(e)}" style="--c: ${c}; --ink: var(${isLight(c) ? '--bg' : '--text'}); ${style}"`;
}

function eventHtml(e, key) {
  if (e.allDay) return `<div class="cal-chip" ${eventAttrs(e)}>${escapeHtml(e.title)}</div>`;
  const when = key === e.startDay ? hm(e.start) : key === e.endDay ? t.until(hm(e.end)) : t.allDay;
  return `<div class="cal-event" ${eventAttrs(e)}><span class="cal-event-time">${when}</span> ${escapeHtml(e.title)}</div>`;
}

const pct = (f) => `${+(f * 100).toFixed(3)}%`;

function blockHtml({ event: e, top, height, col, cols }) {
  return `<div class="cal-block" ${eventAttrs(e, `top: ${pct(top)}; height: ${pct(height)}; left: ${pct(col / cols)}; width: calc(${pct(1 / cols)} - 0.3vw)`)}>
    <div><span class="cal-event-time">${hm(e.start)}–${hm(e.end)}</span> ${escapeHtml(e.title)}</div>
    ${e.location ? `<div class="cal-block-place">${escapeHtml(e.location)}</div>` : ''}
  </div>`;
}

const zonedToday = () => `${timeZone()} ${dayKey(new Date(), timeZone())}`;
let renderedFor;
let shown = [];

function rangeOf(win) {
  if (covers(feedWindow(dayKey(new Date(), timeZone())), win)) return home;
  const key = `${win.from}/${win.days}`;
  const range = ranges.get(key) ?? {};
  if (!range.pending && !(Date.now() - range.at < (range.failed ? RETRY_MS : CALENDAR_EVERY_MS))) loadRange(key, win, range);
  return ranges.get(key);
}

async function loadRange(key, win, old) {
  ranges.set(key, { ...old, events: old.events ?? {}, pending: true });
  const results = await Promise.allSettled(accounts.map((a) => fetchFeed(a.url, win)));
  results.forEach((r, i) => r.status === 'rejected' && console.error(`${accounts[i].label} calendar:`, r.reason));
  const events = Object.fromEntries(
    accounts.map((a, i) => [a.id, results[i].status === 'fulfilled' ? { events: results[i].value } : old.events?.[a.id]]).filter(([, feed]) => feed),
  );
  ranges.set(key, { at: Date.now(), failed: results.some((r) => r.status === 'rejected'), events });
  renderCalendar();
}

function rangeStatus(range) {
  if (range === home) return homeStatus;
  if (!range.at) return [t.loading, false];
  return range.failed ? [t.rangeFailed, true] : [t.updated(hm(new Date(range.at))), false];
}

function renderCalendar() {
  renderedFor = zonedToday();
  const today = dayKey(new Date(), timeZone());
  const span = SPANS[prefs.span];
  const anchor = span.shift(today, offset);
  const range = rangeOf(windowOf(span.days(anchor)));
  shown = selectEvents(
    accounts.flatMap((a) => (range.events[a.id] ? calEvents(range.events[a.id].events, a.id, timeZone()) : [])),
    prefs.selected,
  );
  $('cal-date').textContent = offset ? span.title(anchor) : longDate(new Date());
  $('cal-nav').innerHTML = `<button data-step="-1">‹</button><button data-step="0"${offset ? '' : ' class="off"'}>${t.today}</button><button data-step="1">›</button>`;
  setStatus(...rangeStatus(range), 'cal-status');
  $('cal-spans').innerHTML = Object.entries(SPANS)
    .map(([id, s]) => `<button class="cal-span${id === prefs.span ? ' on' : ''}" data-span="${id}">${s.label}</button>`)
    .join('');
  $('cal-accounts').innerHTML = options
    .map((o) => `<button class="cal-option${o.id === prefs.selected ? ' on' : ''}" data-account="${o.id}" style="--c: ${o.color ?? 'var(--text)'}">${o.label}</button>`)
    .join('');
  const days = $('cal-days');
  days.dataset.span = prefs.span;
  days.innerHTML = span.render(anchor, today);
  fitCells(days);
  scrollTimeline(days);
  if ($('day-preview').open) fillDayPreview($('day-preview').dataset.day);
}

function weekHtml(anchor, today) {
  return daysAhead(anchor, 7)
    .map((key) => {
      const list = eventsOnDay(shown, key);
      return `<div class="cal-day${key === today ? ' today' : ''}">
        <div class="cal-day-name">${dayName(key, today)}</div>
        <div class="cal-events">${list.length ? list.map((e) => eventHtml(e, key)).join('') : `<div class="cal-free">${t.free}</div>`}</div>
      </div>`;
    })
    .join('');
}

function monthHtml(anchor, today) {
  const days = monthDays(anchor);
  const month = anchor.slice(0, 7);
  const state = (key) => (key === today ? ' today' : key < today || !key.startsWith(month) ? ' dim' : '');
  return [
    ...days.slice(0, 7).map((key) => `<div class="cal-weekday">${weekday(key)}</div>`),
    ...days.map((key) => `<div class="cal-cell${state(key)}" data-day="${key}">
        <div class="cal-cell-num">${Number(key.slice(8))}</div>
        <div class="cal-cell-events">${eventsOnDay(shown, key).map((e) => eventHtml(e, key)).join('')}</div>
      </div>`),
  ].join('');
}

const HOURS = Array.from({ length: 24 }, (_, h) => `<div class="cal-hour">${String(h).padStart(2, '0')}:00</div>`).join('');

function dayHtml(key) {
  const list = eventsOnDay(shown, key);
  const blocks = dayLayout(list, key, timeZone());
  const now = key === dayKey(new Date(), timeZone()) ? minuteOf(new Date(), timeZone()) / (24 * 60) : 0;
  // Open on the next event that hasn't ended, else the first one, else 08:00, with half an hour above it.
  const first = blocks.find((b) => b.top + b.height > now) ?? blocks[0];
  const scroll = Math.max(0, (first?.top ?? 8 / 24) - 0.5 / 24);
  const chips = list.filter((e) => e.allDay).map((e) => eventHtml(e, key));
  return `<div class="cal-allday">${chips.join('')}</div>
    <div class="cal-timeline">
      <div class="cal-scroll" data-scroll="${scroll}">
        <div class="cal-track">${HOURS}<div class="cal-blocks">${blocks.map(blockHtml).join('')}</div></div>
      </div>
      ${list.length ? '' : `<div class="cal-free">${t.free}</div>`}
    </div>`;
}

// Scrolling needs layout, so the timeline must be shown.
function scrollTimeline(root) {
  const el = root.querySelector('.cal-scroll');
  if (el) el.scrollTop = el.dataset.scroll * el.scrollHeight;
}

// A month cell lists the events that fit, then how many more there are. Needs layout, so the calendar must be shown.
function fitCells(root) {
  for (const list of root.querySelectorAll('.cal-cell-events')) {
    const items = [...list.children];
    const fits = (el) => el.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom;
    if (!items.length || fits(items.at(-1))) continue;
    list.insertAdjacentHTML('beforeend', '<div class="cal-more"></div>');
    let hidden = 0;
    do {
      items.pop().remove();
      list.lastElementChild.textContent = t.more(++hidden);
    } while (items.length && !fits(list.lastElementChild));
  }
}

const dayDate = (key) => longDate(new Date(`${key}T12:00Z`), 'UTC');

function eventWhen(e) {
  if (e.allDay) return e.startDay === e.endDay ? dayDate(e.startDay) : `${dayDate(e.startDay)} – ${dayDate(e.endDay)}`;
  if (e.startDay === e.endDay) return `${longDate(e.start)} · ${hm(e.start)}–${hm(e.end)}`;
  return `${longDate(e.start)} ${hm(e.start)} – ${longDate(e.end)} ${hm(e.end)}`;
}

// One idle timer for every open dialog, so a stacked dialog never closes under the one being read.
let idleTimer;
function restartIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()), DETAILS_MS);
}

function fillDayPreview(key) {
  const dialog = $('day-preview');
  dialog.dataset.day = key;
  dialog.innerHTML = `<div class="event-head">
      <div class="event-title">${dayDate(key)}</div>
      <button class="event-close">${t.close}</button>
    </div>
    <div class="cal-days" data-span="day">${dayHtml(key)}</div>`;
  scrollTimeline(dialog);
}

function showDayPreview(key) {
  $('day-preview').showModal();
  fillDayPreview(key);
  restartIdleTimer();
}

function showDetails(e) {
  const description = plainText(e.description);
  const dialog = $('event-details');
  dialog.innerHTML = `<div class="event-body" style="--c: ${e.color ?? colorOf[e.account]}">
    <div class="event-head">
      <div class="event-title">${escapeHtml(e.title)}</div>
      <button class="event-close">${t.close}</button>
    </div>
    <div class="event-when">${eventWhen(e)}</div>
    <div class="event-account" style="--c: ${colorOf[e.account]}">${accounts.find((a) => a.id === e.account).label}</div>
    ${e.location ? `<div class="event-location">${escapeHtml(e.location)}</div>` : ''}
    ${description ? `<div class="event-description">${escapeHtml(description)}</div>` : ''}
  </div>`;
  dialog.showModal();
  restartIdleTimer();
}

function calendarStatus(failed) {
  if (!failed.length) return t.updated(hm());
  const cached = failed.filter((a) => feeds[a.id]);
  const showing = cached.length ? ` · ${t.showing(hm(new Date(Math.min(...cached.map((a) => feeds[a.id].at)))))}` : '';
  if (failed.length < accounts.length) return `${t.calendarFailed(failed.map((a) => a.label).join(', '))}${showing}`;
  return cached.length ? `${t.offline}${showing}` : t.waitingCalendar;
}

async function refreshCalendar() {
  const range = feedWindow(dayKey(new Date(), timeZone()));
  const results = await Promise.allSettled(accounts.map((a) => fetchFeed(a.url, range)));
  const failed = accounts.filter((a, i) => results[i].status === 'rejected');
  setTimeout(refreshCalendar, failed.length ? RETRY_MS : CALENDAR_EVERY_MS);
  results.forEach((r, i) => {
    const a = accounts[i];
    if (r.status === 'fulfilled') feeds[a.id] = { url: a.url, at: Date.now(), events: r.value };
    else console.error(`${a.label} calendar:`, r.reason);
  });
  store(FEEDS_KEY, feeds);
  homeStatus = [calendarStatus(failed), failed.length > 0];
  renderCalendar();
}

// Reload when a new version is deployed, so a push to GitHub shows up on the frame by itself.
let loadedVersion;
async function checkVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const { sha } = await res.json();
      if (loadedVersion && sha !== loadedVersion) location.reload();
      loadedVersion = sha;
    }
  } catch {}
}

renderClock();
renderWeather();
setInterval(() => {
  renderClock();
  if (accounts.length && zonedToday() !== renderedFor) renderCalendar();
}, 1000);
refreshWeather();
checkVersion();
setInterval(checkVersion, VERSION_EVERY_MS);
// Tap anywhere to refresh the weather now.
document.addEventListener('click', refreshWeather);

if (accounts.length) {
  $('view-toggle').addEventListener('click', () => {
    prefs.view = prefs.view === 'calendar' ? 'weather' : 'calendar';
    store(PREFS_KEY, prefs);
    showView();
    renderCalendar();
  });
  const choose = (id, attr, pref) =>
    $(id).addEventListener('click', (e) => {
      const option = e.target.closest(`[data-${attr}]`);
      if (!option) return;
      if (pref === 'span') offset = 0;
      prefs[pref] = option.dataset[attr];
      store(PREFS_KEY, prefs);
      renderCalendar();
    });
  choose('cal-accounts', 'account', 'selected');
  choose('cal-spans', 'span', 'span');
  $('cal-nav').addEventListener('click', (e) => {
    const button = e.target.closest('[data-step]');
    if (!button) return;
    const step = Number(button.dataset.step);
    offset = step ? offset + step : 0;
    renderCalendar();
  });
  let navTimer;
  document.addEventListener('click', () => {
    clearTimeout(navTimer);
    if (offset) navTimer = setTimeout(() => ((offset = 0), renderCalendar()), NAV_IDLE_MS);
  });
  // A month cell is too small to aim at one event, so a tap anywhere in it opens the day.
  const openEvent = (e) => {
    const chip = e.target.closest('[data-event]');
    if (chip) showDetails(shown[chip.dataset.event]);
  };
  $('cal-days').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-day]');
    if (cell) showDayPreview(cell.dataset.day);
    else openEvent(e);
  });
  for (const dialog of [$('day-preview'), $('event-details')]) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('.event-close')) dialog.close();
      else if (dialog.id === 'day-preview') openEvent(e);
      restartIdleTimer();
    });
    // Scrolling a long description counts as reading, so it restarts the auto-close.
    dialog.addEventListener('scroll', restartIdleTimer, true);
    dialog.addEventListener('close', () => document.querySelector('dialog[open]') || clearTimeout(idleTimer));
  }
  showView();
  renderCalendar();
  refreshCalendar();
}
