// The sync API contract. Both servers must pass it: the Node one (server.mjs, the Mac)
// and the Swift one built into the shareable Mac app.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { emptyState, setChapter, addMock } from "../src/core.mjs";

// ctx: { base(), token(), home() } (read lazily, after the suite's before() hook ran).
export function apiContract(label, ctx) {
  const sync = (body, token = ctx.token()) => fetch(ctx.base() + "/api/sync", {
    method: "POST", headers: { "Content-Type": "application/json", "x-sync-token": token },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

  test(`${label}: sync is refused without the right key`, async () => {
    const r = await sync({ state: emptyState() }, "wrong");
    assert.equal(r.status, 401);
    assert.equal((await r.json()).success, false);
  });

  test(`${label}: sync merges, persists and returns the merged state`, async () => {
    const phone = addMock(setChapter(emptyState(), "p-curr", 2, 200), "m1", { date: "2026-11-15", paper: "x", p: 10, c: 20, m: 30, leaks: {} }, 200);
    assert.equal((await sync({ device: { id: "phone1", name: "Phone" }, state: phone })).status, 200);
    const r2 = await (await sync({ device: { id: "mac1", name: "Mac" }, state: setChapter(emptyState(), "c-goc", 1, 300) })).json();
    assert.equal(r2.success, true);
    assert.equal(r2.data.state.chapters["p-curr"].s, 2);
    assert.equal(r2.data.state.chapters["c-goc"].s, 1);
    assert.equal(r2.data.state.mocks.m1.p, 10);
    assert.deepEqual(r2.data.devices.map(d => d.name).sort(), ["Mac", "Phone"]);
    const onDisk = JSON.parse(fs.readFileSync(path.join(ctx.home(), "state.json"), "utf8"));
    assert.equal(onDisk.chapters["c-goc"].s, 1);
    assert.ok(fs.readdirSync(path.join(ctx.home(), "backups")).some(f => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)));
  });

  test(`${label}: an older phone edit doesn't overwrite a newer Mac edit`, async () => {
    await sync({ state: setChapter(emptyState(), "m-int", 3, 1000) });
    const r = await (await sync({ state: setChapter(emptyState(), "m-int", 1, 900) })).json();
    assert.equal(r.data.state.chapters["m-int"].s, 3);
  });

  test(`${label}: bad JSON and oversized bodies are rejected`, async () => {
    assert.equal((await sync("{not json")).status, 400);
    const big = JSON.stringify({ state: { chapters: {}, pad: "x".repeat(600 * 1024) } });
    const r = await sync(big).catch(() => ({ status: 413 }));
    assert.equal(r.status, 413);
  });

  test(`${label}: hostile state entries are dropped before saving`, async () => {
    const r = await (await sync({ state: { chapters: { "p-curr": { s: 99, t: 5000 }, "../x": { s: 1, t: 1 } } } })).json();
    assert.equal(r.data.state.chapters["p-curr"].s, 2);
    assert.equal(r.data.state.chapters["../x"], undefined);
  });

  test(`${label}: the Mac itself gets the key in the page`, async () => {
    const html = await (await fetch(ctx.base() + "/")).text();
    assert.ok(html.includes(ctx.token()));
    assert.ok(!html.includes("__SYNC_TOKEN__"));
  });

  test(`${label}: fonts are served but paths can't escape the fonts folder`, async () => {
    const r = await fetch(ctx.base() + "/fonts/ibm-plex-mono-400.woff2");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "font/woff2");
    assert.equal((await fetch(ctx.base() + "/fonts/..%2F..%2Fconfig.json")).status, 404);
    assert.equal((await fetch(ctx.base() + "/fonts/../../config.json")).status, 404);
  });

  test(`${label}: info needs the key and lists devices`, async () => {
    assert.equal((await fetch(ctx.base() + "/api/info")).status, 401);
    const r = await (await fetch(ctx.base() + "/api/info", { headers: { "x-sync-token": ctx.token() } })).json();
    assert.ok(Array.isArray(r.data.addresses));
    assert.ok(r.data.devices.length >= 2);
  });
}
