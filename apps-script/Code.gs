// Extra calendars to include besides the default one, by ID (Calendar settings > Integrate calendar).
const CALENDAR_IDS = [];

// GET ?days=N (default 7) -> { events: [{ title, start, end, allDay, color, location, description }] } from the start of today.
// Timed events have ISO instants. All-day events have yyyy-MM-dd dates and an exclusive end.
// color is the source calendar's colour as #rrggbb. The description may hold HTML.
function doGet(e) {
  const days = Math.min(Math.max(Number(e.parameter.days) || 7, 1), 14);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const timeZone = Session.getScriptTimeZone();
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
