// Runs the API contract against the Swift server inside the shareable Mac app.
// Skipped until scripts/build-friend.sh has built dist/friend/JEE Sprint.app.
import { before, after, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { apiContract } from "./api-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "dist/friend/JEE Sprint.app/Contents/MacOS/JEESprint");
const PORT = 5196;
const built = fs.existsSync(BIN);
let home, proc, token;

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("portable server did not start");
}

before(async () => {
  if (!built) return;
  home = fs.mkdtempSync(path.join(os.tmpdir(), "jee-portable-"));
  proc = spawn(BIN, ["--headless", "--home", home, "--port", String(PORT)], { stdio: "ignore" });
  await waitForServer();
  token = JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).token;
});
after(() => { if (proc) proc.kill(); });

if (built) {
  test("portable: pairing code is 8 unambiguous characters", () => {
    assert.match(token, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
  apiContract("portable server", { base: () => `http://127.0.0.1:${PORT}`, token: () => token, home: () => home });
} else {
  test("portable server tests (skipped: run scripts/build-friend.sh first)", { skip: true }, () => {});
}
