// Reads a Google Calendar .ics feed. Pure: text in, plain data out. Used by the Mac sync server.
//   parseIcsClasses  → the timed events (classes) on each date
//   parseIcsDaysOff  → dates marked as holidays by an event's title

const DAY_MS = 86400000;
const MAX_SPAN_DAYS = 62;
const DEFAULT_CLASS_MINUTES = 30;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Titles that mean "no college". Checked as whole words, any case.
export const DAY_OFF_WORDS = /\b(holiday|holidays|no college|college off|college closed|no class|no classes|day off|off day|vacation|bandh|leave)\b/i;

function unfold(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(s) {
  return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function utc(y, m, d) { return Date.UTC(y, m - 1, d); }
function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
function hhmm(mins) { return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0"); }

// Parses a DTSTART/DTEND value into the local calendar date and time of day:
//   {day: ms at UTC midnight of the local date, mins: minutes after local midnight, allDay}
// `utcOffsetMinutes` is the local zone's offset (330 for IST); omitted, this machine's zone is used.
function parseWhen(params, value, utcOffsetMinutes) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] === undefined || /VALUE=DATE(;|$)/i.test(params)) return { day: utc(y, mo, d), mins: 0, allDay: true };
  const clock = Number(m[4]) * 60 + Number(m[5]);
  if (!m[7]) return { day: utc(y, mo, d), mins: clock, allDay: false }; // TZID or floating: taken as local time
  const instant = Date.UTC(y, mo - 1, d, Number(m[4]), Number(m[5]), Number(m[6]));
  const offset = utcOffsetMinutes === undefined ? -new Date(instant).getTimezoneOffset() : utcOffsetMinutes;
  const local = instant + offset * 60000;
  const day = Math.floor(local / DAY_MS) * DAY_MS;
  return { day, mins: Math.round((local - day) / 60000), allDay: false };
}

function parseEvents(text, utcOffsetMinutes) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon), value = line.slice(colon + 1);
    const semi = head.indexOf(";");
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase(), params = semi < 0 ? "" : head.slice(semi + 1);
    const when = () => parseWhen(params, value.trim(), utcOffsetMinutes);
    if (name === "SUMMARY") cur.title = unescapeText(value);
    else if (name === "UID") cur.uid = value.trim();
    else if (name === "STATUS") cur.status = value.trim().toUpperCase();
    else if (name === "DTSTART") cur.start = when();
    else if (name === "DTEND") cur.end = when();
    else if (name === "RECURRENCE-ID") cur.replaces = when();
    else if (name === "RRULE") cur.rrule = Object.fromEntries(value.trim().split(";").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
    else if (name === "EXDATE") for (const v of value.split(",")) { const w = parseWhen(params, v.trim(), utcOffsetMinutes); if (w) cur.exdates.push(w.day); }
  }
  return events;
}

// A changed or cancelled instance of a repeating event arrives as its own VEVENT (same UID plus
// RECURRENCE-ID). Returns uid → the days whose original occurrence must not be generated.
function replacedDays(events) {
  const out = new Map();
  for (const ev of events) {
    if (!ev.replaces || !ev.uid) continue;
    if (!out.has(ev.uid)) out.set(ev.uid, new Set());
    out.get(ev.uid).add(ev.replaces.day);
  }
  return out;
}

function monthsBetween(a, b) {
  const x = new Date(a), y = new Date(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
}

// Is `day` the nth (or -nth) weekday of its month? spec like "2SA" or "-1FR".
function matchesOrdinalDay(day, spec) {
  const m = spec.match(/^(-?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!m) return false;
  const date = new Date(day);
  if (WEEKDAYS[date.getUTCDay()] !== m[2]) return false;
  if (!m[1]) return true;
  const n = Number(m[1]), dom = date.getUTCDate();
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return n > 0 ? Math.ceil(dom / 7) === n : Math.ceil((daysInMonth - dom + 1) / 7) === -n;
}

function occursOn(day, start, rule) {
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const date = new Date(day), first = new Date(start);
  const byDay = rule.BYDAY ? rule.BYDAY.split(",") : null;
  switch (rule.FREQ) {
    case "DAILY": return Math.round((day - start) / DAY_MS) % interval === 0;
    case "WEEKLY": {
      const mondayOf = ms => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
      const weeks = Math.round((mondayOf(day) - mondayOf(start)) / (7 * DAY_MS));
      const wanted = byDay ? byDay.map(s => s.slice(-2)) : [WEEKDAYS[first.getUTCDay()]];
      return weeks % interval === 0 && wanted.includes(WEEKDAYS[date.getUTCDay()]);
    }
    case "MONTHLY": {
      if (monthsBetween(start, day) % interval !== 0) return false;
      if (byDay) return byDay.some(spec => matchesOrdinalDay(day, spec));
      const days = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(",").map(Number) : [first.getUTCDate()];
      return days.includes(date.getUTCDate());
    }
    case "YEARLY":
      return (date.getUTCFullYear() - first.getUTCFullYear()) % interval === 0 && date.getUTCMonth() === first.getUTCMonth() && date.getUTCDate() === first.getUTCDate();
    default: return false;
  }
}

// Start days of every occurrence of an event that could touch [from, to].
function occurrenceStarts(ev, from, to, span, replaced, utcOffsetMinutes) {
  const start = ev.start.day;
  if (!ev.rrule) return [start];
  const rule = ev.rrule;
  // UNTIL is a moment: an occurrence that starts after it, even on the same date, doesn't happen.
  const until = rule.UNTIL ? parseWhen("", rule.UNTIL.trim(), utcOffsetMinutes) : null;
  const pastUntil = day => until && (day > until.day || (day === until.day && !until.allDay && ev.start.mins > until.mins));
  const limit = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const skipDays = (ev.uid && replaced.get(ev.uid)) || new Set();
  const out = [];
  let seen = 0;
  for (let day = start; day <= to && seen < limit; day += DAY_MS) {
    if (pastUntil(day)) break;
    if (!occursOn(day, start, rule)) continue;
    seen++;
    if (day + (span - 1) * DAY_MS >= from && !ev.exdates.includes(day) && !skipDays.has(day)) out.push(day);
  }
  return out;
}

function windowOf(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number), [ty, tm, td] = to.split("-").map(Number);
  return [utc(fy, fm, fd), utc(ty, tm, td)];
}

// → sorted [{date: "YYYY-MM-DD", title}] of days off between `from` and `to` (inclusive, "YYYY-MM-DD").
// An event counts when it is all-day and options.everyAllDay is set, or when its title contains a
// day-off word (see DAY_OFF_WORDS). Cancelled events never count.
export function parseIcsDaysOff(text, { from, to, everyAllDay = false, utcOffsetMinutes }) {
  const [lo, hi] = windowOf(from, to);
  const events = parseEvents(text, utcOffsetMinutes), replaced = replacedDays(events);
  const found = new Map();
  for (const ev of events) {
    if (!ev.start || ev.status === "CANCELLED") continue;
    const title = ev.title || "";
    const counts = (ev.start.allDay && everyAllDay) || DAY_OFF_WORDS.test(title);
    if (!counts) continue;
    // DTEND is exclusive for all-day events; a timed event covers the dates it starts and ends on.
    const endDay = ev.end ? (ev.start.allDay ? ev.end.day - DAY_MS : ev.end.day) : ev.start.day;
    const span = Math.min(MAX_SPAN_DAYS, Math.max(1, Math.round((endDay - ev.start.day) / DAY_MS) + 1));
    for (const first of occurrenceStarts(ev, lo, hi, span, replaced, utcOffsetMinutes)) {
      for (let i = 0; i < span; i++) {
        const day = first + i * DAY_MS;
        if (day >= lo && day <= hi && !found.has(day)) found.set(day, title.slice(0, 80) || "Day off");
      }
    }
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([day, title]) => ({ date: isoOf(day), title }));
}

function matchesAny(title, words) {
  const lower = title.toLowerCase();
  return words.some(w => w && lower.includes(String(w).toLowerCase()));
}

// → {"YYYY-MM-DD": [{from: "08:30", to: "09:40", title}]} for every date in the window that has
// timed events, each day sorted by start time. `skip`: drop events whose title contains any of these;
// `only`: if given, keep just events whose title contains one. `batch`: if given, an event whose title
// names a batch (contains the word "batch") is kept only when it names this one; events that name no
// batch, like exams for everyone, are kept. All three ignore case.
export function parseIcsClasses(text, { from, to, skip = [], only = [], batch = "", utcOffsetMinutes }) {
  const [lo, hi] = windowOf(from, to);
  const events = parseEvents(text, utcOffsetMinutes), replaced = replacedDays(events);
  const byDay = new Map();
  for (const ev of events) {
    if (!ev.start || ev.start.allDay || ev.status === "CANCELLED") continue;
    const title = (ev.title || "Class").slice(0, 120);
    if (matchesAny(title, skip) || (only.length && !matchesAny(title, only))) continue;
    if (batch && /batch/i.test(title) && !matchesAny(title, [batch])) continue;
    const length = ev.end ? Math.round((ev.end.day - ev.start.day) / 60000) + ev.end.mins - ev.start.mins : DEFAULT_CLASS_MINUTES;
    const entry = { from: hhmm(ev.start.mins), to: hhmm(Math.min(1439, ev.start.mins + Math.max(1, length))), title };
    for (const day of occurrenceStarts(ev, lo, hi, 1, replaced, utcOffsetMinutes)) {
      if (day < lo || day > hi) continue;
      const list = byDay.get(day) || [];
      if (!list.some(c => c.from === entry.from && c.to === entry.to && c.title === entry.title)) list.push(entry);
      byDay.set(day, list);
    }
  }
  const out = {};
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    out[isoOf(day)] = byDay.get(day).slice().sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  }
  return out;
}

// A Google Calendar iCal link, and nothing else: the server will fetch whatever this returns.
export function isGoogleCalendarIcsUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch (e) { return false; }
  return url.protocol === "https:" && url.hostname === "calendar.google.com" && url.port === "" &&
    url.pathname.startsWith("/calendar/ical/") && url.pathname.endsWith(".ics") && !url.username && !url.password;
}
