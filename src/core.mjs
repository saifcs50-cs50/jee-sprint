// Sync-safe progress state, shared by the page, the Mac server and the tests.
//
// Every entry carries `t`, the time it was last changed (ms since epoch). Merging keeps,
// per key, whichever side changed it last. Deleted mocks stay as tombstones so a delete
// on one device wins over the older copy on the other.

export const STATE_VERSION = 2;
const CHAPTER_ID = /^[pcm]-[a-z0-9]{1,20}$/;
const MOCK_ID = /^[A-Za-z0-9_-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEAK_KEYS = ["silly", "memory", "concept", "time", "unattempted"];
const MAX_MOCKS = 500;
const MAX_DAYS_OFF = 400;

export function emptyState() {
  return { v: STATE_VERSION, chapters: {}, mocks: {}, daysOff: {} };
}

function isObj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function stamp(t) { return Number.isFinite(t) && t > 0 && t < 8.64e15 ? Math.floor(t) : null; }
function int(x, lo, hi) { return Number.isInteger(x) && x >= lo && x <= hi ? x : null; }

function cleanChapter(raw) {
  if (!isObj(raw)) return null;
  const s = int(raw.s, 0, 4), t = stamp(raw.t); // 0 not started, 1 learning, 2 done, 3 revised, 4 skipped
  return s === null || t === null ? null : { s, t };
}

const SUBJECTS = ["P", "C", "M", "X"]; // X = mixed
const MAX_QUESTIONS = 300;

// A mark value like 4, 1, 0.25: finite, within range, at most two decimals.
function mark(x, lo, hi) {
  return Number.isFinite(x) && x >= lo && x <= hi && Math.abs(Math.round(x * 100) - x * 100) < 1e-9 ? x : null;
}

function cleanLeaks(raw, limit) {
  const leaks = {};
  let sum = 0;
  for (const k of LEAK_KEYS) {
    const v = isObj(raw) ? int(raw[k], 0, limit) : 0;
    leaks[k] = v === null ? 0 : v;
    sum += leaks[k];
  }
  return sum > limit ? null : leaks;
}

// A logged test. kind "full": a full JEE mock, marks per subject (p, c, m). kind "test": any other test,
// with its question count, right and wrong answers and marking scheme. Entries from before tests
// existed have no kind and are full mocks.
function cleanMock(raw) {
  if (!isObj(raw)) return null;
  const t = stamp(raw.t);
  if (t === null) return null;
  if (raw.deleted === true) return { deleted: true, t };
  if (typeof raw.date !== "string" || !DATE.test(raw.date)) return null;
  const paper = typeof raw.paper === "string" ? raw.paper.slice(0, 60) : "";
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt.slice(0, 40) : "";
  if (raw.kind === "test") {
    const questions = int(raw.questions, 1, MAX_QUESTIONS);
    if (questions === null || !SUBJECTS.includes(raw.subject)) return null;
    const correct = int(raw.correct, 0, questions), wrong = correct === null ? null : int(raw.wrong, 0, questions - correct);
    const plus = mark(raw.plus, 0.25, 10), minus = mark(raw.minus, 0, 10);
    const leaks = cleanLeaks(raw.leaks, questions);
    if (wrong === null || plus === null || minus === null || !leaks) return null;
    return { kind: "test", date: raw.date, paper, subject: raw.subject, questions, correct, wrong, plus, minus, leaks, createdAt, t };
  }
  const p = int(raw.p, -25, 100), c = int(raw.c, -25, 100), m = int(raw.m, -25, 100);
  const leaks = cleanLeaks(raw.leaks, 75);
  if (p === null || c === null || m === null || !leaks) return null;
  return { kind: "full", date: raw.date, paper, p, c, m, leaks, createdAt, t };
}

// → {score, max, pct (whole %), accuracy (% of attempted that were right, or null), unattempted (or null)}
export function testScore(m) {
  if (m.kind !== "test") {
    const score = m.p + m.c + m.m;
    return { score, max: 300, pct: Math.round(score / 3), accuracy: null, unattempted: null };
  }
  const score = Math.round((m.correct * m.plus - m.wrong * m.minus) * 100) / 100, max = m.questions * m.plus;
  const attempted = m.correct + m.wrong;
  return { score, max, pct: Math.round(score / max * 100), accuracy: attempted ? Math.round(m.correct / attempted * 100) : null, unattempted: m.questions - attempted };
}

// A date the user isn't at college. src "manual" (tapped in the app) or "calendar" (read from Google Calendar).
function cleanDayOff(raw) {
  if (!isObj(raw)) return null;
  const t = stamp(raw.t);
  if (t === null || typeof raw.off !== "boolean" || (raw.src !== "manual" && raw.src !== "calendar")) return null;
  return { off: raw.off, src: raw.src, title: typeof raw.title === "string" ? raw.title.slice(0, 80) : "", t };
}

// Turn untrusted input (a request body, localStorage) into a valid state. Bad entries are dropped.
export function normalizeState(raw) {
  const out = emptyState();
  if (!isObj(raw)) return out;
  if (isObj(raw.chapters)) {
    for (const [id, v] of Object.entries(raw.chapters)) {
      if (!CHAPTER_ID.test(id)) continue;
      const clean = cleanChapter(v);
      if (clean) out.chapters[id] = clean;
    }
  }
  if (isObj(raw.mocks)) {
    for (const [id, v] of Object.entries(raw.mocks).slice(0, MAX_MOCKS)) {
      if (!MOCK_ID.test(id)) continue;
      const clean = cleanMock(v);
      if (clean) out.mocks[id] = clean;
    }
  }
  if (isObj(raw.daysOff)) {
    for (const [date, v] of Object.entries(raw.daysOff).slice(0, MAX_DAYS_OFF)) {
      if (!DATE.test(date)) continue;
      const clean = cleanDayOff(v);
      if (clean) out.daysOff[date] = clean;
    }
  }
  return out;
}

function newer(x, y) {
  if (!x) return y;
  if (!y) return x;
  if (y.t !== x.t) return y.t > x.t ? y : x;
  // Same timestamp: prefer the delete, then the larger chapter state, so both sides agree.
  if (y.deleted !== x.deleted) return y.deleted ? y : x;
  return (y.s || 0) > (x.s || 0) ? y : x;
}

// For days off, what the user tapped beats what the calendar says, whichever is newer.
function preferredDayOff(x, y) {
  if (!x) return y;
  if (!y) return x;
  if (x.src !== y.src) return x.src === "manual" ? x : y;
  if (x.t !== y.t) return y.t > x.t ? y : x;
  return x.off ? y : x; // tie: "I have college" wins, the same way on both sides
}

export function mergeStates(a, b) {
  const out = emptyState();
  for (const key of ["chapters", "mocks"]) {
    const ids = new Set([...Object.keys(a[key]), ...Object.keys(b[key])]);
    for (const id of ids) out[key][id] = newer(a[key][id], b[key][id]);
  }
  const days = new Set([...Object.keys(a.daysOff || {}), ...Object.keys(b.daysOff || {})]);
  for (const date of days) out.daysOff[date] = preferredDayOff((a.daysOff || {})[date], (b.daysOff || {})[date]);
  return out;
}

export function setDayOff(state, date, off, now) {
  return Object.assign({}, state, { daysOff: Object.assign({}, state.daysOff, { [date]: { off, src: "manual", title: "", t: now } }) });
}

export function isDayOff(state, date) {
  const e = state.daysOff && state.daysOff[date];
  return !!(e && e.off);
}

// Active days off on or after `fromDate` ("YYYY-MM-DD"), soonest first.
export function upcomingDaysOff(state, fromDate) {
  return Object.entries(state.daysOff || {})
    .filter(([date, e]) => e.off && date >= fromDate)
    .map(([date, e]) => ({ date, title: e.title, src: e.src }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

// Bring the calendar's days off into the state. Manual entries are never touched; calendar entries
// that vanished from the feed are switched off. Returns {state, changed} so callers only save real changes.
export function applyCalendarDaysOff(state, found, now) {
  const next = Object.assign({}, state.daysOff);
  const inFeed = new Map(found.map(f => [f.date, f.title]));
  let changed = false;
  for (const [date, title] of inFeed) {
    const cur = next[date];
    if (cur && cur.src === "manual") continue;
    if (cur && cur.off && cur.title === title) continue;
    next[date] = { off: true, src: "calendar", title, t: now };
    changed = true;
  }
  for (const [date, cur] of Object.entries(next)) {
    if (cur.src === "calendar" && cur.off && !inFeed.has(date)) {
      next[date] = { off: false, src: "calendar", title: cur.title, t: now };
      changed = true;
    }
  }
  return { state: changed ? Object.assign({}, state, { daysOff: next }) : state, changed };
}

export function setChapter(state, id, s, now) {
  return Object.assign({}, state, { chapters: Object.assign({}, state.chapters, { [id]: { s, t: now } }) });
}

export function addMock(state, id, rec, now) {
  const entry = cleanMock(Object.assign({}, rec, { t: now }));
  if (!entry || !MOCK_ID.test(id)) throw new Error("Invalid mock record");
  return Object.assign({}, state, { mocks: Object.assign({}, state.mocks, { [id]: entry }) });
}

export function deleteMock(state, id, now) {
  return Object.assign({}, state, { mocks: Object.assign({}, state.mocks, { [id]: { deleted: true, t: now } }) });
}

export function chapterState(state, id) {
  const e = state.chapters[id];
  return e ? e.s : 0;
}

export function liveMocks(state) {
  return Object.entries(state.mocks)
    .filter(([, m]) => !m.deleted)
    .map(([id, m]) => Object.assign({ id }, m))
    .sort((x, y) => x.date.localeCompare(y.date) || x.createdAt.localeCompare(y.createdAt));
}

export function newMockId(now, rand = Math.random) {
  return "m" + now.toString(36) + Math.floor(rand() * 1e6).toString(36);
}

const DEFAULT_SYNC_PORT = 5199;
const HOST_NAME = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;

// The Mac's sync address as people actually type it → "http://host:port", or null if it isn't one.
// The sync server only speaks plain http on the home network, so "https://" is corrected, and a
// missing scheme or port is filled in.
export function normalizeHost(input) {
  const bare = String(input == null ? "" : input).trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  const m = bare.match(/^([^:]+)(?::(\d{1,5}))?$/);
  if (!m || !HOST_NAME.test(m[1])) return null;
  const port = m[2] === undefined ? DEFAULT_SYNC_PORT : Number(m[2]);
  return port >= 1 && port <= 65535 ? "http://" + m[1] + ":" + port : null;
}
