import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminders } from "../src/reminders.mjs";
import { d } from "../src/plan-data.mjs";

const EARLY = new Date(2026, 0, 1);

test("nothing is scheduled before the plan starts on 1 Oct", () => {
  assert.equal(buildReminders(d("2026-09-29"), 2, EARLY).length, 0);
  const first = buildReminders(d("2026-09-29"), 3, EARLY);
  assert.ok(first.length > 0);
  assert.ok(first.every(r => r.at >= d("2026-10-01")));
});

test("nothing is scheduled from the first exam day", () => {
  const list = buildReminders(d("2027-01-20"), 5, EARLY);
  assert.ok(list.length > 0);
  assert.ok(list.every(r => r.at < d("2027-01-22")));
});

test("a college day has the three blocks and a wind-down", () => {
  const list = buildReminders(d("2026-10-12"), 1, EARLY); // Monday, week 2
  assert.deepEqual(list.map(r => r.at.getHours() + ":" + r.at.getMinutes()), ["5:40", "19:45", "21:45", "22:15"]);
  assert.equal(list[1].title, "Block 2 · Learn Physics");
  assert.match(list[1].body, /Current Electricity, Semiconductors & Logic Gates/);
});

test("Block 2 rotates subjects through the week", () => {
  const titles = buildReminders(d("2026-10-12"), 6, EARLY).filter(r => r.title.startsWith("Block 2")).map(r => r.title.split(" ").pop());
  assert.deepEqual(titles, ["Physics", "Chemistry", "Maths", "Physics", "Chemistry", "Maths"]);
});

test("mock Sundays get the mock schedule, other Sundays the study one", () => {
  assert.equal(buildReminders(d("2026-11-15"), 1, EARLY)[1].title, "Full mock · 3 hours");
  assert.equal(buildReminders(d("2026-11-22"), 1, EARLY)[1].title, "S2 · Part test");
});

test("revision weeks use the second-pass tasks, January uses sprints", () => {
  const dec = buildReminders(d("2026-12-21"), 1, EARLY); // Monday, week 12
  assert.equal(dec[1].title, "Block 2 · Second pass Physics");
  assert.match(dec[1].body, /20 more PYQs/);
  assert.equal(buildReminders(d("2027-01-05"), 1, EARLY)[1].title, "Block 2 · Subject sprint"); // Tuesday
  assert.equal(buildReminders(d("2027-01-04"), 1, EARLY)[1].title, "Block 2 · Weak-chapter drill"); // Monday
});

test("reminders already in the past are skipped", () => {
  const now = new Date(2026, 9, 12, 20, 0); // Mon 12 Oct, 20:00
  const list = buildReminders(d("2026-10-12"), 1, now);
  assert.deepEqual(list.map(r => r.title), ["Block 3 · Lock it in", "Wind down"]);
});

test("ids are unique and stable across calls", () => {
  const a = buildReminders(d("2026-10-01"), 113, EARLY);
  assert.equal(new Set(a.map(r => r.id)).size, a.length);
  const b = buildReminders(d("2026-11-10"), 3, EARLY);
  for (const r of b) assert.equal(a.find(x => x.at.getTime() === r.at.getTime()).id, r.id);
  assert.ok(a.every(r => Number.isInteger(r.id) && r.id > 0 && r.id < 2147483647));
});

test("a day off from college gets the Sunday blocks instead of the college-day ones", () => {
  const isOff = date => date === "2026-10-13";
  const list = buildReminders(d("2026-10-12"), 3, EARLY, isOff);
  const titlesOn = iso => list.filter(r => r.at.getDate() === Number(iso.slice(8))).map(r => r.title);
  assert.equal(titlesOn("2026-10-12")[0], "Block 1 · Practice");
  assert.deepEqual(titlesOn("2026-10-13"), ["S1 · Deep block", "S2 · Part test", "S4 · PYQ block", "S5 · Revision loop", "Plan next week"]);
  assert.equal(titlesOn("2026-10-14")[0], "Block 1 · Practice");
});

test("a day off never turns a mock Sunday into a study Sunday", () => {
  assert.equal(buildReminders(d("2026-11-15"), 1, EARLY, () => true)[1].title, "Full mock · 3 hours");
});

test("with the day's real classes, reminders move to fit and extra blocks get one", () => {
  const classesOn = date => date === "2026-10-13" ? [{ from: "11:00", to: "15:15", title: "x" }] : date === "2026-10-14" ? [{ from: "08:30", to: "18:30", title: "x" }] : null;
  const list = buildReminders(d("2026-10-12"), 3, EARLY, () => false, classesOn);
  const on = day => list.filter(r => r.at.getDate() === day).map(r => String(r.at.getHours()).padStart(2, "0") + ":" + String(r.at.getMinutes()).padStart(2, "0") + " " + r.title);
  assert.deepEqual(on(13), ["05:40 Block 1 · Practice", "07:15 Extra morning block", "16:30 Extra block", "19:45 Block 2 · Learn Chemistry", "21:45 Block 3 · Lock it in", "22:15 Wind down"]);
  assert.deepEqual(on(14).map(x => x.slice(0, 5)), ["05:40", "19:45", "21:45", "22:15"], "a normal 8:30–18:30 day is unchanged");
  assert.deepEqual(on(12).map(x => x.slice(0, 5)), ["05:40", "19:45", "21:45", "22:15"], "no calendar info: the standard day");
  assert.equal(new Set(list.map(r => r.id)).size, list.length);
});
