import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, normalizeState, mergeStates, setChapter, addMock, deleteMock, chapterState, liveMocks, newMockId } from "../src/core.mjs";

const MOCK = { date: "2026-11-15", paper: "24 Jan 2025 S1", p: 40, c: 60, m: 30, leaks: { silly: 3, concept: 5 }, createdAt: "2026-11-15T13:00:00Z" };

test("setChapter returns a new state and leaves the original untouched", () => {
  const a = emptyState();
  const b = setChapter(a, "p-curr", 2, 100);
  assert.equal(chapterState(a, "p-curr"), 0);
  assert.equal(chapterState(b, "p-curr"), 2);
});

test("merge keeps the most recent change per chapter", () => {
  const phone = setChapter(setChapter(emptyState(), "p-curr", 1, 100), "c-goc", 3, 300);
  const mac = setChapter(setChapter(emptyState(), "p-curr", 2, 200), "c-goc", 1, 250);
  const merged = mergeStates(phone, mac);
  assert.equal(chapterState(merged, "p-curr"), 2);
  assert.equal(chapterState(merged, "c-goc"), 3);
  assert.deepEqual(mergeStates(mac, phone), merged, "merge is order-independent");
});

test("merge breaks timestamp ties the same way on both sides", () => {
  const a = setChapter(emptyState(), "m-int", 1, 500);
  const b = setChapter(emptyState(), "m-int", 3, 500);
  assert.equal(chapterState(mergeStates(a, b), "m-int"), 3);
  assert.equal(chapterState(mergeStates(b, a), "m-int"), 3);
});

test("a later delete removes a mock on the other device", () => {
  const withMock = addMock(emptyState(), "m1", MOCK, 100);
  const deleted = deleteMock(withMock, "m1", 200);
  assert.equal(liveMocks(mergeStates(withMock, deleted)).length, 0);
  assert.equal(liveMocks(mergeStates(deleted, withMock)).length, 0);
});

test("an older delete does not remove a mock edited later", () => {
  const deleted = deleteMock(emptyState(), "m1", 100);
  const readded = addMock(emptyState(), "m1", MOCK, 300);
  assert.equal(liveMocks(mergeStates(deleted, readded)).length, 1);
});

test("mocks from both devices survive a merge, sorted by date", () => {
  const a = addMock(emptyState(), "m1", Object.assign({}, MOCK, { date: "2026-11-29" }), 100);
  const b = addMock(emptyState(), "m2", MOCK, 100);
  const list = liveMocks(mergeStates(a, b));
  assert.deepEqual(list.map(m => m.id), ["m2", "m1"]);
  assert.equal(list[1].leaks.silly, 3);
  assert.equal(list[1].leaks.time, 0, "missing leak counts default to 0");
});

test("addMock rejects out-of-range marks", () => {
  assert.throws(() => addMock(emptyState(), "m1", Object.assign({}, MOCK, { p: 101 }), 1));
  assert.throws(() => addMock(emptyState(), "m1", Object.assign({}, MOCK, { date: "15/11/2026" }), 1));
  assert.throws(() => addMock(emptyState(), "bad id!", MOCK, 1));
});

test("normalizeState drops malformed or hostile entries", () => {
  const raw = {
    chapters: { "p-curr": { s: 2, t: 10 }, "p-bad": { s: 9, t: 10 }, "__proto__": { s: 1, t: 1 }, "x-y": { s: 1, t: 1 }, "c-goc": { s: 1 } },
    mocks: { ok: Object.assign({ t: 5 }, MOCK), "no good": Object.assign({ t: 5 }, MOCK), gone: { deleted: true, t: 7 }, big: Object.assign({ t: 5 }, MOCK, { leaks: { silly: 70, time: 10 } }) }
  };
  const s = normalizeState(raw);
  assert.deepEqual(Object.keys(s.chapters), ["p-curr"]);
  assert.deepEqual(Object.keys(s.mocks).sort(), ["gone", "ok"]);
  assert.equal(s.mocks.ok.paper, "24 Jan 2025 S1");
});

test("normalizeState tolerates junk input", () => {
  for (const junk of [null, 5, "x", [], { chapters: [], mocks: "no" }]) {
    assert.deepEqual(normalizeState(junk), emptyState());
  }
});

test("paper names are capped at 60 characters", () => {
  const s = normalizeState({ mocks: { m1: Object.assign({ t: 1 }, MOCK, { paper: "x".repeat(200) }) } });
  assert.equal(s.mocks.m1.paper.length, 60);
});

test("newMockId produces valid, distinct ids", () => {
  const a = newMockId(1790000000000, () => 0.1), b = newMockId(1790000000000, () => 0.2);
  assert.match(a, /^[A-Za-z0-9_-]{1,40}$/);
  assert.notEqual(a, b);
});

test("normalizeHost fixes the ways people type a Mac address", async () => {
  const { normalizeHost } = await import("../src/core.mjs");
  assert.equal(normalizeHost("https://192.0.2.20:5199"), "http://192.0.2.20:5199", "https is corrected to http");
  assert.equal(normalizeHost("192.0.2.20"), "http://192.0.2.20:5199", "bare numbers get scheme and port");
  assert.equal(normalizeHost("192.0.2.20:5199/"), "http://192.0.2.20:5199");
  assert.equal(normalizeHost("  HTTP://My-Mac.local  "), "http://My-Mac.local:5199");
  assert.equal(normalizeHost("http://192.0.2.3:6000/api/sync"), "http://192.0.2.3:6000", "a custom port and stray path are handled");
});

test("normalizeHost rejects things that aren't addresses", async () => {
  const { normalizeHost } = await import("../src/core.mjs");
  for (const bad of ["", "   ", null, undefined, "http://", "my mac", "192.0.2.3:99999", "192.0.2.3:0", "192.0.2.3:abc", "-bad-.local"]) {
    assert.equal(normalizeHost(bad), null, JSON.stringify(bad));
  }
});

// ---- days off ----
import { setDayOff, isDayOff, upcomingDaysOff, applyCalendarDaysOff } from "../src/core.mjs";

test("a manual day off is stored, read back and can be undone", () => {
  const on = setDayOff(emptyState(), "2026-10-20", true, 100);
  assert.equal(isDayOff(on, "2026-10-20"), true);
  assert.equal(isDayOff(on, "2026-10-21"), false);
  assert.equal(isDayOff(emptyState(), "2026-10-20"), false, "original state untouched");
  assert.equal(isDayOff(setDayOff(on, "2026-10-20", false, 200), "2026-10-20"), false);
});

test("calendar days off are added, and removed when the event disappears", () => {
  const a = applyCalendarDaysOff(emptyState(), [{ date: "2026-10-20", title: "Dasara Holiday" }, { date: "2026-11-02", title: "Holiday" }], 100);
  assert.equal(a.changed, true);
  assert.deepEqual(upcomingDaysOff(a.state, "2026-10-01").map(x => [x.date, x.title, x.src]), [["2026-10-20", "Dasara Holiday", "calendar"], ["2026-11-02", "Holiday", "calendar"]]);
  const b = applyCalendarDaysOff(a.state, [{ date: "2026-11-02", title: "Holiday" }], 200);
  assert.equal(b.changed, true);
  assert.equal(isDayOff(b.state, "2026-10-20"), false);
  assert.equal(isDayOff(b.state, "2026-11-02"), true);
});

test("an unchanged calendar doesn't rewrite the state", () => {
  const found = [{ date: "2026-10-20", title: "Holiday" }];
  const a = applyCalendarDaysOff(emptyState(), found, 100);
  const b = applyCalendarDaysOff(a.state, found, 999);
  assert.equal(b.changed, false);
  assert.equal(b.state.daysOff["2026-10-20"].t, 100);
});

test("a manual choice always beats the calendar, whichever is newer", () => {
  const manualNo = setDayOff(emptyState(), "2026-10-20", false, 100); // "I do have college"
  const afterImport = applyCalendarDaysOff(manualNo, [{ date: "2026-10-20", title: "Holiday" }], 500);
  assert.equal(isDayOff(afterImport.state, "2026-10-20"), false, "importer leaves manual entries alone");
  const calendarOnMac = applyCalendarDaysOff(emptyState(), [{ date: "2026-10-20", title: "Holiday" }], 900).state;
  assert.equal(isDayOff(mergeStates(manualNo, calendarOnMac), "2026-10-20"), false, "older manual entry still wins the merge");
  assert.equal(isDayOff(mergeStates(calendarOnMac, manualNo), "2026-10-20"), false);
});

test("two manual changes merge by most recent", () => {
  const a = setDayOff(emptyState(), "2026-10-20", true, 100), b = setDayOff(emptyState(), "2026-10-20", false, 200);
  assert.equal(isDayOff(mergeStates(a, b), "2026-10-20"), false);
  assert.equal(isDayOff(mergeStates(b, a), "2026-10-20"), false);
});

test("upcomingDaysOff lists only active days from today on, in order", () => {
  let s = setDayOff(emptyState(), "2026-11-05", true, 1);
  s = setDayOff(s, "2026-10-02", true, 1);
  s = setDayOff(s, "2026-10-09", false, 1);
  s = setDayOff(s, "2026-09-30", true, 1);
  assert.deepEqual(upcomingDaysOff(s, "2026-10-02").map(x => x.date), ["2026-10-02", "2026-11-05"]);
});

test("normalizeState keeps valid days off and drops bad ones", () => {
  const s = normalizeState({ daysOff: {
    "2026-10-20": { off: true, src: "calendar", title: "x".repeat(200), t: 5 },
    "2026-10-21": { off: true, src: "manual", t: 5 },
    "20/10/2026": { off: true, src: "manual", t: 5 },
    "2026-10-22": { off: "yes", src: "manual", t: 5 },
    "2026-10-23": { off: true, src: "hacker", t: 5 },
    "2026-10-24": { off: true, src: "manual" }
  } });
  assert.deepEqual(Object.keys(s.daysOff).sort(), ["2026-10-20", "2026-10-21"]);
  assert.equal(s.daysOff["2026-10-20"].title.length, 80);
  assert.deepEqual(normalizeState({ chapters: {} }).daysOff, {}, "old saved states without daysOff still load");
});

test("the skipped state (4) survives normalising and merging; 5 does not", () => {
  const s = normalizeState({ chapters: { "m-trig": { s: 4, t: 10 }, "m-sets": { s: 5, t: 10 } } });
  assert.deepEqual(Object.keys(s.chapters), ["m-trig"]);
  assert.equal(chapterState(mergeStates(s, setChapter(emptyState(), "m-trig", 0, 5)), "m-trig"), 4);
});

// ---- tests other than full mocks ----
import { testScore } from "../src/core.mjs";
const PART = { kind: "test", date: "2026-10-11", paper: "Sunday part test", subject: "X", questions: 25, correct: 15, wrong: 4, plus: 4, minus: 1, leaks: { concept: 3 }, createdAt: "2026-10-11T06:00:00Z" };

test("a test with any number of questions is stored and scored", () => {
  const s = addMock(emptyState(), "t1", PART, 100);
  const [m] = liveMocks(s);
  assert.equal(m.kind, "test");
  assert.deepEqual(testScore(m), { score: 56, max: 100, pct: 56, accuracy: 79, unattempted: 6 });
});

test("full mocks are scored out of 300 and old entries without a kind count as full mocks", () => {
  const old = normalizeState({ mocks: { m1: { t: 5, date: "2026-11-15", paper: "x", p: 40, c: 60, m: 30, leaks: {} } } });
  const [m] = liveMocks(old);
  assert.equal(m.kind, "full");
  assert.deepEqual(testScore(m), { score: 130, max: 300, pct: 43, accuracy: null, unattempted: null });
});

test("custom marking, like +1/0 or −0.25, is honoured", () => {
  const board = addMock(emptyState(), "t2", Object.assign({}, PART, { questions: 40, correct: 31, wrong: 9, plus: 1, minus: 0 }), 1);
  assert.deepEqual(testScore(liveMocks(board)[0]), { score: 31, max: 40, pct: 78, accuracy: 78, unattempted: 0 });
  const quarter = addMock(emptyState(), "t3", Object.assign({}, PART, { minus: 0.25 }), 1);
  assert.equal(testScore(liveMocks(quarter)[0]).score, 59);
});

test("impossible test results are rejected", () => {
  const bad = [
    { correct: 20, wrong: 6 },            // more answers than questions
    { questions: 0 }, { questions: 301 },
    { subject: "Bio" }, { plus: 0 }, { minus: -1 }, { plus: 4.123 },
    { leaks: { silly: 10, time: 20 } }     // more leaks than questions
  ];
  for (const change of bad) assert.throws(() => addMock(emptyState(), "x", Object.assign({}, PART, change), 1), JSON.stringify(change));
});
