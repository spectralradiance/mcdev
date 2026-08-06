"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Hypercube, Transform, wrap, toIndex, toAngle } from "./hypercube";
import { type Params, INIT } from "./types";
import { type ThreeScene, createThreeScene, rebuildMeshes } from "./three-scene";
import { parseUrlState } from "./url-state";

/** Per-transform DOM refs updated directly each frame, bypassing React's reconciler. */
type RowRefs = {
  la: HTMLElement | null;
  ls: HTMLElement | null;
  ra: HTMLElement | null;
  rs: HTMLElement | null;
  sl: HTMLInputElement | null;
  av: HTMLElement | null;
};

// ─── component ───────────────────────────────────────────────────────────────

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-1 py-0.5 mt-1 cursor-pointer select-none" onClick={onToggle}>
      <span className="text-xs text-gray-500">{label}</span>
      <div className={`relative w-7 h-3.5 rounded-full transition-colors ${on ? "bg-white" : "bg-gray-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-black transition-transform ${on ? "translate-x-3.5" : "translate-x-0"}`} />
      </div>
    </div>
  );
}

export default function KybosPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // All mutable animation state in refs — the RAF loop never triggers React re-renders
  const mp = useRef<Params>({ ...INIT });
  const transforms = useRef<Transform[]>([]);
  const hypercube = useRef<Hypercube | null>(null);
  const anyAnimated = useRef(false);
  const rafId = useRef(0);
  const modeRef = useRef<"2d" | "3d">("2d");
  const threeRef = useRef<ThreeScene | null>(null);

  // React state — only for structural re-renders (slider panel + row list)
  const [params, setParams] = useState<Params>(INIT);
  const [rows, setRows] = useState<Array<{ id: number; i: number; j: number }>>([]);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [showFaces, setShowFaces] = useState(false);
  const showFacesRef = useRef(false);
  const [showEdges, setShowEdges] = useState(true);
  const showEdgesRef = useRef(true);
  const [showVertices, setShowVertices] = useState(true);
  const showVerticesRef = useRef(true);

  // DOM refs for per-frame updates (bypassing React)
  const rowRefs = useRef<Record<number, RowRefs>>({});
  const threeContainerRef = useRef<HTMLDivElement>(null);
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

  // ── hypercube & Three.js mesh creation ───────────────────────────────────────

  const createThreeObjects = useCallback(() => {
    if (threeRef.current && hypercube.current)
      rebuildMeshes(threeRef.current, hypercube.current);
  }, []);

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
    createThreeObjects();
  }, [createThreeObjects]);

  // ── draw ────────────────────────────────────────────────────────────────────

  // Advances all transform angles one step; writes index/value to per-row DOM directly.
  const stepTransforms = useCallback(() => {
    const { speed, n_divisions, accentuation } = mp.current;
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
        // Accentuation: sinusoidal speed bump at each division boundary
      const ps = spd + spd * Math.sin(trn.angle * n_divisions - Math.PI / 2) * acc;
        trn.angle = wrap(trn.angle + (trn.animate === -1 ? -ps : ps));
        trn.angleIndex = toIndex(trn.angle, n_divisions);
        trn.update();
        const r = rowRefs.current[i];
        if (r?.sl) r.sl.value = String(trn.angleIndex);
        if (r?.av) r.av.textContent = String(trn.angleIndex);
      }
    });
  }, []);

  // Projects N-D → 2D: x = p[0], y = p[1] after all rotations.
  const renderCanvas = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv || !hypercube.current) return;
    const { line_width } = mp.current;
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
    if (showFacesRef.current) {
      ctx.globalAlpha = mp.current.face_alpha / 100;
      ctx.fillStyle = "#fff";
      hc.faces.forEach(([a, b, c, d]) => {
        ctx.beginPath();
        ctx.moveTo(p2d[a][0], p2d[a][1]);
        ctx.lineTo(p2d[b][0], p2d[b][1]);
        ctx.lineTo(p2d[c][0], p2d[c][1]);
        ctx.lineTo(p2d[d][0], p2d[d][1]);
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    if (showEdgesRef.current) {
      ctx.lineWidth = line_width;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#fff";
      ctx.beginPath();
      hc.edges.forEach(([a, b]) => {
        ctx.moveTo(p2d[a][0], p2d[a][1]);
        ctx.lineTo(p2d[b][0], p2d[b][1]);
      });
      ctx.stroke();
    }
    if (showVerticesRef.current) {
      ctx.fillStyle = "#fff";
      p2d.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, []);

  // Projects N-D → 3D: x = p[0], y = p[1], z = p[2]. Cylinders are unit-height meshes scaled and rotated to each edge.
  const draw3D = useCallback(() => {
    const ts = threeRef.current;
    if (!ts || !hypercube.current) return;
    const S = 1.5;
    const hc = hypercube.current;
    const pts = hc.points.map(pt => {
      const p = pt.slice();
      transforms.current.forEach(t => t.apply(p));
      return new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);
    });
    pts.forEach((v, i) => { ts.spheres[i]?.position.copy(v); });
    const yAxis = new THREE.Vector3(0, 1, 0);
    hc.edges.forEach(([a, b], i) => {
      const mesh = ts.edgeCylinders[i];
      if (!mesh) return;
      const dir = pts[b].clone().sub(pts[a]);
      const len = dir.length();
      if (len < 1e-6) return;
      // Scale edge radius with line_width; line_width=4 matches the base cylinder radius
      const edgeR = mp.current.line_width / 4;
      mesh.scale.set(edgeR, len, edgeR);
      mesh.position.copy(pts[a]).addScaledVector(dir.normalize(), len / 2);
      mesh.quaternion.setFromUnitVectors(yAxis, dir);
    });
    ts.edgeCylinders.forEach(m => { m.visible = showEdgesRef.current; });
    ts.spheres.forEach(m => { m.visible = showVerticesRef.current; });
    if (ts.faceMesh) {
      ts.faceMesh.visible = showFacesRef.current;
      if (showFacesRef.current) {
        const pos = ts.faceMesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        let idx = 0;
        hc.faces.forEach(([a, b, c, d]) => {
          arr[idx++] = pts[a].x; arr[idx++] = pts[a].y; arr[idx++] = pts[a].z;
          arr[idx++] = pts[b].x; arr[idx++] = pts[b].y; arr[idx++] = pts[b].z;
          arr[idx++] = pts[c].x; arr[idx++] = pts[c].y; arr[idx++] = pts[c].z;
          arr[idx++] = pts[a].x; arr[idx++] = pts[a].y; arr[idx++] = pts[a].z;
          arr[idx++] = pts[c].x; arr[idx++] = pts[c].y; arr[idx++] = pts[c].z;
          arr[idx++] = pts[d].x; arr[idx++] = pts[d].y; arr[idx++] = pts[d].z;
        });
        pos.needsUpdate = true;
        ts.faceMat.opacity = mp.current.face_alpha / 100;
      }
    }
    ts.controls.update();
    ts.renderer.render(ts.scene, ts.camera);
  }, []);

  // ── Three.js scene init (lazy: runs only on first 3D switch) ─────────────────

  const initThree = useCallback(() => {
    const container = threeContainerRef.current;
    if (!container) return;
    threeRef.current = createThreeScene(container);
    createThreeObjects();
  }, [createThreeObjects]);

  // ── init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const cnv = canvasRef.current!;
    const resize = () => {
      cnv.width = cnv.clientWidth;
      cnv.height = cnv.clientHeight;
      const ts = threeRef.current;
      const cont = threeContainerRef.current;
      if (ts && cont) {
        ts.renderer.setSize(cont.clientWidth, cont.clientHeight);
        ts.camera.aspect = cont.clientWidth / cont.clientHeight;
        ts.camera.updateProjectionMatrix();
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const saved = parseUrlState();
    if (saved) {
      Object.assign(mp.current, saved.params);
      setParams({ ...mp.current });
    }

    createHypercube(mp.current.n_dimensions);

    // Apply saved transform states after createHypercube sets transforms.current
    if (saved?.transforms.length) {
      saved.transforms.forEach(([idx, anim]: [number, number], i: number) => {
        const t = transforms.current[i];
        if (!t) return;
        t.angleIndex = idx;
        t.angle = toAngle(idx, mp.current.n_divisions);
        t.animate = anim;
        t.update();
      });
      anyAnimated.current = transforms.current.some(t => t.animate !== 0);
    }

    const loop = () => {
      stepTransforms();
      if (modeRef.current === "2d") renderCanvas(); else draw3D();
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId.current);
      const ts = threeRef.current;
      if (ts) { ts.renderer.domElement.remove(); ts.renderer.dispose(); threeRef.current = null; }
    };
  }, [createHypercube, stepTransforms, renderCanvas, draw3D]);

  useEffect(() => {
    if (mode === "3d" && !threeRef.current) initThree();
  }, [mode, initThree]);

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

  const switchMode = () => {
    const next: "2d" | "3d" = modeRef.current === "2d" ? "3d" : "2d";
    modeRef.current = next;
    setMode(next);
    if (next === "3d") {
      const ts = threeRef.current;
      if (ts) {
        ts.camera.position.set(0, 0, 10);
        ts.controls.target.set(0, 0, 0);
        ts.controls.update();
      }
    }
  };

  const copySettings = () => {
    const state = {
      d: mp.current.n_dimensions,
      v: Math.log2(mp.current.n_divisions),
      s: mp.current.speed,
      a: mp.current.accentuation,
      w: mp.current.line_width,
      fa: mp.current.face_alpha,
      sv: showVerticesRef.current ? 1 : 0,
      se: showEdgesRef.current ? 1 : 0,
      sf: showFacesRef.current ? 1 : 0,
      t: transforms.current.map(t => [t.angleIndex, t.animate]),
    };
    const encoded = btoa(JSON.stringify(state));
    window.history.replaceState(null, "", `?k=${encoded}`);
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?k=${encoded}`).catch(() => {});
  };

  // ── render ───────────────────────────────────────────────────────────────────

  const td: React.CSSProperties = { padding: "4px", color: "#aaa", fontSize: "0.75rem", cursor: "default" };

  const paramRows = [
    { label: "N", title: "number of dimensions",    min: 2, max: 8,   value: params.n_dimensions,              display: params.n_dimensions,  onChange: onDim },
    { label: "D", title: "angle divisions (2^n)",   min: 1, max: 5,   value: Math.log2(params.n_divisions),    display: params.n_divisions,   onChange: onDiv },
    { label: "S", title: "animation speed",          min: 0, max: 10, value: params.speed,                     display: params.speed,         onChange: (v: number) => setP("speed", v) },
    { label: "A", title: "accentuation",             min: 0, max: 99,  value: params.accentuation,              display: params.accentuation,  onChange: (v: number) => setP("accentuation", v) },
    { label: "W", title: "line width",               min: 1, max: 20,  value: params.line_width,                display: params.line_width,    onChange: (v: number) => setP("line_width", v) },
    { label: "T", title: "face opacity %",            min: 0, max: 100, value: params.face_alpha,                 display: params.face_alpha,    onChange: (v: number) => setP("face_alpha", v) },
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
          <button onClick={copySettings} style={{
            marginTop: "8px", width: "100%", background: "transparent",
            border: "0.5px solid dimgrey", color: "#888",
            fontSize: "0.7rem", padding: "4px", cursor: "pointer",
          }}>copy link</button>
          <Toggle label="vertices" on={showVertices} onToggle={() => { showVerticesRef.current = !showVerticesRef.current; setShowVertices(v => !v); }} />
          <Toggle label="edges" on={showEdges} onToggle={() => { showEdgesRef.current = !showEdgesRef.current; setShowEdges(e => !e); }} />
          <Toggle label="faces" on={showFaces} onToggle={() => { showFacesRef.current = !showFacesRef.current; setShowFaces(f => !f); }} />
        </div>

        {/* canvas / 3D viewport */}
        <div style={{ flex: 1, height: "100%", position: "relative" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: mode === "2d" ? "block" : "none" }} />
          <div ref={threeContainerRef} style={{ width: "100%", height: "100%", display: mode === "3d" ? "block" : "none" }} />
          <button onClick={switchMode} style={{
            position: "absolute", top: 8, right: 8,
            background: "transparent", border: "0.5px solid dimgrey",
            color: "#aaa", fontSize: "0.7rem", padding: "2px 8px", cursor: "pointer",
          }}>
            {mode === "2d" ? "3D" : "2D"}
          </button>
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
