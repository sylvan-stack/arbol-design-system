/* Swimlane Details page (Oaken[Swimlane Details]).
 * One lane, full width, split into wide columns — one per SWIMMER. Every column is
 * a full mini-swimlane that shares ONE vertical time axis: hourly legend, day-pages
 * with night-gaps, the NOW line, the spent/remaining spine, a typed deadline wall and
 * a live countdown — exactly the pool's language, now wide enough to hold the swimmer's
 * ITEMS. Sessions (chat/agent) draw as duration bars on the spine; Jira/MR/commit/state
 * are point markers with a detail card. Two layout directions (Feed | Split) compare live.
 * Clicking a column header opens the action popover (New Chat / Link to / Finish swimmer). */
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD } = React;

const DLOAD = Date.now();
const dSimHours = () => (window.OAK.NOW[0] * 24 + window.OAK.NOW[1]) + (Date.now() - DLOAD) / 3600000;
const CARD_H = 44;   // min vertical slot per item card (anti-overlap spacing)

/* greedy upward placement: cards keep their order but never overlap */
function placeCards(anchored) {
  const sorted = anchored.map((a, i) => ({ ...a, i })).sort((a, b) => a.anchorY - b.anchorY);
  let prev = -Infinity;
  sorted.forEach((c) => { c.placedY = Math.max(c.anchorY, prev + CARD_H); prev = c.placedY; });
  const out = []; sorted.forEach((c) => { out[c.i] = c.placedY; });
  return out;
}

function SourceBadge({ children, hue }) {
  return (
    <span style={{
      font: "600 calc(9px * var(--arbol-font-scale))/1 var(--arbol-font-mono)", letterSpacing: 0.5,
      padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap",
      color: hue != null ? `oklch(0.72 0.13 ${hue})` : "var(--arbol-color-text-muted)",
      background: hue != null ? `color-mix(in oklch, oklch(0.72 0.12 ${hue}) 16%, var(--arbol-color-surface))` : "var(--arbol-color-surface-2)",
      border: "1px solid " + (hue != null ? `color-mix(in oklch, oklch(0.72 0.12 ${hue}) 40%, transparent)` : "var(--arbol-color-hairline)"),
    }}>{children}</span>
  );
}


function ActionPopover({ pop, onClose, onToast }) {
  const ref = useRefD(null);
  useEffectD(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  if (!pop) return null;
  const items = [
    { label: "New Chat", glyph: "❝", hint: "⌘N" },
    { label: "Link to…", glyph: "⇄", hint: "⌘L" },
    { sep: true },
    { label: "Finish swimmer", glyph: "✓", hint: "" },
  ];
  return (
    <div ref={ref} className="dpop" style={{ left: pop.x, top: pop.y }}>
      <div className="dpop-title">{pop.sm.nm}</div>
      {items.map((it, i) => it.sep
        ? <div key={i} className="dpop-sep" />
        : <button key={i} className="dpop-btn" onClick={() => { onToast(`“${it.label}” — coming soon`); onClose(); }}>
            <span className="dpop-glyph">{it.glyph}</span><span style={{ flex: 1 }}>{it.label}</span>
            {it.hint && <span className="dpop-hint">{it.hint}</span>}
          </button>)}
    </div>
  );
}

function DetailsPage({ lane, visibleKinds, layout, onToast }) {
  const O = window.OAK, G = window.GRAINS;
  const { PAGE0, PAGE1, PAGE_HRS, WORK, GAP, DAYS, NOW, clock } = O;
  const scRef = useRefD(null);
  const [h, setH] = useStateD(600);
  const [zoom, setZoom] = useStateD(1.6);     // tighter single-day default
  const [panY, setPanY] = useStateD(0);
  const [, setTick] = useStateD(0);
  const [pop, setPop] = useStateD(null);
  const inited = useRefD(false);
  const z = useRefD(zoom), p = useRefD(panY), hh = useRefD(h);
  z.current = zoom; p.current = panY; hh.current = h;

  useEffectD(() => {
    const el = scRef.current; if (!el) return;
    const set = () => setH(el.clientHeight);
    const ro = new ResizeObserver(set); ro.observe(el); set();
    return () => ro.disconnect();
  }, []);
  useEffectD(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);

  const pph = (h / 9) * zoom;
  const pageH = pph * PAGE_HRS;
  const worldH = DAYS.length * pageH + (DAYS.length - 1) * GAP;
  const yb = (d, hr) => d * (pageH + GAP) + (hr - PAGE0) * pph;
  const ybA = (a) => yb(a[0], a[1]);
  const nowY = ybA(NOW);
  const clampPan = (v) => Math.max(Math.min(0, h - worldH), Math.min(0, v));

  useEffectD(() => { if (h && !inited.current) { inited.current = true; setPanY(clampPan(-(worldH - h) + yb(0, WORK[0]))); } }, [h]);

  // wheel: ⌘/ctrl → zoom (anchored on NOW); else vertical pan
  useEffectD(() => {
    const el = scRef.current; if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        const curPph = (hh.current / 9) * z.current, curPageH = curPph * PAGE_HRS;
        const curWorldH = DAYS.length * curPageH + (DAYS.length - 1) * GAP;
        const curNowY = NOW[0] * (curPageH + GAP) + (NOW[1] - PAGE0) * curPph;
        const screenNow = p.current + (curWorldH - curNowY);
        const nz = Math.min(4.5, Math.max(0.2, z.current * (e.deltaY > 0 ? 0.94 : 1.0638)));
        const nPph = (hh.current / 9) * nz, nPageH = nPph * PAGE_HRS;
        const nWorldH = DAYS.length * nPageH + (DAYS.length - 1) * GAP;
        const nNowY = NOW[0] * (nPageH + GAP) + (NOW[1] - PAGE0) * nPph;
        z.current = nz; setZoom(nz);
        const np = screenNow - (nWorldH - nNowY);
        p.current = Math.max(Math.min(0, hh.current - nWorldH), Math.min(0, np)); setPanY(p.current);
      } else {
        const np = p.current - e.deltaY;
        p.current = Math.max(Math.min(0, hh.current - worldH), Math.min(0, np)); setPanY(p.current);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [worldH, h]);

  // drag to pan (vertical)
  const drag = useRefD(null);
  const onDown = (e) => { if (e.target.closest(".dcol-head") || e.target.closest(".ditem") || e.target.closest(".dpop")) return; drag.current = { y: e.clientY, py: p.current }; };
  useEffectD(() => {
    const mv = (e) => { if (!drag.current) return; const np = drag.current.py + (e.clientY - drag.current.y); p.current = Math.max(Math.min(0, hh.current - worldH), Math.min(0, np)); setPanY(p.current); };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [worldH]);

  const pan = clampPan(panY);
  const sims = dSimHours();
  const swimmers = lane.swimmers || [];
  const split = layout === "split";

  // shared overlays (grid + night-gaps + now), spanning all columns
  const gridLines = [];
  for (let d = 0; d < DAYS.length; d++) for (let hr = PAGE0; hr <= PAGE1; hr++) {
    gridLines.push(<div key={`h${d}-${hr}`} className="dgridline hour" style={{ bottom: yb(d, hr) }} />);
    if (hr < PAGE1) gridLines.push(<div key={`q${d}-${hr}`} className="dgridline half" style={{ bottom: yb(d, hr + 0.5) }} />);
  }
  const nightGaps = [];
  for (let d = 0; d < DAYS.length - 1; d++) nightGaps.push(
    <div key={d} className="dnightgap" style={{ bottom: yb(d, PAGE1), height: GAP }}><span>↑ {DAYS[d + 1].split(" · ")[0]}</span></div>
  );

  // axis ticks
  const ticks = [];
  DAYS.forEach((label, d) => {
    [[8, "faint"], [9, ""], [10, ""], [11, ""], [12, ""], [13, ""], [14, ""], [15, ""], [16, ""], [17, ""], [18, ""], [19, ""], [20, "faint"]].forEach(([hr, cls]) => {
      ticks.push(<div key={`${d}-${hr}`} className={"dtick " + cls} style={{ bottom: yb(d, hr) }}>{clock(hr)}</div>);
    });
    ticks.push(<div key={`dl${d}`} className="ddaylabel" style={{ bottom: yb(d, PAGE0) + 6 }}>{label.split(" · ")[0] === "Today" ? "TODAY" : label.toUpperCase().slice(0, 3)}</div>);
  });
  ticks.push(<div key="now" className="dtick now" style={{ bottom: nowY }}>{clock(NOW[1])}</div>);

  function Spine({ sm }) {
    const sY = ybA(sm.start), dY = ybA(sm.due), planned = sY > nowY, overdue = dY < nowY && !planned;
    const wc = O.WALL[sm.type] || O.WALL.due;
    const soft = `color-mix(in oklch, ${O.FILL[sm.type] || O.FILL.due} 80%, var(--arbol-color-surface))`;
    const parts = [];
    if (planned) {
      parts.push(<div key="f" className="dseg plan" style={{ bottom: sY, height: Math.max(0, dY - sY), background: soft }} />);
      parts.push(<div key="s" className="dstart" style={{ bottom: sY }}>▸ {clock(sm.start[1])}</div>);
    } else {
      const pastTop = Math.min(nowY, dY);
      parts.push(<div key="p" className={"dseg past" + (sm.blocked ? " blocked" : "")} style={{ bottom: sY, height: Math.max(0, pastTop - sY) }} />);
      if (!overdue) parts.push(<div key="f" className="dseg future" style={{ bottom: nowY, height: Math.max(0, dY - nowY), background: soft }} />);
      if (overdue) parts.push(<div key="o" className="dseg over" style={{ bottom: dY, height: Math.max(0, nowY - dY) }} />);
    }
    parts.push(<div key="w" className="dwall" style={{ bottom: dY, borderColor: wc }}>
      <span className="dflag" style={{ background: `color-mix(in oklch, ${wc} 30%, var(--arbol-color-surface))`, color: wc }}>{O.WICON[sm.type] || "⚑"} {clock(sm.due[1])}</span>
    </div>);
    const left = O.abs(sm.due) - sims;
    parts.push(<div key="t" className={"dtimer" + (left < 0 ? " over" : "")} style={{ bottom: dY, color: left < 0 ? "var(--arbol-color-err)" : wc, borderColor: left < 0 ? "var(--arbol-color-err)" : "var(--arbol-color-border)" }}>{O.fmtLeft(left)}</div>);
    if (!planned) { const el = Math.round((nowY - sY) / (dY - sY) * 100); parts.push(<div key="c" className={"dcap" + (overdue ? " over" : "")} style={{ bottom: nowY }}>{overdue ? "OVER" : el + "%"}</div>); }
    return <>{parts}</>;
  }

  function Column({ sm, idx }) {
    const sY = ybA(sm.start), dY = ybA(sm.due), planned = sY > nowY, overdue = dY < nowY && !planned;
    const left = O.abs(sm.due) - sims;
    const wc = O.WALL[sm.type] || O.WALL.due;
    const spent = planned ? null : (overdue ? "OVER" : Math.round((nowY - sY) / (dY - sY) * 100) + "%");
    const items = (sm.items || []).filter((it) => visibleKinds.has(it.kind));
    const spans = items.filter((it) => G.shapeOf(it.kind) === "span");
    const marks = items.filter((it) => G.shapeOf(it.kind) !== "span");

    // span end: a LIVE session's bar grows to the NOW line; else its fixed end
    const spanEndY = (it) => it.live ? nowY : ybA(it.e);
    const anchorOf = (it) => G.shapeOf(it.kind) === "span" ? (ybA(it.s) + spanEndY(it)) / 2 : ybA(it.t);

    // duration bars (always on/near the spine) — live ones breathe + reach NOW
    const bars = spans.map((it, i) => {
      const a = ybA(it.s), b = spanEndY(it), line = G.line(it.kind);
      const barLeft = split ? "calc(50% - 24px)" : "46px";
      return <div key={"bar" + i} className={"dbar" + (it.live ? " live" : "")} title={it.title} style={{ left: barLeft, bottom: Math.min(a, b), height: Math.max(3, Math.abs(b - a)), background: G.soft(it.kind, 60), borderColor: line, ["--ih"]: line }} />;
    });

    // cards + connectors
    const renderSide = (list, side) => {
      const placed = placeCards(list.map((it) => ({ anchorY: anchorOf(it) })));
      return list.map((it, i) => {
        const anchorY = anchorOf(it);
        const py = placed[i];
        const lo = Math.min(anchorY, py), hi = Math.max(anchorY, py);
        const dot = G.line(it.kind, it.state);
        return (
          <React.Fragment key={side + i}>
            <span className="ddot" style={{ bottom: anchorY, background: dot }} />
            <span className={"dlead v " + side} style={{ bottom: lo, height: hi - lo }} />
            <span className={"dlead h " + side} style={{ bottom: py }} />
            <div className={"ditem-wrap " + side} style={{ bottom: py }}><GrainChip grain={it} /></div>
          </React.Fragment>
        );
      });
    };

    const cards = split
      ? [...renderSide(spans, "left"), ...renderSide(marks, "right")]
      : renderSide([...marks, ...spans].sort((a, b) => anchorOf(a) - anchorOf(b)), "right");

    const tint = `color-mix(in oklch, oklch(0.62 0.07 ${lane.hue + idx * 24}) 13%, var(--arbol-color-surface))`;
    const empty = (sm.items || []).length === 0;

    return (
      <div className={"dcol" + (split ? " split" : " feed")} style={{ ["--spine"]: split ? "50%" : "26px", background: tint }}>
        {/* spine + items live in the scrolling world */}
        <div className="dcol-body" style={{ height: worldH }}>
          <Spine sm={sm} />
          {bars}
          {cards}
          {empty && (
            <div className="dempty" style={{ bottom: planned ? sY + (dY - sY) * 0.45 : sY + (Math.min(nowY, dY) - sY) * 0.42 }}>
              <div className="dempty-t">No activity yet</div>
              <button className="dempty-b" onClick={(e) => { e.stopPropagation(); onToast("“New Chat” — coming soon"); }}>❝ Start a chat</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function HeaderCell({ sm, idx }) {
    const sY = ybA(sm.start), dY = ybA(sm.due), planned = sY > nowY, overdue = dY < nowY && !planned;
    const left = O.abs(sm.due) - sims;
    const wc = O.WALL[sm.type] || O.WALL.due;
    const spent = planned ? "PLANNED" : (overdue ? "OVER" : Math.round((nowY - sY) / (dY - sY) * 100) + "%");
    const open = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      setPop({ sm, x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 6 });
    };
    return (
      <button className="dcol-head" onClick={open} title="Swimmer actions">
        <div className="dch-top">
          <span className="dch-num">SWIMMER {idx + 1}</span>
          <span className="dch-spent" style={{ color: overdue ? "var(--arbol-color-err)" : "var(--arbol-color-text-muted)" }}>{spent}</span>
        </div>
        <div className="dch-name">{sm.nm}</div>
        <div className="dch-bot">
          <SourceBadge>{sm.src}</SourceBadge>
          <span className="dch-timer" style={{ color: left < 0 ? "var(--arbol-color-err)" : wc, borderColor: left < 0 ? "var(--arbol-color-err)" : "var(--arbol-color-border)" }}>
            {O.WICON[sm.type] || "⚑"} {O.fmtLeft(left)}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="dpool">
      <div className="daxis"><div className="dworld" style={{ height: worldH, transform: `translateY(${pan}px)` }}>{ticks}</div></div>
      <div className="dscroller" ref={scRef} onMouseDown={onDown}>
        <div className="dworld" style={{ height: worldH, transform: `translateY(${pan}px)` }}>
          <div className="dgrid">{gridLines}{nightGaps}</div>
          <div className="dnow" style={{ bottom: nowY }} />
          <div className="dcols">
            {swimmers.map((sm, i) => <div className="dcolwrap" key={sm.id} style={{ height: worldH }}><Column sm={sm} idx={i} /></div>)}
          </div>
        </div>
        <div className="dheadrow">
          {swimmers.map((sm, i) => <div className="dheadwrap" key={sm.id}><HeaderCell sm={sm} idx={i} /></div>)}
        </div>
      </div>
      <ActionPopover pop={pop} onClose={() => setPop(null)} onToast={onToast} />
    </div>
  );
}

Object.assign(window, { DetailsPage });
