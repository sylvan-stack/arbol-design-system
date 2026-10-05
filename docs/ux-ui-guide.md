# Arbol — UX/UI Guide

> **Purpose.** Arbol is one product surfaced through several independent UIs. This guide
> defines the vocabulary, layout grammar, design tokens, and interaction rules that *every*
> UI shares, so the UIs stay consistent even though they ship as separate apps. Part 1 is
> common to all UIs. Parts 2+ are per-UI sections (Oaken, Seqoya Lab, …).
>
> Companion docs in `~/Artifacts/Arbol/`: `implementation-plan.md` (overall), the phase
> plans/results, and `seqoya-lab-plan.md` (the first UI build, which conforms to this guide).

---

## Part 1 — Common (all UIs)

### 1.1 The UI family

Arbol Root is headless. Each UI is a separate desktop window driven by the same core over
the existing WKWebView↔core bridge. UIs are named after **woods/trees** to keep the family
recognizable and on-theme with "Arbol".

| UI | Theme word | Focus |
| --- | --- | --- |
| **Oaken** | oak | Task management & delivery — the deep task-solving workspace; connects every source of information/expertise for analysis and solving. |
| **Elma Chat** | elm | Chat experience + document viewing/editing. |
| **Willo Station** | willow | Arbol→user communication outside regular chat: reminders, scheduled notifications/tasks, agent-initiated chats. |
| **Seqoya Lab** | sequoia | Intelligence Service features — set up & monitor Intelligence Providers and subscriptions. |

**Why separate UIs.** The user colocates them on monitors — sometimes all of them, sometimes
only the ones a task needs; a wide monitor enables side-by-side arrangements a single window
can't. Each UI is therefore its own OS window, summonable and focusable by **global hotkey**.

### 1.2 The three levels of structure

Every UI is described at exactly three levels. Naming the levels is what keeps layout talk
unambiguous.

| Level | Term | What it is | Referenced by |
| --- | --- | --- | --- |
| 1 | **Layer** | A z-axis plane. The flat layout lives on **Base**; modals/popovers/toasts/command-palette float on **Overlay**. | name — `Overlay` |
| 2 | **Region** | A top-level named area on a layer — the stable vocabulary. | name — `Canvas` |
| 3 | **Cell** | A grid slot inside a region (or the root grid). | coordinates — `R2C1` |

A full reference reads outer→inner: `Base > Canvas > R2C1`. Drop whatever's obvious from
context — usually you write just the leaf (`Canvas`, or `Canvas > R2C1`).

### 1.3 Addressing grammar

1. **Root = the UI name = the whole window area.** `Seqoya Lab`, `Oaken`.
2. **Hierarchy uses `>`**, outer→inner: `Seqoya Lab > Viewport > Navigation Panel > Navigation Tabs`.
   The bare-space form (`Oaken Tabs`) is prose shorthand only; canonical references use `>`.
3. **Section names are globally unique** across all UIs, so you normally write just the leaf
   (`Navigation Brief Pane`). Add the parent path *only* to disambiguate a generic name:
   `Oaken > Tabs` vs `Oaken > Right Panel > Tabs`.
4. **Brackets `[...]` = an active variant/state** driven by tab selection or logic.
   `Seqoya Lab[Intelligence Providers]` is the UI with that tab active. `Oaken[Chat Page]` is
   the page shown when its tab is selected; `Oaken Tabs` alone is the tab strip without any page.
5. **Coordinates** address cells inside a region or the root grid. A coordinate is
   `R<pos>C<pos>` where `<pos>` is either:
   - a **1-based index** — `1, 2, 3…` (the default; use this almost always), or
   - an **anchor** — `E` = last, `M` = middle. Use anchors only when you mean "whatever the
     last/middle one is" and want the reference to survive an added row/column. (`S`/start is
     just `1`.)
6. **Spans / whole lines:** `*` = the whole row/column, `:` = a range.
   - `R1C*` — all of row 1 (e.g. a bar spanning every column).
   - `R2C1:CE` — row 2, first column through last.
7. **Nesting in a coordinate path** drills into a cell: `R1CE > R1C1` = row 1 / last column,
   then inside it row 1 / column 1.

### 1.4 Section spec blocks

A section is *defined* by a spec block. Coordinates **place** it; they are never its identity.
A block carries any property that matters — width, height, layout direction, anchored tokens:

```
<UI>                      (root = whole window)
  R1  Header              width:100%   height:CONTROL_BAR_HEIGHT
  R2  Viewport            fill
  R3  Status Bar          width:100%   height:CONTROL_BAR_HEIGHT
```

Properties use design tokens (§1.7), never raw numbers, where a token exists.

### 1.5 Common chrome — every UI inherits these

Every UI's root grid is three full-width rows:

```
<UI>
  R1  Header       width:100%   height:CONTROL_BAR_HEIGHT
  R2  Viewport     fill                                   ← the only UI-specific region
  R3  Status Bar   width:100%   height:CONTROL_BAR_HEIGHT
```

- **Header** — top control bar: UI title/identity + global actions for that UI.
  All native shells include the shared completion-sound button: click to mute/unmute,
  hold for 450 ms (or press Arrow Down while focused) to open the 0–100% volume
  slider, and right-click to choose or preview a bundled sound. Escape or an outside
  click closes the popup. Volume, mute, and sound choice are shared across shells
  and persist across launches; Willo remains the completion-playback owner. Preview
  honours volume while bypassing mute. Existing Willo preferences are retained.
- **Viewport** — everything between Header and Status Bar; the UI's own content lives here.
- **Status Bar** — bottom control bar: ambient status, connection state, background activity.

Header and Status Bar are provided by the shared design-system so they look identical across
UIs. Only **Viewport** differs per UI.

### 1.6 Layers (z-axis)

- **Base** — the flat region layout (chrome + Viewport content).
- **Overlay** — floats above Base. Overlay pieces have shared, named component types:
  - **Modal** — focus-trapping dialog (e.g. an edit popup). Dims Base behind it.
  - **Popover** — small anchored panel (menus, hover actions).
  - **Toast** — transient bottom/corner notification.
  - **Palette** — command palette (keyboard-driven action search).

Refer to overlay content with the layer prefix when it matters: `Overlay > Intelligence Provider Edit`.

### 1.7 Design tokens

Tokens live in the shared design-system as CSS custom properties (`--arbol-*`) and are the
**only** allowed source for the values they name. Names used in spec blocks map 1:1 to a token.

| Token | Meaning | Notes |
| --- | --- | --- |
| `CONTROL_BAR_HEIGHT` | height of Header and Status Bar | fixed |
| `NAVIGATION_PANEL_WIDTH` | fixed width of a left Navigation Panel | fixed |
| `SPACE_1 … SPACE_6` | spacing scale | use instead of raw px gaps/padding |
| `RADIUS_S / RADIUS_M / RADIUS_L` | corner radii | |
| `COLOR_BG / COLOR_SURFACE / COLOR_BORDER` | base surfaces | |
| `COLOR_TEXT / COLOR_TEXT_MUTED` | text roles | |
| `COLOR_ACCENT / COLOR_OK / COLOR_WARN / COLOR_ERR` | semantic colors | `COLOR_OK` for "Success!" states |
| `BRIEF_PANE_BG_SILVER` | silver-ish background for a Navigation Brief Pane | see §3 |
| `FONT_UI / FONT_MONO` | type families | |
| `TYPE_LABEL / TYPE_BODY / TYPE_TITLE` | type scale roles | |

> Exact values are set in `packages/design-system/tokens.css`. This table is the contract;
> the file is the source of truth.

### 1.8 Styling rules

- **Tokens only.** No magic numbers for spacing, color, radius, type, or the named dimensions.
  If a value recurs, it becomes a token first.
- **Chrome is shared, never reimplemented.** Header/Status Bar/Viewport and the Overlay
  component types come from the design-system. A UI styles its *Viewport content*, not the chrome.
- **Semantic colors carry meaning, not decoration.** `COLOR_OK`/`COLOR_ERR` only for state.
- **One radius/elevation language** across UIs (defined by tokens), so a Card in Seqoya looks
  like a Card in Oaken.

### 1.9 Interaction rules

- **Hotkey-first.** Every UI is built to be driven by keyboard. Each UI is summoned/focused by
  a **global hotkey**: ⌘⌥⇧⌃S Seqoya Lab, ⌘⌥⇧⌃O Oaken, ⌘⌥⇧⌃W Willo Station, ⌘⌥⇧⌃E Elma Chat.
  The hotkeys live in the resident `com.arbol.ui-switcher` LaunchAgent (the same Swift shell
  running `--ui-switcher-agent`), so they cold-start a UI even when no Arbol UI is running;
  `UISwitcherHotkeysController` in every UI process defers to the agent via the shared
  singleton lock and takes the hotkeys back if the agent dies. Within a UI, primary actions
  have local hotkeys; document them in the UI's section.
- **Focus model.** Opening a Modal traps focus; `Esc` dismisses unless the Modal declares
  otherwise. Palette is the universal "do anything" entry point.
- **Consistency over cleverness.** The same gesture means the same thing in every UI.

### 1.10 Architecture (how "separate UIs" is realized)

Decided: **separate macOS apps, separate bundles, shared design-system.** Each
UI ships as its own `.app` (own bundle id + name → its own Cmd+Tab/Dock entry),
all built from one shared Swift shell stamped per-UI via an `ArbolUI` Info.plist
key, each registering its own global toggle hotkey.

```
renderer/
  packages/design-system/        @arbol/design-system  (the consistency layer)
      tokens.css                 §1.7 tokens
      chrome/                    Header, Viewport, StatusBar (§1.5)
      overlay/                   Modal, Popover, Toast, Palette (§1.6)
      components/                Card, Tabs, Dropdown, MultiSelect, …
      bridge/                    arbol.ts — the WKWebView↔core bridge (shared)
  apps/seqoya/                   own vite build → seqoya/index.html
  apps/oaken/   apps/elma/   apps/willo/
```

- Each app is an independent vite bundle that imports `@arbol/design-system`. The design-system
  is the single place that enforces this guide in code.
- **Each UI is its own `.app`** (its own process, `CFBundleIdentifier`, and name → its own
  Cmd+Tab/Dock entry), built from one shared Swift shell stamped per-UI via an `ArbolUI`
  Info.plist key that selects the renderer bundle and title. Each `.app` hosts one
  `WKWebView`. The global hotkeys ⌘⌥⇧⌃S/O/W/E are owned by the resident ui-switcher agent
  (`scripts/install-ui-switcher.sh` → `com.arbol.ui-switcher` LaunchAgent, the same shell
  binary run windowless at `.accessory` policy) and open the target UI — launching the
  bundle when it is not running, otherwise focusing it. They therefore work with no Arbol
  UI running; UI processes host them only as fallback if the agent is gone.
- The frozen Phase 1a renderer still builds (`apps/admin`) but is not stamped as a shipped UI app.

---

## Part 2 — Oaken (placeholder)

Oaken is the task-management & delivery UI — the deep task-solving workspace that connects every
source of information/expertise. Its Viewport layout (Tabs, pages, panels) is defined here once
design starts. It inherits all of Part 1. Known so far:

- `Oaken Tabs` — the tab strip (no page).
- `Oaken[<Page>]` — the active page when its tab is selected, e.g. `Oaken[Chat Page]`.

*(To be detailed in a later session.)*

---

## Part 3 — Seqoya Lab

The Intelligence Service UI: set up and monitor Intelligence Providers (IPs) and the
subscriptions behind them. First UI to be implemented — see `seqoya-lab-plan.md`.

### 3.1 Domain vocabulary

- **Provider** — a *kind* of intelligence (`claude`, `cursor`, …). A string, not a thing you edit.
- **Subscription** — an authenticated *account* behind a provider; owns credentials (in the
  Keychain), usage, and limits. Two Claude subscriptions are supported: **work** ("Example organization
  Claude") and **personal**.
- **Intelligence Provider (IP)** — a configured route/daemon that *binds to one subscription* and
  adds settings (default model, thinking level, repo rules). IPs are added programmatically only;
  the UI configures existing IPs, never creates them.

This is why the page has two sections: **Subscriptions Usage** (subscriptions) and **Intelligence
Providers List** (IPs) — two different entities, not two views of one.

Universe IP is retired from UI catalogs (2026-09-28): Elma and Willo provider
pickers and Seqoya provider settings/recipe pickers omit it, even if an older
daemon still reports it as active. Existing session and recipe route labels use
“Retired provider”. Driver code, persisted routes, history, artifacts, and the
shared Codex subscription remain intact; this presentation change does not migrate
or disable existing routes. Universe repository/entity references are unrelated
and remain visible.

### 3.2 Root grid

```
Seqoya Lab
  R1  Header
  R2  Viewport
  R3  Status Bar
```

### 3.3 Viewport

```
Seqoya Lab > Viewport     layout: 2 columns
  C1  Navigation Panel    width:NAVIGATION_PANEL_WIDTH (fixed)
  C2  Seqoya Page         width:fill
```

```
Navigation Panel          layout: 2 rows
  R1  Navigation Brief Pane
  R2  Navigation Tabs
```

- **Navigation Brief Pane** — visual cue, *not* information. Helps the user recognize the current
  page at a glance: a themed background + icon + a single short label. For
  `Seqoya Lab[Intelligence Providers]`: `BRIEF_PANE_BG_SILVER` background, a brain icon, label
  like `"Claude and Cursor configurations"` (or `"Claude, Cursor and Codex configurations"`).
- **Navigation Tabs** — two options: **Dashboard** (home page) and **Intelligence Providers**.

`Seqoya Page` (C2) is whatever the selected tab renders.

### 3.4 `Seqoya Lab[Dashboard]`

Home page of Seqoya Lab. *(Content TBD — out of scope for the first build; renders a minimal
landing state.)*

### 3.5 `Seqoya Lab[Intelligence Providers] > Seqoya Page`

```
Seqoya Page (Intelligence Providers)   layout: 2 rows
  R1  Subscriptions Usage
  R2  Intelligence Providers List
```

#### Subscriptions Usage (R1)

Lists every subscription with token/cost consumption where available.

- **Hover actions** (per subscription, provider-dependent). For a Claude Code subscription: a
  **Login** button → runs the Claude OAuth login flow (ported from Arco).
- **Usage metrics** below each subscription, provider-shaped:
  - Claude Code → limits info (5-hour / weekly caps).
  - Cursor → "Your included usage" and "On-Demand Usage" sections.
- **View Last Requests** — a link that expands the last **40** requests: datetime, tokens, model,
  cost.

#### Intelligence Providers List (R2)

UI **Cards**, one per IP, showing all info about the provider.

- **Test** button — sends a test message; shows **"Success!"** (`COLOR_OK`) when a non-error
  response is received.
- **Click a Card → `Overlay > Intelligence Provider Edit`** (a Modal). Editable settings depend
  on the IP. New IPs cannot be added here.

### 3.6 `Overlay > Intelligence Provider Edit` — Example organization Claude

The first IP to ship. Bound to the work Claude Code subscription. Editable settings:

1. **Make Default Intelligence Provider** — checkbox. The single global default IP across all
   working dirs.
2. **Make Default for Repos** — multiselect dropdown listing all repos under `~/repo`. When a
   chat opens from one of these repos, this IP is used.
3. **Make Prohibited for Repos** — multiselect of repos this IP must never serve.
4. **Default model** — dropdown.
5. **Default thinking level** — dropdown: `none, minimum, medium, high, xhigh, max, ultra`.

Routing precedence these settings feed (resolved at session creation, then handed to the existing
per-turn selector) is specified in `seqoya-lab-plan.md`.

## Part 4 — Elma Chat

### Retry with image attachments

Retry preserves every image on the failed Turn. Transcript images are stored
as blob references; Elma loads their bytes before sending the replacement
Turn. If any image cannot be loaded, the retry stops with an attachment error
and leaves the original Turn intact. Freshly pasted images use the same inline
submission format without a blob read.

<!-- sources:
Arbol:renderer/apps/elma/src/app/message-attachments.ts
Arbol:renderer/apps/elma/src/api.ts
Arbol:renderer/apps/elma/e2e/retry-image.e2e.mjs
-->

### Repository and Organization shortcuts

- **Cmd+1** opens a new Chat Session for Arbol. The fixed shortcut resolves
  capitalization differences against the repository catalog (for example,
  `arbol`); historical recent entries cannot add a second Arbol row.
- **Cmd+2** opens a new Chat Session for **Euro-Office**, using the `euro-office`
  Organization alias and its root folder from `~/.mycel/config.toml`.
- **Cmd+3–9** are assigned dynamically: recently opened repositories first,
  followed by the remaining repository catalog. Pinned targets are excluded.
- **Cmd+0** opens the “Other…” folder picker.

Organization shortcuts select the whole organizational folder; individual member
repositories retain their own navigation identity. Clicking a navigation row
changes the current Chat Session's working directory when a session is attached.
Number shortcuts always start a new Chat Session.

<!-- sources:
Arbol:renderer/apps/elma/src/nav/repoNavigation.ts
Arbol:renderer/apps/elma/src/App.svelte
Arbol:daemons/taproot/arbol_taproot/server.py
-->

### Meta Cockpit parent Chat Session

For an agent-created Chat Session with recorded parent provenance, Meta Cockpit
shows the parent as a standard Chat Session EntityChip. Cmd+Click opens that
parent in Elma; the chip title refreshes when the parent is renamed. The ongoing
control displays inherited state and writes to the ancestor that owns that state.
The child's transcript, execution controls, and token usage remain its own.

## Part 5 — Willo Station

### Chat Session read receipts

Opening a Chat Session marks it read. For a completed latest response shown in
Elma, focusing the window, returning to its visible view, clicking, or pressing a
key sends another read receipt even if that response was acknowledged earlier.
This allows an explicit read to clear an unread flag set by a later completion.
Automatic projection refreshes deduplicate successful receipts; simultaneous
interactions share an in-flight request, and failed requests remain retryable.
During session switches, the displayed projection must match the selected Chat
Session before Elma acknowledges its response.

### Stations and Agentic Stations

**Stations** contains human-initiated Chat Sessions and standalone Drafts.
**Agentic Stations** contains Chat Sessions whose recorded Initiator kind is
`agent`, `delegate`, or `steward`. Missing legacy Initiator values are treated as
human. The dedicated Stewards page remains available as a narrower view.

Both station pages share cards, section grouping, pagination, current-page
transcript search, title editing, context menus, and compact presentation.
Agentic Stations is also available through the native Go to Page picker using
`agentic-stations`.

For a parent-linked agentic Chat Session, ongoing, unread, and running/idle card
state are derived from the parent's current state. Inheritance follows nested
agent-created parents to the owning ancestor. Clearing or setting ongoing on
that ancestor updates its descendants; toggling ongoing on a child targets that
same ancestor's event stream. Opening a child does not mark its parent read.
Each child's execution state, live output, usage, and completion sound remain
independent of inherited card state.

Creation callers supply `parent_chat_session_id` with non-human Initiator
provenance in `chat_session.create` or `turn.submit.chat_session_creation`.
`initiator_id` remains the agent identity, not an overloaded parent identifier.
The parent edge is retained in `CHAT_SESSION_CREATED`, replayed into the Core
read model, and returned by list/get together with a `parent_chat_session`
presentation snapshot. Reads resolve parents outside the list limit, including
archived parents, in a batched ancestor query. Rootless chats and historical
chats with no recorded or available parent keep their own state; no parent is
inferred from titles, agent ids, or repository folders.

<!-- sources:
Arbol:renderer/apps/willo/src/App.svelte
Arbol:renderer/apps/willo/src/stations.ts
Arbol:renderer/apps/elma/src/nav/MetaCockpit.svelte
Arbol:daemons/core/arbol_core/db/agentic_sessions.py
Arbol:daemons/core/arbol_core/rpc/chat_session.py
Arbol:tests/unit/test_agentic_stations.py
Arbol:renderer/apps/willo/e2e/agentic-stations.e2e.mjs
-->
