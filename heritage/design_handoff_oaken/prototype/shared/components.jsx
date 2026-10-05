/* @arbol/design-system — shared components (ux-ui-guide.md §1.8), re-skinned.
 * Same API surface as the real DS (Button/Card/Tabs/Dropdown/MultiSelect/Field)
 * plus Meter + RingsMark (the sequoia growth-ring identity used app-wide).
 * Styled entirely from --arbol-* tokens. Exported to window for cross-file use. */
const { useState, useRef, useEffect } = React;

/* ── RingsMark ───────────────────────────────────────────────────────────
 * Concentric, slightly-offset growth rings: a sequoia cross-section that also
 * reads as "layers of intelligence". Replaces the brain emoji. Simple circles
 * only — composed, never hand-drawn detail. */
function RingsMark({ size = 26, color = "currentColor", strokeOpacities }) {
  const ops = strokeOpacities || [1, 0.62, 0.4, 0.26];
  const cx = size / 2, cy = size / 2;
  const radii = [0.46, 0.345, 0.235, 0.12].map((r) => r * size);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"
         style={{ display: "block", overflow: "visible" }}>
      {radii.map((r, i) => (
        <circle key={i} cx={cx + (i === 0 ? 0 : i * 0.45)} cy={cy - (i === 0 ? 0 : i * 0.35)}
                r={r} fill="none" stroke={color}
                strokeOpacity={ops[i]} strokeWidth={i === radii.length - 1 ? 1.4 : 1.2} />
      ))}
      <circle cx={cx + 1.5} cy={cy - 1.2} r={1.1} fill={color} />
    </svg>
  );
}

function Button({ children, onClick, kind = "default", disabled, size = "m", title }) {
  const [hover, setHover] = useState(false);
  const bg = kind === "primary" ? "var(--arbol-color-accent)"
    : kind === "ghost" ? "transparent"
    : kind === "soft" ? "var(--arbol-color-accent-soft)"
    : "var(--arbol-color-surface-2)";
  const color = kind === "primary" ? "var(--arbol-color-accent-ink)"
    : kind === "soft" ? "var(--arbol-color-accent)"
    : "var(--arbol-color-text)";
  const pad = size === "s" ? "5px 10px" : "var(--arbol-space-2) var(--arbol-space-3)";
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: bg, color,
        border: kind === "ghost" || kind === "default" ? "1px solid var(--arbol-color-border)" : "1px solid transparent",
        borderRadius: "var(--arbol-radius-m)",
        padding: pad,
        font: `500 ${size === "s" ? "12px" : "var(--arbol-type-body)"}/1 var(--arbol-font-ui)`,
        letterSpacing: 0.1,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
        filter: hover && !disabled ? "brightness(1.08)" : "none",
        transition: "filter .12s ease, transform .12s ease",
        transform: hover && !disabled ? "translateY(-0.5px)" : "none",
      }}>
      {children}
    </button>
  );
}

function Card({ children, onClick, style, interactive }) {
  const [hover, setHover] = useState(false);
  const clickable = !!onClick || interactive;
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--arbol-color-surface)",
        border: "1px solid var(--arbol-color-border)",
        borderRadius: "var(--arbol-radius-l)",
        padding: "var(--arbol-space-4)",
        cursor: clickable ? "pointer" : "default",
        boxShadow: hover && clickable ? "var(--arbol-shadow-2)" : "var(--arbol-shadow-1)",
        borderColor: hover && clickable ? "var(--arbol-color-text-muted)" : "var(--arbol-color-border)",
        transition: "box-shadow .15s ease, border-color .15s ease, transform .15s ease",
        transform: hover && clickable ? "translateY(-1px)" : "none",
        ...style,
      }}>
      {children}
    </div>
  );
}

function Tabs({ tabs, active, onSelect, vertical }) {
  return (
    <div style={{
      display: "flex", flexDirection: vertical ? "column" : "row",
      gap: "var(--arbol-space-1)", padding: "var(--arbol-space-2)",
    }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button key={t.id} onClick={() => onSelect(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: "var(--arbol-space-2)",
              textAlign: "left",
              background: on ? "var(--arbol-color-surface-2)" : "transparent",
              color: on ? "var(--arbol-color-text)" : "var(--arbol-color-text-muted)",
              border: "1px solid " + (on ? "var(--arbol-color-border)" : "transparent"),
              borderRadius: "var(--arbol-radius-m)",
              padding: "9px var(--arbol-space-3)",
              font: "500 var(--arbol-type-body)/1 var(--arbol-font-ui)",
              cursor: "pointer", transition: "background .12s, color .12s",
            }}>
            {t.icon ? <span style={{ opacity: on ? 1 : 0.7, display: "flex" }}>{t.icon}</span> : null}
            <span style={{ flex: 1 }}>{t.label}</span>
            {on ? <span style={{ width: 4, height: 4, borderRadius: 99, background: "var(--arbol-color-accent)" }} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Dropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find((o) => o.value === value) || options[0] || { label: "" };
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
          background: "var(--arbol-color-surface-2)", color: "var(--arbol-color-text)",
          border: "1px solid " + (open ? "var(--arbol-color-accent)" : "var(--arbol-color-border)"),
          borderRadius: "var(--arbol-radius-m)", padding: "var(--arbol-space-2) var(--arbol-space-3)",
          font: "400 var(--arbol-type-body)/1.2 var(--arbol-font-ui)", cursor: "pointer",
        }}>
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur.label}</span>
        <span style={{ color: "var(--arbol-color-text-muted)", fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 50,
          maxHeight: 240, overflow: "auto",
          background: "var(--arbol-color-surface)", border: "1px solid var(--arbol-color-border)",
          borderRadius: "var(--arbol-radius-m)", boxShadow: "var(--arbol-shadow-pop)", padding: 4,
        }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  background: on ? "var(--arbol-color-accent-soft)" : "transparent",
                  border: 0, borderRadius: "var(--arbol-radius-s)", padding: "7px var(--arbol-space-2)", cursor: "pointer",
                  color: on ? "var(--arbol-color-accent)" : "var(--arbol-color-text)",
                  font: "500 var(--arbol-type-body)/1.2 var(--arbol-font-ui)",
                }}>
                <span style={{ flex: 1 }}>{o.label}</span>
                {on ? <span style={{ fontSize: 12 }}>✓</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MultiSelect({ options, selected, onChange, placeholder = "Select…" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const set = new Set(selected);
  const toggle = (v) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange([...next]);
  };
  const labelFor = (v) => (options.find((o) => o.value === v) || {}).label || v;
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6,
          minHeight: 34, flexWrap: "wrap",
          background: "var(--arbol-color-surface-2)",
          color: selected.length ? "var(--arbol-color-text)" : "var(--arbol-color-text-muted)",
          border: "1px solid " + (open ? "var(--arbol-color-accent)" : "var(--arbol-color-border)"),
          borderRadius: "var(--arbol-radius-m)",
          padding: "6px var(--arbol-space-3)",
          font: "400 var(--arbol-type-body)/1.2 var(--arbol-font-ui)", cursor: "pointer",
        }}>
        {selected.length === 0 && <span style={{ flex: 1 }}>{placeholder}</span>}
        {selected.map((v) => (
          <span key={v} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "var(--arbol-color-accent-soft)", color: "var(--arbol-color-accent)",
            borderRadius: "var(--arbol-radius-s)", padding: "2px 7px",
            font: "500 var(--arbol-type-label)/1.3 var(--arbol-font-mono)", whiteSpace: "nowrap",
          }}>
            {labelFor(v)}
            <span onClick={(e) => { e.stopPropagation(); toggle(v); }}
              style={{ cursor: "pointer", opacity: 0.7, fontSize: 12 }}>×</span>
          </span>
        ))}
        <span style={{ marginLeft: "auto", paddingLeft: 6, color: "var(--arbol-color-text-muted)", fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 30,
          maxHeight: 220, overflow: "auto",
          background: "var(--arbol-color-surface)", border: "1px solid var(--arbol-color-border)",
          borderRadius: "var(--arbol-radius-m)", boxShadow: "var(--arbol-shadow-pop)", padding: 4,
        }}>
          {options.length === 0 && (
            <div style={{ padding: "var(--arbol-space-3)", color: "var(--arbol-color-text-muted)" }}>No repos found</div>
          )}
          {options.map((o) => {
            const on = set.has(o.value);
            return (
              <label key={o.value} style={{
                display: "flex", alignItems: "center", gap: "var(--arbol-space-2)",
                padding: "7px var(--arbol-space-2)", cursor: "pointer", borderRadius: "var(--arbol-radius-s)",
                background: on ? "var(--arbol-color-accent-soft)" : "transparent",
              }}>
                <span style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                  border: "1px solid " + (on ? "var(--arbol-color-accent)" : "var(--arbol-color-border)"),
                  background: on ? "var(--arbol-color-accent)" : "transparent",
                  color: "var(--arbol-color-accent-ink)", display: "grid", placeItems: "center", fontSize: 10,
                }}>{on ? "✓" : ""}</span>
                <span style={{ font: "400 var(--arbol-type-body)/1.2 var(--arbol-font-mono)" }}>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: "var(--arbol-space-4)" }}>
      <div style={{
        fontSize: "var(--arbol-type-label)", color: "var(--arbol-color-text-muted)",
        marginBottom: "var(--arbol-space-2)", textTransform: "uppercase",
        letterSpacing: 0.7, fontWeight: 600,
      }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: "var(--arbol-type-label)", color: "var(--arbol-color-text-muted)", marginTop: 6, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{hint}</div>}
    </label>
  );
}

/* Usage meter — the data-bearing bar. Color reflects pressure (ok/warn/err). */
function Meter({ title, meter }) {
  const pct = Math.max(0, Math.min(100, meter.percentUsed));
  const color = pct >= 90 ? "var(--arbol-color-err)" : pct >= 70 ? "var(--arbol-color-warn)" : "var(--arbol-color-ok)";
  return (
    <div style={{ marginTop: "var(--arbol-space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "var(--arbol-type-label)" }}>
        <span style={{ color: "var(--arbol-color-text)", fontWeight: 500, whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ color: "var(--arbol-color-text-muted)", fontFamily: "var(--arbol-font-mono)", whiteSpace: "nowrap", paddingLeft: 10 }}>{meter.displayText}</span>
      </div>
      <div style={{ height: 7, background: "var(--arbol-color-surface-2)", borderRadius: 99, marginTop: 5, overflow: "hidden", border: "1px solid var(--arbol-color-hairline)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width .6s cubic-bezier(.2,.7,.2,1)" }} />
      </div>
      {meter.resetInfo && (
        <div style={{ fontSize: "var(--arbol-type-label)", color: "var(--arbol-color-text-muted)", marginTop: 4 }}>{meter.resetInfo}</div>
      )}
    </div>
  );
}

/* Tiny status dot. */
function Dot({ color = "var(--arbol-color-ok)", pulse }) {
  return <span style={{
    width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0,
    boxShadow: pulse ? `0 0 0 0 ${color}` : "none",
    animation: pulse ? "arbolpulse 2s infinite" : "none",
  }} />;
}

Object.assign(window, { RingsMark, Button, Card, Tabs, Dropdown, MultiSelect, Field, Meter, Dot });
