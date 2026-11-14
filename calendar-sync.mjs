// Mac-server side of the Google Calendar link. Keeps the private iCal link in config.json
// (never sent back to any client), fetches the feed, and turns it into:
//   - the class schedule for the next three weeks (sent to the apps with every sync), and
//   - days off in state.json: today, when it has no classes, plus events named like "Holiday".
import fs from "node:fs";
import path from "node:path";
import { parseIcsDaysOff, parseIcsClasses, isGoogleCalendarIcsUrl } from "./src/calendar.mjs";
import { applyCalendarDaysOff } from "./src/core.mjs";

export const CALENDAR_WINDOW = { from: "2026-10-01", to: "2027-01-31" };
export const REFRESH_EVERY_MS = 10 * 60 * 1000;
export const NO_CLASSES_TITLE = "No classes in your calendar";
const SCHEDULE_DAYS = 21;       // how far ahead the apps get the class schedule
const IN_USE_DAYS = 14;         // classes within this many days either side of today = the calendar is in use
const MAX_ICS_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const MAX_WORDS = 12, MAX_WORD_LENGTH = 40;
const DAY_MS = 86400000;

// Redirects are refused: the only host this server will ever contact is calendar.google.com.
export async function fetchIcs(url) {
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "text/calendar" } });
  if (!r.ok) throw Object.assign(new Error("Google answered HTTP " + r.status), { status: r.status });
  const text = await r.text();
  if (text.length > MAX_ICS_BYTES) throw Object.assign(new Error("Calendar feed is too large"), { tooLarge: true });
  return text;
}

function explain(e) {
  if (e && (e.status || e.notCalendar)) return "Google didn't accept that link. Copy the iCal address again and reconnect.";
  if (e && e.tooLarge) return "That calendar is too large to read. Use a calendar with fewer events.";
  return "Couldn't reach Google Calendar. It'll try again when the Mac is online.";
}

function localIso(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}
function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function cleanWords(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(w => typeof w === "string").map(w => w.trim().slice(0, MAX_WORD_LENGTH)).filter(Boolean).slice(0, MAX_WORDS);
}

// Is today a day off? Yes when it is Mon–Sat, has no classes, and the calendar is in use (it has
// classes within two weeks either side). Only today is judged: colleges often publish the timetable
// just a day or two ahead, so an empty future date usually means "not published yet", not "holiday".
export function emptyToday(classes, today) {
  if (weekday(today) === 0 || classes[today]) return [];
  const lo = addDays(today, -IN_USE_DAYS), hi = addDays(today, IN_USE_DAYS);
  const inUse = Object.keys(classes).some(date => date >= lo && date <= hi);
  return inUse ? [{ date: today, title: NO_CLASSES_TITLE }] : [];
}

export function createCalendarSync({ home, readState, writeState, fetcher = fetchIcs, clock = () => new Date() }) {
  const configFile = path.join(home, "config.json");
  const scheduleFile = path.join(home, "calendar.json");
  let last = { checkedAt: null, found: 0, classDays: 0, error: null };
  let schedule = readSavedSchedule();

  function readConfig() {
    try { return JSON.parse(fs.readFileSync(configFile, "utf8")); }
    catch (e) { console.error(`[jee-sprint] couldn't read config.json: ${e.message}`); return {}; }
  }
  function writeJson(file, data, mode) {
    const tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), mode ? { mode } : undefined);
    fs.renameSync(tmp, file);
  }
  function writeConfig(config) { writeJson(configFile, config, 0o600); }
  function readSavedSchedule() {
    try { const s = JSON.parse(fs.readFileSync(scheduleFile, "utf8")); return s && typeof s.days === "object" ? s : null; }
    catch (e) { return null; }
  }
  function link() {
    const c = readConfig().calendar;
    return c && isGoogleCalendarIcsUrl(c.url) ? c : null;
  }
  function filter() {
    const f = readConfig().calendarFilter || {};
    return { skip: cleanWords(f.skip), only: cleanWords(f.only), batch: typeof f.batch === "string" ? f.batch.trim().slice(0, MAX_WORD_LENGTH) : "" };
  }
  function status() {
    const c = link(), f = filter();
    return { connected: !!c, everyAllDay: !!(c && c.everyAllDay), skip: f.skip, only: f.only, batch: f.batch, checkedAt: last.checkedAt, found: last.found, classDays: last.classDays, error: last.error };
  }
  function apply(found) {
    const result = applyCalendarDaysOff(readState(), found, clock().getTime());
    if (result.changed) writeState(result.state);
  }

  async function refresh() {
    const c = link();
    if (!c) return status();
    const now = clock(), today = localIso(now);
    try {
      const text = await fetcher(c.url);
      if (!/BEGIN:VCALENDAR/.test(text)) throw Object.assign(new Error("Response wasn't a calendar"), { notCalendar: true });
      const f = filter();
      // Look back two weeks as well, to tell a calendar in use from an abandoned one.
      const classes = parseIcsClasses(text, Object.assign({}, CALENDAR_WINDOW, f, { from: addDays(today, -IN_USE_DAYS) }));
      const named = parseIcsDaysOff(text, Object.assign({}, CALENDAR_WINDOW, { everyAllDay: !!c.everyAllDay }));
      const namedDates = new Set(named.map(x => x.date));
      const found = named.concat(emptyToday(classes, today).filter(x => !namedDates.has(x.date)));
      apply(found);
      const until = addDays(today, SCHEDULE_DAYS);
      const days = Object.fromEntries(Object.entries(classes).filter(([date]) => date >= today && date <= until && !namedDates.has(date)));
      schedule = { checkedAt: now.toISOString(), days };
      writeJson(scheduleFile, schedule);
      last = { checkedAt: now.toISOString(), found: found.filter(x => x.date >= today).length, classDays: Object.keys(days).length, error: null };
    } catch (e) {
      console.error(`[jee-sprint] calendar refresh failed: ${e.message}`); // message only: never log the secret link
      last = Object.assign({}, last, { checkedAt: now.toISOString(), error: explain(e) });
    }
    return status();
  }

  // Throws an Error with .userMessage when the link isn't a Google Calendar iCal link.
  function connect(url, everyAllDay) {
    if (!isGoogleCalendarIcsUrl(url)) {
      throw Object.assign(new Error("Not a Google Calendar iCal link"), { userMessage: "That isn't a Google Calendar iCal link. It should start with https://calendar.google.com/calendar/ical/ and end in .ics" });
    }
    writeConfig(Object.assign({}, readConfig(), { calendar: { url: String(url).trim(), everyAllDay: !!everyAllDay } }));
    return refresh();
  }
  function setEveryAllDay(everyAllDay) {
    const c = link();
    if (!c) return status();
    writeConfig(Object.assign({}, readConfig(), { calendar: { url: c.url, everyAllDay: !!everyAllDay } }));
    return refresh();
  }
  // Which events count as this person's classes. Saved even before a calendar is connected.
  // Each argument left undefined keeps its current value.
  function setFilter(skip, only, batch) {
    const cur = filter();
    const next = {
      skip: skip === undefined ? cur.skip : cleanWords(skip),
      only: only === undefined ? cur.only : cleanWords(only),
      batch: typeof batch === "string" ? batch.trim().slice(0, MAX_WORD_LENGTH) : cur.batch
    };
    writeConfig(Object.assign({}, readConfig(), { calendarFilter: next }));
    return refresh();
  }
  function disconnect() {
    const { calendar: _removed, ...rest } = readConfig();
    writeConfig(rest);
    apply([]); // switch off every calendar-made day off; manual ones stay
    schedule = null;
    fs.rmSync(scheduleFile, { force: true });
    last = { checkedAt: null, found: 0, classDays: 0, error: null };
    return status();
  }

  // What the apps need to draw the day: {checkedAt, days: {date: [{from, to, title}]}}, or null.
  function currentSchedule() { return link() ? schedule : null; }

  return { status, refresh, connect, setEveryAllDay, setFilter, disconnect, schedule: currentSchedule };
}
