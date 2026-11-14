// The Google Calendar link on the Node server, with a fake feed in place of Google.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../server.mjs";
import { emptyState, setDayOff } from "../src/core.mjs";

const TOKEN = "cal-test-token";
const LINK = "https://calendar.google.com/calendar/ical/name%40example.com/private-SECRET123/basic.ics";
const event = (date, title) => `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${date}\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
const feed = (...events) => "BEGIN:VCALENDAR\r\n" + events.join("") + "END:VCALENDAR\r\n";

let home, server, base, nextFeed, fetched;
before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "jee-cal-"));
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ token: TOKEN, port: 5199 }));
  fetched = [];
  const fetchIcs = async url => { fetched.push(url); if (nextFeed instanceof Error) throw nextFeed; return nextFeed; };
  server = createServer({ home, publicDir: home, token: TOKEN, fetchIcs, clock: () => new Date(2026, 9, 5, 10, 0) }); // Mon 5 Oct 2026
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (method, body) => fetch(base + "/api/calendar", {
  method, headers: { "Content-Type": "application/json", "x-sync-token": TOKEN }, body: body ? JSON.stringify(body) : undefined
}).then(async r => ({ status: r.status, body: await r.json() }));
const sync = state => fetch(base + "/api/sync", {
  method: "POST", headers: { "Content-Type": "application/json", "x-sync-token": TOKEN }, body: JSON.stringify({ state })
}).then(r => r.json());
const daysOff = async () => {
  const s = (await sync(emptyState())).data.state.daysOff;
  return Object.keys(s).filter(d => s[d].off).sort();
};

test("calendar status needs the sync key and starts disconnected", async () => {
  assert.equal((await fetch(base + "/api/calendar")).status, 401);
  const r = await call("GET");
  assert.deepEqual(r.body.data, { connected: false, everyAllDay: false, skip: [], only: [], batch: "", checkedAt: null, found: 0, classDays: 0, error: null });
});

test("a link that isn't a Google Calendar iCal link is refused and never fetched", async () => {
  for (const url of ["http://127.0.0.1:5199/api/info", "https://evil.example/calendar/ical/x/basic.ics", "file:///etc/passwd"]) {
    const r = await call("POST", { url });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Google Calendar iCal link/);
  }
  assert.deepEqual(fetched, []);
  assert.equal((await call("GET")).body.data.connected, false);
});

test("connecting reads the feed and the days off reach a syncing phone", async () => {
  nextFeed = feed(event("20261020", "Dasara Holiday"), event("20261102", "No college"), event("20261105", "Dentist"));
  const r = await call("POST", { url: LINK });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.connected, true);
  assert.equal(r.body.data.found, 2);
  assert.equal(r.body.data.error, null);
  assert.deepEqual(fetched, [LINK]);
  assert.deepEqual(await daysOff(), ["2026-10-20", "2026-11-02"]);
});

test("the secret link is stored privately and never sent back", async () => {
  const r = await call("GET");
  assert.ok(!JSON.stringify(r.body).includes("SECRET123"));
  const cfg = path.join(home, "config.json");
  assert.equal(JSON.parse(fs.readFileSync(cfg, "utf8")).calendar.url, LINK);
  assert.equal(fs.statSync(cfg).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(cfg, "utf8")).token, TOKEN, "the sync key survives");
});

test("'every all-day event' widens what counts", async () => {
  nextFeed = feed(event("20261020", "Dasara Holiday"), event("20261105", "Dentist"));
  const r = await call("POST", { everyAllDay: true });
  assert.equal(r.body.data.everyAllDay, true);
  assert.deepEqual(await daysOff(), ["2026-10-20", "2026-11-05"]);
  await call("POST", { everyAllDay: false });
  assert.deepEqual(await daysOff(), ["2026-10-20"]);
});

test("a phone's manual 'I have college' survives the next calendar refresh", async () => {
  await sync(setDayOff(emptyState(), "2026-10-20", false, Date.now()));
  await call("POST", { refresh: true });
  assert.deepEqual(await daysOff(), []);
});

test("when Google can't be reached the old days stay and the status explains", async () => {
  nextFeed = feed(event("20261225", "Christmas holiday"));
  await call("POST", { refresh: true });
  nextFeed = new Error("getaddrinfo ENOTFOUND");
  const r = await call("POST", { refresh: true });
  assert.match(r.body.data.error, /Couldn't reach Google Calendar/);
  assert.deepEqual(await daysOff(), ["2026-12-25"]);
  nextFeed = Object.assign(new Error("HTTP 404"), { status: 404 });
  assert.match((await call("POST", { refresh: true })).body.data.error, /didn't accept that link/);
  nextFeed = "<html>Sign in</html>";
  assert.match((await call("POST", { refresh: true })).body.data.error, /didn't accept that link/);
});

const cls = (date, from, to, title) => `BEGIN:VEVENT\r\nUID:${date}${from}${title}\r\nDTSTART;TZID=Asia/Kolkata:${date}T${from}00\r\nDTEND;TZID=Asia/Kolkata:${date}T${to}00\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
const syncFull = async () => (await sync(emptyState())).data;

test("classes reach the apps with each sync; future empty days are not guessed as days off", async () => {
  // Today is Mon 5 Oct and has classes. Tue 6 has none yet: the college just hasn't published it.
  nextFeed = feed(
    cls("20261005", "0830", "0940", "ABC;Phy;Batch- PCM-Alpha"), cls("20261005", "1530", "1640", "DEF;Bio;Batch;B-x"),
    cls("20261007", "0830", "1515", "GH;Math;Batch;PCM-Alpha"), cls("20261012", "0830", "0940", "IJK;Chem;Batch;PCM-Alpha")
  );
  const r = await call("POST", { url: LINK });
  assert.equal(r.body.data.error, null);
  assert.equal(r.body.data.classDays, 3);
  const data = await syncFull();
  assert.deepEqual(Object.keys(data.calendar.days), ["2026-10-05", "2026-10-07", "2026-10-12"]);
  assert.deepEqual(data.calendar.days["2026-10-07"], [{ from: "08:30", to: "15:15", title: "GH;Math;Batch;PCM-Alpha" }]);
  const off = Object.keys(data.state.daysOff).filter(d => data.state.daysOff[d].off && d >= "2026-10-05" && d <= "2026-10-12");
  assert.deepEqual(off, []);
});

test("an empty today in a live calendar becomes a day off", async () => {
  nextFeed = feed(cls("20261003", "0830", "0940", "ABC;Phy;Batch- PCM-Alpha"), cls("20261007", "0830", "0940", "ABC;Phy;Batch- PCM-Alpha"));
  await call("POST", { refresh: true });
  const data = await syncFull();
  assert.equal(data.state.daysOff["2026-10-05"].off, true);
  assert.equal(data.state.daysOff["2026-10-05"].title, "No classes in your calendar");
  assert.equal(data.state.daysOff["2026-10-06"], undefined, "tomorrow is left alone");
  // The college then publishes today's timetable: the day off is withdrawn on the next check.
  nextFeed = feed(cls("20261005", "0830", "0940", "ABC;Phy;Batch- PCM-Alpha"), cls("20261005", "1530", "1640", "DEF;Bio;Batch;B-x"),
    cls("20261007", "0830", "1515", "GH;Math;Batch;PCM-Alpha"), cls("20261012", "0830", "0940", "IJK;Chem;Batch;PCM-Alpha"));
  await call("POST", { refresh: true });
  assert.equal((await syncFull()).state.daysOff["2026-10-05"].off, false);
});

test("my-batch setting drops other batches' events", async () => {
  nextFeed = feed(cls("20261005", "0830", "0940", "ABC;Phy;Batch- PCM-Alpha"), cls("20261005", "1530", "1730", "LMN;Phy lab Exam; Batch - Beta"),
    cls("20261005", "1800", "1830", "ABC;Phy-REMEDIAL SESSION-CS lab"), cls("20261005", "1530", "1640", "DEF;Bio;Batch;B-x"),
    cls("20261007", "0830", "1515", "GH;Math;Batch;PCM-Alpha"), cls("20261012", "0830", "0940", "IJK;Chem;Batch;PCM-Alpha"));
  const r = await call("POST", { batch: "Alpha" });
  assert.equal(r.body.data.batch, "Alpha");
  assert.deepEqual((await syncFull()).calendar.days["2026-10-05"].map(c => c.title), ["ABC;Phy;Batch- PCM-Alpha", "ABC;Phy-REMEDIAL SESSION-CS lab"]);
  await call("POST", { batch: "" });
  nextFeed = feed(cls("20261005", "0830", "0940", "ABC;Phy;Batch- PCM-Alpha"), cls("20261005", "1530", "1640", "DEF;Bio;Batch;B-x"),
    cls("20261007", "0830", "1515", "GH;Math;Batch;PCM-Alpha"), cls("20261012", "0830", "0940", "IJK;Chem;Batch;PCM-Alpha"));
  await call("POST", { refresh: true });
});

test("the subject filter drops other students' classes and is remembered", async () => {
  const r = await call("POST", { skip: [";Bio;", "  ", 42], only: [] });
  assert.deepEqual(r.body.data.skip, [";Bio;"]);
  const data = await syncFull();
  assert.deepEqual(data.calendar.days["2026-10-05"].map(c => c.title), ["ABC;Phy;Batch- PCM-Alpha"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).calendarFilter, { skip: [";Bio;"], only: [], batch: "" });
});

test("a holiday event hides that day's leftover classes", async () => {
  nextFeed = feed(cls("20261005", "0830", "0940", "Phy"), cls("20261007", "0830", "0940", "Phy"), event("20261007", "Holiday"));
  await call("POST", { refresh: true });
  const data = await syncFull();
  assert.equal(data.calendar.days["2026-10-07"], undefined);
  assert.equal(data.state.daysOff["2026-10-07"].title, "Holiday");
});

test("disconnecting removes calendar days off but keeps manual ones", async () => {
  await sync(setDayOff(emptyState(), "2026-12-01", true, Date.now()));
  const r = await call("POST", { disconnect: true });
  assert.equal(r.body.data.connected, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).calendar, undefined);
  assert.deepEqual(await daysOff(), ["2026-12-01"]);
  assert.equal((await syncFull()).calendar, null);
  assert.equal(fs.existsSync(path.join(home, "calendar.json")), false);
});

import { emptyToday } from "../calendar-sync.mjs";
test("only today is ever inferred as a day off, and only from a calendar that is in use", () => {
  const live = { "2026-10-03": [1], "2026-10-07": [1] };
  assert.deepEqual(emptyToday(live, "2026-10-05"), [{ date: "2026-10-05", title: "No classes in your calendar" }]);
  assert.deepEqual(emptyToday(live, "2026-10-07"), [], "today has classes");
  assert.deepEqual(emptyToday(live, "2026-10-04"), [], "Sunday is never listed");
  assert.deepEqual(emptyToday({ "2026-09-01": [1] }, "2026-10-05"), [], "nothing within two weeks either side: the calendar isn't in use");
  assert.deepEqual(emptyToday({ "2026-09-25": [1] }, "2026-10-05"), [{ date: "2026-10-05", title: "No classes in your calendar" }], "recent classes are enough");
  assert.deepEqual(emptyToday({}, "2026-10-05"), []);
});
