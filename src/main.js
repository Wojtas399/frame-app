import './style.css';
import { config, accounts, t } from './config.js';
import { fetchWeather, describe } from './weather.js';
import { icon } from './icons.js';
import { ALL, calEvents, dayKey, dayLayout, daysAhead, eventsOnDay, feedWindow, fetchFeed, isFeed, monthDays, plainText, selectEvents, selectionOptions } from './calendar.js';

const WEATHER_EVERY_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const VERSION_EVERY_MS = 5 * 60 * 1000;
const CACHE_KEY = 'weather-v1';
const CALENDAR_EVERY_MS = 10 * 60 * 1000;
const FEEDS_KEY = 'calendar-v1';
const PREFS_KEY = 'calendar-view-v1';
const DETAILS_MS = 60 * 1000;

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
  $('date').textContent = $('cal-date').textContent = longDate(now);
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
const SPANS = {
  month: { label: t.month, render: monthHtml },
  week: { label: t.week, render: weekHtml },
  day: { label: t.day, render: dayHtml },
};
const feeds = loadFeeds();
const prefs = loadPrefs();

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
const dayName = (key, i) =>
  [t.today, t.tomorrow][i] ??
  new Intl.DateTimeFormat(config.locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00Z`));

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

function renderCalendar() {
  renderedFor = zonedToday();
  shown = selectEvents(
    accounts.flatMap((a) => (feeds[a.id] ? calEvents(feeds[a.id].events, a.id, timeZone()) : [])),
    prefs.selected,
  );
  $('cal-spans').innerHTML = Object.entries(SPANS)
    .map(([id, s]) => `<button class="cal-span${id === prefs.span ? ' on' : ''}" data-span="${id}">${s.label}</button>`)
    .join('');
  $('cal-accounts').innerHTML = options
    .map((o) => `<button class="cal-option${o.id === prefs.selected ? ' on' : ''}" data-account="${o.id}" style="--c: ${o.color ?? 'var(--text)'}">${o.label}</button>`)
    .join('');
  const days = $('cal-days');
  days.dataset.span = prefs.span;
  days.innerHTML = SPANS[prefs.span].render(dayKey(new Date(), timeZone()));
  fitCells(days);
}

function weekHtml(today) {
  return daysAhead(today, 7)
    .map((key, i) => {
      const list = eventsOnDay(shown, key);
      return `<div class="cal-day">
        <div class="cal-day-name">${dayName(key, i)}</div>
        <div class="cal-events">${list.length ? list.map((e) => eventHtml(e, key)).join('') : `<div class="cal-free">${t.free}</div>`}</div>
      </div>`;
    })
    .join('');
}

function monthHtml(today) {
  const days = monthDays(today);
  const month = today.slice(0, 7);
  const state = (key) => (key === today ? ' today' : key < today || !key.startsWith(month) ? ' dim' : '');
  return [
    ...days.slice(0, 7).map((key) => `<div class="cal-weekday">${weekday(key)}</div>`),
    ...days.map((key) => `<div class="cal-cell${state(key)}">
        <div class="cal-cell-num">${Number(key.slice(8))}</div>
        <div class="cal-cell-events">${eventsOnDay(shown, key).map((e) => eventHtml(e, key)).join('')}</div>
      </div>`),
  ].join('');
}

function dayHtml(today) {
  const list = eventsOnDay(shown, today);
  const { from, to, blocks } = dayLayout(list, today, timeZone());
  const hours = Array.from({ length: to - from }, (_, i) => `<div class="cal-hour">${String(from + i).padStart(2, '0')}:00</div>`);
  const chips = list.filter((e) => e.allDay).map((e) => eventHtml(e, today));
  return `<div class="cal-allday">${chips.join('')}</div>
    <div class="cal-timeline">
      ${hours.join('')}
      <div class="cal-blocks">${blocks.map(blockHtml).join('')}</div>
      ${list.length ? '' : `<div class="cal-free">${t.free}</div>`}
    </div>`;
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

let detailsTimer;
function restartDetailsTimer() {
  clearTimeout(detailsTimer);
  detailsTimer = setTimeout(() => $('event-details').close(), DETAILS_MS);
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
  restartDetailsTimer();
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
  renderCalendar();
  setStatus(calendarStatus(failed), failed.length > 0, 'cal-status');
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
      prefs[pref] = option.dataset[attr];
      store(PREFS_KEY, prefs);
      renderCalendar();
    });
  choose('cal-accounts', 'account', 'selected');
  choose('cal-spans', 'span', 'span');
  $('cal-days').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-event]');
    if (chip) showDetails(shown[chip.dataset.event]);
  });
  $('event-details').addEventListener('click', (e) => {
    if (e.target === e.currentTarget || e.target.closest('.event-close')) e.currentTarget.close();
  });
  // Scrolling a long description counts as reading, so it restarts the auto-close.
  $('event-details').addEventListener('scroll', restartDetailsTimer, true);
  $('event-details').addEventListener('close', () => clearTimeout(detailsTimer));
  showView();
  renderCalendar();
  refreshCalendar();
}
