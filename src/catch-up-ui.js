// The failsafe card: chapters that carried over from past weeks, what to do about them, a Skip
// button for each, and the list of skipped chapters. Logic lives in catch-up.mjs.
// Concatenated after app.js by build.mjs, so it shares its scope.

const CATCH_UP_ADVICE = {
  catchup: "Finish these in Sunday's first block and on your next day off, before this week's chapters slip too.",
  short: "Too many for Sunday alone. Do the less important ones the short way: lecture at 2×, 15 PYQs and a one-page note, about 2½ hours each. The rest of their PYQs wait for the second pass.",
  skip: "This is more than catch-up time can absorb. Skip the Low and Med ones, do the rest the short way, and replan the remaining weeks."
};

function renderCatchUp() {
  const box = $("catchUp");
  if (!box) return;
  const r = catchUp(st, today0());
  if (!r.carried.length && !r.skipped.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  const carried = r.carried.length
    ? '<div class="tw-head"><h3>Carried over · ' + r.carried.length + '</h3><span class="eyebrow">from earlier weeks</span></div>' +
      '<p class="muted small">' + CATCH_UP_ADVICE[r.level] + "</p>" +
      r.carried.map(id => '<div class="carry">' + chip(id) + (CAN_EDIT ? '<button type="button" class="btn ghost" data-skip="' + id + '">Skip</button>' : "") + "</div>").join("") +
      (r.suggestSkip ? '<p class="callout">If you skip one, skip <strong>' + esc(CH[r.suggestSkip].name) + "</strong>. It's asked the least of these.</p>" : "")
    : "";
  const skipped = r.skipped.length
    ? '<details class="skipbox"><summary>Skipped · ' + r.skipped.length + '</summary><p class="muted small">These wait for the buffer weeks (21 Dec – 3 Jan). They don\'t count against your pace.</p>' +
      r.skipped.map(id => '<div class="carry"><span class="nm">' + esc(CH[id].name) + ' <span class="tag">' + CH[id].tier + "</span></span>" +
        (CAN_EDIT ? '<button type="button" class="btn ghost" data-unskip="' + id + '">Bring back</button>' : "") + "</div>").join("") + "</details>"
    : "";
  box.innerHTML = carried + skipped;
}

document.addEventListener("click", ev => {
  if (!CAN_EDIT) return;
  const skip = ev.target.closest("[data-skip]");
  if (skip) { commit(setChapter(state, skip.dataset.skip, SKIPPED, Date.now())); return; }
  const back = ev.target.closest("[data-unskip]");
  if (back) commit(setChapter(state, back.dataset.unskip, 0, Date.now()));
});
