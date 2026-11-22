// Extra calendars to include besides the default one, by ID (Calendar settings > Integrate calendar).
const CALENDAR_IDS = [];

// GET ?from=yyyy-MM-dd&days=N -> { events: [{ title, start, end, allDay, color, location, description }] } for N days
// (default 7, at most 62) from the start of `from` in the script's timezone. A missing or invalid `from` means today.
// Timed events have ISO instants. All-day events have yyyy-MM-dd dates and an exclusive end.
// color is the source calendar's colour as #rrggbb. The description may hold HTML.
function doGet(e) {
  const timeZone = Session.getScriptTimeZone();
  const days = Math.min(Math.max(Number(e.parameter.days) || 7, 1), 62);
  const start = startOf(e.parameter.from, timeZone);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const day = (d) => Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
  const calendars = [CalendarApp.getDefaultCalendar(), ...CALENDAR_IDS.map((id) => CalendarApp.getCalendarById(id))].filter(Boolean);
  const events = calendars
    .flatMap((calendar) => {
      const color = calendar.getColor();
      return calendar.getEvents(start, end).map((event) => ({ event, color }));
    })
    .filter(({ event }) => event.getMyStatus() !== CalendarApp.GuestStatus.NO)
    .map(({ event, color }) => ({
      title: event.getTitle(),
      ...(event.isAllDayEvent()
        ? { start: day(event.getAllDayStartDate()), end: day(event.getAllDayEndDate()), allDay: true }
        : { start: event.getStartTime().toISOString(), end: event.getEndTime().toISOString(), allDay: false }),
      color,
      location: event.getLocation(),
      description: event.getDescription(),
    }));

  return ContentService.createTextOutput(JSON.stringify({ events })).setMimeType(ContentService.MimeType.JSON);
}

function startOf(from, timeZone) {
  try {
    const date = Utilities.parseDate(from, timeZone, 'yyyy-MM-dd');
    // parseDate is lenient (2026-02-31 is 3 March), so only a date that formats back to itself counts.
    if (Utilities.formatDate(date, timeZone, 'yyyy-MM-dd') === from) return date;
  } catch (err) {}
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
