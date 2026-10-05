/* Common chrome (ux-ui-guide.md §1.5): Header / Viewport / Status Bar, three
 * full-width rows at CONTROL_BAR_HEIGHT. Wrapped in a macOS window frame so the
 * prototype reads as a real floating .app. Header carries the theme switcher. */
const { useState: useStateC, useRef: useRefC, useEffect: useEffectC } = React;

function TrafficLights() {
  const dots = ["#ff5f57", "#febc2e", "#28c840"];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {dots.map((c, i) => (
        <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: c,
          boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.25)" }} />
      ))}
    </div>
  );
}

function ThemeSwitcher({ theme, onTheme }) {
  const [open, setOpen] = useStateC(false);
  const ref = useRefC(null);
  useEffectC(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = THEMES.find((t) => t.id === theme) || THEMES[0];
  const Swatch = ({ t, size = 14 }) => (
    <span style={{ width: size, height: size, borderRadius: 99, background: t.bg,
      border: "1px solid rgba(128,128,128,0.4)", display: "grid", placeItems: "center", flexShrink: 0 }}>
      <span style={{ width: size * 0.5, height: size * 0.5, borderRadius: 99, background: t.accent }} />
    </span>
  );
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button onClick={() => setOpen((o) => !o)} title="Switch color schema"
        style={{
          display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
          background: "var(--arbol-color-surface-2)", border: "1px solid var(--arbol-color-border)",
          borderRadius: 99, padding: "4px 9px 4px 5px",
          color: "var(--arbol-color-text-muted)", font: "500 var(--arbol-type-label)/1 var(--arbol-font-ui)",
        }}>
        <Swatch t={cur} />
        {cur.name}
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, minWidth: 210,
          maxHeight: 420, overflow: "auto",
          background: "var(--arbol-color-surface)", border: "1px solid var(--arbol-color-border)",
          borderRadius: "var(--arbol-radius-m)", boxShadow: "var(--arbol-shadow-pop)", padding: 5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--arbol-type-label)", color: "var(--arbol-color-text-muted)",
            textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600, padding: "5px 8px 8px", whiteSpace: "nowrap" }}>
            Color schema
            <span style={{ flex: 1 }} />
            <span style={{ font: "500 9px/1 var(--arbol-font-mono)", letterSpacing: 0.3, whiteSpace: "nowrap" }}>dark → light</span>
          </div>
          {/* the brightness ladder, visualized */}
          <div style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden", margin: "0 6px 7px" }}>
            {THEMES.map((t) => <span key={t.id} style={{ flex: 1, background: t.bg }} />)}
          </div>
          {THEMES.map((t, i) => {
            const on = t.id === theme;
            return (
              <button key={t.id} onClick={() => { onTheme(t.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                  background: on ? "var(--arbol-color-surface-2)" : "transparent",
                  border: "1px solid " + (on ? "var(--arbol-color-border)" : "transparent"),
                  borderRadius: "var(--arbol-radius-s)", padding: "6px 8px", cursor: "pointer",
                  color: "var(--arbol-color-text)", font: "500 var(--arbol-type-body)/1 var(--arbol-font-ui)",
                }}>
                <span style={{ width: 16, textAlign: "right", color: "var(--arbol-color-text-muted)", font: "500 var(--arbol-type-label)/1 var(--arbol-font-mono)" }}>{String(i + 1).padStart(2, "0")}</span>
                <Swatch t={t} size={16} />
                <span style={{ flex: 1 }}>{t.name}</span>
                {on ? <span style={{ color: "var(--arbol-color-accent)", fontSize: 12 }}>✓</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KbdHint({ k }) {
  return <kbd style={{
    font: "500 var(--arbol-type-label)/1 var(--arbol-font-mono)", color: "var(--arbol-color-text-muted)",
    background: "var(--arbol-color-surface-2)", border: "1px solid var(--arbol-color-border)",
    borderRadius: 5, padding: "3px 6px",
  }}>{k}</kbd>;
}

/* Text-size stepper — dumb control; each UI wires its own inc/dec logic
 * (single-axis for Seqoya, UI+content dual-axis for Elma). */
function FontSizeControl({ onInc, onDec, canInc = true, canDec = true, title }) {
  const btn = (disabled) => ({
    width: 22, height: 22, display: "grid", placeItems: "center",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
    background: "var(--arbol-color-surface-2)", border: "1px solid var(--arbol-color-border)",
    borderRadius: 7, color: "var(--arbol-color-text-muted)", font: "600 14px/1 var(--arbol-font-ui)",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }} title={title || "Text size"}>
      <button style={btn(!canDec)} disabled={!canDec} onClick={onDec} aria-label="Decrease text size">−</button>
      <span style={{ width: 16, textAlign: "center", font: "700 11px/1 var(--arbol-font-ui)", color: "var(--arbol-color-text-muted)", userSelect: "none" }}>A</span>
      <button style={btn(!canInc)} disabled={!canInc} onClick={onInc} aria-label="Increase text size">+</button>
    </div>
  );
}

/* BriefPane (ux-ui-guide.md §3.3) — the shared per-page visual cue, now used by
 * every UI. Themed silver base + a per-PAGE identity: a unique `glyph` (large &
 * faint, bleeding the top-right corner) and a `hue` offset that rotates the
 * silver so each page reads a distinct color while staying inside the theme.
 * `ui` is the UI family tag (SEQOYA / ELMA); `glyph` should be an SVG that fills
 * its box (width/height 100%, currentColor). */
function BriefPane({ ui, label, sub, glyph, hue = 0 }) {
  return (
    <div style={{
      margin: "var(--arbol-space-3)", padding: "var(--arbol-space-4)",
      borderRadius: "var(--arbol-radius-l)", color: "var(--arbol-brief-pane-fg)",
      position: "relative", overflow: "hidden", minHeight: 104,
      display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2,
      boxShadow: "var(--arbol-shadow-1)",
    }}>
      {/* themed silver base, hue-rotated per page */}
      <div style={{ position: "absolute", inset: 0,
        background: "var(--arbol-brief-pane-bg-silver)", filter: `hue-rotate(${hue}deg)` }} />
      {/* the page glyph, large & faint, bleeding the corner — the unique cue */}
      <div style={{ position: "absolute", top: -22, right: -20, width: 132, height: 132,
        opacity: 0.46, color: "var(--arbol-brief-ring)" }}>{glyph}</div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 15, height: 15, display: "inline-flex", flexShrink: 0 }}>{glyph}</span>
        <span style={{ font: "600 var(--arbol-type-label)/1 var(--arbol-font-mono)",
          letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.7 }}>{ui}</span>
      </div>
      <div style={{ position: "relative", fontWeight: 700, fontSize: "var(--arbol-type-title)", lineHeight: 1.15, whiteSpace: "pre-line" }}>{label}</div>
      {sub != null && <div style={{ position: "relative", fontSize: "var(--arbol-type-label)", opacity: 0.82 }}>{sub}</div>}
    </div>
  );
}

Object.assign(window, { UIShell, KbdHint, BriefPane });

function UIShell({ title, theme, onTheme, status, children, fontCtl, maxWidth = 1180, headerLead, headerExtras }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "grid", placeItems: "center",
      padding: 28, boxSizing: "border-box",
    }}>
      <div data-screen-label={title} style={{
        width: `min(${maxWidth}px, 100%)`, height: "min(760px, 100%)",
        display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "var(--arbol-control-bar-height) 1fr var(--arbol-control-bar-height)",
        background: "var(--arbol-color-bg)", color: "var(--arbol-color-text)",
        borderRadius: 14, overflow: "hidden",
        border: "1px solid var(--arbol-color-border)",
        boxShadow: "0 40px 120px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--arbol-space-3)",
          padding: "0 var(--arbol-space-4) 0 var(--arbol-space-4)",
          background: "color-mix(in oklch, var(--arbol-color-accent) 16%, var(--arbol-color-surface))",
          borderBottom: "1px solid var(--arbol-color-border)",
          fontSize: "var(--arbol-type-label)", color: "var(--arbol-color-text-muted)", userSelect: "none", minWidth: 0,
        }}>
          <TrafficLights />
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginLeft: 14 }}>
            <span style={{ color: "var(--arbol-color-accent)", display: "flex" }}>
              <RingsMark size={20} color="var(--arbol-color-accent)" />
            </span>
            <span style={{ color: "var(--arbol-color-text)", fontWeight: 700, fontSize: "var(--arbol-type-body)", letterSpacing: 0.2, whiteSpace: "nowrap" }}>{title}</span>
          </div>
          {headerLead != null ? headerLead : null}
          <span style={{ flex: 1, WebkitAppRegion: "drag" }} />
          {headerExtras != null ? headerExtras : null}
          <FontSizeControl {...(fontCtl || {})} />
          <ThemeSwitcher theme={theme} onTheme={onTheme} />
        </div>

        {/* Viewport */}
        <div style={{ minHeight: 0, minWidth: 0, overflow: "hidden" }}>{children}</div>

        {/* Status Bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--arbol-space-3)",
          padding: "0 var(--arbol-space-4)",
          background: "color-mix(in oklch, var(--arbol-color-accent) 16%, var(--arbol-color-surface))",
          borderTop: "1px solid var(--arbol-color-border)",
          fontSize: "var(--arbol-type-label)", color: "var(--arbol-color-text-muted)", userSelect: "none",
          whiteSpace: "nowrap",
        }}>
          {status}
        </div>
      </div>
    </div>
  );
}
