/* Oaken root (ux-ui-guide.md Part 2). A real shared-chrome window with two pages:
 *   pool     — the full swimlane pool (mountPool, imperative, ported sketch)
 *   details  — Oaken[Swimlane Details], opened by clicking a lane title
 * Owns: page + selected lane, theme, font scale, the Details layout direction,
 * item-type visibility, and the per-page Header controls (via UIShell slots). */
const { useState: useStateO, useEffect: useEffectO, useRef: useRefO } = React;

const OAK_FONT_MAX = 23 / 13.5, OAK_FONT_MIN = 11.5 / 13.5;
const oakR2 = (v) => Math.round(v * 100) / 100;

/* imperative pool mounted into a div; hands its control API up via onReady */
function PoolMount({ onOpenLane, onZoomText, onReady }) {
  const ref = useRefO(null);
  useEffectO(() => {
    const api = window.mountPool(ref.current, { onOpenLane, onZoomText });
    onReady(api);
    return () => api.destroy();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function HeaderBtn({ children, onClick, on, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        background: on ? "var(--arbol-color-accent)" : "var(--arbol-color-surface-2)",
        color: on ? "var(--arbol-color-accent-ink)" : "var(--arbol-color-text)",
        border: "1px solid " + (on ? "transparent" : "var(--arbol-color-border)"),
        borderRadius: 6, padding: "3px 8px", cursor: "pointer",
        font: "600 calc(9.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono)", whiteSpace: "nowrap",
      }}>{children}</button>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 3, background: "var(--arbol-color-surface-2)", border: "1px solid var(--arbol-color-border)", borderRadius: 7, padding: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} title={o.title}
            style={{ background: on ? "var(--arbol-color-accent)" : "transparent", color: on ? "var(--arbol-color-accent-ink)" : "var(--arbol-color-text-muted)",
              border: 0, borderRadius: 5, padding: "4px 9px", cursor: "pointer", font: "600 calc(10px * var(--arbol-font-scale))/1 var(--arbol-font-ui)", whiteSpace: "nowrap" }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/* Details shows every grain kind (the per-lane filter was removed). */
const ALL_KINDS = new Set(window.GRAINS.ORDER);

function App() {
  const UI_ID = "oaken";
  const [page, setPage] = useStateO("pool");
  const [lane, setLane] = useStateO(null);
  const [theme, setTheme] = useStateO(() => localStorage.getItem(`arbol-theme:${UI_ID}`) || "redwood");
  const [uiScale, setUiScale] = useStateO(() => parseFloat(localStorage.getItem(`arbol-ui-font-scale:${UI_ID}`)) || 1);
  const [layout, setLayout] = useStateO(() => localStorage.getItem(`oaken-detail-layout`) || "feed");
  const [toast, setToast] = useStateO(null);
  const poolApi = useRefO(null);
  const [, force] = useStateO(0);

  useEffectO(() => { localStorage.setItem(`arbol-theme:${UI_ID}`, theme); }, [theme]);
  useEffectO(() => { localStorage.setItem(`arbol-ui-font-scale:${UI_ID}`, uiScale); document.documentElement.style.setProperty("--arbol-font-scale", String(uiScale)); }, [uiScale]);
  useEffectO(() => { localStorage.setItem(`oaken-detail-layout`, layout); }, [layout]);
  const openLane = (L) => { setLane(L); setPage("details"); };
  const back = () => { setPage("pool"); };

  useEffectO(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "[") { e.preventDefault(); if (page === "details") back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

  const showToast = (msg) => { setToast(msg); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(null), 2200); };

  const fontCtl = {
    onInc: () => setUiScale((s) => Math.min(OAK_FONT_MAX, oakR2(s + 0.1))),
    onDec: () => setUiScale((s) => Math.max(OAK_FONT_MIN, oakR2(s - 0.1))),
    canInc: uiScale < OAK_FONT_MAX, canDec: uiScale > OAK_FONT_MIN,
    title: `Text size — ${Math.round(uiScale * 100)}%`,
  };

  // ── per-page Header slots ────────────────────────────────────────────────
  const headerLead = page === "pool"
    ? <span style={{ color: "var(--arbol-color-text-muted)", whiteSpace: "nowrap" }}>· Swimlanes</span>
    : (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <button onClick={back} title="Back to Swimlanes (⌘[)"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", background: "var(--arbol-color-surface-2)",
            border: "1px solid var(--arbol-color-border)", borderRadius: 7, padding: "4px 9px 4px 7px", color: "var(--arbol-color-text)",
            font: "600 calc(11px * var(--arbol-font-scale))/1 var(--arbol-font-ui)", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: "calc(13px * var(--arbol-font-scale))", lineHeight: 1 }}>‹</span>Swimlanes
        </button>
        <span style={{ color: "var(--arbol-color-text-muted)", opacity: 0.5 }}>⟩</span>
        <span style={{ color: "var(--arbol-color-text-muted)", whiteSpace: "nowrap", fontWeight: 600, fontSize: "var(--arbol-type-label)" }}>LANE {lane && lane.n}</span>
        <span style={{ color: "var(--arbol-color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360, fontWeight: 600 }}>{lane && lane.tkt}</span>
      </div>
    );

  const headerExtras = page === "pool"
    ? (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <HeaderBtn title="Narrower columns" onClick={() => poolApi.current && poolApi.current.narrow()}>▭−</HeaderBtn>
        <HeaderBtn title="Wider columns" onClick={() => poolApi.current && poolApi.current.widen()}>▭＋</HeaderBtn>
        <HeaderBtn title="Fit all occupied swimlanes" on={poolApi.current && poolApi.current.isFit()} onClick={() => { poolApi.current && poolApi.current.fit(); force((n) => n + 1); }}>Fit swimlanes</HeaderBtn>
      </div>
    )
    : (
      <Seg value={layout} onChange={setLayout}
        options={[{ value: "feed", label: "Feed", title: "Spine left · one feed of items" }, { value: "split", label: "Split", title: "Spine centred · sessions left, events right" }]} />
    );

  const status = page === "pool"
    ? <><Dot color="var(--arbol-color-ok)" /><span>Connected</span><span style={{ opacity: 0.5 }}>·</span><span style={{ fontFamily: "var(--arbol-font-mono)" }}>{window.OAK.LANES.filter((l) => !l.empty).length} active lanes</span><span style={{ flex: 1 }} /><span style={{ opacity: 0.7 }}>Click a lane title to expand its swimmers →</span></>
    : <><Dot color={lane && lane.swimmers.some((s) => O_overdue(s)) ? "var(--arbol-color-err)" : "var(--arbol-color-ok)"} /><span style={{ fontFamily: "var(--arbol-font-mono)" }}>{lane && lane.swimmers.length} swimmers</span><span style={{ opacity: 0.5 }}>·</span><span style={{ fontFamily: "var(--arbol-font-mono)" }}>{lane && lane.swimmers.reduce((n, s) => n + (s.items ? s.items.length : 0), 0)} grains</span><span style={{ flex: 1 }} /><span style={{ opacity: 0.7 }}>Click a swimmer header for actions · ⌘[ back</span></>;

  return (
    <div data-theme={theme} style={{ width: "100%", height: "100%" }}>
      <UIShell title="Oaken" theme={theme} onTheme={setTheme} fontCtl={fontCtl} maxWidth={1340}
        headerLead={headerLead} headerExtras={headerExtras} status={status}>
        <div style={{ height: "100%", minWidth: 0 }}>
          {page === "pool"
            ? <div data-screen-label="Swimlanes" style={{ width: "100%", height: "100%", minHeight: 0 }}>
                <PoolMount onOpenLane={openLane} onReady={(api) => { poolApi.current = api; force((n) => n + 1); }} />
              </div>
            : <div data-screen-label={"Swimlane Details — Lane " + (lane && lane.n)} style={{ width: "100%", height: "100%", minHeight: 0 }}>
                <DetailsPage lane={lane} visibleKinds={ALL_KINDS} layout={layout} onToast={showToast} />
              </div>}
        </div>
      </UIShell>
      {toast && <div className="dtoast">{toast}</div>}
    </div>
  );
}

function O_overdue(sm) {
  const O = window.OAK;
  return O.abs(sm.due) < (O.NOW[0] * 24 + O.NOW[1]) && !(O.abs(sm.start) > (O.NOW[0] * 24 + O.NOW[1]));
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
