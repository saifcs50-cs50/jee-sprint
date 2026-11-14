// Plan data shared by the page, the reminder scheduler and the tests.
// Dates are local calendar dates (IST).

export const DAY_MS = 86400000;
export function d(s) { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
export function today0(now = new Date()) { return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
export function iso(x) { return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
export function days(a, b) { return Math.round((b - a) / DAY_MS); }
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function short(x) { return x.getDate() + " " + MO[x.getMonth()]; }
export function range(a, b) { return a.getMonth() === b.getMonth() ? a.getDate() + "–" + b.getDate() + " " + MO[b.getMonth()] : short(a) + " – " + short(b); }

export const PLAN_START = d("2026-10-01");
export const SYLLABUS_END = d("2026-12-20");
export const REVISION_START = d("2026-12-21");
export const SPRINT_START = d("2027-01-04");
export const EXAM = d("2027-01-22");
export const EXAM_END = d("2027-01-30");
export const MOCK_SUNDAYS = ["2026-11-15", "2026-11-29", "2026-12-13", "2026-12-27", "2027-01-03", "2027-01-10", "2027-01-17"];

export const SUBJ = { P: "Physics", C: "Chemistry", M: "Maths" };
export const STATES = ["Not started", "Learning", "Done", "Revised", "Skipped"];

export const CHAPTERS = [
  ["p-units", "P", "Units, Dimensions & Errors + vector basics", "Med", "11"],
  ["p-estat", "P", "Electrostatics & Capacitors", "Top", "12"],
  ["p-curr", "P", "Current Electricity", "Top", "12"],
  ["p-optics", "P", "Ray Optics + Wave Optics", "Top", "12"],
  ["p-modern", "P", "Dual Nature, Atoms & Nuclei", "Top", "12"],
  ["p-mag", "P", "Moving Charges & Magnetism", "Top", "12"],
  ["p-semi", "P", "Semiconductors & Logic Gates", "Top", "12"],
  ["p-emi", "P", "EMI, AC & EM Waves", "Top", "12"],
  ["p-thermo", "P", "Thermodynamics + Kinetic Theory", "Top", "11"],
  ["p-kin", "P", "Kinematics (1D & 2D)", "High", "11"],
  ["p-nlm", "P", "Laws of Motion (friction, circular)", "High", "11"],
  ["p-wpe", "P", "Work, Energy & Power", "High", "11"],
  ["p-com", "P", "Centre of Mass & Collisions", "Med", "11"],
  ["p-rot", "P", "Rotational Motion", "Top", "11"],
  ["p-grav", "P", "Gravitation", "Top", "11"],
  ["p-fluids", "P", "Fluids", "High", "11"],
  ["p-shm", "P", "Oscillations (SHM) & Waves", "Med", "11"],
  ["p-low", "P", "Solids, Thermal Properties, Experiments", "Low", "11"],
  ["c-mole", "C", "Mole Concept", "Med", "11"],
  ["c-atom", "C", "Atomic Structure", "Top", "11"],
  ["c-period", "C", "Periodic Classification", "Med", "11"],
  ["c-bond", "C", "Chemical Bonding", "Top", "11"],
  ["c-goc", "C", "GOC + Purification & Characterisation", "Top", "11"],
  ["c-hydro", "C", "Hydrocarbons", "Top", "11"],
  ["c-halo", "C", "Haloalkanes & Haloarenes", "Med", "12"],
  ["c-coord", "C", "Coordination Compounds", "Top", "12"],
  ["c-df", "C", "d- & f-Block", "Top", "12"],
  ["c-alco", "C", "Alcohols, Phenols & Ethers", "High", "12"],
  ["c-carb", "C", "Aldehydes, Ketones & Acids", "High", "12"],
  ["c-thermo", "C", "Chemical Thermodynamics", "High", "11"],
  ["c-sol", "C", "Solutions", "Top", "12"],
  ["c-amine", "C", "Amines", "High", "12"],
  ["c-bio", "C", "Biomolecules", "High", "12"],
  ["c-electro", "C", "Electrochemistry", "High", "12"],
  ["c-kin", "C", "Chemical Kinetics", "Med", "12"],
  ["c-equil", "C", "Chemical & Ionic Equilibrium", "Low", "11"],
  ["c-redox", "C", "Redox Reactions", "Med", "11"],
  ["c-pblock", "C", "p-Block (Groups 13–18)", "Low", "11"],
  ["c-prac", "C", "Practical Chemistry", "Low", ""],
  ["m-sets", "M", "Sets & Relations", "Low", "11"],
  ["m-matdet", "M", "Matrices & Determinants", "Top", "12"],
  ["m-func", "M", "Functions + Inverse Trig", "High", "12"],
  ["m-lcd", "M", "Limits, Continuity & Differentiability", "High", "12"],
  ["m-aod", "M", "Application of Derivatives", "High", "12"],
  ["m-int", "M", "Indefinite + Definite Integration", "Top", "12"],
  ["m-area", "M", "Area Under Curves", "High", "12"],
  ["m-de", "M", "Differential Equations", "High", "12"],
  ["m-vec", "M", "Vectors", "High", "12"],
  ["m-3d", "M", "3D Geometry", "Top", "12"],
  ["m-seq", "M", "Sequences & Series", "Top", "11"],
  ["m-bin", "M", "Binomial Theorem", "High", "11"],
  ["m-pnc", "M", "Permutations & Combinations", "High", "11"],
  ["m-prob", "M", "Probability", "High", "12"],
  ["m-complex", "M", "Complex Numbers & Quadratics", "High", "11"],
  ["m-stats", "M", "Statistics", "Med", "11"],
  ["m-lines", "M", "Straight Lines", "High", "11"],
  ["m-circle", "M", "Circles", "High", "11"],
  ["m-conics", "M", "Parabola, Ellipse, Hyperbola", "Med", "11"],
  ["m-trig", "M", "Trigonometry", "Low", "11"]
].map(r => ({ id: r[0], s: r[1], name: r[2], tier: r[3], cls: r[4] }));

export const CH = Object.fromEntries(CHAPTERS.map(c => [c.id, c]));

export const WEEKS = [
  { n: 0, from: "2026-10-01", to: "2026-10-04", ph: 1, P: ["p-units"], C: ["c-mole", "c-redox"], M: ["m-sets", "m-matdet"],
    note: "Fast start. Sunday 4 Oct: skim the 21 Jan 2026 Shift 1 paper for 30 minutes without solving, then study. Set up one notes notebook per subject and one mistake log. Mole concept and redox go together: both are stoichiometry." },
  { n: 1, from: "2026-10-05", to: "2026-10-11", ph: 1, P: ["p-estat"], C: ["c-atom", "c-period"], M: ["m-func", "m-lcd"],
    note: "Sunday 11 Oct: first part test." },
  { n: 2, from: "2026-10-12", to: "2026-10-18", ph: 1, P: ["p-curr", "p-semi"], C: ["c-bond"], M: ["m-aod", "m-vec"],
    note: "Current Electricity is the most-asked physics chapter. Semiconductors is short and cheap marks. Settle on one lecture source per subject by Sunday and stop switching." },
  { n: 3, from: "2026-10-19", to: "2026-10-25", ph: 1, P: ["p-optics"], C: ["c-goc"], M: ["m-int"],
    note: "Registration is expected to open this week or next: jeemain.nta.nic.in, with a parent. GOC and Integration are the two biggest blocks of the plan. If there's a holiday this week, give it to them." },
  { n: 4, from: "2026-10-26", to: "2026-11-01", ph: 1, P: ["p-modern", "p-kin"], C: ["c-hydro", "c-halo"], M: ["m-area", "m-de"],
    note: "Six chapters, but Area and Modern Physics are quick. Part test Sunday 1 Nov. Check the new bulletin for syllabus changes." },
  { n: 5, from: "2026-11-02", to: "2026-11-08", ph: 1, P: ["p-mag"], C: ["c-coord", "c-df"], M: ["m-3d", "m-seq"],
    note: "Coordination and d & f: read NCERT line by line. 3D Geometry reuses the vectors from week 2." },
  { n: 6, from: "2026-11-09", to: "2026-11-15", ph: 1, P: ["p-emi"], C: ["c-alco", "c-carb"], M: ["m-pnc"],
    note: "Sunday 15 Nov: first full mock (a 2024 paper, 9:00–12:00), so this week carries less. The score doesn't matter yet. Practise the three-round method and log it." },
  { n: 7, from: "2026-11-16", to: "2026-11-22", ph: 1, P: ["p-thermo", "p-low"], C: ["c-thermo", "c-sol"], M: ["m-bin", "m-prob"],
    note: "Thermo week: physics and chemistry thermodynamics share the first law, and Thermal Properties rides along. Probability builds on last week's P&C." },
  { n: 8, from: "2026-11-23", to: "2026-11-29", ph: 1, P: ["p-nlm"], C: ["c-amine", "c-bio"], M: ["m-complex", "m-stats"],
    note: "Sunday 29 Nov: full mock #2. You're two-thirds of the way. If the pace line says more than 3 chapters behind, cut now." },
  { n: 9, from: "2026-11-30", to: "2026-12-06", ph: 1, P: ["p-wpe", "p-com"], C: ["c-electro", "c-kin"], M: ["m-lines", "m-circle"],
    note: "The heaviest week left: six mid-size chapters." },
  { n: 10, from: "2026-12-07", to: "2026-12-13", ph: 1, P: ["p-rot"], C: ["c-equil"], M: ["m-conics"],
    note: "Rotation is the biggest time sink in Physics, so cap it at this week. Sunday 13 Dec: full mock #3." },
  { n: 11, from: "2026-12-14", to: "2026-12-20", ph: 1, P: ["p-grav", "p-fluids", "p-shm"], C: ["c-pblock", "c-prac"], M: ["m-trig"],
    note: "Last syllabus week. Finish by Sunday 20 December. Anything still open either goes on the cut list or into week 13's buffer, not into January." },
  { n: 12, from: "2026-12-21", to: "2026-12-27", ph: 2, P: [], C: [], M: [],
    Ptask: "Second pass: 20 more PYQs each on Current, Electrostatics, Optics, Modern, Magnetism.", Ctask: "NCERT re-read: d & f, Coordination, p-Block, Biomolecules. Redo the reaction charts.", Mtask: "Second pass: Integration, 3D, Sequences, Matrices, Probability.",
    note: "Christmas holidays are likely. Run the Sunday timetable on each one, take a full mock on one holiday, and another on Sunday 27 Dec." },
  { n: 13, from: "2026-12-28", to: "2027-01-03", ph: 2, P: [], C: [], M: [],
    Ptask: "Second pass on your 3 weakest chapters (from the leak chart).", Ctask: "Second pass on your 3 weakest chapters.", Mtask: "Second pass on your 3 weakest chapters.",
    note: "This is also the buffer for anything left from the syllabus. Sunday 3 Jan: mock." },
  { n: 14, from: "2027-01-04", to: "2027-01-10", ph: 3, P: [], C: [], M: [],
    Ptask: "Revision round 1: short notes + mistake log.", Ctask: "Revision round 1 + NCERT inorganic re-read.", Mtask: "Revision round 1: short notes + mistake log.",
    note: "No new chapters from here on. Tue, Thu, Sat: subject sprints from 2026 papers. Sunday 10 Jan: mock." },
  { n: 15, from: "2027-01-11", to: "2027-01-17", ph: 3, P: [], C: [], M: [],
    Ptask: "Formula sheets daily; drill the weakest chapters.", Ctask: "Reaction charts daily; drill the weakest chapters.", Mtask: "PYQ drills on the weakest chapters.",
    note: "Sunday 17 Jan: last full mock. Your city slip should arrive around now." },
  { n: 16, from: "2027-01-18", to: "2027-01-21", ph: 3, P: [], C: [], M: [],
    Ptask: "Short notes and formula sheets only.", Ctask: "Short notes and reaction charts only.", Mtask: "Short notes and the mistake log only.",
    note: "Light week. Move your wake-up time to match your shift. Nothing new the day before your exam. Pack your admit card, photo ID and photos the night before." }
].map(w => Object.assign({}, w, { a: d(w.from), b: d(w.to) }));

export const PHASES = {
  1: { name: "Phase 1 · Whole syllabus", when: "1 Oct – 20 Dec · 12 weeks", blurb: "Every chapter once: lecture, 30–40 PYQs, short notes. Mocks every other Sunday from 15 Nov." },
  2: { name: "Phase 2 · Second pass", when: "21 Dec – 3 Jan", blurb: "The PYQs you skipped on Top chapters, NCERT inorganic, and your weakest chapters. Mocks every Sunday plus one holiday mock." },
  3: { name: "Phase 3 · Sharpen", when: "4 Jan – exam", blurb: "No new chapters. Mocks, subject sprints, short notes and the mistake log." }
};

export function currentWeek(t) {
  return WEEKS.find(w => t >= w.a && t <= w.b) || null;
}

// Which subject owns weekday Block 2 (Mon/Thu Physics, Tue/Fri Chemistry, Wed/Sat Maths).
export const BLOCK2_SUBJECT = [null, "P", "C", "M", "P", "C", "M"];

export const TT = {
  weekday: { label: "College day", foot: "About 3 h 20 min of your own study, plus commute recall. The travel times are guesses; shift them to your real bus, but keep the three blocks and the 22:30 bedtime.", rows: [
    ["05:30", "05:40", "Wake up", "Water, lights on. The phone stays on the charger.", "life"],
    ["05:40", "07:00", "Block 1 · Practice", "PYQs on whatever you learned last evening. The hardest problems go here, while your brain is fresh.", "study"],
    ["07:00", "07:45", "Get ready, breakfast, leave", "", "life"],
    ["07:45", "08:30", "Commute", "Flashcards or this week's formula sheet. No reels.", "light"],
    ["08:30", "18:30", "College", "Take notes in class. Free periods: this week's PYQs. Lunch: 10 minutes on your short notes.", "college"],
    ["18:30", "19:15", "Travel home", "", "light"],
    ["19:15", "19:45", "Reset", "Shower, eat something, 15-minute walk. No phone.", "life"],
    ["19:45", "21:15", "Block 2 · Learn", "New chapter: lecture and main notes. Mon & Thu Physics · Tue & Fri Chemistry · Wed & Sat Maths.", "study"],
    ["21:15", "21:45", "Dinner", "With family, away from the desk.", "life"],
    ["21:45", "22:15", "Block 3 · Lock it in", "10 PYQs on tonight's topic, or short-notes revision of older chapters.", "study"],
    ["22:15", "22:30", "Wind down", "Write tomorrow's three tasks. The phone charges outside your room.", "life"],
    ["22:30", "05:30", "Sleep", "7 hours. Not negotiable.", "sleep"]] },
  sunday: { label: "Sunday / day off", foot: "About 8 hours of study with a protected evening off. Every day off from college runs on this timetable too.", rows: [
    ["06:30", "07:30", "Wake, walk, breakfast", "You get 8 hours of sleep on Saturday night.", "life"],
    ["07:30", "09:30", "S1 · Deep block", "Finish the week's hardest chapter, or catch up on whatever slipped.", "study"],
    ["09:30", "09:45", "Break", "", "life"],
    ["09:45", "10:45", "S2 · Part test", "25 mixed PYQs in 60 minutes, from every chapter done so far.", "study"],
    ["10:45", "11:45", "S3 · Analyse", "Every wrong or skipped question goes in the mistake log with its leak type.", "study"],
    ["11:45", "13:30", "Lunch and real rest", "", "life"],
    ["13:30", "15:30", "S4 · PYQ block", "The subject that went worst in the part test.", "study"],
    ["15:30", "16:00", "Break", "", "life"],
    ["16:00", "17:30", "S5 · Revision loop", "Short notes from chapters finished 1, 7 and 21 days ago.", "study"],
    ["17:30", "20:00", "Off", "Sport, friends, family. Protect this.", "off"],
    ["20:00", "20:45", "S6 · Plan the week", "Update the tracker, move unfinished work, read next week's row.", "study"],
    ["20:45", "22:00", "Dinner, screens off", "", "life"],
    ["22:00", "05:30", "Sleep", "", "sleep"]] },
  mock: { label: "Mock Sunday", foot: "Mock Sundays: 15 Nov, 29 Nov and 13 Dec, then every Sunday from 27 Dec to 17 Jan, plus one Christmas-week holiday. The mock runs at JEE Shift 1 time so your body gets used to 9:00–12:00.", rows: [
    ["06:30", "08:30", "Wake, breakfast", "Eat what you'll eat on exam day.", "life"],
    ["08:30", "09:00", "Warm-up", "Flip through formula sheets. Nothing new.", "light"],
    ["09:00", "12:00", "Full mock", "One real paper, strict 3 hours, phone in another room. Three-round method.", "mock"],
    ["12:00", "13:30", "Lunch and rest", "", "life"],
    ["13:30", "15:30", "Analyse", "Log the mock in the app. Put every lost mark into one of the five leaks.", "study"],
    ["15:30", "16:00", "Break", "", "life"],
    ["16:00", "17:30", "Fix the top three leaks", "Concept gaps first: re-study them, then redo those questions.", "study"],
    ["17:30", "20:00", "Off", "", "off"],
    ["20:00", "20:45", "Plan the week", "", "study"],
    ["20:45", "22:00", "Dinner, screens off", "", "life"],
    ["22:00", "05:30", "Sleep", "", "sleep"]] },
  jan: { label: "Revision college day", foot: "From 21 December there are no new chapters, apart from finishing anything left over in week 13. Every block is second-pass PYQs, recall, sprints or fixing leaks.", rows: [
    ["05:30", "05:40", "Wake up", "", "life"],
    ["05:40", "07:00", "Block 1 · Recall", "One subject's short notes and formula sheet, then 10 PYQs cold. Rotate Physics → Chemistry → Maths.", "study"],
    ["07:00", "07:45", "Get ready, breakfast, leave", "", "life"],
    ["07:45", "08:30", "Commute", "The mistake log or flashcards.", "light"],
    ["08:30", "18:30", "College", "", "college"],
    ["18:30", "19:45", "Travel home and reset", "", "life"],
    ["19:45", "21:15", "Block 2 · Second pass, sprint or drill", "Until 3 Jan: second-pass PYQs from the week's list. From 4 Jan: Tue, Thu, Sat, one subject from a 2026 paper (25 questions in 60 minutes, then check); Mon, Wed, Fri, a PYQ drill on the weakest chapter from Sunday's mock.", "study"],
    ["21:15", "21:45", "Dinner", "", "life"],
    ["21:45", "22:15", "Block 3 · Mistake log", "Re-attempt five old mistakes without looking at the fix.", "study"],
    ["22:15", "22:30", "Wind down", "", "life"],
    ["22:30", "05:30", "Sleep", "", "sleep"]] }
};
export const TT_ORDER = ["weekday", "sunday", "mock", "jan"];

// Which timetable a date uses. `off` = no college that day (holiday), so it runs like a Sunday.
export function autoTT(t, off = false) {
  if (t.getDay() === 0) return MOCK_SUNDAYS.includes(iso(t)) ? "mock" : "sunday";
  if (off) return "sunday";
  return t >= REVISION_START ? "jan" : "weekday";
}
