# Handoff: Oaken — Swimlanes pool + Swimlane Details + the Grain kit

## Overview
This package is a **high-fidelity design reference** for **Oaken**, the task-management &
delivery workspace in the Arbol family (per `ux-ui-guide.md` Part 1 + Part 2). It covers two
pages and one new shared subsystem:

1. **`Oaken[Swimlanes]`** — the *pool*: a vertical-time board of **Lanes** (workstreams), each
   split into **Swimmer** columns (one task track each). Time runs up the Y-axis, paged by
   working day.
2. **`Oaken[Swimlane Details]`** — opened by clicking a Lane title. That one Lane fills the
   full width, split into wide **Swimmer columns**; each column is a full mini-swimlane on a
   shared time axis, now wide enough to hold the swimmer's **Grains** (chat/agent sessions,
   MRs, commits, tickets, state changes).
3. **The Grain kit** (`shared/grains.jsx`) — the cross-UI render system for Arbol's first-class
   citizens (guide §1.11). Introduced here but **belongs to the shared design system** and is
   reused by every UI.

Navigation between the two pages is a drill-down: lane-title click → details; back via a
breadcrumb chevron or **⌘[**.

## About the design files
The files in `prototype/` are **design references built in HTML + React-via-Babel** — they show
the intended look and behavior. They are **not** meant to ship as-is. Oaken is a **new** window
in an app family that already exists in this repo, so the task is to **recreate these designs in
the real renderer** using its established stack and the shared `@arbol/design-system`, not to
introduce a new one. If a target environment does not yet exist, implement in the family's
chosen stack (React + a real CSS/token layer).

Open `prototype/Oaken.html` in a browser to interact with the reference.

### File → real-codebase mapping

| Prototype file | Real target in the repo | Notes |
| --- | --- | --- |
| `prototype/shared/tokens.css` | `renderer/packages/design-system/src/tokens.css` | **Already exists** (the 12-theme ladder from the Seqoya handoff). No new tokens required — Oaken consumes the existing `--arbol-*`. |
| `prototype/shared/themes.jsx` | `renderer/packages/design-system/src/themes.ts` | Already exists. Unchanged. |
| `prototype/shared/components.jsx` | `renderer/packages/design-system/src/components/` | Already exists. Oaken uses `Dot` (+ `RingsMark` via chrome). Unchanged. |
| `prototype/shared/chrome.jsx` | `renderer/packages/design-system/src/chrome/Chrome.tsx` | **Two additive changes to port** — see "Shared-layer changes" below. |
| `prototype/shared/grains.jsx` | **new** `renderer/packages/design-system/src/grains/` | **NEW shared subsystem.** Port `GRAINS` (palette + helpers) + `GrainChip`/`GrainCard`. Used by Oaken now and by Elma/Willo later. |
| `prototype/src/app.jsx` | `renderer/apps/oaken/src/App.tsx` | Window shell: page state (`pool`/`details`), selected lane, theme, font scale, Feed/Split layout, header controls, ⌘[, toast. |
| `prototype/src/pool.jsx` | `renderer/apps/oaken/src/pages/Swimlanes/` | The pool timeline. Imperative DOM in the proto (the px/time math is tuned); re-express idiomatically (canvas/abs-positioned divs) — the geometry is documented below. |
| `prototype/src/details.jsx` | `renderer/apps/oaken/src/pages/SwimlaneDetails/` | The details page (React in the proto). |
| `prototype/src/data.jsx` | — | **Mock data + the time model only.** The `LANES`/swimmers/grains are fake. Port the *time model* helpers (`abs`, `clock`, `fmtLeft`, paging math) and the `WALL`/`FILL`/`WICON` swimmer-wall palette; wire real lanes/swimmers/grains from the core. Do **not** ship the mock `LANES`. |

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, motion, and interactions are final.
Everything is expressed through `--arbol-*` tokens — **do not hardcode hex/px for
color/space/radius/type**. The one structural caveat: the prototype's pool is imperative for
expedience; reproduce its *behavior and geometry*, not its DOM-string approach.

---

## Shared-layer changes to port (`chrome.jsx`)
This work made the shared `UIShell` slightly more capable. Both changes are backward-compatible
(Seqoya/Elma already verified):

1. **Optional Header slots.** `UIShell` now accepts `headerLead` (rendered just after the title)
   and `headerExtras` (rendered just before the FontSizeControl/ThemeSwitcher, after the flexible
   drag spacer). Oaken uses `headerLead` for the page label / drill-down breadcrumb and
   `headerExtras` for the per-page controls (Fit/widen/narrow on the pool; Feed/Split on details).
2. **No header clip + contained grid.** The root grid column is `minmax(0, 1fr)` and the Viewport
   cell is `min-width:0; overflow:hidden`. The **Header row must NOT set `overflow:hidden`** —
   doing so clips the ThemeSwitcher popover. (This was a real bug fixed here.)

Also a **global polish** applied across Oaken's CSS + the Grain kit: every literal `px`
font-size is wrapped as `calc(<n>px * var(--arbol-font-scale))` so the Header's **A− / A+**
text-size control scales *all* text, not just token-based text. Do the equivalent in the real
app (prefer the type tokens; for bespoke sizes, multiply by the scale variable).

---

## The time model (shared by both pages)
A working-hours vertical axis, paged by day. Defined in `data.jsx`:

- **Day page** shows **08:00–20:00** (`PAGE0=8 … PAGE1=20`, 12h tall). Multiple day-pages stack
  with a **30px hatched "night gap"** between them (labelled "↑ {next day}"). Demo has 3 days.
- **Workday band** = 09:00–18:00 (`WORK`), used to frame the initial scroll position.
- **NOW** line — a glowing 2px accent rule at the current time (demo: today 13:30), with its
  time label on the axis in accent.
- **`abs([day,hour])`** = `day*24 + hour` (absolute hours, for ordering/countdowns).
  **`clock(h)`** → `"HH:MM"`. **`fmtLeft(hoursLeft)`** → countdown string (`2d 4h`, `3h 12m`,
  `12:34`, or `+1:02` when overdue).
- **Pixels:** `pxPerHour = (viewportHeight / 9) * zoom`; a day-page is `pxPerHour * 12` tall;
  `bottom`-anchored (time increases upward). Y for `[day,hour]` =
  `day*(pageH+GAP) + (hour-PAGE0)*pxPerHour`.
- **Gestures:** **⌘/Ctrl + scroll** zooms (anchored on the NOW line); plain scroll / drag pans.
  Pool zoom clamp `0.075–4.5`; details default zoom `1.6` (tighter, since it shows more detail),
  clamp `0.2–4.5`.
- A floating **time tooltip** follows the cursor on the pool (`"Today · 13:42"`).

---

## Screens / Views

### Shared chrome (`UIShell`)
Three full-width rows: **Header** (`--arbol-control-bar-height`) / **Viewport** (fill) / **Status
Bar** (`control-bar-height`). The proto wraps it in a faux macOS window; in the app that's the OS
window — drop the frame. Title = `RingsMark` + "Oaken". Default theme **`redwood`** (matches
Seqoya/Elma).

- **Header — pool:** `headerLead` = "· Swimlanes" muted label. `headerExtras` = three controls:
  **▭−** (narrower columns), **▭＋** (wider columns), **Fit swimlanes** (toggle; fits all occupied
  lanes to the viewport width — active state filled with accent). Then the shared FontSizeControl
  + ThemeSwitcher.
- **Header — details:** `headerLead` = a breadcrumb: **‹ Swimlanes** button → `⟩` → `LANE {n}` →
  the lane ticket title (ellipsised, `max-width:360`). `headerExtras` = the **Feed / Split**
  segmented toggle.
- **Status Bar — pool:** green `Dot` + "Connected" · "{n} active lanes" (mono) · right-aligned
  hint "Click a lane title to expand its swimmers →".
- **Status Bar — details:** state `Dot` (red if any swimmer overdue) · "{n} swimmers" · "{n}
  grains" (mono) · right hint "Click a swimmer header for actions · ⌘[ back".

### `Oaken[Swimlanes]` — the pool
Grid: a **64px axis column** + the scrolling **world**. The world holds (z-order low→high):
night-gap hatches, the hour grid, the lanes, the NOW line. A sticky **header row** of lane
titles sits on top; it pans horizontally with the world but not vertically.

- **Axis (64px):** hour ticks (`08,09,12,15,18,20` emphasized; `08/20` faint) with a tiny tick
  mark; per-day label ("TODAY"/"THU"/"FRI"); the NOW tick in accent. Mono, `type` ~10px.
- **Lane:** `border-radius:10px 10px 0 0`, hairline inset ring. Width = `nSwimmers × COLW`
  (`COLW` default **150px**, widen/narrow step ±22, clamp 50–320; Fit computes to fill). Lanes
  separated by **8px** gap, container padding `0 12px`. Empty lanes render a thin 70px stub with
  a vertical "no swimmers" label and reduced opacity. Lane background tint is derived from the
  lane's `hue` + per-column index + an **importance** factor (brighter = higher priority; order
  in `IMP_ORDER`).
- **Lane title (header row):** `LANE {n}` eyebrow (mono, muted) + the ticket title (ellipsised).
  The title is a hover-highlightable button → opens Swimlane Details.
- **Swimmer (one column):** drawn as a vertical **spine** centered in the column:
  - **Spent segment** — solid `surface`-mix stroke from `start` up to NOW (`border-radius`
    rounds the bottom). Blocked swimmers add a 45° hatch.
  - **Remaining segment** — softer, lane-tinted fill from NOW up to the wall.
  - **Overdue** — if the wall is below NOW, a red 45° hatch from wall→NOW instead.
  - **Planned** (start in the future) — a single soft fill start→wall + a "▸ HH:MM" start chip.
  - **Wall** — a 2px horizontal rule at the `due` time, colored by wall type, with a small flag
    chip `{icon} HH:MM`. Wall types: **estimated** `≈` (green), **due** `⚑` (amber), **deadline**
    `⛔` (red). (`WALL`/`FILL`/`WICON` in `data.jsx`.)
  - **Countdown timer** — mono chip near the wall, live-ticking via `fmtLeft`; turns red/`+`
    when overdue.
  - **% spent cap** — a mono pill at the NOW line showing elapsed % (or "OVER").
  - **Name label** — the swimmer name + source badge, placed by a small **anti-overlap solver**
    (`placeLabels`) that nudges labels along the spine to minimize collisions.
- Initial view scrolls so the workday (09:00) sits near the bottom and centers the two
  highest-priority lanes.

### `Oaken[Swimlane Details]` — one Lane, expanded
Grid: a **56px axis column** + the scrolling world. The world holds the shared grid + night gaps
+ NOW line, then a flex row of **Swimmer columns** (`flex:1`, **12px** gap, `0 14px` padding) —
so 2–4 swimmers become comfortably wide. A sticky **header row** of column headers sits on top.

Each **Swimmer column**:
- Rounded top, hairline ring, faint lane-hue tint (varies per column index).
- **Column header (sticky, clickable → action popover):** `SWIMMER {i}` eyebrow + **% spent**
  (or PLANNED/OVER, red when overdue) on the right; the swimmer **name** (2-line clamp); a bottom
  row with the **source badge** + the live **countdown** chip (wall-type colored, red+`+` overdue).
- **Spine** — same spent/remaining/overdue/planned/wall/timer/% language as the pool, but the
  spine position is driven by `--spine`: **26px from the left in Feed**, **centered (50%) in
  Split**.
- **Grains** live in the column, anchored to their time:
  - **Span grains** (chat/agent sessions) → a **duration bar** (6px wide, kind-hue border +
    soft fill) offset just off the spine. A **live** session (`live:true`) **breathes** (a 2.4s
    glow) and its bar **grows up to the NOW line**, with a pulsing 11px tip dot at the growing
    edge.
  - **Mark grains** (ticket/mr/commit/state) → a **7px dot** on the spine + a **GrainChip** card
    offset to the side, joined by a dashed leader (vertical riser + horizontal stub). Cards are
    placed by a greedy upward solver (`placeCards`, min 44px slot) so they never overlap.
  - **Layout directions:** **Feed** = spine left, one column of chips to the right (marks + spans
    interleaved by time). **Split** = spine centered, **span** chips left / **mark** chips right.
  - **Empty swimmer** — shows just the stroke + a centered "No activity yet" + a dashed
    **"❝ Start a chat"** button.
- **Action popover** (on column-header click): titled with the swimmer name; items **New Chat**
  (`⌘N`), **Link to…** (`⌘L`), separator, **Finish swimmer**. All currently fire a toast
  ("… — coming soon"); wire them to the real actions. Dismiss on outside-click / Esc.

---

## The Grain kit (`shared/grains.jsx`) — port to the design system
A **Grain** is any first-class Arbol citizen. `window.GRAINS` exposes the palette + helpers and
two components. This is the single place entity rendering is defined — **never re-style entity
cards per surface**; every UI renders Grains through these.

### `GRAINS.KINDS` (extend as kinds are added; keep keys stable)
| kind | tag | shape | family | hue | glyph |
| --- | --- | --- | --- | --- | --- |
| `ticket` | TICKET | mark | activity | 256 | ▣ |
| `mr` | MR | mark | activity | 150 | ⇄ |
| `commit` | PUSH | mark | activity | 200 | ● |
| `state` | STATE | mark | activity | 28 | ◆ |
| `chat` | CHAT | span | activity | 34 | ❝ |
| `agent` | AGENT | span | activity | 300 | ✦ |
| `artifact` | ART | note | knowledge | 210 | ◫ |
| `requirement` | REQ | note | knowledge | 95 | § |
| `invariant` | INV | note | knowledge | 322 | ∎ |

- **`shape`** — `span` (duration → bar; live → grows to NOW) · `mark` (point → dot+chip) ·
  `note` (durable/authored → listed & inspected; pins to a time as a mark). *Note-shape grains
  are defined but not yet exercised by Oaken — they need a list/inspector surface, TBD.*
- **`family`** — `activity` (it happened) vs `knowledge` (it was authored).
- **`STATE_HUE`** — optional `state` recolors a grain: `open 64, merged 150, closed 28,
  started 200, blocked 25, finished 150, review 256`.
- **Helpers:** `meta(kind)`, `shapeOf(kind)`, `hueOf(kind,state)`, `line(kind,state)` →
  `oklch(0.70 0.13 H)`, `soft(kind,a,state)` → a surface-mixed tint.

### Components
- **`GrainChip`** — the canonical compact unit: kind **glyph** (hue) + **title** (one line,
  ellipsised) + a meta line (`{TAG} · {meta}`). Left border = kind hue, **2px** (live → **3px**),
  `radius 8`, padding `6px 9px`, `shadow-1`. A **live** grain shows a 6px breathing pip before the
  title (1.8s). Self-injects its `gc-*` styles so it's portable.
- **`GrainCard`** — expanded variant (inspector/hover/focus): glyph + tag header, larger title,
  meta line.
- A relationship between two Grains is a **Link** (the swimmer "Link to…" action; not yet built).

---

## Interactions & behavior
- **Drill-down:** lane title → details (sets selected lane + page). **Back:** breadcrumb ‹
  Swimlanes button, or **⌘[**.
- **Zoom/pan:** ⌘/Ctrl+scroll zoom (anchored on NOW), scroll/drag pan. Pool also: widen/narrow
  columns, **Fit swimlanes** (auto-fit occupied lanes to width).
- **Live timers:** countdowns tick every second from a simulated clock; the live session bar
  re-grows to NOW each frame and breathes.
- **Feed ⇄ Split:** re-lays the grain chips (persisted in `localStorage["oaken-detail-layout"]`).
- **Action popover:** New Chat / Link to… / Finish swimmer — **stubs** (toast). Wire to core.
- **Theme switch / text size:** shared Header controls; instant; persisted.
- **Motion:** live-session glow/pulse + chip pip are gated by `@media (prefers-reduced-motion)`.
  Honor it.

## State management
App-level (`app.jsx`): `page` (`pool|details`), `lane` (selected), `theme` (persisted
`arbol-theme:oaken`, default `redwood`), `uiScale` (persisted `arbol-ui-font-scale:oaken`),
`layout` (`feed|split`, persisted), `toast`, and a ref to the pool's imperative control API
(widen/narrow/fit/isFit). Pool internals: `zoom`, `panX/panY`, `COLW`, `fitMode`. Details
internals: `zoom`, `panY`, live-tick.

**Real data:** lanes → swimmers → grains come from the core. A swimmer is a track rooted on a
source grain (its ticket) with `start`, a typed `wall` (`due` time + `estimated|due|deadline`),
optional `blocked`, and a list of child grains (each `{kind, …, t}` for marks or `{kind, …, s,e,
live?}` for spans, plus optional `state`). Wire timers/“live” to real session status.

## Design tokens
**`prototype/shared/tokens.css` (already in the repo) is the source of truth.** Oaken adds no new
tokens. Values it leans on:
- `--arbol-control-bar-height` (Header/Status Bar), `--arbol-space-1…6` (4/8/12/16/24/32),
  `--arbol-radius-s/m/l` (5/9/16), `--arbol-type-label/body/title` (11.5/13.5/16, all × the font
  scale), `--arbol-font-ui` (Hanken Grotesk), `--arbol-font-mono` (Spline Sans Mono — **all data**:
  times, %s, tags, countdowns), `--arbol-shadow-1/2/pop`, and the per-theme color set
  (`-bg/-surface/-surface-2/-border/-hairline/-text/-text-muted/-accent/-accent-ink/-accent-soft/
  -ok/-warn/-err`).
- **Oaken-specific layout constants** (currently literals — promote to tokens if you like):
  pool axis 64px / details axis 56px; pool `COLW` 150 (50–320); lane gap 8 / details column gap
  12; night gap 30px; day-page 08:00–20:00; spine width 26px (Feed) / 50% (Split); grain bar 6px
  (live 7px); grain dot 7px; min card slot 44px.
- **Grain hues** live in `GRAINS.KINDS` (oklch L0.70 C0.13), not in tokens — they're a data
  palette, intentionally theme-independent so a kind reads the same on any theme.

## Assets
No raster assets. All iconography is inline SVG (`RingsMark`, traffic lights) or text glyphs
(grain glyphs, wall icons ≈⚑⛔, ▸, breadcrumb chevrons). Fonts: Hanken Grotesk + Spline Sans Mono
(Google Fonts in the proto; self-host or use the fallbacks in the app).

## Files
- `prototype/Oaken.html` — entry (font + token + script load order; all CSS for the timeline,
  spine, grain placement, popover, toast).
- `prototype/shared/tokens.css` — design tokens + 12-theme ladder (already in repo).
- `prototype/shared/themes.jsx` — `window.THEMES` registry (already in repo).
- `prototype/shared/components.jsx` — shared DS components (already in repo).
- `prototype/shared/chrome.jsx` — `UIShell` + ThemeSwitcher (**port the two additive changes**).
- `prototype/shared/grains.jsx` — **the Grain kit (NEW shared subsystem to port).**
- `prototype/src/app.jsx` — window shell: pool⇄details nav, header controls, theme/font/layout,
  ⌘[, toast.
- `prototype/src/pool.jsx` — the Swimlanes pool (imperative; geometry documented above).
- `prototype/src/details.jsx` — the Swimlane Details page (spine + grains + Feed/Split + popover).
- `prototype/src/data.jsx` — **mock lanes/swimmers/grains (do not ship) + the time model +
  wall palette (port these).**

Open `prototype/Oaken.html` to interact with the reference.
