# Arbol design loop — working with design from both sides

> **The problem this solves.** Arbol's UI evolves from two directions: design work
> (often sketched in a sandboxed Claude artifact) and renderer-born components that
> later want better styling. Round-tripping through a hand-maintained prototype loses
> changes. This is the reliable alternative: **Storybook is the single source of truth
> for what exists and how it looks**, and the sandbox is demoted to a throwaway
> sketchpad. There is only one copy of each component, so nothing can drift.

Run it: `cd renderer && npm run storybook` → http://localhost:6006.
Build a static catalog: `npm run build-storybook`.

---

## The one principle

**Edit the real component in the repo; never round-trip through the sandbox.**

A sandboxed artifact (claude.ai) can't import the real `@arbol/design-system` or run
Vite, so anything built there is a *separate copy* that drifts. So:

- **Ideate** a new look in the artifact if you like — fast, visual, throwaway. Its
  output is *intent* (a mockup, rough CSS), never the authoritative result.
- **Commit the change in the repo**, against the real component in Storybook, where it
  hot-reloads across all 12 themes. That edit *is* what ships.

If the artifact needs to see current components, hand it **screenshots of the
Storybook stories** — it's a reference consumer, not a source.

---

## Skin vs skeleton — what each side owns

Every component is two layers, and only one round-trips:

| Layer | What | Where | Who edits |
| --- | --- | --- | --- |
| **Skin** | colors, radii, type, spacing, the visual language | token-based CSS classes (`oaken.css`, `willo.css`, the Entity kit's `ec-*`) + inline `style` using `--arbol-*` tokens | **design leads** — pure CSS/tokens |
| **Skeleton** | structure, computed geometry, solvers, gestures, logic | TSX (`Swimlanes.tsx` geometry, `placeCards`, zoom/pan, the event fold) | **code leads** — never a design concern |

**The contract:** class names + DOM structure are the interface. A restyle changes CSS
class bodies and token values; renaming a class or changing structure is a *skeleton*
change and goes through code. The more a component keeps its look in token-based
classes and CSS variables (e.g. the Entity kit's `--ec-line`, the spine's `--spine`),
the more of it is restyleable without touching logic — the entity kit is the model.

Three kinds of change map cleanly:

- **New shared primitive** (a token, a DS component) → design proposes, the design
  system (`packages/design-system`) owns it. Add a story.
- **New page / feature** → design leads the layout; the renderer implements it.
- **Restyle a renderer-born component** → design owns its **skin** (CSS + tokens),
  code owns its **skeleton**. Edit the CSS against its Storybook story.

---

## The restyle loop (the common case)

1. Open the component's story in Storybook (`npm run storybook`).
2. Switch the theme toolbar to the theme(s) you care about (all 12 are wired).
3. Edit the **skin** — the component's CSS file / token values. The real component
   hot-reloads in every theme.
4. (Optional) capture a visual diff — see *Detecting & accepting change* below.
5. Commit. No prototype, no snapshot, no diff-to-apply.

---

## How the catalog is organized

Stories run the **real** components — `.storybook/main.ts` aliases `@arbol/design-system`
to source and globs `packages/**` + `apps/**`. The sidebar:

- **Design System** — `Components`, `Chrome`, `Overlay/Modal`, `Entity Kit`, `ComingSoon`
  (`packages/design-system/src/**`).
- **Oaken** — `Swimlanes Pool`, `Swimlane Details`, `Controls`.
- **Willo** — `Components` (the 6 monitor surfaces), `Monitor (App)`.
- **Seqoya** — `Dashboard`, `NavigationPanel`, `CommandPalette`, `SubscriptionRow`,
  `IpCard`, `IP Edit Modal`, `Intelligence Providers (Page)`.
- **Elma** — `Chat`, `Branching`, `Quick`, `Components`, `HistoryOverlay`,
  `NavigationPanel`, `Page (Full)`.
- **Internal / Bridge Harness** — proves the core-bridge stub.

Theme switching is `withThemeByDataAttribute` in `.storybook/preview.tsx` — it sets
`data-theme` on `<html>`, exactly as each app's `App.tsx` does, and loads
`tokens.css` once.

---

## Conventions (follow these when adding stories)

1. **Fixtures never ship.** Mock data lives in each app's `src/stories.fixtures.ts`
   (or inside the `*.stories.tsx`). The app entry (`main.tsx`) never imports stories
   or fixtures, so Vite tree-shakes them out of the shipped bundle — honoring the
   "no mock data ships" handoff rule. Prefer deriving fixtures from the app's own
   helpers (Oaken reuses its time model; Willo derives views via the real `monitor.ts`
   fold; Elma reuses `seedTree()`/`mockAnswer()`).
2. **Prefer prop-driven stories.** Most components take their data via props and need
   no bridge. Reach for the bridge stub only for `App`/page stories that call the core.
3. **Stateful components need a controlled wrapper** in the story (Tabs, Dropdown,
   MultiSelect, ThemeSwitcher, Modal, the Feed/Split `Seg`, the composer): a small
   `render: () => { const [v, setV] = useState(...); return <C .../> }`.
4. **Height for fill-the-viewport surfaces.** Timeline/monitor/chat/page components are
   `height:100%` — wrap them in a host with a definite height (`82vh`, `560`).
5. **Class-based skins must import their CSS.** Oaken stories `import './oaken.css'`,
   Willo stories `import './willo.css'`. The DS + Seqoya + Elma are inline-token styled
   (no CSS import needed).
6. **Overlays story full-viewport** with a reopen host (Modal, ConfirmDialog,
   QuickActions, HistoryOverlay, CommandPalette dismiss on backdrop/Esc).
7. **Verify props against the source** before writing a story — components are under
   active development.

### Adding a story (recipe)

```tsx
// apps/<ui>/src/<area>/<Thing>.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Thing } from './Thing'
// import './<ui>.css'            // only if the skin is class-based
const meta = { component: Thing, title: '<Ui>/<Thing>', tags: ['autodocs'] } satisfies Meta<typeof Thing>
export default meta
export const Default: StoryObj<typeof meta> = { args: { /* … */ } }
```

---

## The bridge harness — `@arbol/storybook-bridge`

Page/`App` stories that call the core (`call` / `callNative` / `subscribe` from
`@arbol/design-system`) use the stub at [.storybook/bridge-stub.tsx](.storybook/bridge-stub.tsx),
aliased as `@arbol/storybook-bridge`. It matches the real protocol in
`design-system/src/bridge/arbol.ts`.

```tsx
import { withBridge } from '@arbol/storybook-bridge'

export const Loaded = {
  decorators: [withBridge({
    rpc:     { 'ip.list': () => ({ ips: [...] }) },        // call()  — Seqoya, Elma
    native:  { 'webUsage.fetch': () => ({ ok: true, ... }) }, // callNative()
    streams: { 'events.all': (emit) => events.forEach(emit) }, // subscribe() — Willo, Elma
    latencyMs: 150, // so loading states are visible
  })],
}
```

It installs during render (before the story's child effects fire `call`/`subscribe`)
and tears down on unmount. See `Internal/Bridge Harness` for a live RPC + stream demo.
Component stories that take data via props need none of this.

---

## Detecting & accepting external change (the enforcement layer)

The other half of "how do I let design know something changed and accept it" is
**visual regression**: every appearance change to any story becomes a reviewable image
diff you approve or reject — and a restyle that breaks another state shows up too.

- **`npm run test-storybook`** (wired: `vitest.config.ts` + `@storybook/addon-vitest`
  + Playwright) renders **every** story in headless chromium. Today it's a runtime
  **smoke test** — every story must mount without throwing (it reuses `.storybook/main.ts`,
  so the `@arbol/*` aliases resolve). It's also the hook for screenshot diffs.
- **Chromatic** for cloud visual review across themes/branches: `@chromatic-com/storybook`
  is installed; needs a project token + a CI step (`npx chromatic`).

Two green-on-every-change gates: `npm run build-storybook` (compile) and
`npm run test-storybook` (render).

---

## Where the rest lives

- Implementation specs that produced this catalog: [docs/plans/storybook-stories/](../docs/plans/storybook-stories/).
- The design grammar/tokens contract: `~/Artifacts/Arbol/ux-ui-guide.md`.
- Tokens are the source of truth in `packages/design-system/src/tokens.css`; the guide
  table is the contract.
