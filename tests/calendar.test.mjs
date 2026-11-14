import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcsDaysOff, isGoogleCalendarIcsUrl } from "../src/calendar.mjs";

const WINDOW = { from: "2026-10-01", to: "2027-01-31" };
const ics = (...events) => "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + events.map(e => "BEGIN:VEVENT\r\n" + e.join("\r\n") + "\r\nEND:VEVENT\r\n").join("") + "END:VCALENDAR\r\n";
const dates = list => list.map(x => x.date);

test("an all-day event named like a holiday becomes a day off", () => {
  const out = parseIcsDaysOff(ics(["DTSTART;VALUE=DATE:20261020", "DTEND;VALUE=DATE:20261021", "SUMMARY:Dasara Holiday"]), WINDOW);
  assert.deepEqual(out, [{ date: "2026-10-20", title: "Dasara Holiday" }]);
});

test("ordinary events are ignored unless every all-day event counts", () => {
  const feed = ics(
    ["DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261106", "SUMMARY:Mum's birthday"],
    ["DTSTART:20261106T043000Z", "DTEND:20261106T053000Z", "SUMMARY:Dentist"]
  );
  assert.deepEqual(parseIcsDaysOff(feed, WINDOW), []);
  assert.deepEqual(dates(parseIcsDaysOff(feed, { ...WINDOW, everyAllDay: true })), ["2026-11-05"], "timed events still need a day-off word");
});

test("day-off words match as whole words, in any case", () => {
  const feed = ics(
    ["DTSTART;VALUE=DATE:20261012", "SUMMARY:NO COLLEGE"],
    ["DTSTART;VALUE=DATE:20261013", "SUMMARY:college off (strike)"],
    ["DTSTART;VALUE=DATE:20261014", "SUMMARY:Bandh"],
    ["DTSTART;VALUE=DATE:20261015", "SUMMARY:Offer letter"],
    ["DTSTART;VALUE=DATE:20261016", "SUMMARY:Cleave the report"]
  );
  assert.deepEqual(dates(parseIcsDaysOff(feed, WINDOW)), ["2026-10-12", "2026-10-13", "2026-10-14"]);
});

test("a multi-day holiday covers every date; DTEND is exclusive", () => {
  const out = parseIcsDaysOff(ics(["DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227", "SUMMARY:Christmas vacation"]), WINDOW);
  assert.deepEqual(dates(out), ["2026-12-24", "2026-12-25", "2026-12-26"]);
});

test("dates outside the plan window are dropped, including the part of a span that overhangs", () => {
  const feed = ics(
    ["DTSTART;VALUE=DATE:20260815", "SUMMARY:Holiday"],
    ["DTSTART;VALUE=DATE:20270130", "DTEND;VALUE=DATE:20270203", "SUMMARY:Holiday"]
  );
  assert.deepEqual(dates(parseIcsDaysOff(feed, WINDOW)), ["2027-01-30", "2027-01-31"]);
});

test("cancelled events don't count", () => {
  assert.deepEqual(parseIcsDaysOff(ics(["DTSTART;VALUE=DATE:20261020", "SUMMARY:Holiday", "STATUS:CANCELLED"]), WINDOW), []);
});

test("a timed event with a day-off word counts on its local date", () => {
  const out = parseIcsDaysOff(ics(["DTSTART;TZID=Asia/Kolkata:20261118T090000", "DTEND;TZID=Asia/Kolkata:20261118T170000", "SUMMARY:No college - sports day"]), WINDOW);
  assert.deepEqual(dates(out), ["2026-11-18"]);
});

test("folded lines and escaped characters in titles are handled", () => {
  const feed = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261102\r\nSUMMARY:Holiday\\, Foundation Day \r\n (state)\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert.deepEqual(parseIcsDaysOff(feed, WINDOW), [{ date: "2026-11-02", title: "Holiday, Foundation Day (state)" }]);
});

test("weekly repeats honour BYDAY, INTERVAL, UNTIL and EXDATE", () => {
  const feed = ics(["DTSTART;VALUE=DATE:20261003", "SUMMARY:No college", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;UNTIL=20261115", "EXDATE;VALUE=DATE:20261017"]);
  assert.deepEqual(dates(parseIcsDaysOff(feed, WINDOW)), ["2026-10-03", "2026-10-31", "2026-11-14"]);
});

test("a 'second Saturday' monthly repeat that began before the window works", () => {
  const feed = ics(["DTSTART;VALUE=DATE:20260613", "SUMMARY:College holiday", "RRULE:FREQ=MONTHLY;BYDAY=2SA"]);
  assert.deepEqual(dates(parseIcsDaysOff(feed, WINDOW)), ["2026-10-10", "2026-11-14", "2026-12-12", "2027-01-09"]);
});

test("COUNT limits a repeat, counting from its first occurrence", () => {
  const feed = ics(["DTSTART;VALUE=DATE:20260928", "SUMMARY:Leave", "RRULE:FREQ=DAILY;COUNT=5"]);
  assert.deepEqual(dates(parseIcsDaysOff(feed, WINDOW)), ["2026-10-01", "2026-10-02"]);
});

test("yearly repeats land on the same date", () => {
  const feed = ics(["DTSTART;VALUE=DATE:20201225", "SUMMARY:Christmas holiday", "RRULE:FREQ=YEARLY"]);
  assert.deepEqual(dates(parseIcsDaysOff(feed, WINDOW)), ["2026-12-25"]);
});

test("the same date from two events appears once", () => {
  const feed = ics(["DTSTART;VALUE=DATE:20261020", "SUMMARY:Holiday"], ["DTSTART;VALUE=DATE:20261020", "SUMMARY:No college"]);
  assert.equal(parseIcsDaysOff(feed, WINDOW).length, 1);
});

test("junk input yields no days off", () => {
  for (const junk of ["", "not a calendar", "BEGIN:VEVENT\nSUMMARY:Holiday\nEND:VEVENT", "BEGIN:VEVENT\nDTSTART:garbage\nSUMMARY:Holiday\nEND:VEVENT"]) {
    assert.deepEqual(parseIcsDaysOff(junk, WINDOW), []);
  }
});

test("only Google Calendar iCal links are accepted", () => {
  assert.ok(isGoogleCalendarIcsUrl("https://calendar.google.com/calendar/ical/name%40example.com/private-abc123/basic.ics"));
  assert.ok(isGoogleCalendarIcsUrl("  https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics "));
  for (const bad of [
    "http://calendar.google.com/calendar/ical/x/basic.ics", "https://evil.example/calendar/ical/x/basic.ics",
    "https://calendar.google.com.evil.example/calendar/ical/x/basic.ics", "https://calendar.google.com/calendar/u/0/r",
    "https://user:pw@calendar.google.com/calendar/ical/x/basic.ics", "https://calendar.google.com:8443/calendar/ical/x/basic.ics",
    "file:///etc/passwd", "http://127.0.0.1:5199/api/info", "", null
  ]) assert.equal(isGoogleCalendarIcsUrl(bad), false, String(bad));
});

// ---- class timetable ----
import { parseIcsClasses } from "../src/calendar.mjs";
import { classLabel } from "../src/day-plan.mjs";
const IST = { ...WINDOW, utcOffsetMinutes: 330 };

test("timed events become that day's classes, in local time and in order", () => {
  const feed = ics(
    ["UID:b", "DTSTART:20261006T041000Z", "DTEND:20261006T051000Z", "SUMMARY:GH;Math;Batch;PCM-Alpha"],
    ["UID:a", "DTSTART:20261006T030000Z", "DTEND:20261006T041000Z", "SUMMARY:ABC;Phy;Batch- PCM-Alpha"],
    ["UID:c", "DTSTART;VALUE=DATE:20261006", "SUMMARY:Someone's birthday"]
  );
  assert.deepEqual(parseIcsClasses(feed, IST), { "2026-10-06": [
    { from: "08:30", to: "09:40", title: "ABC;Phy;Batch- PCM-Alpha" },
    { from: "09:40", to: "10:40", title: "GH;Math;Batch;PCM-Alpha" }
  ] });
});

test("a UTC time late in the evening lands on the next local date", () => {
  const out = parseIcsClasses(ics(["UID:a", "DTSTART:20261006T190000Z", "DTEND:20261006T200000Z", "SUMMARY:Night class"]), IST);
  assert.deepEqual(out, { "2026-10-07": [{ from: "00:30", to: "01:30", title: "Night class" }] });
});

test("skip words drop other students' subjects but keep a shared lab", () => {
  const feed = ics(
    ["UID:1", "DTSTART;TZID=Asia/Kolkata:20261006T153000", "DTEND;TZID=Asia/Kolkata:20261006T164000", "SUMMARY:DEF;Bio;Batch;B-Dr.Gamma & Alpha batch"],
    ["UID:2", "DTSTART;TZID=Asia/Kolkata:20261006T153000", "DTEND;TZID=Asia/Kolkata:20261006T164000", "SUMMARY:RST;Stat;Batch;S-Dr.Gamma & Alpha batch"],
    ["UID:3", "DTSTART;TZID=Asia/Kolkata:20261006T153000", "DTEND;TZID=Asia/Kolkata:20261006T164000", "SUMMARY:OPQ;CS Lab;Batch;CS-"],
    ["UID:4", "DTSTART;TZID=Asia/Kolkata:20261008T153000", "DTEND;TZID=Asia/Kolkata:20261008T180000", "SUMMARY:HI;JK/XYZ;OPQ;LM;Bio/CS lab; Batch; B- Dr. Gamma & Alpha"]
  );
  const out = parseIcsClasses(feed, { ...IST, skip: [";Bio;", ";stat;"] });
  assert.deepEqual(out["2026-10-06"].map(c => c.title), ["OPQ;CS Lab;Batch;CS-"]);
  assert.equal(out["2026-10-08"].length, 1, "Bio/CS lab is kept: it isn't ';Bio;'");
});

test("'only' words keep just the matching events", () => {
  const feed = ics(
    ["UID:1", "DTSTART;TZID=Asia/Kolkata:20261006T083000", "DTEND;TZID=Asia/Kolkata:20261006T094000", "SUMMARY:ABC;Phy;Batch- PCM-Alpha"],
    ["UID:2", "DTSTART;TZID=Asia/Kolkata:20261006T180000", "DTEND;TZID=Asia/Kolkata:20261006T183000", "SUMMARY:ABC;Phy-REMEDIAL SESSION-CS lab"]
  );
  assert.equal(parseIcsClasses(feed, { ...IST, only: ["alpha"] })["2026-10-06"].length, 1);
  assert.equal(parseIcsClasses(feed, IST)["2026-10-06"].length, 2);
});

test("a weekly class repeats, and a moved or cancelled instance replaces the original", () => {
  const feed = ics(
    ["UID:phy", "DTSTART;TZID=Asia/Kolkata:20261005T083000", "DTEND;TZID=Asia/Kolkata:20261005T094000", "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261026T000000Z", "SUMMARY:Phy"],
    ["UID:phy", "RECURRENCE-ID;TZID=Asia/Kolkata:20261012T083000", "DTSTART;TZID=Asia/Kolkata:20261012T110000", "DTEND;TZID=Asia/Kolkata:20261012T121500", "SUMMARY:Phy (moved)"],
    ["UID:phy", "RECURRENCE-ID;TZID=Asia/Kolkata:20261019T083000", "DTSTART;TZID=Asia/Kolkata:20261019T083000", "DTEND;TZID=Asia/Kolkata:20261019T094000", "STATUS:CANCELLED", "SUMMARY:Phy"]
  );
  const out = parseIcsClasses(feed, IST);
  assert.deepEqual(out["2026-10-05"], [{ from: "08:30", to: "09:40", title: "Phy" }]);
  assert.deepEqual(out["2026-10-12"], [{ from: "11:00", to: "12:15", title: "Phy (moved)" }]);
  assert.equal(out["2026-10-19"], undefined, "cancelled instance leaves the day empty");
  assert.equal(out["2026-10-26"], undefined, "UNTIL stops the repeat");
});

test("identical duplicate events are listed once, and cancelled ones not at all", () => {
  const e = ["DTSTART;TZID=Asia/Kolkata:20261006T083000", "DTEND;TZID=Asia/Kolkata:20261006T094000", "SUMMARY:Phy"];
  const feed = ics(["UID:1", ...e], ["UID:2", ...e], ["UID:3", ...e, "STATUS:CANCELLED"]);
  assert.equal(parseIcsClasses(feed, IST)["2026-10-06"].length, 1);
});

test("classLabel pulls the subject out of the college's event titles", () => {
  const cases = {
    "ABC;Phy;Batch- PCM-Alpha": "Phy",
    ";Chem;Batch;PCM-Alpha": "Chem",
    "GH;Math;Batch;PCM-Alpha": "Math",
    "AAB/CD/EFG;Hindi/Sanskrit;Batch;S-Dr.Gamma & Alpha": "Hindi/Sanskrit",
    "OPQ;YZ;CS Lab;Batch;CS-": "CS Lab",
    "OPQ;CS;Batch;CS-Dr.Gamma": "CS",
    "HI;JK/XYZ;OPQ;LM;Bio/CS lab; Batch; B- Dr. Gamma & Alpha": "Bio/CS lab",
    "LMN;UVX/ABC/ST;NOP;QR;Phy/Chem lab; Batch; C- Alpha": "Phy/Chem lab",
    "UVW;Eng;Batch;Dr.Gamma & Alpha-5A": "Eng",
    "ABC;Phy-REMEDIAL SESSION-CS lab": "Phy-REMEDIAL SESSION-CS lab",
    "Parent-teacher meeting": "Parent-teacher meeting"
  };
  for (const [title, label] of Object.entries(cases)) assert.equal(classLabel(title), label, title);
});

test("with a batch set, events naming another batch are dropped; events naming none are kept", () => {
  const at = (uid, title) => ["UID:" + uid, "DTSTART;TZID=Asia/Kolkata:20261007T153000", "DTEND;TZID=Asia/Kolkata:20261007T173000", "SUMMARY:" + title];
  const feed = ics(
    at(1, "LMN;ABC;Phy lab midterm Exam; Batch - Alpha"), at(2, "LMN;ABC;Phy lab midterm Exam; Batch - Beta"),
    at(3, "LMN;ABC;Phy lab midterm Exam; Batch - Dr. Gamma"), at(4, "OPQ;CS Lab;Batch;CS-Dr.Gamma & Alpha batch"),
    at(5, "ABC;Phy-REMEDIAL SESSION-CS lab"), at(6, "CLASS 12 - MID TERM EXAM - PHYSICS")
  );
  const kept = parseIcsClasses(feed, { ...IST, batch: "alpha" })["2026-10-07"].map(c => c.title);
  assert.deepEqual(kept.sort(), ["LMN;ABC;Phy lab midterm Exam; Batch - Alpha", "CLASS 12 - MID TERM EXAM - PHYSICS", "OPQ;CS Lab;Batch;CS-Dr.Gamma & Alpha batch", "ABC;Phy-REMEDIAL SESSION-CS lab"].sort());
  assert.equal(parseIcsClasses(feed, IST)["2026-10-07"].length, 6, "no batch set: everything counts");
});
