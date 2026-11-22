#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZONE = 'Europe/Warsaw';
const wallClock = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  );
const now = wallClock(new Date());
const day = (n) => new Date(Date.UTC(now.year, now.month - 1, now.day + n)).toISOString().slice(0, 10);

function zonedInstant(n, hhmm) {
  const guess = new Date(`${day(n)}T${hhmm}:00Z`);
  const w = wallClock(guess);
  return new Date(2 * guess - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)).toISOString();
}
const timed = (title, n, from, to, toDay = n, color) => ({ title, start: zonedInstant(n, from), end: zonedInstant(toDay, to), allDay: false, color });
const allDay = (title, n, days = 1, color) => ({ title, start: day(n), end: day(n + days), allDay: true, color });
const FAMILY = '#33b679';
const HOLIDAYS = '#8e24aa';
const hour = (h) => `${String(h).padStart(2, '0')}:00`;

const feeds = {
  'private.json': {
    events: [
      timed('<b>x</b> & dinner', 0, '19:00', '21:00'),
      timed('Gym', 0, '07:30', '08:15', 0, FAMILY),
      allDay("Mum's birthday", 1, 1, FAMILY),
      allDay('Ski trip', 2, 3, HOLIDAYS),
      timed('Night train', 3, '23:00', '01:30', 4),
      {
        ...timed('Dentist', 6, '10:00', '10:45'),
        location: 'ul. Floriańska 12, Kraków',
        description: `Bring the <b>X-ray</b> results.<br>Parking at the back gate.<ul><li>ID card</li><li>Insurance card</li></ul><img src=x onerror="window.__pwned = 1"><script>window.__pwned = 1</script>${'<p>More notes.</p>'.repeat(30)}`,
      },
    ],
  },
  'business.json': {
    events: [
      timed('Standup', 0, '09:00', '09:15'),
      timed('Design review with the platform team', 0, '11:00', '12:00'),
      timed('Standup', 1, '09:00', '09:15'),
      allDay('Conference', 1, 2),
      ...Array.from({ length: 18 }, (_, i) => timed(`Interview ${i + 1}`, 4, hour(6 + i), hour(7 + i))),
      timed('Quarterly planning', 6, '13:00', '15:00'),
    ],
  },
  'malformed.json': { events: [{ title: 5, start: 'soon' }] },
  'bad-color.json': { events: [{ ...allDay('Painted', 0), color: 'red;background:url(x)' }] },
};

for (const [file, feed] of Object.entries(feeds)) writeFileSync(join(HERE, file), JSON.stringify(feed, null, 2) + '\n');
console.log(`today in ${ZONE} is ${day(0)}; wrote ${Object.keys(feeds).join(', ')}`);
