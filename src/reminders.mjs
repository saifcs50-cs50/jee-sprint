// Builds the phone's study-block reminders from the plan. Pure: no Capacitor calls here.
import { PLAN_START, EXAM, SPRINT_START, SUBJ, CH, BLOCK2_SUBJECT, DAY_MS, TT, autoTT, currentWeek, days, iso } from "./plan-data.mjs";
import { buildCollegeDay } from "./day-plan.mjs";

const WIND_DOWN = ["22:15", "Wind down", "Write tomorrow's three tasks. Phone out of the room, sleep at 22:30."];

function weekFocus(week, subj) {
  if (!week) return "";
  const ids = week[subj] || [];
  if (ids.length) return "This week: " + ids.map(id => CH[id].name).join(", ") + ".";
  return week[subj + "task"] || "";
}

function weekdayBlocks(day, week) {
  const subj = BLOCK2_SUBJECT[day.getDay()];
  return [
    ["05:40", "Block 1 · Practice", "PYQs on what you learned last night. 80 minutes, hardest problems first."],
    ["19:45", "Block 2 · Learn " + SUBJ[subj], weekFocus(week, subj) || "Lecture and main notes for this week's chapter."],
    ["21:45", "Block 3 · Lock it in", "10 PYQs on tonight's topic, or short notes."],
    WIND_DOWN
  ];
}

function revisionBlocks(day, week) {
  const dow = day.getDay(), subj = BLOCK2_SUBJECT[dow];
  let block2;
  if (day < SPRINT_START) block2 = ["19:45", "Block 2 · Second pass " + SUBJ[subj], weekFocus(week, subj) || "Second-pass PYQs on your weakest chapters."];
  else if (dow === 2 || dow === 4 || dow === 6) block2 = ["19:45", "Block 2 · Subject sprint", "One subject from a 2026 paper: 25 questions in 60 minutes, then check."];
  else block2 = ["19:45", "Block 2 · Weak-chapter drill", "PYQs on the weakest chapter from Sunday's mock."];
  return [
    ["05:40", "Block 1 · Recall " + SUBJ[subj], "Short notes and formula sheet, then 10 PYQs cold."],
    block2,
    ["21:45", "Block 3 · Mistake log", "Re-attempt five old mistakes without looking at the fix."],
    WIND_DOWN
  ];
}

const SUNDAY = [
  ["07:30", "S1 · Deep block", "Finish this week's hardest chapter, or catch up on whatever slipped."],
  ["09:45", "S2 · Part test", "25 mixed PYQs in 60 minutes. Then log every miss."],
  ["13:30", "S4 · PYQ block", "The subject that went worst this morning."],
  ["16:00", "S5 · Revision loop", "Short notes from chapters finished 1, 7 and 21 days ago."],
  ["20:00", "Plan next week", "Tick the tracker and check the pace line."]
];

const MOCK_SUNDAY = [
  ["08:30", "Mock at 9:00", "Formula sheets only. The phone goes in another room."],
  ["09:00", "Full mock · 3 hours", "Three rounds. Chemistry first."],
  ["13:30", "Analyse the mock", "Log it in JEE Sprint and sort every lost mark into a leak."],
  ["16:00", "Fix the top three leaks", "Concept gaps first: re-study, then redo those questions."],
  ["20:00", "Plan next week", "Tick the tracker and check the pace line."]
];

// A college day whose real class hours are known: the usual blocks move to fit, and any extra
// block (late start, early finish) gets its own reminder.
function fittedBlocks(usual, classes, kind) {
  const [b1, b2, b3, wind] = usual;
  const at = buildCollegeDay(classes, TT[kind]).blocks;
  const out = [];
  if (at.block1) out.push([at.block1, b1[1], b1[2]]);
  if (at.extraMorning) out.push([at.extraMorning, "Extra morning block", "College starts late today. Use it for this week's chapter."]);
  if (at.extraEvening) out.push([at.extraEvening, "Extra block", "College ended early. Use it for this week's chapter or PYQs."]);
  if (at.block2) out.push([at.block2, b2[1], b2[2]]);
  if (at.block3) out.push([at.block3, b3[1], b3[2]]);
  out.push([at.wind, wind[1], wind[2]]);
  return out.sort((x, y) => x[0].localeCompare(y[0]));
}

function blocksFor(day, off, classes) {
  const kind = autoTT(day, off), week = currentWeek(day);
  if (kind === "mock") return MOCK_SUNDAY;
  if (kind === "sunday") return SUNDAY;
  const usual = kind === "jan" ? revisionBlocks(day, week) : weekdayBlocks(day, week);
  return classes && classes.length ? fittedBlocks(usual, classes, kind) : usual;
}

function at(day, hm) {
  const [h, m] = hm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

// Reminders for `count` days starting at local midnight `start`, skipping anything at or before `now`.
// `isOff(dateIso)` says whether that date is a day off from college; those days get the Sunday blocks.
// `classesOn(dateIso)` returns that date's classes from the calendar, or null when unknown.
// Ids are stable per slot (day index since 1 Oct × 10 + slot), so rescheduling replaces rather than duplicates.
export function buildReminders(start, count, now, isOff = () => false, classesOn = () => null) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(start.getTime() + i * DAY_MS + 3 * 3600000); // +3h keeps DST-free arithmetic on the right date
    const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    if (d0 < PLAN_START || d0 >= EXAM) continue;
    const dayIndex = days(PLAN_START, d0);
    blocksFor(d0, isOff(iso(d0)), classesOn(iso(d0))).forEach(([hm, title, body], k) => {
      const when = at(d0, hm);
      if (when > now) out.push({ id: dayIndex * 10 + k + 1, at: when, title, body });
    });
  }
  return out;
}
