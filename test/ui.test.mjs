import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const src = f => fs.readFileSync(new URL("../web/assets/" + f, import.meta.url), "utf8");
async function boot(hash, search = "?demo=1") {
  const el = { innerHTML: "" }, noop = { classList: { add() {}, remove() {} }, textContent: "" };
  const ctx = { console, URL, URLSearchParams, Date, Math, JSON, Array, Object, Number, String, Promise, setInterval: () => 0, setTimeout: () => 0, addEventListener() {},
    matchMedia: () => ({ matches: false }), navigator: { clipboard: { writeText: async () => {} } }, localStorage: { getItem: () => null, setItem() {} },
    location: { hash, search, origin: "https://x.test" }, fetch: async () => ({ status: 404, ok: false, url: "", headers: { get: () => "" } }),
    document: { querySelector: s => s === "#app" ? el : noop, addEventListener() {}, activeElement: null, body: {}, documentElement: { setAttribute() {}, removeAttribute() {} }, getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext(src("engine.js") + "\n" + src("app.js"), ctx);
  await new Promise(r => setImmediate(r));
  return el.innerHTML;
}
test("overview renders metrics and workflows", async () => {
  const h = await boot("");
  for (const s of ["need attention", "Healthy", "nightly-backup", "invoice-webhook", "Demo data", "Demo workspace"]) assert.ok(h.includes(s), s);
});
test("detail view renders runs and demo actions", async () => {
  const h = await boot("#/m/crm-export");
  for (const s of ["Failing", "401 Unauthorized", "Send a successful run", "Recent runs"]) assert.ok(h.includes(s), s);
});
test("settings renders sections", async () => {
  const h = await boot("#/settings");
  for (const s of ["Appearance", "Ingest token", "Report a run", "Reset demo data"]) assert.ok(h.includes(s), s);
});
test("without ?demo and without a server it falls back to demo", async () => assert.ok((await boot("", "")).includes("Demo workspace")));

test("activity tab and notifications bell render", async () => {
  const a = await boot("#/activity");
  for (const x of ["Recent runs", "Failed only", "crm-export", "Notifications", "unread"]) assert.ok(a.includes(x), x);
  assert.ok(a.includes('href="#/activity"'));
});
