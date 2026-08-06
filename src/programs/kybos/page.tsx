"use client";

import { useRef, useEffect, useState, useCallback } from "react";

// ─── pure logic ──────────────────────────────────────────────────────────────

class Hypercube {
  points: number[][];
  edges: [number, number][];

  constructor(n: number) {
    const nPts = 1 << n;
    this.points = [];
    for (let i = 0; i < nPts; i++) {
      let t = i;
      const p: number[] = [];
      for (let j = 0; j < nPts; j++) {
        p.push(t % 2 === 0 ? -1 : 1);
        t = Math.floor(t / 2);
      }
      this.points.push(p);
    }
    this.edges = [];
    for (let i = 0; i < nPts; i++) {
      for (let j = i + 1; j < nPts; j++) {
        let diff = 0;
        for (let k = 0; k < n; k++) {
          if (this.points[i][k] !== this.points[j][k] && ++diff >= 2) break;
        }
        if (diff === 1) this.edges.push([i, j]);
      }
    }
  }
}

class Transform {
  angle: number;
  index_i: number;
  index_j: number;
  cosA: number;
  sinA: number;
  animate = 0;
  goalAngle = -1;
  angleIndex = 0;

  constructor(a: number, i: number, j: number) {
    this.angle = a;
    this.index_i = i;
    this.index_j = j;
    this.cosA = Math.cos(a);
    this.sinA = Math.sin(a);
  }

  update() {
    this.cosA = Math.cos(this.angle);
    this.sinA = Math.sin(this.angle);
  }

  apply(p: number[]) {
    const pi = p[this.index_i] * this.cosA - p[this.index_j] * this.sinA;
    const pj = p[this.index_i] * this.sinA + p[this.index_j] * this.cosA;
    p[this.index_i] = pi;
    p[this.index_j] = pj;
  }
}

function wrap(a: number): number {
  const pi2 = Math.PI * 2;
  while (a < 0) a += pi2;
  while (a > pi2) a -= pi2;
  return a;
}
function toIndex(angle: number, n: number): number {
  const ind = (angle / (Math.PI * 2)) * n;
  return ind > n - 0.5 ? 0 : Math.round(ind);
}
function toAngle(idx: number, n: number): number {
  return (Math.PI * 2 * idx) / n;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface Params {
  n_dimensions: number;
  n_divisions: number;
  speed: number;
  accentuation: number;
  line_width: number;
}

type RowRefs = {
  la: HTMLElement | null;
  ls: HTMLElement | null;
  ra: HTMLElement | null;
  rs: HTMLElement | null;
  sl: HTMLInputElement | null;
  av: HTMLElement | null;
};

// ─── component ───────────────────────────────────────────────────────────────

const INIT: Params = { n_dimensions: 4, n_divisions: 8, speed: 10, accentuation: 95, line_width: 4 };

export default function KybosPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // animation state lives in refs — no re-renders per frame
  const mp = useRef<Params>({ ...INIT });
  const transforms = useRef<Transform[]>([]);
  const hypercube = useRef<Hypercube | null>(null);
  const anyAnimated = useRef(false);
  const rafId = useRef(0);

  // React state — only for structural re-renders (slider panel + row list)
  const [params, setParams] = useState<Params>(INIT);
  const [rows, setRows] = useState<Array<{ id: number; i: number; j: number }>>([]);

  // DOM refs for per-frame updates (bypassing React)
  const rowRefs = useRef<Record<number, RowRefs>>({});
  const allLA = useRef<HTMLElement | null>(null);
  const allLS = useRef<HTMLElement | null>(null);
  const allRA = useRef<HTMLElement | null>(null);
  const allRS = useRef<HTMLElement | null>(null);

  const ensureRow = (id: number) => {
    if (!rowRefs.current[id])
      rowRefs.current[id] = { la: null, ls: null, ra: null, rs: null, sl: null, av: null };
    return rowRefs.current[id];
  };

  // ── UI sync helpers ─────────────────────────────────────────────────────────

  const syncAllBtns = useCallback(() => {
    const on = anyAnimated.current;
    if (allLA.current) allLA.current.style.display = on ? "none" : "";
    if (allLS.current) allLS.current.style.display = on ? "" : "none";
    if (allRA.current) allRA.current.style.display = on ? "none" : "";
    if (allRS.current) allRS.current.style.display = on ? "" : "none";
  }, []);

  const syncRowBtns = useCallback((idx: number) => {
    const trn = transforms.current[idx];
    const r = rowRefs.current[idx];
    if (!r || !trn) return;
    if (r.la) r.la.style.display = trn.animate === -1 ? "none" : "";
    if (r.ls) r.ls.style.display = trn.animate === -1 ? "" : "none";
    if (r.ra) r.ra.style.display = trn.animate === 1 ? "none" : "";
    if (r.rs) r.rs.style.display = trn.animate === 1 ? "" : "none";
  }, []);

  const checkAny = useCallback(() => {
    anyAnimated.current = transforms.current.some(t => t.animate !== 0);
    syncAllBtns();
  }, [syncAllBtns]);

  // ── actions ─────────────────────────────────────────────────────────────────

  const setAllToIndex = useCallback(() => {
    transforms.current.forEach(t => { t.angle = toAngle(t.angleIndex, mp.current.n_divisions); });
  }, []);

  const stopOne = useCallback((idx: number) => {
    const t = transforms.current[idx];
    if (!t) return;
    t.animate = 0;
    t.angle = toAngle(t.angleIndex, mp.current.n_divisions);
    t.update();
    checkAny();
    syncRowBtns(idx);
  }, [checkAny, syncRowBtns]);

  const stopAll = useCallback(() => {
    transforms.current.forEach(t => { t.animate = 0; });
    anyAnimated.current = false;
    syncAllBtns();
    transforms.current.forEach((_, i) => syncRowBtns(i));
  }, [syncAllBtns, syncRowBtns]);

  const animateOne = useCallback((idx: number, dir: -1 | 1) => {
    transforms.current[idx].animate = dir;
    setAllToIndex();
    anyAnimated.current = true;
    syncAllBtns();
    syncRowBtns(idx);
  }, [setAllToIndex, syncAllBtns, syncRowBtns]);

  const animateAll = useCallback((dir: -1 | 1) => {
    transforms.current.forEach(t => { t.animate = dir; });
    setAllToIndex();
    anyAnimated.current = true;
    syncAllBtns();
    transforms.current.forEach((_, i) => syncRowBtns(i));
  }, [setAllToIndex, syncAllBtns, syncRowBtns]);

  const randomize = useCallback(() => {
    const n = mp.current.n_divisions;
    transforms.current.forEach(t => {
      const ind = Math.floor(Math.random() * n);
      t.angleIndex = ind;
      t.goalAngle = toAngle(ind, n);
    });
  }, []);

  const reset = useCallback(() => {
    transforms.current.forEach(t => { t.goalAngle = 0; t.angleIndex = 0; });
  }, []);

  const sliderChanged = useCallback((idx: number, val: number) => {
    const t = transforms.current[idx];
    if (!t) return;
    t.angleIndex = val;
    t.goalAngle = toAngle(val, mp.current.n_divisions);
  }, []);

  // ── hypercube creation ───────────────────────────────────────────────────────

  const createHypercube = useCallback((n: number) => {
    hypercube.current = new Hypercube(n);
    const ts: Transform[] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        ts.push(new Transform(0, i, j));
    transforms.current = ts;
    anyAnimated.current = false;
    rowRefs.current = {};
    setRows(ts.map((t, id) => ({ id, i: t.index_i, j: t.index_j })));
  }, []);

  // ── draw ────────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv || !hypercube.current) return;
    const { speed, n_divisions, accentuation, line_width } = mp.current;
    const spd = speed / 100;
    const acc = accentuation / 100;

    transforms.current.forEach((trn, i) => {
      if (trn.goalAngle !== -1) {
        trn.angle += (trn.goalAngle - trn.angle) * spd * 2;
        trn.angle = wrap(trn.angle);
        if (Math.abs(trn.angle - trn.goalAngle) < 0.001) {
          trn.angle = trn.goalAngle;
          trn.goalAngle = -1;
        }
        trn.update();
        const r = rowRefs.current[i];
        if (r?.sl) r.sl.value = String(trn.angleIndex);
        if (r?.av) r.av.textContent = String(trn.angleIndex);
      }

      if (trn.animate !== 0) {
        const ps = spd + spd * Math.sin(trn.angle * n_divisions - Math.PI / 2) * acc;
        trn.angle = wrap(trn.angle + (trn.animate === -1 ? -ps : ps));
        trn.angleIndex = toIndex(trn.angle, n_divisions);
        trn.update();
        const r = rowRefs.current[i];
        if (r?.sl) r.sl.value = String(trn.angleIndex);
        if (r?.av) r.av.textContent = String(trn.angleIndex);
      }
    });

    const ctx = cnv.getContext("2d")!;
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    const s = Math.min(cnv.width, cnv.height) * 0.19;
    const cx = cnv.width / 2;
    const cy = cnv.height / 2;
    const hc = hypercube.current;

    const p2d = hc.points.map(pt => {
      const p = pt.slice();
      transforms.current.forEach(t => t.apply(p));
      return [p[0] * s + cx, cy - p[1] * s];
    });

    ctx.lineWidth = line_width;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    hc.edges.forEach(([a, b]) => {
      ctx.moveTo(p2d[a][0], p2d[a][1]);
      ctx.lineTo(p2d[b][0], p2d[b][1]);
    });
    ctx.stroke();
  }, []);

  // ── init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const cnv = canvasRef.current!;
    const resize = () => { cnv.width = cnv.clientWidth; cnv.height = cnv.clientHeight; };
    resize();
    window.addEventListener("resize", resize);
    createHypercube(mp.current.n_dimensions);
    const loop = () => { draw(); rafId.current = requestAnimationFrame(loop); };
    rafId.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(rafId.current); };
  }, [createHypercube, draw]);

  useEffect(() => { syncAllBtns(); }, [rows, syncAllBtns]);

  // ── param handlers ───────────────────────────────────────────────────────────

  const setP = (key: keyof Params, v: number) => {
    mp.current[key] = v;
    setParams(p => ({ ...p, [key]: v }));
  };

  const onDim = (v: number) => { mp.current.n_dimensions = v; setParams(p => ({ ...p, n_dimensions: v })); createHypercube(v); };
  const onDiv = (v: number) => {
    const nd = Math.pow(2, v);
    mp.current.n_divisions = nd;
    setParams(p => ({ ...p, n_divisions: nd }));
    setAllToIndex();
    transforms.current.forEach((_, i) => { const r = rowRefs.current[i]; if (r?.sl) r.sl.max = String(nd - 1); });
  };

  // ── render ───────────────────────────────────────────────────────────────────

  const td: React.CSSProperties = { padding: "4px", color: "#aaa", fontSize: "0.75rem", cursor: "default" };

  const paramRows = [
    { label: "N", title: "number of dimensions",    min: 2, max: 8,   value: params.n_dimensions,              display: params.n_dimensions,  onChange: onDim },
    { label: "D", title: "angle divisions (2^n)",   min: 1, max: 5,   value: Math.log2(params.n_divisions),    display: params.n_divisions,   onChange: onDiv },
    { label: "S", title: "animation speed",          min: 0, max: 100, value: params.speed,                     display: params.speed,         onChange: (v: number) => setP("speed", v) },
    { label: "A", title: "accentuation",             min: 0, max: 99,  value: params.accentuation,              display: params.accentuation,  onChange: (v: number) => setP("accentuation", v) },
    { label: "W", title: "line width",               min: 1, max: 20,  value: params.line_width,                display: params.line_width,    onChange: (v: number) => setP("line_width", v) },
  ];

  return (
    <>
      <style>{`
        .k-range { -webkit-appearance:none; appearance:none; background:#fff; height:1px; outline:0; cursor:pointer; width:100%; vertical-align:middle; display:block; }
        .k-range::-webkit-slider-thumb { -webkit-appearance:none; background:#fff; height:20px; width:1px; }
        .k-range::-moz-range-thumb { -moz-appearance:none; background:#fff; height:20px; width:1px; border:none; border-radius:0; }
        .k-range::-moz-range-track { background:#fff; height:1px; }
        .k-btn { cursor:default; user-select:none; }
      `}</style>

      <div style={{ display: "flex", height: "calc(100vh - 88px)", background: "#000", color: "#fff", overflow: "hidden" }}>

        {/* left panel — sliders */}
        <div style={{ width: "15%", height: "100%", borderRight: "0.5px solid dimgrey", padding: "4px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {paramRows.map(({ label, title, min, max, value, display, onChange }) => (
                <tr key={label}>
                  <td style={td} title={title}>{label}</td>
                  <td style={{ padding: "2px" }}>
                    <input className="k-range" type="range" min={min} max={max} value={value}
                      onChange={e => onChange(parseInt(e.target.value))} />
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>&nbsp;{display}&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* canvas */}
        <div style={{ flex: 1, height: "100%" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>

        {/* right panel — transforms */}
        <div style={{ width: "15%", height: "100%", borderLeft: "0.5px solid dimgrey", padding: "4px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td />
                <td style={{ ...td, textAlign: "right" }}>
                  <span ref={el => { allLA.current = el; }} className="k-btn" onClick={() => animateAll(-1)}>&#9665;</span>
                  <span ref={el => { allLS.current = el; }} className="k-btn" style={{ display: "none" }} onClick={stopAll}>||</span>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <span className="k-btn" style={{ fontSize: "1.2rem", marginRight: 4 }} onClick={randomize}>&#9860;</span>
                  <span className="k-btn" style={{ fontSize: "1.2rem" }} onClick={reset}>&#8676;</span>
                </td>
                <td style={td}>
                  <span ref={el => { allRA.current = el; }} className="k-btn" onClick={() => animateAll(1)}>&#9655;</span>
                  <span ref={el => { allRS.current = el; }} className="k-btn" style={{ display: "none" }} onClick={stopAll}>||</span>
                </td>
                <td />
              </tr>

              {rows.map(({ id, i, j }) => (
                <tr key={id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{i}-{j}</td>
                  <td style={{ ...td, textAlign: "right", paddingRight: 0 }}>
                    <span ref={el => { ensureRow(id).la = el; }} className="k-btn" onClick={() => animateOne(id, -1)}>&#9665;</span>
                    <span ref={el => { ensureRow(id).ls = el; }} className="k-btn" style={{ display: "none" }} onClick={() => stopOne(id)}>||</span>
                  </td>
                  <td style={{ padding: "2px" }}>
                    <input ref={el => { ensureRow(id).sl = el; }} className="k-range" type="range"
                      min={0} max={params.n_divisions - 1} defaultValue={0}
                      onChange={e => sliderChanged(id, parseInt(e.target.value))} />
                  </td>
                  <td style={{ ...td, paddingLeft: 0 }}>
                    <span ref={el => { ensureRow(id).ra = el; }} className="k-btn" onClick={() => animateOne(id, 1)}>&#9655;</span>
                    <span ref={el => { ensureRow(id).rs = el; }} className="k-btn" style={{ display: "none" }} onClick={() => stopOne(id)}>||</span>
                  </td>
                  <td ref={el => { ensureRow(id).av = el as HTMLElement | null; }} style={td}>0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
