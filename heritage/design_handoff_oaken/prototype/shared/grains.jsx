/* @arbol/design-system — Grain kit (ux-ui-guide.md §1.9).
 *
 * A GRAIN is any first-class Arbol citizen — chat session, agent session, merge
 * request, commit, ticket, artifact, requirement, invariant… In wood, *the grain*
 * is the through-line that records the tree's whole history; every Grain is one
 * strand of that record. Used across all four UIs.
 *
 * Each Grain has:
 *   • kind   — its type (key into GRAINS.KINDS): glyph + tag + label + hue + family.
 *   • shape  — how it renders in time:
 *        span  → has duration            → a BAR  (chat / agent sessions; live → grows to NOW)
 *        mark  → a single point in time   → a DOT + chip (mr / commit / ticket / state)
 *        note  → durable, authored        → listed/inspected; pins to a time as a mark
 *   • family — activity (it happened) | knowledge (it was authored)
 *
 * Render any Grain with <GrainChip> (compact, the timeline/list unit) or
 * <GrainCard> (expanded). A relationship between two Grains is a Link. */

window.GRAINS = {
  KINDS: {
    ticket:      { tag: "TICKET", label: "Ticket",        shape: "mark", family: "activity",  hue: 256, glyph: "▣" },
    mr:          { tag: "MR",     label: "Merge request", shape: "mark", family: "activity",  hue: 150, glyph: "⇄" },
    commit:      { tag: "PUSH",   label: "Commit",        shape: "mark", family: "activity",  hue: 200, glyph: "●" },
    state:       { tag: "STATE",  label: "State change",  shape: "mark", family: "activity",  hue: 28,  glyph: "◆" },
    chat:        { tag: "CHAT",   label: "Chat session",  shape: "span", family: "activity",  hue: 34,  glyph: "❝" },
    agent:       { tag: "AGENT",  label: "Agent session", shape: "span", family: "activity",  hue: 300, glyph: "✦" },
    artifact:    { tag: "ART",    label: "Artifact",      shape: "note", family: "knowledge", hue: 210, glyph: "◫" },
    requirement: { tag: "REQ",    label: "Requirement",   shape: "note", family: "knowledge", hue: 95,  glyph: "§" },
    invariant:   { tag: "INV",    label: "Invariant",     shape: "note", family: "knowledge", hue: 322, glyph: "∎" },
  },
  ORDER: ["ticket", "mr", "commit", "state", "chat", "agent", "artifact", "requirement", "invariant"],
  /* a mark/span can carry a state that recolours it (MR open/merged, swimmer blocked…) */
  STATE_HUE: { open: 64, merged: 150, closed: 28, started: 200, blocked: 25, finished: 150, review: 256 },

  meta(kind) { return this.KINDS[kind] || this.KINDS.chat; },
  shapeOf(kind) { return this.meta(kind).shape; },
  hueOf(kind, state) { return state != null && this.STATE_HUE[state] != null ? this.STATE_HUE[state] : this.meta(kind).hue; },
  line(kind, state) { return `oklch(0.70 0.13 ${this.hueOf(kind, state)})`; },
  soft(kind, a = 22, state) { return `color-mix(in oklch, oklch(0.72 0.12 ${this.hueOf(kind, state)}) ${a}%, var(--arbol-color-surface))`; },
};

/* Self-contained styles (gc- prefix) so the chip is portable into any UI. */
(function () {
  if (document.getElementById("arbol-grain-styles")) return;
  const s = document.createElement("style");
  s.id = "arbol-grain-styles";
  s.textContent = `
    @keyframes gc-breathe { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
    .gc { display: flex; align-items: flex-start; gap: 7px; max-width: 100%; min-width: 0;
      background: var(--arbol-color-surface); border: 1px solid var(--arbol-color-border);
      border-left: 2px solid var(--gc-line); border-radius: 8px; padding: 6px 9px; box-shadow: var(--arbol-shadow-1); }
    .gc.live { border-left-width: 3px; }
    .gc-glyph { font-size: calc(12px * var(--arbol-font-scale)); line-height: 1.1; flex-shrink: 0; }
    .gc-body { min-width: 0; }
    .gc-title { font: 600 calc(11px * var(--arbol-font-scale))/1.2 var(--arbol-font-ui); color: var(--arbol-color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gc-meta { margin-top: 2px; font: 500 calc(8.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono); color: var(--arbol-color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gc-tag { letter-spacing: .5px; }
    .gc-live { display: inline-block; width: 6px; height: 6px; border-radius: 99px; margin-right: 5px; vertical-align: middle; animation: gc-breathe 1.8s ease-in-out infinite; }
    /* expanded card */
    .gc-card { display: block; background: var(--arbol-color-surface); border: 1px solid var(--arbol-color-border);
      border-left: 3px solid var(--gc-line); border-radius: 10px; padding: 10px 12px; box-shadow: var(--arbol-shadow-1); }
    .gc-card .gc-card-head { display: flex; align-items: center; gap: 7px; }
    .gc-card .gc-card-glyph { font-size: calc(13px * var(--arbol-font-scale)); }
    .gc-card .gc-card-kind { font: 600 calc(9px * var(--arbol-font-scale))/1 var(--arbol-font-mono); letter-spacing: .6px; }
    .gc-card .gc-card-title { margin-top: 7px; font: 600 calc(13px * var(--arbol-font-scale))/1.3 var(--arbol-font-ui); color: var(--arbol-color-text); }
    .gc-card .gc-card-meta { margin-top: 4px; font: 500 calc(9.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono); color: var(--arbol-color-text-muted); }
    @media (prefers-reduced-motion: reduce) { .gc-live { animation: none; opacity: 1; } }
  `;
  document.head.appendChild(s);
})();

/* GrainChip — the canonical compact render of any Grain (timeline / list / picker). */
function GrainChip({ grain }) {
  const G = window.GRAINS, k = G.meta(grain.kind), line = G.line(grain.kind, grain.state);
  return (
    <div className={"gc" + (grain.live ? " live" : "")} style={{ ["--gc-line"]: line }} title={grain.title}>
      <span className="gc-glyph" style={{ color: line }}>{k.glyph}</span>
      <div className="gc-body">
        <div className="gc-title">{grain.live && <span className="gc-live" style={{ background: line }} />}{grain.title}</div>
        <div className="gc-meta"><span className="gc-tag" style={{ color: line }}>{k.tag}</span>{grain.meta ? " · " + grain.meta : ""}</div>
      </div>
    </div>
  );
}

/* GrainCard — expanded render (inspector / hover / focus). */
function GrainCard({ grain }) {
  const G = window.GRAINS, k = G.meta(grain.kind), line = G.line(grain.kind, grain.state);
  return (
    <div className="gc-card" style={{ ["--gc-line"]: line }}>
      <div className="gc-card-head">
        <span className="gc-card-glyph" style={{ color: line }}>{k.glyph}</span>
        <span className="gc-card-kind" style={{ color: line }}>{k.tag}</span>
        {grain.live && <span className="gc-live" style={{ background: line }} />}
      </div>
      <div className="gc-card-title">{grain.title}</div>
      {grain.meta && <div className="gc-card-meta">{grain.meta}</div>}
    </div>
  );
}

Object.assign(window, { GrainChip, GrainCard });
