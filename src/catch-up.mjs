// The failsafe for unfinished chapters. Pure: given each chapter's state and today's date, says what
// has carried over from past weeks, how far behind that is, and what to do about it.
import { CHAPTERS, CH, WEEKS } from "./plan-data.mjs";

export const SKIPPED = 4; // chapter state: deliberately dropped (the user can bring it back)
const TIER_RANK = { Top: 0, High: 1, Med: 2, Low: 3 };
const CATCH_UP_MAX = 3;   // up to this many: Sunday's deep block and days off absorb it
const SHORT_MAX = 6;      // up to this many: do the least important ones the short way

function isDone(s) { return s === 2 || s === 3; }

// stateOf(id) → 0 not started, 1 learning, 2 done, 3 revised, 4 skipped. today: local midnight Date.
// → { due, done, ahead, behind, carried, skipped, level, suggestSkip }
//   due          chapters scheduled in weeks that have ended
//   carried      those of them still unfinished, most important first (never includes skipped ones)
//   level        "ok" | "catchup" | "short" | "skip": how strong the response needs to be
//   suggestSkip  the least important carried chapter once catch-up alone won't do; never a Top one
export function catchUp(stateOf, today) {
  const dueIds = [];
  WEEKS.forEach((w, order) => {
    if (w.b < today) for (const k of ["P", "C", "M"]) for (const id of w[k]) dueIds.push({ id, order });
  });
  const carried = dueIds
    .filter(x => stateOf(x.id) < 2)
    .sort((x, y) => TIER_RANK[CH[x.id].tier] - TIER_RANK[CH[y.id].tier] || x.order - y.order)
    .map(x => x.id);
  const dueSet = new Set(dueIds.map(x => x.id));
  const done = CHAPTERS.filter(c => isDone(stateOf(c.id))).length;
  const ahead = CHAPTERS.filter(c => !dueSet.has(c.id) && isDone(stateOf(c.id))).length;
  const behind = carried.length;
  const level = behind === 0 ? "ok" : behind <= CATCH_UP_MAX ? "catchup" : behind <= SHORT_MAX ? "short" : "skip";
  const lowest = carried[carried.length - 1];
  const suggestSkip = behind > CATCH_UP_MAX && lowest && CH[lowest].tier !== "Top" ? lowest : null;
  return {
    due: dueIds.length, done, ahead, behind, carried,
    skipped: CHAPTERS.filter(c => stateOf(c.id) === SKIPPED).map(c => c.id),
    level, suggestSkip
  };
}
