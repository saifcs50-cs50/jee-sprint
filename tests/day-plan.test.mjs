import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCollegeDay } from "../src/day-plan.mjs";
import { TT } from "../src/plan-data.mjs";

const cls = (from, to, title = "ABC;Phy;Batch- PCM-Alpha") => ({ from, to, title });
const times = plan => plan.rows.map(r => r[0] + "-" + r[1] + " " + r[2]);
const NORMAL = [cls("08:30", "09:40"), cls("09:40", "10:40", "GH;Math;Batch;PCM-Alpha"), cls("11:00", "12:15", "IJK;Chem;Batch;PCM-Alpha"), cls("13:10", "18:30", "UVW;Eng;Batch;x")];

test("a normal 8:30–18:30 day matches the standard timetable", () => {
  const plan = buildCollegeDay(NORMAL, TT.weekday);
  assert.deepEqual(times(plan), [
    "05:30-05:40 Wake up", "05:40-07:00 Block 1 · Practice", "07:00-07:45 Get ready, breakfast", "07:45-08:30 Commute",
    "08:30-18:30 College", "18:30-19:15 Travel home", "19:15-19:45 Reset", "19:45-21:15 Block 2 · Learn",
    "21:15-21:45 Dinner", "21:45-22:15 Block 3 · Lock it in", "22:15-22:30 Wind down", "22:30-05:30 Sleep"
  ]);
  assert.deepEqual(plan.blocks, { block1: "05:40", extraMorning: null, extraEvening: null, block2: "19:45", block3: "21:45", wind: "22:15" });
  assert.equal(plan.start, "08:30");
  assert.equal(plan.end, "18:30");
});

test("the college row lists each class by subject", () => {
  const college = buildCollegeDay(NORMAL, TT.weekday).rows.find(r => r[2] === "College");
  assert.equal(college[4], "college");
  assert.deepEqual(college[5].map(i => i.from + " " + i.label), ["08:30 Phy", "09:40 Math", "11:00 Chem", "13:10 Eng"]);
  assert.match(college[3], /4 classes/);
});

test("when college ends early, an extra block fills the afternoon", () => {
  const plan = buildCollegeDay([cls("08:30", "15:15")], TT.weekday);
  assert.deepEqual(times(plan).slice(4, 10), [
    "08:30-15:15 College", "15:15-16:00 Travel home", "16:00-16:30 Reset", "16:30-19:30 Extra block", "19:30-19:45 Break", "19:45-21:15 Block 2 · Learn"
  ]);
  assert.equal(plan.blocks.extraEvening, "16:30");
});

test("when the first class is late, an extra morning block appears", () => {
  const plan = buildCollegeDay([cls("11:00", "18:30")], TT.weekday);
  assert.deepEqual(times(plan).slice(0, 6), [
    "05:30-05:40 Wake up", "05:40-07:00 Block 1 · Practice", "07:00-07:15 Breakfast", "07:15-09:30 Extra morning block", "09:30-10:15 Get ready", "10:15-11:00 Commute"
  ]);
  assert.equal(plan.blocks.extraMorning, "07:15");
});

test("a late finish shortens Block 2 but keeps the 22:30 bedtime", () => {
  const plan = buildCollegeDay([cls("08:30", "19:30")], TT.weekday);
  assert.deepEqual(times(plan).slice(5), [
    "19:30-20:15 Travel home", "20:15-20:45 Reset", "20:45-21:15 Block 2 · Learn", "21:15-21:45 Dinner", "21:45-22:15 Block 3 · Lock it in", "22:15-22:30 Wind down", "22:30-05:30 Sleep"
  ]);
});

test("a very late finish drops Block 2 rather than cutting sleep", () => {
  const plan = buildCollegeDay([cls("08:30", "20:30")], TT.weekday);
  assert.equal(plan.blocks.block2, null);
  assert.deepEqual(times(plan).slice(5), ["20:30-21:15 Travel home", "21:15-21:45 Dinner", "21:45-22:15 Block 3 · Lock it in", "22:15-22:30 Wind down", "22:30-05:30 Sleep"]);
});

test("a gap of an hour or more between classes is flagged as a free period", () => {
  const plan = buildCollegeDay([cls("08:30", "12:15"), cls("13:10", "16:40"), cls("18:00", "18:30", "ABC;Phy-REMEDIAL SESSION-CS lab")], TT.weekday);
  const items = plan.rows.find(r => r[2] === "College")[5];
  assert.deepEqual(items.filter(i => i.free).map(i => i.from + "-" + i.to), ["16:40-18:00"], "lunch (55 min) is not flagged");
});

test("overlapping classes still give the right college hours", () => {
  const plan = buildCollegeDay([cls("15:30", "18:00"), cls("08:30", "09:40"), cls("15:30", "16:40")], TT.weekday);
  assert.equal(plan.start + "-" + plan.end, "08:30-18:00");
});

test("revision-phase days use the revision block names", () => {
  const plan = buildCollegeDay(NORMAL, TT.jan);
  assert.ok(times(plan).includes("05:40-07:00 Block 1 · Recall"));
  assert.ok(times(plan).includes("21:45-22:15 Block 3 · Mistake log"));
});

test("rows never overlap and always run forward", () => {
  for (const day of [NORMAL, [cls("06:30", "09:00")], [cls("13:00", "14:00")], [cls("08:30", "21:30")], [cls("17:00", "18:30")]]) {
    const rows = buildCollegeDay(day, TT.weekday).rows;
    for (let i = 0; i < rows.length - 1; i++) {
      assert.ok(rows[i][0] < rows[i][1], rows[i].slice(0, 3).join(" "));
      assert.equal(rows[i][1], rows[i + 1][0], rows[i].slice(0, 3).join(" ") + " → " + rows[i + 1].slice(0, 3).join(" "));
    }
    assert.equal(rows[rows.length - 1][2], "Sleep");
  }
});
