// Folding sections: every section after the top one collapses to a bar with a one-line summary,
// so the page is short until you open what you need. Open/closed is remembered on this device.
// Concatenated after app.js by build.mjs, so it shares its scope.

const OPEN_KEY = "jee-sprint-open";
let openSections = {};

function setSummary(id, text) {
  const el = $("sum-" + id);
  if (el) el.textContent = text;
}

function setSectionOpen(id, open) {
  const sec = $(id);
  if (!sec || !sec.classList.contains("fold")) return;
  sec.classList.toggle("open", open);
  sec.querySelector(".sec-toggle").setAttribute("aria-expanded", String(open));
  $("body-" + id).hidden = !open;
  openSections = Object.assign({}, openSections, { [id]: open });
  lsSet(OPEN_KEY, JSON.stringify(openSections));
}

// Turns <section><div><p.eyebrow><h2>Title</h2></div>…content…</section> into a proper accordion:
// the title becomes a button inside the heading, with the summary, and the content gets a body wrapper.
function initSections() {
  try { openSections = JSON.parse(lsGet(OPEN_KEY) || "{}") || {}; } catch (e) { openSections = {}; }
  document.querySelectorAll("main > section[id]").forEach(sec => {
    if (sec.id === "now") return;
    const head = sec.firstElementChild, h2 = head.querySelector("h2");
    const body = document.createElement("div");
    body.className = "sec-body";
    body.id = "body-" + sec.id;
    while (head.nextSibling) body.appendChild(head.nextSibling);
    sec.appendChild(body);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sec-toggle";
    btn.setAttribute("aria-controls", body.id);
    const title = document.createElement("span"), sum = document.createElement("span"), chev = document.createElement("span");
    title.className = "sec-title"; title.textContent = h2.textContent;
    sum.className = "sec-sum"; sum.id = "sum-" + sec.id; sum.textContent = sec.dataset.sum || "";
    chev.className = "chev"; chev.setAttribute("aria-hidden", "true");
    btn.append(title, sum, chev);
    h2.textContent = "";
    h2.appendChild(btn);
    head.className = "sec-head";

    const open = openSections[sec.id] === true;
    sec.classList.add("fold");
    sec.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
  });
  const fromLink = location.hash.slice(1);
  if (fromLink) setSectionOpen(fromLink, true);
}

document.addEventListener("click", ev => {
  const toggle = ev.target.closest(".sec-toggle");
  if (toggle) { const sec = toggle.closest("section"); setSectionOpen(sec.id, !sec.classList.contains("open")); return; }
  const link = ev.target.closest('.bar a[href^="#"]');
  if (link) { setSectionOpen(link.getAttribute("href").slice(1), true); return; } // then the browser scrolls to it
  const week = ev.target.closest(".wk-head");
  if (week) {
    const card = week.closest(".wk"), n = Number(card.dataset.n), open = !card.classList.contains("open");
    openWeeks = new Set(open ? [...openWeeks, n] : [...openWeeks].filter(x => x !== n));
    card.classList.toggle("open", open);
    week.setAttribute("aria-expanded", String(open));
    $("wk-body-" + n).hidden = !open;
  }
});
