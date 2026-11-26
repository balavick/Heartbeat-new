/* Shared by the browser and the Netlify Functions. Port of app/baseline.py. */
const HOUR = 3600, DAY = 86400;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function cadence(times, now) {
  const ts = [...times].sort((a, b) => a - b).slice(-50);
  if (ts.length < 5) return ["learning", null];
  const gaps = ts.slice(1).map((t, i) => t - ts[i]), med = median(gaps);
  const mad = median(gaps.map(g => Math.abs(g - med))), allowed = med + 3 * Math.max(mad, 0.1 * med), since = now - ts[ts.length - 1];
  return [since <= allowed ? "ok" : since <= 2 * allowed ? "late" : "down", allowed];
}
function volume(times, now) {
  const c = hi => times.filter(t => t > hi - DAY && t <= hi).length;
  const cur = c(now), base = median([1, 2, 3, 4, 5, 6, 7].map(i => c(now - i * DAY)));
  return [base >= 5 && cur < base * 0.5 ? "degraded" : "ok", cur, base];
}
/* Runs normally seen between start and end, from the same clock hours (UTC) on previous days. */
function expectedRuns(times, start, end, days = 7) {
  const floor = end - 2 * DAY; let h = Math.max(start - start % HOUR + HOUR, floor - floor % HOUR), total = 0;
  while (h < end) {
    total += median(Array.from({ length: days }, (_, k) => { const lo = h - (k + 1) * DAY; return times.filter(t => t >= lo && t < lo + HOUR).length; }));
    h += HOUR;
  }
  return total;
}
function evaluate(times, now, lastOk = true) {
  let [c, allowed] = cadence(times, now); const [v, cur, base] = volume(times, now);
  if (c === "late" || c === "down") { // quiet hours: silence is normal if history says this workflow sleeps now
    let mn = Infinity, mx = -Infinity; for (const t of times) { if (t < mn) mn = t; if (t > mx) mx = t; }
    if (mx - mn >= 3 * DAY && expectedRuns(times, mx, now) < 1) c = "ok";
  }
  const state = !lastOk ? "failing" : c === "down" ? "down" : c === "late" ? "late" : v === "degraded" ? "degraded" : c === "learning" ? "learning" : "ok";
  return { state, expected_within: allowed, runs_24h: cur, baseline_24h: base };
}
function hourly(times, now, n = 24) {
  const o = Array(n).fill(0);
  for (const t of times) { const i = Math.floor((now - t) / HOUR); if (i >= 0 && i < n) o[n - 1 - i]++; }
  return o;
}
if (typeof module !== "undefined") module.exports = { evaluate, hourly, DAY };
