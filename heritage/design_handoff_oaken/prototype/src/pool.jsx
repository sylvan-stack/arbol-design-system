/* Pool page — the full swimlane pool (ported from oaken/sketches/pool-sketch.html,
 * refactored into mountPool(container,{onOpenLane,onZoomText}) so the window shell
 * owns the chrome + nav). Imperative on purpose: the px/time math is already tuned.
 * Clicking a lane title calls onOpenLane(lane) → Swimlane Details. */
function mountPool(container, opts = {}) {
  const O = window.OAK;
  const { PAGE0, PAGE1, PAGE_HRS, WORK, GAP, DAYS, NOW, clock } = O;
  const onOpenLane = opts.onOpenLane || (() => {});
  const onZoomText = opts.onZoomText || (() => {});

  container.innerHTML = `
    <div class="pool" data-pool>
      <div class="scroller axiscol" data-axis-scroller><div class="world" data-axis-world></div></div>
      <div class="scroller" data-scroller>
        <div class="world" data-world>
          <div class="nightgaps" data-nightgaps></div>
          <div class="grid" data-grid></div>
          <div class="lanes" data-lanes></div>
          <div class="nowline" data-nowline></div>
        </div>
        <div class="headrow" data-headrow></div>
        <div class="timetip" data-timetip></div>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const world = $("[data-world]"), axisWorld = $("[data-axis-world]");
  const lanesEl = $("[data-lanes]"), scroller = $("[data-scroller]");
  const nightgaps = $("[data-nightgaps]"), headrow = $("[data-headrow]");
  const timetip = $("[data-timetip]"), nowLine = $("[data-nowline]");

  const WALL = O.WALL, FILL = O.FILL, ICON = O.WICON;
  const wallCol = (t) => WALL[t] || WALL.due;
  const baseFill = (t) => FILL[t] || FILL.due;
  const imp = O.imp;
  const softFill = (t, im = 0.6) => `color-mix(in oklch, ${baseFill(t)} ${Math.round(64 + im * 36)}%, var(--arbol-color-surface))`;
  const lanes = O.LANES;

  let zoom = 1, panX = 0, panY = 0;
  let COLW = 150, fitMode = false; const LANEGAP = 8, PADX = 12;
  const shownLanes = () => fitMode ? lanes.filter((L) => !L.empty) : lanes;
  const swEntries = [];
  function contentWidth() { const S = shownLanes(); let w = PADX * 2 + LANEGAP * (S.length - 1); S.forEach((L) => w += L.empty ? 70 : L.swimmers.length * COLW); return w; }
  function overlap(a, b) { const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)); const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)); return x * y; }

  const pxPerHour = () => (scroller.clientHeight / 9) * zoom;
  const pageH = () => pxPerHour() * PAGE_HRS;
  const worldH = () => DAYS.length * pageH() + (DAYS.length - 1) * GAP;
  const yb = (day, hour) => day * (pageH() + GAP) + (hour - PAGE0) * pxPerHour();
  const ybArr = (a) => yb(a[0], a[1]);
  const nowY = () => ybArr(NOW);
  function geom(sm) { const sY = ybArr(sm.start), dY = ybArr(sm.due), nY = nowY(); return { sY, dY, nY, planned: sY > nY, overdue: dY < nY && !(sY > nY) }; }

  function setZoomRead() { const win = 9 / zoom; const txt = win >= 24 ? (win / 24).toFixed(1) + "d" : win.toFixed(1) + "h"; onZoomText("window " + txt.replace(/\.0(d|h)/, "$1")); }
  function clampPan() {
    const vp = scroller.clientHeight, wh = world.clientHeight;
    panY = Math.max(Math.min(0, vp - wh), Math.min(0, panY));
    panX = Math.max(Math.min(0, scroller.clientWidth - world.scrollWidth), Math.min(0, panX));
  }
  function applyPan() { clampPan(); world.style.transform = `translate(${panX}px, ${panY}px)`; axisWorld.style.transform = `translateY(${panY}px)`; headrow.style.transform = `translateX(${panX}px)`; }

  function renderAxis() {
    axisWorld.innerHTML = "";
    DAYS.forEach((label, d) => {
      [[8, "faint"], [9, ""], [12, ""], [15, ""], [18, ""], [20, "faint"]].forEach(([hr, cls]) => {
        const t = document.createElement("div"); t.className = "tick " + cls; t.style.bottom = yb(d, hr) + "px"; t.textContent = clock(hr); axisWorld.appendChild(t);
      });
      const dl = document.createElement("div"); dl.className = "daylabel"; dl.style.bottom = (yb(d, PAGE0) + 6) + "px"; dl.textContent = label.split(" · ")[0] === "Today" ? "TODAY" : label.toUpperCase().slice(0, 3); axisWorld.appendChild(dl);
    });
    const nt = document.createElement("div"); nt.className = "tick now"; nt.style.bottom = nowY() + "px"; nt.textContent = clock(NOW[1]); axisWorld.appendChild(nt);
  }
  function renderNightGaps() {
    nightgaps.innerHTML = "";
    for (let d = 0; d < DAYS.length - 1; d++) {
      const g = document.createElement("div"); g.className = "nightgap"; g.style.bottom = (yb(d, PAGE1)) + "px"; g.style.height = GAP + "px";
      g.innerHTML = `<span>↑ ${DAYS[d + 1].split(" · ")[0]}</span>`; nightgaps.appendChild(g);
    }
  }
  const colBg = (hue, idx, n) => { const im = imp(n); const H = hue + idx * 26, L = 0.56 + (idx % 2) * 0.05 + im * 0.07, a = Math.round(24 + im * 42); return `color-mix(in oklch, oklch(${L} 0.085 ${H}) ${a}%, transparent)`; };
  function renderGrid() {
    const g = $("[data-grid]"); g.innerHTML = "";
    for (let d = 0; d < DAYS.length; d++) {
      for (let hr = PAGE0; hr <= PAGE1; hr++) {
        const ln = document.createElement("div"); ln.className = "gridline hour"; ln.style.bottom = yb(d, hr) + "px"; g.appendChild(ln);
        if (hr < PAGE1) { const hf = document.createElement("div"); hf.className = "gridline half"; hf.style.bottom = yb(d, hr + 0.5) + "px"; g.appendChild(hf); }
      }
    }
  }
  function swimmerHTML(sm, im) {
    const { sY, dY, nY, planned, overdue } = geom(sm);
    const wc = wallCol(sm.type), soft = softFill(sm.type, im);
    const dueAbs = O.abs(sm.due);
    let h = "";
    if (planned) {
      h += `<div class="seg future plan" style="bottom:${sY}px; height:${Math.max(0, dY - sY)}px; background:${soft}"></div>`;
      h += `<div class="startmark" style="bottom:${sY}px">▸ ${clock(sm.start[1])}</div>`;
    } else {
      const pastTop = Math.min(nY, dY);
      h += `<div class="seg past${sm.blocked ? " blocked" : ""}" style="bottom:${sY}px; height:${Math.max(0, pastTop - sY)}px"></div>`;
      if (!overdue) h += `<div class="seg future" style="bottom:${nY}px; height:${Math.max(0, dY - nY)}px; background:${soft}"></div>`;
      if (overdue) h += `<div class="seg over" style="bottom:${dY}px; height:${Math.max(0, nY - dY)}px"></div>`;
    }
    h += `<div class="wall" style="bottom:${dY}px; border-color:${wc}"><span class="flag" style="background:color-mix(in oklch, ${wc} 30%, var(--arbol-color-surface)); color:${wc}">${ICON[sm.type] || "⚑"} ${clock(sm.due[1])}</span></div>`;
    h += `<div class="timer" data-due="${dueAbs}" style="bottom:${dY}px; color:${wc}">…</div>`;
    if (!planned) { const el = Math.round((nY - sY) / (dY - sY) * 100); h += `<div class="cap${overdue ? " over" : ""}" style="bottom:${nY}px">${overdue ? "OVER" : el + "%"}</div>`; }
    return h;
  }
  function placeLabels() {
    const wr = world.getBoundingClientRect(); const placed = [];
    swEntries.forEach((e) => {
      const cr = e.colEl.getBoundingClientRect(); const cx = (cr.left - wr.left) + cr.width / 2;
      const w = Math.min(240, e.nm.length * 6.6 + e.src.length * 5 + 38), hh = 12;
      const lo = e.yLo + 14, hi = Math.max(e.yLo + 14, e.yHi - 12);
      const N = 9; let best = null, bestScore = Infinity;
      for (let i = 0; i < N; i++) {
        const cy = (N === 1) ? lo : (lo + (hi - lo) * i / (N - 1));
        const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - hh, y1: cy + hh };
        let ov = 0; for (const p of placed) ov += overlap(box, p);
        const pull = Math.abs(cy - (lo + hi) / 2) / Math.max(1, (hi - lo)) * 22;
        const score = ov * 1000 + pull;
        if (score < bestScore) { bestScore = score; best = { cy, box }; }
      }
      placed.push(best.box);
      const el = document.createElement("div"); el.className = "namelabel";
      el.style.bottom = best.cy + "px"; el.innerHTML = `<span class="nm-t">${e.nm}</span><span class="src">${e.src}</span>`;
      e.colEl.appendChild(el);
    });
  }
  function renderLanes() {
    lanesEl.innerHTML = ""; swEntries.length = 0; headrow.innerHTML = "";
    shownLanes().forEach((L) => {
      const nCols = L.empty ? 1 : L.swimmers.length;
      const flex = L.empty ? "0 0 70px" : `${nCols} 0 ${nCols * COLW}px`;
      const im = imp(L.n);
      const hc = document.createElement("div");
      hc.className = "headcell" + (L.empty ? " empty" : "");
      hc.style.flex = flex;
      hc.innerHTML = `<div class="lane-num">LANE ${L.n}</div>` + (L.empty ? "" : `<div class="lane-tkt" title="Open “${L.tkt}” →">${L.tkt}</div>`);
      if (!L.empty) { hc.querySelector(".lane-tkt").addEventListener("click", (e) => { e.stopPropagation(); onOpenLane(L); }); }
      headrow.appendChild(hc);

      const lane = document.createElement("div");
      lane.className = "lane" + (L.empty ? " empty" : "");
      lane.style.flex = flex; lane.dataset.lane = L.tkt || ("Lane " + L.n);
      const track = document.createElement("div"); track.className = "track";
      if (L.empty) { const c = document.createElement("div"); c.className = "col"; c.style.background = "color-mix(in oklch, var(--arbol-color-text-muted) 9%, transparent)"; c.innerHTML = `<div class="empty-note">no swimmers</div>`; track.appendChild(c); }
      else L.swimmers.forEach((sm, i) => {
        const c = document.createElement("div"); c.className = "col"; c.style.background = colBg(L.hue, i, L.n); c.innerHTML = swimmerHTML(sm, im); track.appendChild(c);
        const g = geom(sm); swEntries.push({ colEl: c, nm: sm.nm, src: sm.src, yLo: g.sY, yHi: (g.planned ? g.dY : Math.min(g.nY, g.dY)) });
      });
      lane.appendChild(track); lanesEl.appendChild(lane);
    });
    nowLine.style.bottom = nowY() + "px";
    updateTimers();
  }
  function relayout() {
    const h = Math.round(worldH()); world.style.height = h + "px"; axisWorld.style.height = h + "px";
    const cw = contentWidth(), vw = scroller.clientWidth, ww = Math.max(vw, cw);
    world.style.width = ww + "px"; headrow.style.right = "auto"; headrow.style.width = ww + "px";
    setZoomRead(); renderAxis(); renderNightGaps(); renderGrid(); renderLanes(); placeLabels(); applyPan();
  }

  const onWheel = (e) => {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      const screenNow = panY + (world.clientHeight - nowY());
      zoom = Math.min(4.5, Math.max(0.075, zoom * (e.deltaY > 0 ? 0.94 : 1.0638)));
      relayout(); panY = screenNow - (world.clientHeight - nowY()); applyPan();
    } else { panY -= e.deltaY; panX -= e.deltaX; applyPan(); }
  };
  scroller.addEventListener("wheel", onWheel, { passive: false });

  let drag = null;
  const onDown = (e) => { if (e.target.closest(".cap") || e.target.closest(".namelabel") || e.target.closest(".lane-tkt")) return; drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; scroller.classList.add("grab"); };
  const onMove = (e) => { if (!drag) return; panX = drag.px + (e.clientX - drag.x); panY = drag.py + (e.clientY - drag.y); applyPan(); };
  const onUp = () => { drag = null; scroller.classList.remove("grab"); };
  scroller.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);

  const onTip = (e) => {
    if (drag) { timetip.style.display = "none"; return; }
    const rect = scroller.getBoundingClientRect(); const sy = e.clientY - rect.top, sx = e.clientX - rect.left;
    const ybBottom = world.clientHeight - (sy - panY);
    const block = pageH() + GAP; const idx = Math.floor(ybBottom / block);
    if (idx < 0 || idx >= DAYS.length) { timetip.style.display = "none"; return; }
    const within = ybBottom - idx * block;
    if (within > pageH()) { timetip.style.display = "none"; return; }
    const hour = Math.max(PAGE0, Math.min(PAGE1, PAGE0 + within / pxPerHour()));
    timetip.textContent = DAYS[idx].split(" · ")[0] + " · " + clock(hour);
    timetip.style.display = "block"; timetip.style.left = (sx + 14) + "px"; timetip.style.top = sy + "px";
  };
  scroller.addEventListener("mousemove", onTip);
  scroller.addEventListener("mouseleave", () => { timetip.style.display = "none"; });

  const LOAD = Date.now();
  const simHours = () => (NOW[0] * 24 + NOW[1]) + (Date.now() - LOAD) / 3600000;
  function updateTimers() { const sh = simHours(); container.querySelectorAll(".timer[data-due]").forEach((t) => { const left = parseFloat(t.dataset.due) - sh; t.textContent = O.fmtLeft(left); t.classList.toggle("over", left < 0); }); }
  const timer = setInterval(updateTimers, 1000);

  const onResize = () => relayout();
  window.addEventListener("resize", onResize);

  // init — workday 09:00→18:00 fills the view, centred on the middle lanes
  relayout();
  requestAnimationFrame(() => {
    relayout();
    panY = scroller.clientHeight - world.clientHeight + yb(0, WORK[0]);
    const a = lanesEl.children[3], b = lanesEl.children[4];
    if (a && b && world.clientWidth > scroller.clientWidth) { const wr = world.getBoundingClientRect(); const cx = ((a.getBoundingClientRect().left + b.getBoundingClientRect().right) / 2) - wr.left; panX = scroller.clientWidth / 2 - cx; }
    applyPan();
  });

  return {
    widen() { fitMode = false; COLW = Math.min(320, COLW + 22); relayout(); },
    narrow() { fitMode = false; COLW = Math.max(50, COLW - 22); relayout(); },
    isFit: () => fitMode,
    fit() {
      fitMode = !fitMode;
      if (fitMode) { const occ = lanes.filter((L) => !L.empty), totalCols = occ.reduce((s, L) => s + L.swimmers.length, 0); const avail = scroller.clientWidth - PADX * 2 - LANEGAP * (occ.length - 1); COLW = Math.max(46, Math.floor(avail / totalCols)); panX = 0; relayout(); }
      else { COLW = 150; relayout(); }
      return fitMode;
    },
    destroy() {
      clearInterval(timer);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("mousedown", onDown);
      scroller.removeEventListener("mousemove", onTip);
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("resize", onResize);
      container.innerHTML = "";
    },
  };
}

window.mountPool = mountPool;
