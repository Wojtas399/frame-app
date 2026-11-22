import { t } from './config.js';

export async function fetchFeed(url) {
  const request = new URL(url, location.href);
  request.searchParams.set('days', '8');
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
const isFeedEvent = (e) =>
  typeof e?.title === 'string' &&
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

// CalEvent: { account, title, allDay, start: Date|null, end: Date|null, startDay, endDay (inclusive) }
export function calEvents(feed, account, timeZone) {
  return feed.map(({ title, allDay, start, end }) => {
    // Google Calendar ends an all-day event on the day after its last day.
    if (allDay) return { account, title, allDay, start: null, end: null, startDay: start, endDay: later(start, addDays(end, -1)) };
    const s = new Date(start);
    const e = new Date(end);
    const startDay = dayKey(s, timeZone);
    return { account, title, allDay, start: s, end: e, startDay, endDay: later(startDay, dayKey(new Date(e - 1), timeZone)) };
  });
}

export const daysAhead = (today, n) => Array.from({ length: n }, (_, i) => addDays(today, i));

export function eventsOnDay(events, key) {
  return events.filter((e) => e.startDay <= key && key <= e.endDay).sort((a, b) => b.allDay - a.allDay || a.start - b.start);
}

export const ALL = 'all';

export const selectionOptions = (accounts) => (accounts.length > 1 ? [...accounts, { id: ALL, label: t.all }] : []);

export const selectEvents = (events, selected) => (selected === ALL ? events : events.filter((e) => e.account === selected));
