import { t } from './config.js';

export async function fetchFeed(url, { from, days }) {
  const request = new URL(url, location.href);
  request.searchParams.set('from', from);
  request.searchParams.set('days', days);
  const res = await fetch(request, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Calendar request failed: ${res.status}`);
  const { events } = await res.json();
  if (!isFeed(events)) throw new Error('Calendar feed is malformed');
  return events;
}

export const isFeed = (events) => Array.isArray(events) && events.every(isFeedEvent);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isInstant = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isDate = (s) => DATE.test(s) && isInstant(s);
const COLOR = /^#[0-9a-f]{6}$/i;
const isOptional = (s) => s === undefined || typeof s === 'string';
const isFeedEvent = (e) =>
  typeof e?.title === 'string' &&
  (e.color === undefined || COLOR.test(e.color)) &&
  isOptional(e.location) &&
  isOptional(e.description) &&
  (e.allDay === true ? isDate(e.start) && isDate(e.end) : e.allDay === false && isInstant(e.start) && isInstant(e.end));

export function dayKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const later = (a, b) => (a > b ? a : b);

// CalEvent: { account, color: string|undefined, title, allDay, location, description (may hold HTML), start: Date|null, end: Date|null, startDay, endDay (inclusive) }
export function calEvents(feed, account, timeZone) {
  return feed.map(({ title, allDay, start, end, color, location = '', description = '' }) => {
    // Google Calendar ends an all-day event on the day after its last day.
    if (allDay) return { account, color, title, allDay, location, description, start: null, end: null, startDay: start, endDay: later(start, addDays(end, -1)) };
    const s = new Date(start);
    const e = new Date(end);
    const startDay = dayKey(s, timeZone);
    return { account, color, title, allDay, location, description, start: s, end: e, startDay, endDay: later(startDay, dayKey(new Date(e - 1), timeZone)) };
  });
}

// Google Calendar descriptions are HTML. Keep their line breaks, drop the markup.
export function plainText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, ul, ol, li, tr, h1, h2, h3, h4, h5, h6').forEach((el) => {
    el.before('\0');
    el.after('\0');
  });
  // A run of block edges is one line break.
  return doc.body.textContent.replace(/\s*\0[\s\0]*/g, '\n').trim();
}

export const daysAhead = (today, n) => Array.from({ length: n }, (_, i) => addDays(today, i));

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const mondayOf = (key) => addDays(key, -((new Date(`${key}T00:00Z`).getUTCDay() + 6) % 7));

// The whole weeks, Monday first, that hold today's month.
export function monthDays(today) {
  const [year, month] = today.split('-').map(Number);
  const from = mondayOf(`${today.slice(0, 8)}01`);
  const to = addDays(mondayOf(new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)), 6);
  return daysAhead(from, daysBetween(from, to) + 1);
}

// One fetch covers every span, so switching spans works offline.
export function feedWindow(today) {
  const month = monthDays(today);
  return { from: month[0], days: daysBetween(month[0], later(month.at(-1), addDays(today, 6))) + 1 };
}

export function eventsOnDay(events, key) {
  return events.filter((e) => e.startDay <= key && key <= e.endDay).sort((a, b) => b.allDay - a.allDay || a.start - b.start);
}

const minuteOf = (date, timeZone) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).split(':').map(Number);
  return h * 60 + m;
};

// Timed events on one day as blocks on an hour timeline from `from` to `to`, with top and height as fractions of it.
// Each run of overlapping events splits the width into as many columns as it needs, each event in the first free one.
export function dayLayout(events, key, timeZone) {
  const spans = eventsOnDay(events, key)
    .filter((e) => !e.allDay)
    .map((event) => ({
      event,
      start: event.startDay < key ? 0 : minuteOf(event.start, timeZone),
      end: dayKey(event.end, timeZone) > key ? 24 * 60 : minuteOf(event.end, timeZone),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const from = Math.max(0, Math.min(8, ...spans.map((s) => Math.floor(s.start / 60))));
  const to = Math.min(24, Math.max(20, ...spans.map((s) => Math.ceil(s.end / 60))));
  const placed = [];
  let columns = [];
  let runEnd = 0;
  for (const s of spans) {
    if (s.start >= runEnd) columns = [];
    let col = columns.findIndex((end) => end <= s.start);
    if (col < 0) col = columns.length;
    columns[col] = s.end;
    runEnd = Math.max(runEnd, s.end);
    placed.push({ ...s, col, columns });
  }
  const minutes = (to - from) * 60;
  const blocks = placed.map(({ event, start, end, col, columns }) => ({ event, top: (start - from * 60) / minutes, height: (end - start) / minutes, col, cols: columns.length }));
  return { from, to, blocks };
}

export const ALL = 'all';

export const selectionOptions = (accounts) => (accounts.length > 1 ? [...accounts, { id: ALL, label: t.all }] : []);

export const selectEvents = (events, selected) => (selected === ALL ? events : events.filter((e) => e.account === selected));
