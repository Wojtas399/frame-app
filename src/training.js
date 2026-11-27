import { addDays, isFeed } from './calendar.js';

// `intervals` is `<athlete id>:<API key>` from intervals.icu Settings > Developer Settings, e.g. `i123456:abc…`.
// Returns the planned workouts and notes from `from` for `days` days as calendar feed events, one all-day event each.
export async function fetchTraining(intervals, { from, days }) {
  const [athlete, key] = intervals.split(':');
  const request = new URL(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(athlete)}/events`);
  request.searchParams.set('oldest', from);
  request.searchParams.set('newest', addDays(from, days - 1));
  const res = await fetch(request, { headers: { Authorization: `Basic ${btoa(`API_KEY:${key}`)}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Intervals.icu request failed: ${res.status}`);
  const events = (await res.json()).map(feedEvent);
  if (!isFeed(events)) throw new Error('Intervals.icu events are malformed');
  return events;
}

// Notes (rest days, nutrition, messages from a coach) are dimmer than workouts.
const NOTE_COLOR = '#2e6544';

// Intervals.icu dates are local wall-clock strings like "2026-11-28T00:00:00", and end_date_local is the next day.
function feedEvent({ category, name, start_date_local, end_date_local, moving_time, icu_training_load, description }) {
  const start = start_date_local.slice(0, 10);
  const end = end_date_local?.slice(0, 10);
  const facts = [moving_time && duration(moving_time), icu_training_load && `Load ${icu_training_load}`].filter(Boolean).join(' · ');
  return {
    // The duration leads, so a chip cut short still shows it.
    title: moving_time ? `${duration(moving_time)} · ${name ?? ''}` : (name ?? ''),
    start,
    end: end > start ? end : addDays(start, 1),
    allDay: true,
    ...(category === 'NOTE' && { color: NOTE_COLOR }),
    // Feed descriptions are HTML, and these are plain text.
    description: escapeHtml([facts, description].filter(Boolean).join('\n\n')),
  };
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);

function duration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h${m ? ` ${m}min` : ''}` : `${m}min`;
}
