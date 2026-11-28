import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { handle, record, check, snapshot } from "../netlify/lib/core.mjs";

const { evaluate } = createRequire(import.meta.url)("../web/assets/engine.js");
const ENV = { HEARTBEAT_PASSWORD: "pw", HEARTBEAT_INGEST_TOKEN: "tok", SESSION_SECRET: "s3cret" };
const mem = () => { const m = new Map(); return {
  set: async (k, v) => void m.set(k, v), delete: async k => void m.delete(k),
  get: async (k, o) => m.has(k) ? (o?.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null,
  list: async ({ prefix }) => ({ blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }) }; };
const NOW = Date.UTC(2026, 10, 20, 12), req = (path, o = {}) => new Request("https://x.test" + path, o);
async function seed(store, slug, stopHoursAgo = 0) { for (let i = 8 * 72; i >= 0; i--) { const t = NOW - i * 1200000; if (t <= NOW - stopHoursAgo * 3600000) await record(store, slug, {}, t); } }
async function cookie(store) { const r = await handle(req("/login", { method: "POST", body: "password=pw" }), store, ENV, NOW); return r.headers.get("set-cookie").split(";")[0]; }

test("503 when env is missing", async () => assert.equal((await handle(req("/api/monitors"), mem(), {}, NOW)).status, 503));
test("ping needs the token and a valid slug", async () => {
  const s = mem(), go = (slug, h) => handle(req("/ping/" + slug, { method: "POST", headers: h, body: "{}" }), s, ENV, NOW);
  assert.equal((await go("a", {})).status, 401);
  assert.equal((await go("a b", { "x-heartbeat-token": "tok" })).status, 400);
  assert.equal((await go("a", { "x-heartbeat-token": "tok" })).status, 200);
  assert.equal((await go("a", { authorization: "Bearer tok" })).status, 200);
});
test("login, cookie, lockout", async () => {
  const s = mem();
  assert.equal((await handle(req("/api/monitors"), s, ENV, NOW)).status, 401);
  assert.equal((await handle(req("/login", { method: "POST", body: "password=no" }), s, ENV, NOW)).status, 401);
  const ck = await cookie(s);
  assert.equal((await handle(req("/api/monitors", { headers: { cookie: ck } }), s, ENV, NOW)).status, 200);
  assert.equal((await handle(req("/api/monitors", { headers: { cookie: ck } }), s, ENV, NOW + 8 * 864e5)).status, 401);
  assert.equal((await handle(req("/api/monitors", { headers: { cookie: ck.slice(0, -1) + "0" } }), s, ENV, NOW)).status, 401);
  for (let i = 0; i < 5; i++) await handle(req("/login", { method: "POST", body: "password=no" }), s, ENV, NOW);
  assert.equal((await handle(req("/login", { method: "POST", body: "password=pw" }), s, ENV, NOW)).status, 429);
});
test("snapshot states, detail, and one alert per change", async () => {
  const s = mem(); await seed(s, "healthy"); await seed(s, "silent", 3);
  const by = Object.fromEntries((await snapshot(s, NOW / 1000)).map(m => [m.slug, m.state]));
  assert.deepEqual(by, { healthy: "ok", silent: "down" });
  const d = await (await handle(req("/api/monitors/silent", { headers: { cookie: await cookie(s) } }), s, ENV, NOW)).json();
  assert.equal(d.runs.length, 15);
  assert.deepEqual(await check(s, ENV, NOW / 1000), ["silent"]);
  assert.deepEqual(await check(s, ENV, NOW / 1000), []);
});
test("failed run is reported as failing", async () => {
  const s = mem(); await seed(s, "j"); await record(s, "j", { ok: false, error: "401 Unauthorized" }, NOW);
  assert.equal((await snapshot(s, NOW / 1000))[0].state, "failing");
});
test("quiet hours are not an outage, missed business hours are", () => {
  const B = 100 * 86400, runs = []; for (let d = 1; d <= 8; d++) for (let h = 9; h < 18; h++) runs.push(B - d * 86400 + h * 3600);
  assert.equal(evaluate(runs, B + 3 * 3600).state, "ok");
  assert.equal(evaluate([...runs, B + 9 * 3600], B + 14.5 * 3600).state, "down");
});

test("alerts history and activity feed", async () => {
  const s = mem(); await seed(s, "ok-one"); await seed(s, "quiet", 3); await record(s, "ok-one", { ok: false, error: "boom" }, NOW + 1000);
  await check(s, ENV, NOW / 1000);
  const ck = { headers: { cookie: await cookie(s) } };
  const alerts = await (await handle(req("/api/alerts", ck), s, ENV, NOW)).json();
  assert.ok(alerts.some(a => a.slug === "quiet" && a.state === "down" && a.ts > 0));
  const act = await (await handle(req("/api/activity", ck), s, ENV, NOW + 2000)).json();
  assert.ok(act.length > 0 && act.length <= 40 && act[0].ts >= act.at(-1).ts);
  assert.equal(act[0].slug, "ok-one"); assert.equal(act[0].ok, 0); assert.ok(act[0].payload.includes("boom"));
  assert.equal((await handle(req("/api/alerts"), s, ENV, NOW)).status, 401);
});
