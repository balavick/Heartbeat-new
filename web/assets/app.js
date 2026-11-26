(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LABEL = { ok: "Healthy", learning: "Learning", late: "Late", degraded: "Low volume", down: "Silent", failing: "Failing" };
const WHY = {
  ok: "Runs are arriving on their usual rhythm.",
  learning: "It needs at least 5 runs before it can judge what normal looks like.",
  late: "The last run is later than its usual gap. It may just be slow.",
  degraded: "Runs still arrive, but at under half the usual daily volume.",
  down: "No run has arrived for far longer than usual. Check the trigger, schedule or server.",
  failing: "The latest run reported an error."
};
const TONE = { ok: "ok", learning: "idle", late: "warn", degraded: "warn", down: "bad", failing: "bad" };
const ORDER = { failing: 0, down: 1, late: 2, degraded: 3, learning: 4, ok: 5 };
const S = { mode: "loading", list: [], q: "", f: "all", runs: {}, token: null, revealed: false, loginErr: "", err: false, setup: "" };
const demoOnly = new URLSearchParams(location.search).has("demo");
let demo = null;

const LOGO = `<svg class="logo" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><path d="M16 28C5 20 3 12.5 6 8.5c3-4 8-3 10 1 2-4 7-5 10-1 3 4 1 11.5-10 19.5z" fill="none" stroke="url(#g)" stroke-width="2.2" stroke-linejoin="round"/><path d="M3 17h7l2.5-5 4 9 2.5-4H29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ago = t => { if (!t) return "never"; const s = Date.now() / 1000 - t; return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
const dur = s => s == null ? "n/a" : s < 5400 ? Math.max(1, Math.round(s / 60)) + " min" : s < 172800 ? (s / 3600).toFixed(1) + " h" : Math.round(s / 86400) + " d";
const st = s => `<span class="st ${TONE[s]}"><i></i>${LABEL[s]}</span>`;
const spark = a => { const m = Math.max(1, ...a); return `<svg class="spark" viewBox="0 0 96 24" aria-hidden="true"><polyline points="${a.map((v, i) => `${(i * 96 / 23).toFixed(1)},${(22 - v / m * 20).toFixed(1)}`).join(" ")}"/></svg>`; };
const snippet = slug => `curl -X POST ${location.origin}/ping/${slug} \\\n  -H "X-Heartbeat-Token: ${S.token || "YOUR_INGEST_TOKEN"}" \\\n  -H "Content-Type: application/json" -d '{"ok": true}'`;
const copyBtn = (text, label = "Copy", cls = "btn") => `<button class="${cls}" data-act="copy" data-text="${esc(text)}">${label}</button>`;
const metric = (l, v, sub, pct, tone = "") => `<div class="metric"><div class="m-l">${l}</div><div class="m-v">${v}</div>${pct == null ? "" : `<div class="bar ${tone}"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>`}<div class="m-s">${sub}</div></div>`;

const theme = () => { try { return localStorage.getItem("hb-theme") || "system"; } catch { return "system"; } };
const applyTheme = t => { const r = document.documentElement; t === "system" ? r.removeAttribute("data-theme") : r.setAttribute("data-theme", t); };

function seedDemo() {
  const now = Date.now() / 1000, step = 1200, d = {};
  const gen = (slug, keep) => { d[slug] = []; for (let i = 8 * 72; i >= 0; i--) { const t = now - i * step; if (keep(t, i)) d[slug].push({ t, ok: true, d: Math.round(300 + Math.random() * 500) }); } };
  gen("nightly-backup", () => true);
  gen("invoice-webhook", t => t <= now - 3 * 3600);
  gen("lead-sync", (t, i) => t <= now - DAY || i % 3 === 0);
  gen("crm-export", () => true);
  Object.assign(d["crm-export"].at(-1), { ok: false, note: "401 Unauthorized: token expired" });
  return d;
}
function useDemo() {
  S.mode = "demo"; demo = demo || seedDemo();
  const now = Date.now() / 1000;
  S.list = Object.entries(demo).map(([slug, r]) => { const ts = r.map(x => x.t); return { slug, ...evaluate(ts, now, r.at(-1).ok), last_seen: ts.at(-1), spark: hourly(ts, now) }; });
}
async function api(path, opt) {
  const r = await fetch(path, { credentials: "same-origin", ...opt });
  return { status: r.status, ok: r.ok, url: r.url, json: (r.headers.get("content-type") || "").includes("json") ? await r.json() : null };
}
async function refresh() {
  if (demoOnly) { useDemo(); return render(); }
  try {
    const r = await api("/api/monitors");
    if (r.json && r.status === 200) { S.mode = "live"; S.list = r.json; S.err = false; }
    else if (r.json && r.status === 401) S.mode = "login";
    else if (r.json && r.status === 503) { S.mode = "setup"; S.setup = r.json.error; }
    else useDemo();
  } catch { if (S.mode === "live") S.err = true; else useDemo(); }
  render();
}
async function onRoute() {
  const [r, arg] = route();
  if (S.mode === "live" && r === "d") { const x = await api("/api/monitors/" + encodeURIComponent(arg)).catch(() => null); if (x?.json?.runs) S.runs[arg] = x.json.runs.map(p => { let n = {}; try { n = JSON.parse(p.payload); } catch {} return { t: p.ts, ok: !!p.ok, d: p.duration_ms, note: n.error || n.note }; }); }
  if (S.mode === "live" && r === "s" && !S.token) { const x = await api("/api/settings").catch(() => null); S.token = x?.json?.ingest_token || null; }
  render();
}
const route = () => { const h = location.hash.slice(1) || "/"; return h.startsWith("/m/") ? ["d", decodeURIComponent(h.slice(3))] : h === "/settings" ? ["s"] : ["o"]; };

const shell = (c, r) => `<header class="top"><div class="bar1"><a class="brand" href="#/" aria-label="Heartbeat home">${LOGO}<span>Heartbeat</span></a><span class="sep" aria-hidden="true">/</span>
<span class="ws"><i class="av" aria-hidden="true">H</i>${S.mode === "demo" ? "Demo workspace" : "My workspace"}<b class="env ${S.mode === "demo" ? "" : "live"}">${S.mode === "demo" ? "Demo" : "Live"}</b></span><span class="grow"></span>
${S.mode === "live" ? '<button class="btn sm" data-act="signout">Sign out</button>' : demoOnly ? '<a class="btn sm" href="/">Open live monitor</a>' : ""}</div>
<nav class="tabs" aria-label="Main"><a href="#/" ${r !== "s" ? 'aria-current="page"' : ""}>Overview</a><a href="#/settings" ${r === "s" ? 'aria-current="page"' : ""}>Settings</a></nav></header>
<main class="page">${S.err ? '<p class="note" role="alert">Cannot reach the server. Showing the last data received.</p>' : ""}${c}</main><div id="toast" role="status" aria-live="polite"></div>`;

function rows() {
  const q = S.q.toLowerCase(), attn = m => ORDER[m.state] < 4;
  const v = S.list.filter(m => (S.f === "all" || (S.f === "attn") === attn(m)) && m.slug.toLowerCase().includes(q)).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.slug.localeCompare(b.slug));
  if (!v.length) return `<tr><td colspan="4" class="mute">No workflows match this filter.</td></tr>`;
  return v.map(m => `<tr data-href="#/m/${encodeURIComponent(m.slug)}"><td><a href="#/m/${encodeURIComponent(m.slug)}">${esc(m.slug)}</a><div class="sub2">Last run ${ago(m.last_seen)}</div></td><td>${st(m.state)}</td>
<td class="num hide-sm">${m.runs_24h}<span class="mute"> / ${Math.round(m.baseline_24h)} usual</span></td><td class="hide-md">${spark(m.spark)}</td></tr>`).join("");
}
function overview() {
  const L = S.list, n = L.filter(m => ORDER[m.state] < 4).length, ok = L.filter(m => m.state === "ok").length;
  const runs = L.reduce((a, m) => a + m.runs_24h, 0), usual = L.reduce((a, m) => a + m.baseline_24h, 0), learning = L.filter(m => m.state === "learning").length;
  const note = S.mode === "demo" ? '<p class="note">Demo data. These workflows are simulated in your browser and nothing is sent to a server.</p>' : "";
  if (!L.length) return `<h1>Overview</h1><p class="lede">Heartbeat learns how often each workflow runs and tells you when one goes quiet.</p>${note}<div class="box empty"><h2>No workflows yet</h2><p>A workflow appears here after its first run reports in.</p><pre>${esc(snippet("my-first-workflow"))}</pre>${copyBtn(snippet("my-first-workflow"), "Copy command", "btn pri")}</div>`;
  return `<h1>${n ? `${n} of ${L.length} workflows need attention` : "All workflows are running normally"}</h1><p class="lede">Each workflow is judged against its own learned rhythm, not a fixed schedule.</p>${note}
<div class="metrics">${metric("Workflows", L.length, `${learning} still learning`)}${metric("Healthy", ok, `${Math.round(ok / L.length * 100)}% of workflows`, ok / L.length * 100, "ok")}${metric("Need attention", n, n ? "Silent, late, failing or low volume" : "Nothing to do", n / L.length * 100, "bad")}${metric("Runs in 24 h", runs, `${Math.round(usual)} usual`, usual ? runs / usual * 100 : 0)}</div>
<div class="box"><div class="box-h"><label class="sr" for="q">Search workflows</label><input id="q" type="search" placeholder="Search workflows..." value="${esc(S.q)}" autocomplete="off">
<label class="sr" for="f">Filter</label><select id="f">${[["all", "All workflows"], ["attn", "Needs attention"], ["ok", "Healthy and learning"]].map(([k, t]) => `<option value="${k}" ${S.f === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
<table><caption class="sr">Workflows</caption><thead><tr><th>Workflow</th><th>Status</th><th class="hide-sm">Runs in 24 h</th><th class="hide-md">Last 24 h</th></tr></thead><tbody id="rows">${rows()}</tbody></table></div>`;
}
function detail(slug) {
  const m = S.list.find(x => x.slug === slug);
  if (!m) return `<div class="crumbs"><a href="#/">Overview</a></div><h1>Workflow not found</h1><p class="lede">No runs have been recorded for "${esc(slug)}".</p>`;
  const runs = S.mode === "demo" ? demo[slug].slice(-12).reverse() : S.runs[slug] || [], mx = Math.max(1, ...m.spark);
  return `<div class="crumbs"><a href="#/">Overview</a><span aria-hidden="true">/</span><span>${esc(m.slug)}</span></div><div class="title"><h1>${esc(m.slug)}</h1>${st(m.state)}</div><p class="lede">${WHY[m.state]}</p>
<div class="metrics m3">${metric("Last run", ago(m.last_seen), m.last_seen ? new Date(m.last_seen * 1000).toLocaleString() : "No runs yet")}${metric("Expected within", dur(m.expected_within), "Learned from its own history")}${metric("Runs in 24 h", m.runs_24h, `${Math.round(m.baseline_24h)} usual`, m.baseline_24h ? m.runs_24h / m.baseline_24h * 100 : 0)}</div>
<div class="box"><div class="box-h"><h2>Runs per hour</h2></div><svg class="chart" viewBox="0 0 240 60" preserveAspectRatio="none" role="img" aria-label="${m.runs_24h} runs in the last 24 hours" style="margin-top:16px">${m.spark.map((v, i) => `<rect x="${i * 10 + 1}" y="${60 - v / mx * 58}" width="8" height="${Math.max(v ? 1.5 : .5, v / mx * 58)}" rx="1"/>`).join("")}</svg><div class="axis"><span>24 h ago</span><span>now</span></div></div>
${S.mode === "demo" ? `<section class="card"><div class="card-b"><h2>Try it</h2><p>Simulate this workflow reporting in. This changes nothing on any server.</p></div><div class="card-f"><span>Watch the status and counts update.</span><span><button class="btn" data-act="fail" data-slug="${esc(slug)}">Send a failed run</button> <button class="btn pri" data-act="ping" data-slug="${esc(slug)}">Send a successful run</button></span></div></section>` : ""}
<div class="box"><div class="box-h"><h2>Recent runs</h2></div><table><caption class="sr">Recent runs</caption><thead><tr><th>Time</th><th>Result</th><th class="hide-sm">Duration</th><th>Note</th></tr></thead><tbody>${runs.length ? runs.map(r => `<tr><td class="num">${new Date(r.t * 1000).toLocaleString()}</td><td>${r.ok ? '<span class="st ok"><i></i>Succeeded</span>' : '<span class="st bad"><i></i>Failed</span>'}</td><td class="num hide-sm">${r.d ? Math.round(r.d) + " ms" : "n/a"}</td><td class="mute">${esc(r.note || "")}</td></tr>`).join("") : `<tr><td colspan="4" class="mute">No recent runs loaded.</td></tr>`}</tbody></table></div>`;
}
function settings() {
  const live = S.mode === "live", t = theme();
  return `<h1>Settings</h1><p class="lede">${live ? "Connect workflows, change the look, and manage your session." : "Demo mode has no server, so there is nothing to connect yet."}</p>
<div class="set"><nav class="subnav" aria-label="Settings sections"><button data-act="jump" data-id="s-app">Appearance</button><button data-act="jump" data-id="s-tok">Ingest token</button><button data-act="jump" data-id="s-run">Report a run</button><button data-act="jump" data-id="s-ses">${live ? "Session" : "Demo data"}</button></nav><div>
<section class="card" id="s-app"><div class="card-b"><h2>Appearance</h2><p>Choose how Heartbeat looks on this device.</p><label class="sr" for="theme">Theme</label><select id="theme">${[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([k, v]) => `<option value="${k}" ${t === k ? "selected" : ""}>${v}</option>`).join("")}</select></div><div class="card-f"><span>System follows your device setting.</span></div></section>
<section class="card" id="s-tok"><div class="card-b"><h2>Ingest token</h2><p>Your workflows send this token with every run.</p>${live ? (S.token ? `<div class="field"><input id="tok" type="${S.revealed ? "text" : "password"}" value="${esc(S.token)}" readonly aria-label="Ingest token"><button class="btn" data-act="reveal">${S.revealed ? "Hide" : "Reveal"}</button></div>` : '<div class="sk" style="width:60%"></div>') : '<p style="margin:0">Your server sets this token. Demo mode has none.</p>'}</div><div class="card-f"><span>Change it with HEARTBEAT_INGEST_TOKEN in your Netlify environment variables.</span>${live && S.token ? copyBtn(S.token, "Copy token", "btn pri") : ""}</div></section>
<section class="card" id="s-run"><div class="card-b"><h2>Report a run</h2><p>Add this to the end of a cron job, script or automation.</p><pre>${esc(snippet("nightly-backup"))}</pre></div><div class="card-f"><span>Send {"ok": false, "error": "..."} to report a failure.</span>${copyBtn(snippet("nightly-backup"), "Copy command", "btn pri")}</div></section>
<section class="card" id="s-ses"><div class="card-b"><h2>${live ? "Session" : "Demo data"}</h2><p>${live ? "Sign out of this browser. Your workflows keep reporting." : "Reset the simulated workflows to their starting state."}</p></div><div class="card-f"><span>${live ? "Sessions last 7 days." : "Only affects this browser."}</span>${live ? '<button class="btn pri" data-act="signout">Sign out</button>' : '<button class="btn pri" data-act="reset">Reset demo data</button>'}</div></section>
</div></div>`;
}
const authView = (inner) => `<div class="auth"><div class="auth-in">${LOGO.replace('width="24" height="24"', 'width="44" height="44"')}${inner}</div></div>`;
const loginView = () => authView(`<h1>Sign in to Heartbeat</h1><form id="login"><label class="sr" for="pw">Password</label><input id="pw" type="password" placeholder="Password" autocomplete="current-password" required autofocus><p class="err" role="alert">${esc(S.loginErr)}</p><button class="btn pri">Continue</button></form><p class="fine">Your workflows keep reporting while you are signed out. <a href="/?demo=1">See the demo</a></p>`);

function render() {
  const app = $("#app"), [r, arg] = route(), auth = S.mode === "login" || S.mode === "setup";
  document.body.className = auth ? "on-auth" : "";
  if (S.mode === "loading") { app.innerHTML = '<main class="page"><div class="sk" style="width:40%;height:32px"></div><div class="sk" style="width:60%"></div><div class="sk" style="height:120px;margin-top:24px"></div><div class="sk" style="height:200px"></div></main>'; return; }
  if (S.mode === "login") { app.innerHTML = loginView(); return; }
  if (S.mode === "setup") { app.innerHTML = authView(`<h1>Almost there</h1><p class="fine" style="font-size:15px">${esc(S.setup)}</p>`); return; }
  app.innerHTML = shell(r === "d" ? detail(arg) : r === "s" ? settings() : overview(), r);
  document.title = (r === "d" ? arg + " | " : r === "s" ? "Settings | " : "") + "Heartbeat";
}
const toast = t => { const e = $("#toast"); if (!e) return; e.textContent = t; e.classList.add("show"); setTimeout(() => e.classList.remove("show"), 2000); };

document.addEventListener("click", async e => {
  const tr = e.target.closest("tr[data-href]"); if (tr && !e.target.closest("a,button")) { location.hash = tr.dataset.href.slice(1); return; }
  const b = e.target.closest("[data-act]"); if (!b) return; const a = b.dataset.act;
  if (a === "copy") { try { await navigator.clipboard.writeText(b.dataset.text); toast("Copied"); } catch { toast("Copy failed. Select the text manually."); } }
  else if (a === "reveal") { S.revealed = !S.revealed; render(); }
  else if (a === "jump") document.getElementById(b.dataset.id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  else if (a === "reset") { demo = null; useDemo(); render(); toast("Demo data reset"); }
  else if (a === "signout") { await api("/logout", { method: "POST" }); S.mode = "login"; S.token = null; render(); }
  else if (a === "ping" || a === "fail") {
    const r = { t: Date.now() / 1000, ok: a === "ping", d: Math.round(300 + Math.random() * 500) }; if (a === "fail") r.note = "Simulated failure"; demo[b.dataset.slug].push(r); useDemo(); render(); toast(a === "ping" ? "Run recorded" : "Failed run recorded");
  }
});
document.addEventListener("input", e => { if (e.target.id === "q") { S.q = e.target.value; $("#rows").innerHTML = rows(); } });
document.addEventListener("change", e => {
  if (e.target.id === "f") { S.f = e.target.value; $("#rows").innerHTML = rows(); }
  if (e.target.id === "theme") { try { localStorage.setItem("hb-theme", e.target.value); } catch {} applyTheme(e.target.value); }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "login") return; e.preventDefault();
  try {
    const r = await fetch("/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "password=" + encodeURIComponent($("#pw").value) });
    if (r.status === 429) S.loginErr = "Too many attempts. Try again in 5 minutes."; else if (r.ok && new URL(r.url).pathname === "/") { S.loginErr = ""; return refresh(); } else S.loginErr = "That password is wrong.";
  } catch { S.loginErr = "Cannot reach the server."; }
  render();
});
addEventListener("hashchange", onRoute);
applyTheme(theme()); render(); refresh();
setInterval(() => { if (!["q", "pw", "theme", "f"].includes(document.activeElement?.id) && S.mode !== "login") refresh(); }, 15000);
})();
