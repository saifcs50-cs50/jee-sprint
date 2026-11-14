// Days off from college: the "No college today" button, the Days off list, and (on the Mac)
// the Google Calendar link. Concatenated after app.js by build.mjs, so it shares its scope.

const LAST_STUDY_DAY = "2027-01-21";
const DAYS_OFF_SHOWN = 12;
let calendarStatus = null; // null: this Mac's server has no calendar support, or we haven't asked yet
let calendarShown = "";    // what #offCal was last drawn from, to avoid redrawing while someone types

function isOffDay(t) { return t.getDay() !== 0 && isDayOff(state, iso(t)); }
function inPlan(t) { return t >= PLAN_START && t < EXAM; }
function dayLabel(dateIso) { const x = d(dateIso); return WD[x.getDay()] + " " + short(x); }

function renderTodayOff() {
  const box = $("todayOff"), t = today0();
  if (!CAN_EDIT || !inPlan(t) || t.getDay() === 0) { box.innerHTML = ""; return; }
  const date = iso(t), entry = state.daysOff[date];
  box.innerHTML = isOffDay(t)
    ? '<span class="offchip">Day off' + (entry.title ? ": " + esc(entry.title) : "") + '</span><button type="button" class="btn ghost" data-off="' + date + '" data-set="0">I do have college today</button>'
    : '<button type="button" class="btn ghost" data-off="' + date + '" data-set="1">No college today</button>';
}

// The static parts are drawn once so typing in a field is never interrupted by a background sync.
function renderDaysOffShell() {
  const box = $("daysOffBox");
  if (!CAN_EDIT) { box.innerHTML = "<p>Days off are set in the JEE Sprint app on your Mac or phone.</p>"; renderTodayOff(); return; }
  const today = iso(today0()), min = today < "2026-10-01" ? "2026-10-01" : today;
  box.innerHTML =
    '<div class="dev-row"><h3>Coming up</h3><div id="offList"></div></div>' +
    '<div class="dev-row"><h3>Add a day off</h3><div class="offadd"><label class="vh" for="offDate">Date</label><input id="offDate" type="date" min="' + min + '" max="' + LAST_STUDY_DAY + '">' +
    '<button type="button" class="btn ghost" id="offAdd">Add day off</button></div><p class="msg err" id="offMsg" role="alert"></p></div>' +
    '<div class="dev-row" id="offCal" hidden></div>';
  renderDaysOff();
  renderCalendar();
}

function renderDaysOff() {
  renderTodayOff();
  renderCalendar(); // its "today" line depends on whether today is a day off
  const t = today0(), ahead = upcomingDaysOff(state, iso(t)).filter(x => d(x.date).getDay() !== 0 && x.date <= LAST_STUDY_DAY);
  setSummary("daysoff", (isOffDay(t) ? "Today is a day off. " : "") + (ahead.filter(x => x.date > iso(t)).length ? "Next: " + dayLabel(ahead.filter(x => x.date > iso(t))[0].date) + "." : "No more marked.") + (calendarDays ? " College calendar linked." : ""));
  const list = $("offList");
  if (!list) return;
  const days = upcomingDaysOff(state, iso(today0())).filter(x => d(x.date).getDay() !== 0 && x.date <= LAST_STUDY_DAY);
  if (!days.length) { list.innerHTML = '<p class="muted">No days off marked. Tap "No college today" on the day, or add a date below.</p>'; return; }
  list.innerHTML = '<ul class="offlist">' + days.slice(0, DAYS_OFF_SHOWN).map(x =>
    '<li><span class="when">' + dayLabel(x.date) + '</span><span class="what">' + esc(x.title || "Day off") + ' <span class="tag">' + (x.src === "calendar" ? "Google Calendar" : "Added here") + "</span></span>" +
    '<button type="button" class="btn ghost" data-off="' + x.date + '" data-set="0">I have college</button></li>').join("") + "</ul>" +
    (days.length > DAYS_OFF_SHOWN ? '<p class="muted small">and ' + (days.length - DAYS_OFF_SHOWN) + " more later.</p>" : "");
}

/* ---------- Google Calendar (the link lives on the Mac and never leaves it) ---------- */
async function calendarCall(body) {
  const init = { headers: { "Content-Type": "application/json", "x-sync-token": JEE_ENV.token } };
  if (body) { init.method = "POST"; init.body = JSON.stringify(body); }
  const r = await fetch("/api/calendar", init);
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "HTTP " + r.status);
  return j.data;
}

async function loadCalendarStatus() {
  try { calendarStatus = await calendarCall(); }
  catch (e) { calendarStatus = null; } // older or self-contained Mac app without calendar support
  renderCalendar();
}

// "Today: 7 classes, 08:30–18:30. Tomorrow: nothing in the calendar yet.", from the schedule the Mac last read.
function hoursOf(classes) { return classes.length + (classes.length === 1 ? " class, " : " classes, ") + classes[0].from + "–" + classes.map(c => c.to).sort().pop(); }
function todayFromCalendar() {
  const t = today0(), tomorrow = new Date(t.getTime() + 36 * 3600000);
  const now = classesOn(iso(t)), next = classesOn(iso(tomorrow));
  const today = now ? "Today: " + hoursOf(now) + "." : t.getDay() === 0 ? "Today is Sunday." : isOffDay(t) ? "Today: no classes, so it's a day off." : "Today: no classes in the calendar.";
  const after = next ? "Tomorrow: " + hoursOf(next) + "." : tomorrow.getDay() === 0 ? "" : "Tomorrow: nothing in the calendar yet.";
  return (today + " " + after).trim();
}

function words(id) { return $(id).value.split(",").map(w => w.trim()).filter(Boolean); }

function renderCalendar() {
  const box = $("offCal");
  if (!box) return;
  const typing = document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type === "text";
  const key = JSON.stringify([calendarStatus, calendarDays && calendarDays.checkedAt, iso(today0()), isOffDay(today0())]);
  if (typing || key === calendarShown) return;
  calendarShown = key;
  if (IS_ANDROID) {
    box.hidden = false;
    box.innerHTML = calendarDays
      ? '<h3>Google Calendar</h3><p>Linked through your Mac. ' + esc(todayFromCalendar()) + " Last checked " + esc(ago(calendarDays.checkedAt)) + '.</p><p class="msg err" id="calMsg" role="alert"></p><div class="btnrow"><button type="button" class="btn ghost" id="calPhoneRefresh">Refresh calendar</button></div>'
      : '<h3>Google Calendar</h3><p class="muted">Connect your college calendar in the Mac app. Your classes and days off then reach this phone when it syncs.</p>';
    return;
  }
  if (!calendarStatus) { box.hidden = true; return; }
  box.hidden = false;
  const s = calendarStatus;
  box.innerHTML = s.connected
    ? '<h3>Google Calendar</h3><div class="calrow"><p>Connected. ' + esc(todayFromCalendar()) + " " + (s.checkedAt ? "Checked " + esc(ago(s.checkedAt)) + "." : "Checking now…") + ' It re-checks every 10 minutes.</p>' +
      '<p class="muted small">Your college adds classes only a day or two ahead, so the app builds today and tomorrow from the calendar and keeps the standard day beyond that. A weekday becomes a day off when the day arrives with no classes listed.</p>' +
      '<p class="msg err" id="calMsg" role="alert">' + esc(s.error || "") + "</p>" +
      '<div class="field"><label for="calBatch">My batch (events for other batches are ignored)</label><input id="calBatch" type="text" autocomplete="off" spellcheck="false" placeholder="Your batch name" value="' + esc(s.batch || "") + '"></div>' +
      '<div class="field"><label for="calSkip">Skip events containing (separate with commas)</label><input id="calSkip" type="text" autocomplete="off" spellcheck="false" placeholder=";Bio;, ;Stat;" value="' + esc(s.skip.join(", ")) + '"></div>' +
      '<div class="field"><label for="calOnly">Only count events containing (leave empty for all)</label><input id="calOnly" type="text" autocomplete="off" spellcheck="false" value="' + esc(s.only.join(", ")) + '"></div>' +
      '<p class="muted small">A shared timetable has classes you don\'t take. Skip them here so the app sees your real hours. Today\'s list under "Your day, hour by hour" shows what was kept.</p>' +
      '<label class="check"><input type="checkbox" id="calAll"' + (s.everyAllDay ? " checked" : "") + '><span>Also treat every all-day event as a day off (not just ones named Holiday, No college, Leave or Vacation).</span></label>' +
      '<div class="btnrow"><button type="button" class="btn ghost" id="calFilter">Save filter</button><button type="button" class="btn ghost" id="calRefresh">Check now</button><button type="button" class="btn ghost" id="calDisconnect">Disconnect</button></div></div>'
    : '<h3>Google Calendar</h3><div class="calrow"><p>Connect the calendar that has your college timetable. The app then shows each day\'s classes, treats a weekday with no classes as a day off, and moves your study blocks to fit your real hours.</p>' +
      "<ol><li>On a computer, open Google Calendar and go to Settings.</li><li>On the left, click the calendar that holds your classes.</li><li>Scroll to <strong>Integrate calendar</strong> and copy <strong>Secret address in iCal format</strong>. If it's your college's calendar and that isn't shown, copy <strong>Public address in iCal format</strong>.</li><li>Paste it below.</li></ol>" +
      '<label class="vh" for="calUrl">iCal address</label><input id="calUrl" type="text" autocomplete="off" spellcheck="false" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics">' +
      '<p class="msg err" id="calMsg" role="alert"></p>' +
      '<div class="btnrow"><button type="button" class="btn" id="calConnect">Connect</button></div>' +
      '<p class="muted small">The link is stored only on this Mac. Anyone with a secret link can read that calendar, so don\'t share it.</p></div>';
}

async function calendarAction(body, busyButton) {
  const msg = $("calMsg");
  if (busyButton) busyButton.disabled = true;
  try {
    calendarStatus = await calendarCall(body);
    calendarShown = "";
    renderCalendar();
    runSync(); // pull the classes and days off the Mac just read
  } catch (e) {
    console.warn("[jee-sprint] calendar", e);
    if (msg) msg.textContent = e.message;
    if (busyButton) busyButton.disabled = false;
  }
}

// Phone: ask the Mac to re-read the calendar now, then sync to pick up the result.
async function refreshCalendarFromPhone(button) {
  const msg = $("calMsg");
  button.disabled = true;
  try {
    await macPost("/api/calendar", { refresh: true });
    calendarShown = "";
    await runSync();
  } catch (e) {
    console.warn("[jee-sprint] calendar refresh", e);
    if (msg) msg.textContent = explainSyncError(e);
    button.disabled = false;
  }
}

document.addEventListener("click", ev => {
  const off = ev.target.closest("[data-off]");
  if (off && CAN_EDIT) { commit(setDayOff(state, off.dataset.off, off.dataset.set === "1", Date.now())); return; }
  const id = ev.target.id;
  if (id === "offAdd") {
    const date = $("offDate").value, msg = $("offMsg");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg.textContent = "Pick a date first."; return; }
    if (date < "2026-10-01" || date > LAST_STUDY_DAY) { msg.textContent = "Pick a date between 1 October and 21 January."; return; }
    if (d(date).getDay() === 0) { msg.textContent = "That's a Sunday. Sundays already run the day-off timetable."; return; }
    msg.textContent = "";
    $("offDate").value = "";
    commit(setDayOff(state, date, true, Date.now()));
    return;
  }
  if (id === "calConnect") {
    const url = $("calUrl").value.trim();
    if (!url) { $("calMsg").textContent = "Paste the iCal address first."; return; }
    ev.target.blur();
    calendarAction({ url }, ev.target);
    return;
  }
  if (id === "calFilter") { ev.target.blur(); calendarAction({ skip: words("calSkip"), only: words("calOnly"), batch: $("calBatch").value.trim() }, ev.target); return; }
  if (id === "calPhoneRefresh") { refreshCalendarFromPhone(ev.target); return; }
  if (id === "calRefresh") { calendarAction({ refresh: true }, ev.target); return; }
  if (id === "calDisconnect") { calendarAction({ disconnect: true }, ev.target); }
});
document.addEventListener("change", ev => {
  if (ev.target.id === "calAll" && calendarStatus && calendarStatus.connected) calendarAction({ everyAllDay: ev.target.checked });
});
