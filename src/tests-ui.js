// The test log: full mocks and any other test (part tests, chapter tests, college tests), compared
// in percent on one chart, with a filter, the leak summary and a table. Scoring lives in core.mjs.
// Concatenated after app.js by build.mjs, so it shares its scope.

const TEST_FILTERS = [["all", "All"], ["full", "Full mocks"], ["P", "Physics"], ["C", "Chemistry"], ["M", "Maths"], ["X", "Mixed"]];
const SUBJECT_NAME = { P: "Physics", C: "Chemistry", M: "Maths", X: "Mixed" };
const LEAK_INPUTS = { silly: "lSilly", memory: "lMemory", concept: "lConcept", time: "lTime", unattempted: "lUnatt" };
let testFilter = "all";

function checkedValue(name, fallback) {
  const r = document.querySelector('input[name="' + name + '"]:checked');
  return r ? r.value : fallback;
}
function testName(m) { return m.paper || (m.kind === "test" ? SUBJECT_NAME[m.subject] + " test" : "Full mock"); }
function fmtMark(x) { return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100); }
function scoreText(m) { const s = testScore(m); return fmtMark(s.score) + " / " + fmtMark(s.max) + " (" + s.pct + "%)"; }
function inFilter(m, key) { return key === "all" || (key === "full" ? m.kind !== "test" : m.kind === "test" && m.subject === key); }

function renderMocks() {
  const all = liveMocks(state), list = all.filter(m => inFilter(m, testFilter));
  const chart = $("chart"), leaks = $("leaks"), tbl = $("mockTable");
  const last = all[all.length - 1];
  setSummary("mocks", all.length ? all.length + " logged. Last: " + testName(last) + ", " + scoreText(last) + "." : "None logged yet. Log any test: part tests, chapter tests, full mocks.");
  $("mockFilter").innerHTML = all.length > 1
    ? TEST_FILTERS.filter(([k]) => k === "all" || all.some(m => inFilter(m, k)))
        .map(([k, label]) => '<button type="button" class="tab" data-tf="' + k + '" aria-pressed="' + (k === testFilter) + '">' + label + "</button>").join("")
    : "";
  if (!list.length) {
    chart.innerHTML = '<p class="empty">' + (all.length ? "No tests of this kind yet." : "No tests logged yet. Log this Sunday's part test and the trend line starts. Your first full mock is Sunday 15 November.") + "</p>";
    leaks.innerHTML = ""; tbl.innerHTML = ""; return;
  }
  chart.innerHTML = chartSVG(list);
  const sums = LEAKS.map(l => [l[1], list.reduce((s, m) => s + (m.leaks[l[0]] || 0), 0)]);
  const max = Math.max(1, ...sums.map(x => x[1]));
  const top = sums.slice().sort((a, b) => b[1] - a[1])[0];
  leaks.innerHTML = '<p class="eyebrow">Questions lost' + (testFilter === "all" ? ", all tests" : ", " + TEST_FILTERS.find(f => f[0] === testFilter)[1].toLowerCase()) + "</p>" +
    sums.map(x => '<div class="leak"><span>' + x[0] + '</span><div class="lt"><div class="lf" style="width:' + (x[1] / max * 100) + '%"></div></div><span class="n">' + x[1] + "</span></div>").join("") +
    (top[1] > 0 ? '<p class="callout">Biggest leak so far: <strong>' + top[0] + "</strong> (" + top[1] + " questions). Fix this one first.</p>" : "");
  tbl.innerHTML = '<table><thead><tr><th>Date</th><th>Test</th><th class="num">Score</th><th class="num">%</th><th class="num">Accuracy</th><th><span class="vh">Delete</span></th></tr></thead><tbody>' +
    list.slice().reverse().map(m => {
      const s = testScore(m);
      return '<tr><td class="mono">' + esc(short(d(m.date))) + "</td><td>" + esc(testName(m)) + ' <span class="tag">' + (m.kind === "test" ? m.questions + " Q" : "Mock") + '</span></td>' +
        '<td class="num">' + fmtMark(s.score) + " / " + fmtMark(s.max) + '</td><td class="num"><strong>' + s.pct + '%</strong></td><td class="num">' + (s.accuracy === null ? "–" : s.accuracy + "%") + "</td><td>" +
        (CAN_EDIT ? '<button type="button" class="btn ghost" data-del="' + esc(m.id) + '">Delete</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
}

// Score in percent, oldest to newest. Full mocks are filled dots, other tests hollow.
function chartSVG(list) {
  const W = 640, H = 230, pl = 44, pr = 60, pt = 16, pb = 30;
  const pct = list.map(m => testScore(m).pct), n = list.length;
  const ymin = Math.min(0, Math.floor(Math.min(...pct) / 25) * 25), ymax = 100;
  const x = i => n === 1 ? pl + (W - pl - pr) / 2 : pl + i * (W - pl - pr) / (n - 1);
  const y = v => pt + (ymax - v) * (H - pt - pb) / (ymax - ymin);
  let g = "";
  const ticks = [0, 25, 50, 75, 100]; if (ymin < 0) ticks.unshift(ymin);
  ticks.forEach(v => { g += '<line class="gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "%</text>"; });
  const step = Math.max(1, Math.ceil(n / 10));
  list.forEach((m, i) => { if (i % step === 0 || i === n - 1) g += '<text class="ax" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">#' + (i + 1) + "</text>"; });
  const pts = pct.map((v, i) => x(i) + "," + y(v));
  if (n > 1) g += '<path class="ar" d="M' + x(0) + "," + y(Math.max(0, ymin)) + " L" + pts.join(" L") + " L" + x(n - 1) + "," + y(Math.max(0, ymin)) + ' Z"/><polyline class="ln" points="' + pts.join(" ") + '"/>';
  list.forEach((m, i) => { g += '<circle class="' + (m.kind === "test" ? "dt" : "end") + '" cx="' + x(i) + '" cy="' + y(pct[i]) + '" r="' + (i === n - 1 ? 5 : 3.5) + '"/>'; });
  g += '<text class="lbl" x="' + (x(n - 1) + 10) + '" y="' + (y(pct[n - 1]) + 4) + '">' + pct[n - 1] + "%</text>";
  return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Test scores in percent, oldest first: ' + pct.join(", ") + '">' + g + "</svg>";
}

/* ---------- the form ---------- */
function readInt(id, lo, hi, required) {
  const raw = $(id).value.trim();
  if (raw === "") return required ? { err: true } : { v: null };
  const v = Number(raw);
  return Number.isInteger(v) && v >= lo && v <= hi ? { v } : { err: true };
}
function readMark(id, lo, hi) {
  const v = Number($(id).value.trim());
  return $(id).value.trim() !== "" && Number.isFinite(v) && v >= lo && v <= hi && Math.abs(Math.round(v * 100) - v * 100) < 1e-9 ? { v } : { err: true };
}

function setTestKind(kind) {
  $("fsTest").hidden = kind !== "test";
  $("fsFull").hidden = kind !== "full";
  $("mSubmit").textContent = kind === "test" ? "Log test" : "Log mock";
  $("mPaper").placeholder = kind === "test" ? "Sunday part test" : "24 Jan 2025 Shift 1";
  updateTestPreview();
}

// Live score while typing, and the Unattempted leak pre-filled from questions − right − wrong.
function updateTestPreview() {
  const out = $("tPreview");
  if (!out || checkedValue("mKind", "test") !== "test") return;
  const q = readInt("tQ", 1, 300, true), r = readInt("tRight", 0, 300, true), w = readInt("tWrong", 0, 300, true);
  const plus = readMark("tPlus", 0.25, 10), minus = readMark("tMinus", 0, 10);
  $("lUnatt").placeholder = "";
  if (q.err || r.err || w.err) { out.textContent = "Fill in questions, right and wrong to see the score."; return; }
  if (r.v + w.v > q.v) { out.textContent = "Right and wrong add up to more than " + q.v + " questions."; return; }
  if (plus.err || minus.err) { out.textContent = "Marking: between 0.25 and 10 per right answer, and 0 to 10 off per wrong one."; return; }
  const m = { kind: "test", questions: q.v, correct: r.v, wrong: w.v, plus: plus.v, minus: minus.v }, s = testScore(m);
  $("lUnatt").placeholder = String(s.unattempted);
  out.textContent = "Score " + fmtMark(s.score) + " / " + fmtMark(s.max) + " (" + s.pct + "%) · " + s.unattempted + " unattempted" + (s.accuracy === null ? "" : " · " + s.accuracy + "% of attempted were right");
}

function readLeaks(limit, unattemptedDefault) {
  const leaks = {};
  let sum = 0;
  for (const [k] of LEAKS) {
    const r = readInt(LEAK_INPUTS[k], 0, limit, false);
    if (r.err) return { err: "Leak counts must be whole numbers from 0 to " + limit + "." };
    leaks[k] = r.v === null ? (k === "unattempted" ? unattemptedDefault : 0) : r.v;
    sum += leaks[k];
  }
  return sum > limit ? { err: "The leak counts add up to more than " + limit + " questions." } : { leaks };
}

function onMockSubmit(ev) {
  ev.preventDefault();
  const msg = $("mockMsg");
  const say = (text, bad) => { msg.textContent = text; msg.className = "msg" + (bad ? " err" : ""); };
  const date = $("mDate").value, kind = checkedValue("mKind", "test"), now = Date.now();
  if (!date) return say("Add the date you took the test.", true);
  const base = { date, paper: $("mPaper").value.trim().slice(0, 60), createdAt: new Date(now).toISOString() };
  let rec;
  if (kind === "test") {
    const q = readInt("tQ", 1, 300, true), r = readInt("tRight", 0, 300, true), w = readInt("tWrong", 0, 300, true);
    const plus = readMark("tPlus", 0.25, 10), minus = readMark("tMinus", 0, 10);
    if (q.err) return say("Questions must be a whole number from 1 to 300.", true);
    if (r.err || w.err) return say("Fill in how many you got right and wrong (0 if none).", true);
    if (r.v + w.v > q.v) return say("Right and wrong add up to more than " + q.v + " questions.", true);
    if (plus.err || minus.err) return say("Marking: between 0.25 and 10 per right answer, and 0 to 10 off per wrong one.", true);
    const lk = readLeaks(q.v, q.v - r.v - w.v);
    if (lk.err) return say(lk.err, true);
    rec = Object.assign(base, { kind: "test", subject: checkedValue("mSubj", "X"), questions: q.v, correct: r.v, wrong: w.v, plus: plus.v, minus: minus.v, leaks: lk.leaks });
  } else {
    const p = readInt("mP", -25, 100, true), c = readInt("mC", -25, 100, true), m = readInt("mM", -25, 100, true);
    if (p.err || c.err || m.err) return say("Each subject's marks must be a whole number from −25 to 100.", true);
    const lk = readLeaks(75, 0);
    if (lk.err) return say(lk.err, true);
    rec = Object.assign(base, { kind: "full", p: p.v, c: c.v, m: m.v, leaks: lk.leaks });
  }
  try { commit(addMock(state, newMockId(now), rec, now)); }
  catch (e) { console.error("[jee-sprint] test rejected", e); return say("That test couldn't be saved. Check the numbers and try again.", true); }
  say("Logged. " + scoreText(Object.assign({ t: now }, rec)) + ".");
  // Keep the kind, subject, question count and marking for the next entry; clear the results.
  ["mPaper", "tRight", "tWrong", "mP", "mC", "mM", ...Object.values(LEAK_INPUTS)].forEach(i => { $(i).value = ""; });
  updateTestPreview();
}

document.addEventListener("change", ev => {
  if (ev.target.name === "mKind") setTestKind(ev.target.value);
});
document.addEventListener("input", ev => {
  if (ev.target.closest && ev.target.closest("#fsTest")) updateTestPreview();
});
document.addEventListener("click", ev => {
  const f = ev.target.closest("[data-tf]");
  if (f) { testFilter = f.dataset.tf; renderMocks(); }
});
