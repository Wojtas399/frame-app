// Extra calendars to include besides the default one, by ID (Calendar settings > Integrate calendar).
const CALENDAR_IDS = [];

// GET ?days=N (default 7) -> { events: [{ title, start, end, allDay }] } from the start of today.
// Timed events have ISO instants. All-day events have yyyy-MM-dd dates and an exclusive end.
function doGet(e) {
  const days = Math.min(Number(e.parameter.days) || 7, 14);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const timeZone = Session.getScriptTimeZone();
  const day = (d) => Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
  const calendars = [CalendarApp.getDefaultCalendar(), ...CALENDAR_IDS.map((id) => CalendarApp.getCalendarById(id))];
  const events = calendars
    .flatMap((calendar) => calendar.getEvents(start, end))
    .map((event) =>
      event.isAllDayEvent()
        ? { title: event.getTitle(), start: day(event.getAllDayStartDate()), end: day(event.getAllDayEndDate()), allDay: true }
        : { title: event.getTitle(), start: event.getStartTime().toISOString(), end: event.getEndTime().toISOString(), allDay: false },
    );

  return ContentService.createTextOutput(JSON.stringify({ events })).setMimeType(ContentService.MimeType.JSON);
}
