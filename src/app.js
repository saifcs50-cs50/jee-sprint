// Page logic for all three builds. The build script prepends plan-data.mjs, core.mjs and
// reminders.mjs (exports stripped) and defines JEE_ENV = {platform, token, hosts}.
//   platform "mac":      served by the Mac sync server; same-origin sync.
//   platform "android":  bundled in the APK; syncs to the Mac over Wi-Fi via native HTTP.
//   platform "artifact": the claude.ai copy; read-only, no sync.

const PLATFORM = JEE_ENV.platform;
const VARIANT = JEE_ENV.variant || "personal"; // "friend" builds pair by code and carry no personal notes
const EXTRA = JEE_ENV.extra || {}; // personal-build-only notes, injected by build.mjs
const IS_ANDROID = PLATFORM === "android";
const CAN_EDIT = PLATFORM !== "artifact";
const LS = { calendar: "jee-sprint-calendar", state: "jee-sprint-state-v2", device: "jee-sprint-device", host: "jee-sprint-host", token: "jee-sprint-pair-code", remind: "jee-sprint-reminders", lastSync: "jee-sprint-last-sync" };
const SYNC_DEBOUNCE_MS = 800;
const SYNC_EVERY_MS = IS_ANDROID ? 120000 : 60000;
const REMINDER_DAYS = 14;
const LEAKS = [["silly", "Silly"], ["memory", "Memory"], ["concept", "Concept"], ["time", "Time"], ["unattempted", "Unattempted"]];

/* ---------- local storage ---------- */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

let state = emptyState();
// The class schedule the Mac read from Google Calendar: {checkedAt, days: {date: [{from, to, title}]}} or null.
let calendarDays = null;
function loadCalendarDays() {
  try { const c = JSON.parse(lsGet(LS.calendar) || "null"); calendarDays = c && typeof c.days === "object" ? c : null; }
  catch (e) { calendarDays = null; }
}
function setCalendarDays(next) {
  const value = next && typeof next.days === "object" ? next : null;
  const daysChanged = JSON.stringify(value && value.days) !== JSON.stringify(calendarDays && calendarDays.days);
  calendarDays = value;
  lsSet(LS.calendar, JSON.stringify(value));
  renderCalendar();
  if (!daysChanged) return;
  renderTT();
  if (IS_ANDROID) refreshReminders();
}
// A date's classes, or null when unknown. Only today and tomorrow are trusted: the college publishes
// its timetable a day or two ahead, so anything further out is usually incomplete.
function classesOn(dateIso) {
  if (dateIso > iso(new Date(today0().getTime() + 36 * 3600000))) return null;
  const list = calendarDays && calendarDays.days[dateIso];
  return Array.isArray(list) && list.length ? list : null;
}

function loadState() {
  const raw = lsGet(LS.state);
  if (!raw) return;
  try { state = normalizeState(JSON.parse(raw)); }
  catch (e) { console.error("[jee-sprint] saved progress was unreadable; starting empty", e); }
}
function commit(next) {
  const prev = state;
  state = next;
  if (!lsSet(LS.state, JSON.stringify(state))) setSyncText("Couldn't save on this device: storage is blocked.", "bad");
  stateChanged(prev);
  queueSync();
}

// Redraw everything that depends on saved progress. `prev` is the state before the change.
function stateChanged(prev) {
  refreshChapters(); renderMocks(); renderTT(); renderDaysOff(); renderCatchUp();
  if (IS_ANDROID && JSON.stringify(prev.daysOff) !== JSON.stringify(state.daysOff)) refreshReminders();
}

function deviceId() {
  let id = lsGet(LS.device);
  if (!id) { id = "d" + Date.now().toString(36) + Math.floor(Math.random() * 1e8).toString(36); lsSet(LS.device, id); }
  return id;
}

/* ---------- helpers ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function $(id) { return document.getElementById(id); }
function st(id) { return chapterState(state, id); }
function isFinished(s) { return s === 2 || s === 3; } // done or revised; skipped (4) is neither
function weekNote(w) { return w.note + (EXTRA.weekNotes && EXTRA.weekNotes[w.n] ? " " + EXTRA.weekNotes[w.n] : ""); }
function syncToken() { return JEE_ENV.token || lsGet(LS.token) || ""; }
function isPaired() { return PLATFORM === "mac" || (!!syncToken() && hostCandidates().length > 0); }
function ago(isoOrMs) {
  const t = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(t)) return "never";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " h ago";
  return short(new Date(t));
}

/* ---------- chapters ---------- */
function chip(id) {
  const c = CH[id], s = st(id);
  const tags = (c.cls === "12" ? '<span class="tag xii">XII</span>' : "") + '<span class="tag' + (c.tier === "Top" ? " top" : "") + '">' + c.tier + "</span>";
  const label = esc(c.name) + ": " + STATES[s] + (CAN_EDIT ? ". Tap to change." : ".");
  return '<button type="button" class="ch' + (s === SKIPPED ? " skipped" : "") + '" data-id="' + id + '" aria-label="' + label + '"' + (CAN_EDIT ? "" : " disabled") + '><span class="sq s' + s + '" aria-hidden="true"></span><span class="nm">' + esc(c.name) + '</span><span class="tags">' + tags + "</span></button>";
}
function subjBlock(w, k) {
  const ids = w[k] || [], task = w[k + "task"];
  let h = ids.map(chip).join("");
  if (task) h += '<p class="task">' + esc(task) + "</p>";
  return h || '<p class="task">—</p>';
}
function refreshChapters() {
  document.querySelectorAll(".ch").forEach(b => {
    const id = b.dataset.id, s = st(id);
    b.querySelector(".sq").className = "sq s" + s;
    b.classList.toggle("skipped", s === SKIPPED);
    b.setAttribute("aria-label", CH[id].name + ": " + STATES[s] + (CAN_EDIT ? ". Tap to change." : "."));
  });
  renderProgress(); renderPace(); updateWeekHeads();
}

function renderProgress() {
  $("prog").innerHTML = ["P", "C", "M"].map(k => {
    const list = CHAPTERS.filter(c => c.s === k);
    const done = list.filter(c => isFinished(st(c.id))).length;
    return '<div class="prow"><span>' + SUBJ[k] + '</span><div class="ptrack" role="progressbar" aria-label="' + SUBJ[k] + ' chapters done" aria-valuemin="0" aria-valuemax="' + list.length + '" aria-valuenow="' + done + '"><div class="pfill" style="width:' + Math.round(done / list.length * 100) + '%"></div></div><span class="n">' + done + " / " + list.length + "</span></div>";
  }).join("");
}

function renderPace() {
  const t = today0(), total = CHAPTERS.length, r = catchUp(st, t);
  const left = days(t, SYLLABUS_END);
  let verdict, cls;
  if (r.done + r.skipped.length >= total) { verdict = "Syllabus complete"; cls = "ok"; }
  else if (t < PLAN_START || r.due === 0) { verdict = "Pace check starts Mon 5 Oct"; cls = "wait"; }
  else if (r.behind > 0) { verdict = "Behind by " + r.behind; cls = "behind"; }
  else { verdict = r.ahead > 0 ? "Ahead by " + r.ahead : "On pace"; cls = "ok"; }
  const when = left > 0 ? left + (left === 1 ? " day" : " days") + " to finish the syllabus (Sun 20 Dec)" : (left === 0 ? "Syllabus deadline is today" : "Syllabus deadline was Sun 20 Dec");
  $("pace").innerHTML = '<div class="pl"><span class="pn">' + r.done + " / " + total + '</span><span>chapters done</span><span class="pv ' + cls + '">' + verdict + '</span></div><span class="muted" style="font-size:.9rem">' + when + (r.skipped.length ? " · " + r.skipped.length + " skipped" : "") + "</span>";
}

/* ---------- hero, timeline, timetable, weeks ---------- */
function renderHero() {
  const t = today0(), left = days(t, EXAM);
  if (left > 0) {
    $("days").textContent = left; $("daysUnit").textContent = left === 1 ? "day" : "days";
    $("countSub").textContent = "until Friday 22 January 2027, the first exam day. Your own date comes on the city slip.";
  } else if (t <= EXAM_END) {
    $("days").textContent = days(t, EXAM_END) + 1; $("daysUnit").textContent = "exam days left";
    $("countSub").textContent = "Session 1 is running (22–30 Jan). Check your admit card for your date and shift.";
  } else {
    $("days").textContent = "✓"; $("daysUnit").textContent = "Session 1 done";
    $("countSub").textContent = "Board mode until your board exams, then Session 2 in April.";
  }
  const w = currentWeek(t), ph = $("phaseLine");
  if (t < PLAN_START) ph.textContent = "Plan starts Thursday 1 October · in " + days(t, PLAN_START) + (days(t, PLAN_START) === 1 ? " day" : " days");
  else if (w) ph.textContent = PHASES[w.ph].name + " · Week " + w.n + (w.ph === 1 ? " (" + (w.n + 1) + " of 12)" : "");
  else ph.textContent = t <= EXAM_END ? "Exam window" : "After Session 1";

  const box = $("thisWeek"), show = t < PLAN_START ? WEEKS[0] : w;
  if (!show) {
    box.innerHTML = '<div class="tw-head"><h3>' + (t <= EXAM_END ? "Exam week" : "Board mode") + '</h3></div><p class="tw-note">' + (t <= EXAM_END
      ? "No new questions the day before your exam. Short notes, mistake log, sleep at 22:00. Admit card, photo ID and photos packed the night before."
      : "Write full board answers with steps and practise from your board's question bank. Session 2 prep resumes after the boards.") + "</p>";
    return;
  }
  box.innerHTML = '<div class="tw-head"><h3>' + (t < PLAN_START ? "Starts Thursday 1 October" : "This week") + " · Week " + show.n + '</h3><span class="eyebrow">' + range(show.a, show.b) + "</span></div>" +
    (EXTRA.preStart && t < d(EXTRA.preStart.until) ? '<p class="tw-note">' + esc(EXTRA.preStart.text) + "</p>" : "") +
    ["P", "C", "M"].map(k => '<div class="subjrow"><span class="eyebrow">' + SUBJ[k] + '</span><div class="chips">' + subjBlock(show, k) + "</div></div>").join("") +
    '<p class="tw-note">' + esc(weekNote(show)) + "</p>";
}

function renderTimeline() {
  const s = d("2026-10-01"), e = d("2027-01-31"), span = days(s, e);
  const segs = [["p1", "2026-10-01", "2026-12-21", "Whole syllabus", "1 Oct – 20 Dec"], ["p2", "2026-12-21", "2027-01-04", "Second pass", "21 Dec – 3 Jan"], ["p3", "2027-01-04", "2027-01-22", "Sharpen", "4 – 21 Jan"], ["ex", "2027-01-22", "2027-01-31", "Session 1", "22 – 30 Jan"]];
  $("tlBar").innerHTML = segs.map(g => '<div class="tl-seg ' + g[0] + '" style="width:' + (days(d(g[1]), d(g[2])) / span * 100) + '%"></div>').join("");
  $("tlLegend").innerHTML = segs.map(g => '<div><i class="tl-seg ' + g[0] + '"></i><span><strong>' + g[3] + '</strong> <span class="muted mono" style="font-size:.78rem">' + g[4] + "</span></span></div>").join("");
  $("tlMonths").innerHTML = [["Oct", "2026-10-01"], ["Nov", "2026-11-01"], ["Dec", "2026-12-01"], ["Jan", "2027-01-01"]].map(m => '<span style="left:' + (days(s, d(m[1])) / span * 100) + '%">' + m[0] + "</span>").join("");
  const x = days(s, today0()) / span * 100, now = $("tlNow");
  if (x > 100) return;
  now.hidden = false;
  now.style.left = Math.max(0, x) + "%";
  if (x < 6) { now.style.transform = "none"; now.style.alignItems = "flex-start"; }
  if (x < 0) now.textContent = "you are here";
}

let ttSel = null, ttAuto = null;
function mins(hm) { const p = hm.split(":").map(Number); return p[0] * 60 + p[1]; }
function rowHolds(r, nm) { const a = mins(r[0]), b = mins(r[1]); return a < b ? (nm >= a && nm < b) : (nm >= a || nm < b); }

// Today's own timetable: which kind of day it is and its rows (built from the calendar when known).
function todayPlan(t) {
  const off = isOffDay(t), kind = t < PLAN_START ? "weekday" : autoTT(t, off);
  const classes = kind === "weekday" || kind === "jan" ? classesOn(iso(t)) : null;
  const plan = classes ? buildCollegeDay(classes, TT[kind]) : null;
  return { kind, off, plan, rows: plan ? plan.rows : TT[kind].rows };
}

// "Now: Block 2 · Learn until 21:15. Next: Dinner." for the top of the page and the Today bar.
function renderNowNext(today, t) {
  const el = $("nowNext");
  if (!inPlan(t)) { el.hidden = true; setSummary("today", t < PLAN_START ? "Starts Thursday 1 October." : "Session 1 is here."); return; }
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const i = today.rows.findIndex(r => rowHolds(r, nm));
  const cur = today.rows[i < 0 ? 0 : i], next = today.rows[((i < 0 ? 0 : i) + 1) % today.rows.length];
  const text = "Now: " + cur[2] + " until " + cur[1] + ". Next: " + next[2] + ".";
  el.hidden = false;
  el.innerHTML = '<strong>Now</strong> ' + esc(cur[2]) + ' <span class="muted">until ' + cur[1] + '</span><br><strong>Next</strong> ' + esc(next[2]) + ' <span class="muted">' + next[0] + "</span>";
  setSummary("today", (today.off ? "Day off. " : "") + text);
}
function renderTT() {
  const t = today0(), today = todayPlan(t), off = today.off, effective = today.kind;
  if (effective !== ttAuto) { ttAuto = effective; ttSel = effective; } // today's kind changed (day off toggled, or a new day)
  renderNowNext(today, t);
  $("ttTabs").innerHTML = TT_ORDER.map(k => '<button type="button" class="tab" role="tab" id="tab-' + k + '" data-k="' + k + '" aria-selected="' + (k === ttSel) + '" aria-controls="tt">' + TT[k].label + (k === effective ? " · today" : "") + "</button>").join("");
  const tt = TT[ttSel], now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const live = ttSel === effective && t >= PLAN_START;
  // On a college day whose classes we know, the rows are built around the real hours.
  const plan = live ? today.plan : null;
  $("tt").setAttribute("aria-labelledby", "tab-" + ttSel);
  $("tt").innerHTML = (plan ? plan.rows : tt.rows).map(r => {
    const inRow = rowHolds(r, nm);
    const items = r[5] ? '<ul class="cls">' + r[5].map(i => '<li' + (i.free ? ' class="free"' : "") + '><span class="ct">' + i.from + "–" + i.to + "</span>" + esc(i.label) + (i.free ? ": this week's PYQs" : "") + "</li>").join("") + "</ul>" : "";
    return '<div class="tt-row ' + r[4] + (live && inRow ? " now" : "") + '"><span class="t">' + r[0] + "–" + r[1] + '</span><div><div class="w">' + esc(r[2]) + "</div>" + (r[3] ? '<div class="dt">' + esc(r[3]) + "</div>" : "") + items + "</div></div>";
  }).join("");
  $("ttFoot").textContent = plan
    ? "Built from your college calendar: first class " + plan.start + ", last one ends " + plan.end + ". Calendar checked " + ago(calendarDays.checkedAt) + ". The travel times are guesses."
    : tt.foot;
  $("todayEyebrow").textContent = t < PLAN_START ? "From Thursday 1 October" : "Today · " + WDL[t.getDay()] + " " + short(t) + (off ? " · day off" : "");
}

let openWeeks = null; // week numbers shown expanded (this session only)
function weekCounts(w) {
  const ids = [...w.P, ...w.C, ...w.M];
  return { total: ids.length, done: ids.filter(id => isFinished(st(id))).length, skipped: ids.filter(id => st(id) === SKIPPED).length };
}
function weekProgress(w, past) {
  const c = weekCounts(w);
  if (!c.total) return { text: "Revision", late: false };
  const open = c.total - c.done - c.skipped;
  return { text: c.done + " / " + c.total + " done" + (c.skipped ? " · " + c.skipped + " skipped" : ""), late: past && open > 0 };
}
function renderWeeks() {
  const t = today0(), cur = currentWeek(t);
  if (!openWeeks) openWeeks = new Set([cur ? cur.n : 0]);
  let h = "", lastPh = 0;
  for (const w of WEEKS) {
    if (w.ph !== lastPh) {
      const p = PHASES[w.ph];
      h += '<div class="phase-h"><h3>' + p.name + '</h3><span class="eyebrow">' + p.when + "</span><p>" + p.blurb + "</p></div>";
      lastPh = w.ph;
    }
    const isOpen = openWeeks.has(w.n), past = t > w.b, prog = weekProgress(w, past);
    const cls = (cur && cur.n === w.n ? " cur" : "") + (past ? " past" : "") + (isOpen ? " open" : "");
    h += '<article class="card wk' + cls + '" data-n="' + w.n + '"><h4 class="wk-h"><button type="button" class="wk-head" aria-expanded="' + isOpen + '" aria-controls="wk-body-' + w.n + '">' +
      '<span class="wn">Week ' + w.n + '</span><span class="wd">' + WD[w.a.getDay()] + " " + short(w.a) + " – " + WD[w.b.getDay()] + " " + short(w.b) + '</span>' +
      '<span class="wp' + (prog.late ? " late" : "") + '">' + prog.text + '</span><span class="chev" aria-hidden="true"></span></button></h4>' +
      '<div class="wk-body" id="wk-body-' + w.n + '"' + (isOpen ? "" : " hidden") + ">" +
      ["P", "C", "M"].map(k => '<div class="wcol"><span class="eyebrow">' + SUBJ[k] + "</span>" + subjBlock(w, k) + "</div>").join("") +
      '<p class="wnote">' + esc(weekNote(w)) + "</p></div></article>";
  }
  $("weekList").innerHTML = h;
  updateWeekHeads();
}
function updateWeekHeads() {
  const t = today0(), cur = currentWeek(t);
  document.querySelectorAll(".wk[data-n]").forEach(el => {
    const w = WEEKS[Number(el.dataset.n)], prog = weekProgress(w, t > w.b), wp = el.querySelector(".wp");
    wp.textContent = prog.text;
    wp.classList.toggle("late", prog.late);
  });
  const r = catchUp(st, t), w = cur || (t < PLAN_START ? WEEKS[0] : null);
  setSummary("weeks", (w ? "Week " + w.n + ": " + weekProgress(w, false).text.toLowerCase() + "." : "All 17 weeks.") + (r.behind ? " " + r.behind + " carried over." : ""));
}

/* ---------- tests (rendering and the form live in tests-ui.js) ---------- */
let armed = null, armTimer = null;
function onDelete(btn) {
  const id = btn.dataset.del;
  if (armed !== id) {
    document.querySelectorAll("[data-del]").forEach(b => { b.textContent = "Delete"; b.classList.remove("warn"); });
    armed = id; btn.textContent = "Tap again to delete"; btn.classList.add("warn");
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { armed = null; btn.textContent = "Delete"; btn.classList.remove("warn"); }, 4000);
    return;
  }
  armed = null; clearTimeout(armTimer);
  commit(deleteMock(state, id, Date.now()));
}

/* ---------- sync ---------- */
let syncTimer = null, syncing = false, syncAgain = false, devices = [];
function setSyncText(text, kind) { const el = $("syncState"); el.textContent = text; el.dataset.kind = kind || ""; setSummary("device", text); }

function hostCandidates() {
  return [lsGet(LS.host)].concat(JEE_ENV.hosts || []).map(normalizeHost).filter((h, i, a) => h && a.indexOf(h) === i);
}

// POST to the Mac's sync server: same-origin on the Mac, native HTTP over Wi-Fi on the phone.
async function macPost(path, payload) {
  if (PLATFORM === "mac") {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-sync-token": JEE_ENV.token }, body: JSON.stringify(payload) });
    const body = await r.json();
    if (!r.ok || !body.success) throw new Error(body.error || "HTTP " + r.status);
    return body.data;
  }
  let lastErr = null;
  for (const host of hostCandidates()) {
    try {
      const r = await window.Capacitor.nativePromise("CapacitorHttp", "request", {
        url: host.replace(/\/+$/, "") + path, method: "POST", responseType: "json",
        headers: { "Content-Type": "application/json", "x-sync-token": syncToken() },
        data: payload, connectTimeout: 3000, readTimeout: 8000
      });
      const body = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      if (r.status !== 200 || !body || !body.success) throw Object.assign(new Error((body && body.error) || "HTTP " + r.status), { status: r.status });
      lsSet(LS.host, host);
      return body.data;
    } catch (e) { lastErr = Object.assign(e instanceof Error ? e : new Error(String(e && e.message || e)), { host }); }
  }
  throw lastErr || new Error("No Mac address set");
}

function syncSummary() {
  const last = lsGet(LS.lastSync);
  if (PLATFORM === "mac") {
    const others = devices.filter(x => x.id !== deviceId()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    return "Saved on this Mac." + (others.length ? " " + others[0].name + " last synced " + ago(others[0].lastSeen) + "." : " Your phone hasn't synced yet.");
  }
  if (!isPaired()) return "Not paired with a Mac yet. Enter your Mac's address and pairing code under Sync.";
  return last ? "Last synced with your Mac " + ago(Number(last)) + "." : "Not synced yet. Open the app on your home Wi-Fi.";
}

// Why the last sync failed, in words the person can act on. Shown in the Sync panel.
let syncProblem = "";
function explainSyncError(e) {
  if (PLATFORM === "mac") return "The sync service on this Mac isn't answering. Quit and reopen the app.";
  if (e && e.status === 401) return "Your Mac refused the pairing code. Type it again exactly as the Mac app shows it.";
  const where = e && e.host ? e.host.replace(/^http:\/\//, "") : "that address";
  return "Couldn't reach your Mac at " + where + ". Check that the address matches the one in the Mac app, that the phone and Mac are on the same Wi-Fi, and that the Mac app is open.";
}

async function runSync() {
  if (!CAN_EDIT) return;
  if (!isPaired()) { setSyncText(syncSummary(), "warn"); renderDevice(); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  const sent = JSON.stringify(state);
  try {
    if (IS_ANDROID) setSyncText("Syncing with your Mac…", "busy");
    const data = await macPost("/api/sync", { device: { id: deviceId(), name: IS_ANDROID ? "Phone" : "Mac" }, state });
    if ("calendar" in data) setCalendarDays(data.calendar);
    const merged = mergeStates(state, normalizeState(data.state));
    devices = Array.isArray(data.devices) ? data.devices : devices;
    lsSet(LS.lastSync, String(Date.now()));
    if (JSON.stringify(merged) !== sent) { const prev = state; state = merged; lsSet(LS.state, JSON.stringify(state)); stateChanged(prev); }
    syncProblem = "";
    setSyncText(syncSummary(), "ok");
  } catch (e) {
    console.warn("[jee-sprint] sync failed", e);
    syncProblem = explainSyncError(e);
    setSyncText(PLATFORM === "mac" ? "Saved on this Mac, but the sync service isn't answering." : "Saved on this phone. It'll sync when it can reach your Mac.", "warn");
  } finally {
    syncing = false;
    if (PLATFORM === "mac") { loadMacInfo(); loadCalendarStatus(); } else renderDevice();
    if (syncAgain) { syncAgain = false; runSync(); }
  }
}
function queueSync() {
  if (!CAN_EDIT) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, SYNC_DEBOUNCE_MS);
}

/* ---------- phone reminders ---------- */
function ln(method, options) { return window.Capacitor.nativePromise("LocalNotifications", method, options || {}); }
async function cancelReminders() {
  const pending = await ln("getPending");
  const ids = ((pending && pending.notifications) || []).map(n => ({ id: n.id }));
  if (ids.length) await ln("cancel", { notifications: ids });
}
async function scheduleReminders() {
  await cancelReminders();
  const list = buildReminders(today0(), REMINDER_DAYS, new Date(), date => isDayOff(state, date), classesOn);
  if (!list.length) return null;
  await ln("schedule", { notifications: list.map(r => ({
    id: r.id, title: r.title, body: r.body, channelId: "blocks", smallIcon: "ic_stat_jee", iconColor: "#2545c4",
    schedule: { at: r.at.toISOString(), allowWhileIdle: true }
  })) });
  return list[0];
}
let reminderNote = "";
async function setReminders(on) {
  try {
    if (!on) { await cancelReminders(); lsSet(LS.remind, "off"); reminderNote = "Reminders are off."; return; }
    const perm = await ln("requestPermissions");
    if (!perm || perm.display !== "granted") { lsSet(LS.remind, "off"); reminderNote = "Notifications are blocked for JEE Sprint. Allow them in Android Settings → Apps → JEE Sprint → Notifications, then try again."; return; }
    try { await ln("createChannel", { id: "blocks", name: "Study blocks", description: "A nudge when each study block starts", importance: 4, visibility: 1, vibration: true }); }
    catch (e) { console.warn("[jee-sprint] channel", e); }
    lsSet(LS.remind, "on");
    await refreshReminders();
  } catch (e) {
    console.error("[jee-sprint] reminders failed", e);
    reminderNote = "Couldn't set reminders: " + (e && e.message ? e.message : "unknown error") + ".";
  } finally { renderDevice(); }
}
async function refreshReminders() {
  if (lsGet(LS.remind) !== "on") return;
  try {
    const next = await scheduleReminders();
    reminderNote = next ? "On for the next " + REMINDER_DAYS + " days. Next: " + WD[next.at.getDay()] + " " + String(next.at.getHours()).padStart(2, "0") + ":" + String(next.at.getMinutes()).padStart(2, "0") + " · " + next.title + ". Opening the app tops them up." : "No study blocks left to remind you about.";
  } catch (e) {
    console.error("[jee-sprint] reschedule failed", e);
    reminderNote = "Couldn't refresh reminders. Open the app again later.";
  }
  renderDevice();
}

/* ---------- this-device panel ---------- */
let macAddresses = [];
function renderDevice() {
  const box = $("deviceBox");
  if (!box) return;
  if (PLATFORM === "artifact") {
    box.innerHTML = '<p>This claude.ai copy is read-only. Tick chapters and log mocks in the <strong>JEE Sprint</strong> app on your Mac or phone. Those two sync with each other.</p>';
    return;
  }
  if (PLATFORM === "mac") {
    const phone = devices.filter(x => x.id !== deviceId());
    box.innerHTML =
      '<div class="dev-row"><h3>Sync</h3><p>' + esc(syncSummary()) + '</p><p class="msg err" role="alert">' + esc(syncProblem) + "</p></div>" +
      '<div class="dev-row"><h3>Phone setup</h3><p>In the phone app\'s Sync section, enter this Mac\'s address: ' + (macAddresses.length ? macAddresses.map(a => '<code>http://' + esc(a) + ":" + (location.port || "5199") + "</code>").join(" or ") : "this Mac's IP address (System Settings › Wi-Fi › Details), written like <code>192.168.0.10</code>") +
      (VARIANT === "friend" ? ' and the pairing code <code class="pair">' + esc(JEE_ENV.token) + "</code>" : "") + (VARIANT === "friend" ? ". Both need to be on the same Wi-Fi, with this app running (closing the window is fine; quitting stops sync).</p></div>" : ". Both need to be on the same Wi-Fi, with the Mac awake.</p></div>") +
      (phone.length ? '<div class="dev-row"><h3>Devices</h3><ul class="plain">' + phone.map(p => "<li>" + esc(p.name) + " · last synced " + esc(ago(p.lastSeen)) + "</li>").join("") + "</ul></div>" : "") +
      '<div class="dev-row"><button type="button" class="btn ghost" id="syncNow">Sync now</button></div>';
    return;
  }
  const on = lsGet(LS.remind) === "on";
  const typing = document.activeElement && document.activeElement.tagName === "INPUT" && box.contains(document.activeElement);
  if (typing) { // a background sync must not wipe what's being typed
    $("devSummary").textContent = syncSummary();
    $("devMsg").textContent = syncProblem;
    return;
  }
  const shownHost = (normalizeHost(lsGet(LS.host)) || (JEE_ENV.hosts || [])[0] || "").replace(/^http:\/\//, "").replace(/:5199$/, "");
  box.innerHTML =
    '<div class="dev-row"><h3>Sync with your Mac</h3><p id="devSummary">' + esc(syncSummary()) + '</p>' +
    '<p class="msg err" id="devMsg" role="alert">' + esc(syncProblem) + '</p>' +
    '<div class="hostrow"><label for="hostIn">Mac address</label><input id="hostIn" type="text" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="192.168.0.10" value="' + esc(shownHost) + '">' +
    (JEE_ENV.token ? "" : '<label for="codeIn">Pairing code</label><input id="codeIn" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" value="' + esc(lsGet(LS.token) || "") + '">') +
    '<button type="button" class="btn ghost" id="syncNow">Save & sync</button></div>' +
    '<p class="muted small">Type the address the Mac app shows under "Phone setup". The numbers alone are enough, like 192.168.0.10. Your phone syncs whenever it can reach the Mac on your home Wi-Fi.</p></div>' +
    '<div class="dev-row"><h3>Study-block reminders</h3><p>' + esc(reminderNote || (on ? "On." : "A notification when each block starts: 05:40, 19:45, 21:45 on college days, and the Sunday blocks.")) + '</p>' +
    '<button type="button" class="btn' + (on ? " ghost" : "") + '" id="remindToggle">' + (on ? "Turn reminders off" : "Turn reminders on") + "</button></div>";
}

async function loadMacInfo() {
  try {
    const r = await fetch("/api/info", { headers: { "x-sync-token": JEE_ENV.token } });
    const body = await r.json();
    if (body.success) { macAddresses = body.data.addresses || []; devices = body.data.devices || devices; }
  } catch (e) { console.warn("[jee-sprint] info failed", e); }
  finally { renderDevice(); }
}

/* ---------- events & boot ---------- */
document.addEventListener("click", ev => {
  const b = ev.target.closest(".ch");
  if (b && CAN_EDIT) { const id = b.dataset.id, cur = st(id); commit(setChapter(state, id, cur === SKIPPED ? 1 : (cur + 1) % 4, Date.now())); return; }
  const tab = ev.target.closest(".tab[data-k]"); // timetable tabs only; the test-log filters are .tab[data-tf]
  if (tab) { ttSel = tab.dataset.k; renderTT(); $("tab-" + ttSel).focus(); return; }
  const del = ev.target.closest("[data-del]");
  if (del) { onDelete(del); return; }
  if (ev.target.id === "syncNow") {
    const input = $("hostIn"), code = $("codeIn"), msg = $("devMsg");
    if (input) {
      const raw = input.value.trim(), host = normalizeHost(raw);
      if (raw && !host) { msg.textContent = "That doesn't look like an address. Type the numbers the Mac app shows, like 192.168.0.10"; return; }
      if (!raw) { msg.textContent = "Type your Mac's address first. The Mac app shows it under \"Phone setup\"."; return; }
      lsSet(LS.host, host);
    }
    if (code) {
      const c = code.value.trim().toUpperCase();
      if (!/^[A-Z0-9-]{4,40}$/.test(c)) { msg.textContent = "Type the pairing code the Mac app shows, like ABCD-2345."; return; }
      lsSet(LS.token, c);
    }
    ev.target.blur();
    runSync(); return;
  }
  if (ev.target.id === "remindToggle") { setReminders(lsGet(LS.remind) !== "on"); }
});

function boot() {
  if (PLATFORM === "artifact") { $("banner").hidden = false; $("mockForm").hidden = true; }
  $("mockForm").addEventListener("submit", onMockSubmit);
  $("mDate").value = iso(today0());
  initSections();
  loadState(); loadCalendarDays();
  renderHero(); renderTimeline(); renderTT(); renderWeeks(); renderProgress(); renderPace(); renderMocks(); renderDevice(); renderDaysOffShell(); renderCatchUp();
  setSyncText(CAN_EDIT ? syncSummary() : "Read-only copy. Your live tracker is in the JEE Sprint app.", "");
  setInterval(() => { if (!document.activeElement || !document.activeElement.classList.contains("tab")) renderTT(); }, 60000);
  if (!CAN_EDIT) return;
  if (PLATFORM === "mac") { loadMacInfo(); loadCalendarStatus(); }
  runSync();
  setInterval(() => { if (document.visibilityState === "visible") runSync(); }, SYNC_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    renderHero(); renderPace(); renderTT(); renderDaysOff(); renderCatchUp(); updateWeekHeads(); runSync();
    if (PLATFORM === "mac") loadCalendarStatus();
    if (IS_ANDROID) refreshReminders();
  });
  if (IS_ANDROID) refreshReminders();
}
