// Builds the hour-by-hour plan for a college day from that day's real classes (read from the
// calendar), so the study blocks sit around the actual college hours. Pure; shared by the
// timetable view and the phone reminders.

const WAKE = 330, WAKE_LEN = 10;          // 05:30, then Block 1 at 05:40
const BLOCK1_END = 420;                    // 07:00
const READY = 45, TRAVEL = 45, RESET = 30, SHORT_BREAK = 15;
const BLOCK2_START = 1185;                 // 19:45
const DINNER = 1275, DINNER_LEN = 30;      // 21:15
const WIND = 1335, WIND_LEN = 15;          // 22:15, so sleep at 22:30
const MIN_BLOCK = 30;                      // shorter than this isn't worth calling a block
const MIN_EXTRA = 60;
const FREE_PERIOD = 60;                    // a gap this long between classes is a free period

const SUBJECT_HINT = /^(phy|chem|maths?|cs|bio|stat|eng|english|kannada|hindi|sanskrit)\b/i;
const INITIALS = /^[A-Z]{2,4}([/,][A-Z]{2,4})*$/;

// "ABC;Phy;Batch- PCM-A" → "Phy". College timetables put teacher initials first and the
// batch last; anything that doesn't fit that shape is returned unchanged.
export function classLabel(title) {
  const fields = String(title).split(";").map(f => f.trim()).filter(Boolean);
  const cut = fields.findIndex(f => /^batch\b/i.test(f));
  const lead = cut < 0 ? fields : fields.slice(0, cut);
  return lead.find(f => SUBJECT_HINT.test(f)) || lead.find(f => !INITIALS.test(f)) || String(title).trim();
}

function toMins(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
function hm(mins) { const x = ((mins % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); }

// Title and detail of the base timetable's row whose title starts with `prefix`.
function baseText(base, prefix, fallbackTitle, fallbackDetail = "") {
  const row = base.rows.find(r => r[2].startsWith(prefix));
  return row ? [row[2], row[3]] : [fallbackTitle, fallbackDetail];
}

// The class list for the College row, with free periods (gaps of an hour or more) marked.
function collegeItems(sorted) {
  const items = sorted.map(c => ({ from: c.from, to: c.to, label: classLabel(c.title), free: false }));
  let busyUntil = toMins(sorted[0].to);
  for (const c of sorted.slice(1)) {
    const start = toMins(c.from);
    if (start - busyUntil >= FREE_PERIOD) items.push({ from: hm(busyUntil), to: c.from, label: "Free period", free: true });
    busyUntil = Math.max(busyUntil, toMins(c.to));
  }
  return items.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

// classes: [{from: "HH:MM", to: "HH:MM", title}] (at least one). base: TT.weekday or TT.jan, for the block wording.
// → {rows, start, end, blocks}. rows use the TT row shape [from, to, title, detail, kind] with the class
// list as a sixth element on the College row. blocks gives each study block's start (or null) for reminders.
export function buildCollegeDay(classes, base) {
  const sorted = classes.slice().sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const start = toMins(sorted[0].from), end = Math.max(...sorted.map(c => toMins(c.to)));
  const leave = start - TRAVEL, readyStart = leave - READY;
  const rows = [];
  const blocks = { block1: null, extraMorning: null, extraEvening: null, block2: null, block3: null, wind: null };
  const push = (from, to, title, detail, kind, items) => {
    if (to <= from) return;
    rows.push(items ? [hm(from), hm(to), title, detail, kind, items] : [hm(from), hm(to), title, detail, kind]);
  };

  // Morning
  const [wakeTitle, wakeDetail] = baseText(base, "Wake", "Wake up");
  const wakeAt = readyStart >= WAKE + WAKE_LEN ? WAKE : Math.min(WAKE, leave - 30 - WAKE_LEN);
  let cursor = wakeAt + WAKE_LEN;
  push(wakeAt, cursor, wakeTitle, wakeDetail, "life");
  if (readyStart - cursor >= MIN_BLOCK) {
    const [title, detail] = baseText(base, "Block 1", "Block 1");
    const b1End = Math.min(BLOCK1_END, readyStart);
    blocks.block1 = hm(cursor);
    push(cursor, b1End, title, detail, "study");
    cursor = b1End;
    if (readyStart - cursor >= MIN_EXTRA + SHORT_BREAK) {
      push(cursor, cursor + SHORT_BREAK, "Breakfast", "", "life");
      cursor += SHORT_BREAK;
      blocks.extraMorning = hm(cursor);
      push(cursor, readyStart, "Extra morning block", "College starts late today. Use it for this week's chapter: lecture or PYQs.", "study");
      cursor = readyStart;
    }
  }
  push(cursor, leave, blocks.extraMorning ? "Get ready" : "Get ready, breakfast", "", "life");
  push(Math.max(cursor, leave), start, ...baseText(base, "Commute", "Commute"), "light");

  // College
  const items = collegeItems(sorted), count = sorted.length, hasFree = items.some(i => i.free);
  push(start, end, "College", count + (count === 1 ? " class" : " classes") + " from your calendar. " +
    (hasFree ? "Use the free period for this week's PYQs." : "Take notes in class. Lunch: 10 minutes on your short notes."), "college", items);

  // Evening
  cursor = end + TRAVEL;
  push(end, cursor, "Travel home", "", "light");
  if (cursor + RESET <= DINNER - MIN_BLOCK) {
    const [, resetDetail] = baseText(base, "Reset", "Reset", "Shower, eat something, 15-minute walk. No phone.");
    const resetEnd = cursor + RESET;
    const roomForExtra = BLOCK2_START - resetEnd >= MIN_EXTRA + SHORT_BREAK;
    push(cursor, roomForExtra ? resetEnd : Math.max(resetEnd, BLOCK2_START), "Reset", resetDetail, "life");
    cursor = Math.max(resetEnd, roomForExtra ? resetEnd : BLOCK2_START);
    if (roomForExtra) {
      blocks.extraEvening = hm(cursor);
      push(cursor, BLOCK2_START - SHORT_BREAK, "Extra block", "College ended early. Use it for this week's chapter or PYQs, with a 10-minute break each hour.", "study");
      push(BLOCK2_START - SHORT_BREAK, BLOCK2_START, "Break", "", "life");
      cursor = BLOCK2_START;
    }
    blocks.block2 = hm(cursor);
    push(cursor, DINNER, ...baseText(base, "Block 2", "Block 2"), "study");
    cursor = DINNER;
  } else if (cursor < DINNER) {
    push(cursor, DINNER, "Reset", "", "life");
    cursor = DINNER;
  }
  push(cursor, cursor + DINNER_LEN, ...baseText(base, "Dinner", "Dinner"), "life");
  cursor += DINNER_LEN;
  if (WIND - cursor >= 20) {
    blocks.block3 = hm(cursor);
    push(cursor, WIND, ...baseText(base, "Block 3", "Block 3"), "study");
    cursor = WIND;
  }
  blocks.wind = hm(cursor);
  push(cursor, cursor + WIND_LEN, ...baseText(base, "Wind down", "Wind down"), "life");
  cursor += WIND_LEN;
  rows.push([hm(cursor), hm(wakeAt), ...baseText(base, "Sleep", "Sleep"), "sleep"]);

  return { rows, start: hm(start), end: hm(end), blocks };
}
