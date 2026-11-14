import { test } from "node:test";
import assert from "node:assert/strict";
import { catchUp, SKIPPED } from "../src/catch-up.mjs";
import { d, WEEKS, CH } from "../src/plan-data.mjs";

// Chapters due by the end of week N (weeks 0..N), in plan order.
const dueThrough = n => WEEKS.filter(w => w.n <= n).flatMap(w => [...w.P, ...w.C, ...w.M]);
const states = map => id => map[id] || 0;
const allDone = ids => Object.fromEntries(ids.map(id => [id, 2]));
const MON_WEEK2 = d("2026-10-12"); // weeks 0 and 1 are over: 5 + 5 = 10 chapters due

test("nothing is due before the first week ends", () => {
  const r = catchUp(states({}), d("2026-10-03"));
  assert.deepEqual([r.carried, r.behind, r.level, r.due], [[], 0, "ok", 0]);
});

test("everything due and done is on pace", () => {
  const r = catchUp(states(allDone(dueThrough(1))), MON_WEEK2);
  assert.equal(r.due, 10);
  assert.deepEqual([r.behind, r.ahead, r.level, r.suggestSkip], [0, 0, "ok", null]);
});

test("unfinished chapters from past weeks carry over, most important first", () => {
  const done = allDone(dueThrough(1));
  delete done["m-sets"];      // Low, week 0
  delete done["p-estat"];     // Top, week 1
  done["c-period"] = 1;       // Med, week 1, only started
  const r = catchUp(states(done), MON_WEEK2);
  assert.deepEqual(r.carried, ["p-estat", "c-period", "m-sets"]);
  assert.equal(r.behind, 3);
  assert.equal(r.level, "catchup");
  assert.equal(r.suggestSkip, null, "three behind is still catch-up territory");
});

test("this week's chapters are not counted as behind", () => {
  const r = catchUp(states(allDone(dueThrough(1))), d("2026-10-14")); // mid week 2
  assert.equal(r.behind, 0);
});

test("four to six behind: do some the short way, and the lowest-priority one is offered for skipping", () => {
  const done = allDone(dueThrough(1));
  for (const id of ["m-sets", "c-period", "c-mole", "p-units"]) delete done[id]; // Low, Med, Med, Med
  const r = catchUp(states(done), MON_WEEK2);
  assert.equal(r.behind, 4);
  assert.equal(r.level, "short");
  assert.equal(r.suggestSkip, "m-sets");
});

test("seven or more behind is beyond catch-up", () => {
  const r = catchUp(states({}), MON_WEEK2);
  assert.equal(r.behind, 10);
  assert.equal(r.level, "skip");
  assert.equal(CH[r.suggestSkip].tier, "Low");
});

test("a Top chapter is never the one suggested for skipping", () => {
  const done = allDone(dueThrough(1));
  for (const id of dueThrough(1).filter(id => CH[id].tier === "Top")) delete done[id];
  const r = catchUp(states(done), MON_WEEK2);
  assert.ok(r.behind >= 3);
  assert.ok(r.carried.every(id => CH[id].tier === "Top"));
  assert.equal(r.suggestSkip, null);
});

test("skipping a chapter takes it off the backlog and lists it as skipped", () => {
  const done = allDone(dueThrough(1));
  for (const id of ["m-sets", "c-period", "c-mole", "p-units"]) delete done[id];
  done["m-sets"] = SKIPPED;
  const r = catchUp(states(done), MON_WEEK2);
  assert.equal(r.behind, 3);
  assert.deepEqual(r.skipped, ["m-sets"]);
  assert.ok(!r.carried.includes("m-sets"));
  assert.equal(r.done, 6, "skipped is not done");
});

test("chapters finished ahead of schedule show as ahead", () => {
  const done = allDone(dueThrough(1));
  done["p-curr"] = 2; done["c-bond"] = 3; // week 2 chapters, already done
  const r = catchUp(states(done), MON_WEEK2);
  assert.deepEqual([r.behind, r.ahead], [0, 2]);
});

test("after the syllabus deadline every unfinished chapter is carried", () => {
  const r = catchUp(states(allDone(dueThrough(10))), d("2026-12-22"));
  assert.equal(r.due, 59);
  assert.deepEqual(r.carried.slice().sort(), dueThrough(11).filter(id => !dueThrough(10).includes(id)).sort());
});
