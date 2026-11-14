// Builds the three versions of the page from src/:
//   dist/mac/        served by server.mjs on the Mac (sync key injected at serve time)
//   dist/android/    Capacitor webDir for the phone app (sync key + Mac addresses baked in)
//   dist/artifact/   the read-only claude.ai copy
// `node build.mjs --friend` builds the shareable variant instead (no personal notes, no sync key):
//   dist/friend/mac-web/   bundled into the self-contained Mac app
//   dist/friend/android/   Capacitor webDir for the friend APK (pairs by code)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defaultHome, loadConfig, lanAddresses, DEFAULT_PORT } from "./server.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const MODULES = ["src/plan-data.mjs", "src/core.mjs", "src/day-plan.mjs", "src/reminders.mjs", "src/catch-up.mjs"];
// Page scripts, concatenated in this order into one scope; boot() runs after all of them are defined.
const SCRIPTS = ["src/app.js", "src/days-off.js", "src/fold.js", "src/catch-up-ui.js", "src/tests-ui.js"];
const FRIEND = process.argv.includes("--friend");

// Optional extra notes for the personal build, handed to the page as JEE_ENV.extra:
//   weekNotes: { <week number>: "text appended to that week's note" }
//   preStart:  { until: "YYYY-MM-DD", text: "shown on the This week card before that date" }
// Empty here. The shareable (--friend) build never contains them.
const PERSONAL_EXTRA = { weekNotes: {}, preStart: null };

// Keep <!--only:VARIANT-->…<!--/only--> blocks for this variant, drop the others.
function pageFor(variant) {
  return read("src/page.html").replace(/<!--only:(\w+)-->([\s\S]*?)<!--\/only-->/g, (_, v, body) => (v === variant ? body : ""));
}

// Inline the ES modules as plain script: drop import lines and `export` keywords.
function bundleScript(env) {
  const mods = MODULES.map(f => read(f).replace(/^import .*;$/gm, "").replace(/^export /gm, ""));
  return "(function(){\n\"use strict\";\nconst JEE_ENV = " + JSON.stringify(env) + ";\n" + mods.join("\n") + "\n" + SCRIPTS.map(read).join("\n") + "\nboot();\n})();";
}

const BASE_CSS = `html{-webkit-text-size-adjust:100%}
body{margin:0}
[hidden]{display:none!important}
img{max-width:100%}
:root{padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px)}
body::before{content:""; position:fixed; left:0; right:0; top:0; height:env(safe-area-inset-top,0px); background:var(--paper); z-index:30}
`;

function appDocument(env) {
  return "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n" +
    "<meta name=\"color-scheme\" content=\"light dark\">\n<title>JEE Sprint</title>\n" +
    "<style>\n" + read("assets/fonts/fonts.css") + BASE_CSS + read("src/styles.css") + "</style>\n</head>\n<body>\n" +
    pageFor(env.variant) + "\n<script>\n" + bundleScript(env) + "\n</script>\n</body>\n</html>\n";
}

function artifactDocument() {
  return "<title>JEE Main Sprint 2027</title>\n" +
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n" +
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap\">\n" +
    "<style>\n" + read("src/styles.css") + "</style>\n\n" + pageFor("personal") + "\n<script>\n" + bundleScript({ platform: "artifact", variant: "personal", extra: PERSONAL_EXTRA, token: "", hosts: [] }) + "\n</script>\n";
}

function writeTarget(dir, file, html, withFonts) {
  const out = path.join(ROOT, "dist", dir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, file), html);
  if (withFonts) {
    fs.mkdirSync(path.join(out, "fonts"));
    for (const f of fs.readdirSync(path.join(ROOT, "assets/fonts")).filter(f => f.endsWith(".woff2"))) {
      fs.copyFileSync(path.join(ROOT, "assets/fonts", f), path.join(out, "fonts", f));
    }
  }
}

function macHosts(port) {
  const hosts = lanAddresses().map(a => `http://${a}:${port}`);
  try {
    const name = execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim();
    if (/^[A-Za-z0-9-]+$/.test(name)) hosts.push(`http://${name}.local:${port}`);
  } catch (e) { console.warn("Couldn't read the Mac's Bonjour name:", e.message); }
  return hosts;
}

if (FRIEND) {
  writeTarget("friend/mac-web", "index.html", appDocument({ platform: "mac", variant: "friend", token: "__SYNC_TOKEN__", hosts: [] }), true);
  writeTarget("friend/android", "index.html", appDocument({ platform: "android", variant: "friend", token: "", hosts: [] }), true);
  fs.writeFileSync(path.join(ROOT, "dist/friend/core.js"), read("src/core.mjs").replace(/^export /gm, ""));
  console.log("Built dist/friend/mac-web, dist/friend/android, dist/friend/core.js");
} else {
  const config = loadConfig(defaultHome());
  const port = config.port || DEFAULT_PORT;
  writeTarget("mac", "index.html", appDocument({ platform: "mac", variant: "personal", extra: PERSONAL_EXTRA, token: "__SYNC_TOKEN__", hosts: [] }), true);
  const hosts = macHosts(port);
  writeTarget("android", "index.html", appDocument({ platform: "android", variant: "personal", extra: PERSONAL_EXTRA, token: config.token, hosts }), true);
  writeTarget("artifact", "jee-sprint.html", artifactDocument(), false);
  console.log("Built dist/mac, dist/android (Mac at " + hosts.join(", ") + "), dist/artifact");
}
