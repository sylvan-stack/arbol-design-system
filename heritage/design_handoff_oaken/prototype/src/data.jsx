/* Oaken data + time model (shared by Pool and Swimlane Details).
 * A LANE is a workstream. A SWIMMER is one task on a lane, rooted on a source GRAIN
 * (its ticket) with a start, a typed WALL (estimated | due | deadline) and a stream of
 * child GRAINS (see shared/grains.jsx for the kind/shape palette + GrainChip).
 * Span grains (chat/agent sessions) draw as bars; mark grains (ticket/mr/commit/state)
 * as dots. Everything here is plain data, exported to window.OAK. */

/* ── time model: working-hours axis, paged by day (matches the pool sketch) ── */
const PAGE0 = 8, PAGE1 = 20, PAGE_HRS = PAGE1 - PAGE0;  // each day-page shows 08:00–20:00
const WORK = [9, 18];                                    // workday band
const GAP = 30;                                          // px night-gap between pages
const DAYS = ["Today · Wed Jun 4", "Thu Jun 5", "Fri Jun 6"];
const NOW = [0, 13.5];                                   // today 13:30

const abs = (a) => a[0] * 24 + a[1];                     // [day,hour] → absolute hours
const clock = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0")}`;

/* swimmer WALL types — pastel fill for the remaining part, wall line a touch more
 * saturated. Three types. (Shared with the pool sketch so the two pages match.) */
const WALL = { estimated: "oklch(0.60 0.125 150)", due: "oklch(0.74 0.135 64)", deadline: "oklch(0.62 0.165 25)" };
const FILL = { estimated: "oklch(0.80 0.075 150)", due: "oklch(0.80 0.072 66)", deadline: "oklch(0.76 0.085 24)" };
const WICON = { estimated: "≈", due: "⚑", deadline: "⛔" };

/* ── lanes → swimmers → grains ──────────────────────────────────────────────
 * t = [day, hour]. Span grains carry {s,e}; live spans add `live:true` and grow to NOW.
 * Lane 4 is the demo lane opened in Details (3 active swimmers + 1 planned/empty). */
const LANES = [
  { n: 1, empty: true },
  { n: 2, empty: true },
  {
    n: 3, tkt: "Billing & Invoicing — Q3 Migration Programme", hue: 30, swimmers: [
      { id: "bill-1", nm: "[BILL] Reconcile invoice schema diff between legacy and v2 ledgers", src: "JIRA", start: [0, 9.5], due: [0, 17], type: "due", items: [
        { kind: "ticket", t: [0, 9.5], title: "BILL-204 Schema diff", meta: "In progress" },
        { kind: "chat", s: [0, 10], e: [0, 11.25], title: "Map legacy columns", meta: "you · 14 msgs" },
        { kind: "mr", t: [0, 12.5], title: "!318 ledger-diff tool", meta: "open", state: "open" },
      ] },
      { id: "bill-2", nm: "[BILL] Backfill historical invoices into the new partitioned tables", src: "JIRA", start: [0, 10], due: [0, 15], type: "deadline", blocked: true, items: [
        { kind: "ticket", t: [0, 10], title: "BILL-209 Backfill", meta: "Blocked" },
        { kind: "state", t: [0, 12], title: "Blocked on infra", meta: "waiting", state: "blocked" },
        { kind: "agent", s: [0, 12.5], e: [0, 13.1], live: true, title: "Draught partition plan", meta: "agent · running" },
      ] },
    ]
  },
  {
    n: 4, tkt: "Checkout v2 — Payments & Auth Hardening", hue: 64, swimmers: [
      { id: "pay-1", nm: "[PAY] Finalize payments API contract with the processor team", src: "JIRA", start: [0, 9], due: [1, 12], type: "due", items: [
        { kind: "ticket", t: [0, 9],            title: "PAY-771 API contract", meta: "In review", state: "review" },
        { kind: "state",  t: [0, 9],            title: "Started", meta: "you", state: "started" },
        { kind: "chat",   s: [0, 9.5], e: [0, 10.6], title: "Draft contract w/ processor", meta: "you · 22 msgs" },
        { kind: "mr",     t: [0, 11],           title: "!402 contract types", meta: "open", state: "open" },
        { kind: "commit", t: [0, 12.4],         title: "3 commits pushed", meta: "feat/pay-contract" },
        { kind: "agent",  s: [0, 12.6], e: [0, 13.3], live: true, title: "Generate client stubs", meta: "agent · running" },
        { kind: "chat",   s: [0, 13.0], e: [0, 13.5], live: true, title: "Pair on contract edge cases", meta: "you · running" },
      ] },
      { id: "auth-1", nm: "[AUTH] Refactor auth token refresh to handle silent re-issue", src: "SLACK", start: [0, 11], due: [0, 16], type: "deadline", blocked: true, items: [
        { kind: "chat",  s: [0, 11], e: [0, 11.5],  title: "Repro silent-refresh bug", meta: "you · 9 msgs" },
        { kind: "state", t: [0, 11.6],              title: "Blocked — needs secret rotation", meta: "blocked", state: "blocked" },
        { kind: "mr",    t: [0, 13],                title: "!409 refresh handler", meta: "draft", state: "open" },
        { kind: "agent", s: [0, 13.4], e: [0, 14.4], title: "Bisect token expiry path", meta: "agent · waiting" },
      ] },
      { id: "pay-2", nm: "[PAY] Webhook retries + idempotency keys for failed captures", src: "JIRA", start: [0, 12], due: [0, 14], type: "deadline", items: [
        { kind: "ticket", t: [0, 12],            title: "PAY-788 Idempotency", meta: "In progress" },
        { kind: "chat",   s: [0, 12.2], e: [0, 12.9], title: "Design retry/backoff", meta: "you · 11 msgs" },
        { kind: "commit", t: [0, 13.2],          title: "1 commit pushed", meta: "fix/webhook-retry" },
        { kind: "mr",     t: [0, 13.4],          title: "!411 idempotency keys", meta: "merged", state: "merged" },
      ] },
      { id: "pci-1", nm: "[PAY] PCI scope review for the new capture flow", src: "JIRA", start: [0, 10.5], due: [0, 18], type: "estimated", items: [] },
    ]
  },
  {
    n: 5, tkt: "Search Relevance — Ranking Quality Initiative", hue: 150, swimmers: [
      { id: "srch-1", nm: "[SRCH] Rebuild relevance index with the new analyzer pipeline", src: "JIRA", start: [0, 9], due: [1, 16], type: "estimated", items: [
        { kind: "ticket", t: [0, 9], title: "SRCH-552 Reindex", meta: "In progress" },
        { kind: "agent", s: [0, 10], e: [0, 11], title: "Tune analyzer config", meta: "agent" },
      ] },
      { id: "srch-2", nm: "[SRCH] Offline eval harness for ranking regressions", src: "TEXT", start: [0, 10.5], due: [2, 12], type: "due", items: [
        { kind: "chat", s: [0, 10.5], e: [0, 11.5], title: "Define eval metrics", meta: "you · 7 msgs" },
      ] },
    ]
  },
  {
    n: 6, tkt: "Mobile Stability — Cold-Start Crash Taskforce", hue: 20, swimmers: [
      { id: "mob-1", nm: "[MOB] Implement account-status filtering for crash notifications", src: "SLACK", start: [0, 11], due: [0, 13], type: "deadline", items: [
        { kind: "ticket", t: [0, 11], title: "MOB-118 Crash filter", meta: "Overdue" },
        { kind: "commit", t: [0, 12.5], title: "2 commits pushed", meta: "fix/coldstart" },
      ] },
    ]
  },
  {
    n: 7, tkt: "Q3 Planning & Vendor Onboarding", hue: 265, swimmers: [
      { id: "plan-1", nm: "[PLAN] Spec review with design for the notification centre", src: "TEXT", start: [1, 9], due: [1, 17], type: "estimated", items: [] },
      { id: "sec-1", nm: "[SEC] Vendor security questionnaire for the analytics SDK", src: "JIRA", start: [1, 10], due: [2, 15], type: "deadline", items: [] },
    ]
  },
  { n: 8, empty: true },
];

/* importance ordering (brighter lane = higher priority) — kept from the sketch */
const IMP_ORDER = [4, 5, 6, 3, 7, 2, 1, 8];
const imp = (n) => 1 - Math.max(0, IMP_ORDER.indexOf(n)) / (IMP_ORDER.length - 1);

/* live countdown formatting */
function fmtLeft(hoursLeft) {
  const over = hoursLeft < 0, s = Math.floor(Math.abs(hoursLeft) * 3600);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  let t;
  if (!over && Math.abs(hoursLeft) * 60 > 30) { t = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`; }
  else { t = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`; }
  return (over ? "+" : "") + t;
}

window.OAK = {
  PAGE0, PAGE1, PAGE_HRS, WORK, GAP, DAYS, NOW,
  abs, clock, fmtLeft,
  WALL, FILL, WICON,
  LANES, imp,
  laneByN: (n) => LANES.find((L) => L.n === n),
};
