// JEE Sprint sync server. Runs on the Mac (LaunchAgent), serves the Mac app page and
// merges progress from the phone over the home Wi-Fi. No dependencies, no cloud.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { emptyState, normalizeState, mergeStates } from "./src/core.mjs";
import { createCalendarSync, REFRESH_EVERY_MS } from "./calendar-sync.mjs";

export const DEFAULT_PORT = 5199;
const MAX_BODY = 512 * 1024;
const BACKUPS_KEPT = 21;
const DEVICE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const FONT_FILE = /^[a-z0-9-]{1,60}\.woff2$/;

export function defaultHome() {
  return process.env.JEE_SPRINT_HOME || path.join(os.homedir(), "Library", "Application Support", "JEE Sprint");
}

export function loadConfig(home) {
  fs.mkdirSync(home, { recursive: true });
  const file = path.join(home, "config.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const config = { token: crypto.randomBytes(18).toString("base64url"), port: DEFAULT_PORT };
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) {
    if (e.code !== "ENOENT") console.error(`[jee-sprint] could not read ${file}: ${e.message}`);
    return fallback;
  }
}

function writeAtomic(file, data) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function localDate(now) {
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

function backupDaily(home, state, now) {
  const dir = path.join(home, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `state-${localDate(now)}.json`);
  writeAtomic(file, state); // the day's last sync wins
  const old = fs.readdirSync(dir).filter(f => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - BACKUPS_KEPT))) fs.unlinkSync(path.join(dir, f));
}

export function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === "IPv4" && !a.internal)
    .map(a => a.address);
}

function isLoopback(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function tokenOk(req, token) {
  const got = Buffer.from(String(req.headers["x-sync-token"] || ""));
  const want = Buffer.from(token);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const ok = (res, data) => send(res, 200, { success: true, data, error: null });
const fail = (res, status, error) => send(res, status, { success: false, data: null, error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Test hook: makes the page believe it is `day` ("YYYY-MM-DD", 10:00) by shifting its clock.
function fakeClockScript(day) {
  return `<script>(() => { const shift = new Date("${day}T10:00:00").getTime() - Date.now(), Real = Date;
window.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + shift); } static now() { return Real.now() + shift; } }; })();</script>`;
}

export function createServer({ home, publicDir, token, clock = () => new Date(), fetchIcs, pageToday }) {
  const stateFile = path.join(home, "state.json");
  const devicesFile = path.join(home, "devices.json");
  const calendar = createCalendarSync({
    home, clock, fetcher: fetchIcs,
    readState: () => normalizeState(readJson(stateFile, emptyState())),
    writeState: state => writeAtomic(stateFile, state)
  });

  // Google Calendar link. Paired devices may read the status and ask for a fresh check; changing the
  // link or the filters is for this Mac only, and the link itself is never sent back.
  async function handleCalendar(req, res) {
    if (req.method === "GET") return ok(res, calendar.status());
    if (req.method !== "POST") return fail(res, 404, "Not found.");
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (e) { return fail(res, e.status || 400, "That request wasn't valid."); }
    if (!body || typeof body !== "object") return fail(res, 400, "That request wasn't valid.");
    const onlyRefresh = Object.keys(body).every(k => k === "refresh");
    if (!onlyRefresh && !isLoopback(req)) return fail(res, 403, "Change calendar settings in the Mac app.");
    if (body.disconnect === true) return ok(res, calendar.disconnect());
    if (Array.isArray(body.skip) || Array.isArray(body.only) || typeof body.batch === "string") {
      return ok(res, await calendar.setFilter(Array.isArray(body.skip) ? body.skip : undefined, Array.isArray(body.only) ? body.only : undefined, body.batch));
    }
    if (typeof body.url === "string") {
      try { return ok(res, await calendar.connect(body.url, body.everyAllDay === true)); }
      catch (e) {
        if (e.userMessage) return fail(res, 400, e.userMessage);
        throw e;
      }
    }
    if (typeof body.everyAllDay === "boolean") return ok(res, await calendar.setEveryAllDay(body.everyAllDay));
    return ok(res, await calendar.refresh());
  }

  function devicesList() {
    const devices = readJson(devicesFile, {});
    return Object.entries(devices).map(([id, v]) => ({ id, name: v.name, lastSeen: v.lastSeen }));
  }

  async function handleSync(req, res) {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (e) { return fail(res, e.status || 400, e.status === 413 ? "Sync data is too large." : "Sync data wasn't valid JSON."); }
    const incoming = normalizeState(body && body.state);
    const stored = normalizeState(readJson(stateFile, emptyState()));
    const merged = mergeStates(stored, incoming);
    const now = clock();
    writeAtomic(stateFile, merged);
    backupDaily(home, merged, now);
    const dev = body && body.device;
    if (dev && typeof dev.id === "string" && DEVICE_ID.test(dev.id)) {
      const devices = readJson(devicesFile, {});
      devices[dev.id] = { name: String(dev.name || "Device").slice(0, 40), lastSeen: now.toISOString() };
      writeAtomic(devicesFile, devices);
    }
    return ok(res, { state: merged, devices: devicesList(), serverTime: now.toISOString(), calendar: calendar.schedule() });
  }

  function serveIndex(req, res) {
    let html;
    try { html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8"); }
    catch (e) { console.error(`[jee-sprint] index.html missing: ${e.message}`); return fail(res, 500, "The app files are missing. Re-run the installer."); }
    // Only this Mac gets the sync token; other devices on the Wi-Fi get a page that can't sync.
    const page = html.replace("__SYNC_TOKEN__", isLoopback(req) ? token : "");
    return send(res, 200, pageToday ? page.replace("<head>", "<head>" + fakeClockScript(pageToday)) : page, "text/html; charset=utf-8");
  }

  function serveFont(res, name) {
    if (!FONT_FILE.test(name)) return fail(res, 404, "Not found.");
    try { return send(res, 200, fs.readFileSync(path.join(publicDir, "fonts", name)), "font/woff2"); }
    catch { return fail(res, 404, "Not found."); }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return serveIndex(req, res);
      if (req.method === "GET" && url.pathname.startsWith("/fonts/")) return serveFont(res, url.pathname.slice(7));
      if (url.pathname.startsWith("/api/")) {
        if (!tokenOk(req, token)) return fail(res, 401, "Wrong or missing sync key.");
        if (req.method === "POST" && url.pathname === "/api/sync") return await handleSync(req, res);
        if (req.method === "GET" && url.pathname === "/api/info") return ok(res, { addresses: lanAddresses(), devices: devicesList() });
        if (url.pathname === "/api/calendar") return await handleCalendar(req, res);
      }
      return fail(res, 404, "Not found.");
    } catch (e) {
      console.error(`[jee-sprint] ${req.method} ${url.pathname} failed: ${e.stack || e.message}`);
      return fail(res, 500, "The Mac couldn't save that. Try again.");
    }
  });
  server.calendarSync = calendar;
  return server;
}

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// Flags exist for local testing: --home <dir> --public <dir> --port <n>, --ics-file <path> (reads the
// calendar from a local file instead of Google) and --today YYYY-MM-DD (the page and the calendar
// logic pretend it is that day). The LaunchAgent passes none.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const home = arg("home") ? path.resolve(arg("home")) : defaultHome();
  const config = loadConfig(home);
  const publicDir = arg("public") ? path.resolve(arg("public")) : path.join(home, "app", "public");
  const port = Number(arg("port")) || config.port || DEFAULT_PORT;
  const icsFile = arg("ics-file");
  const fetchIcs = icsFile ? async () => fs.readFileSync(path.resolve(icsFile), "utf8") : undefined;
  const pageToday = /^\d{4}-\d{2}-\d{2}$/.test(arg("today") || "") ? arg("today") : undefined;
  const clock = pageToday ? () => new Date(pageToday + "T10:00:00") : undefined;
  const server = createServer({ home, publicDir, token: config.token, fetchIcs, pageToday, clock });
  server.on("error", e => { console.error(`[jee-sprint] server error: ${e.message}`); process.exit(1); });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[jee-sprint] listening on :${port} (LAN: ${lanAddresses().join(", ")}), data in ${home}`);
  });
  // Keep days off in step with Google Calendar even when no app window is open.
  server.calendarSync.refresh();
  setInterval(() => server.calendarSync.refresh(), REFRESH_EVERY_MS);
}
