"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { type Polytope, Cell24, Cell600, Hypercube, Transform, wrap, toIndex, toAngle } from "./hypercube";
import { type Params, INIT } from "./types";
import { type ThreeScene, createThreeScene, rebuildMeshes, rebuildSphereLines } from "./three-scene";
import { parseUrlState } from "./url-state";
import { generateSphere, stereographic, type SphereCurves } from "./hypersphere";

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

const SPHERE_RINGS = 5;
const SPHERE_STEPS = 60;

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
  const hypercube = useRef<Polytope | null>(null);
  const anyAnimated = useRef(false);
  const rafId = useRef(0);
  const modeRef = useRef<"2d" | "3d">("2d");
  const threeRef = useRef<ThreeScene | null>(null);
  const shapeRef = useRef<"cube" | "sphere" | "24cell" | "600cell">("cube");
  const sphereRef = useRef<SphereCurves | null>(null);
  const cell24Ref = useRef(new Cell24());
  const cell600Ref = useRef(new Cell600());
  const perspRef = useRef(false);

  // React state — only for structural re-renders (slider panel + row list)
  const [params, setParams] = useState<Params>(INIT);
  const [rows, setRows] = useState<Array<{ id: number; i: number; j: number }>>([]);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [shape, setShape] = useState<"cube" | "sphere" | "24cell" | "600cell">("cube");
  const [persp, setPersp] = useState(false);
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

  // Projects N-D → 2D for cube (orthographic) or S³ (stereographic).
  const renderCanvas = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d")!;
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    const cx = cnv.width / 2, cy = cnv.height / 2;

    if (shapeRef.current === "sphere" && sphereRef.current) {
      const sphere = sphereRef.current;
      const S = Math.min(cnv.width, cnv.height) * 0.22;
      const familyColors = ["#ff5050", "#50ff50", "#5080ff"];
      const [, f1, f2] = sphere.familyStarts;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.55;
      sphere.curves.forEach((curve, ci) => {
        const family = ci < f1 ? 0 : ci < f2 ? 1 : 2;
        ctx.strokeStyle = familyColors[family];
        ctx.beginPath();
        let penDown = false;
        curve.forEach(pt => {
          const p = pt.slice();
          transforms.current.forEach(t => t.apply(p));
          const [X, Y] = stereographic(p);
          if (!isFinite(X) || !isFinite(Y) || Math.hypot(X, Y) > 8) { penDown = false; return; }
          const sx = X * S + cx, sy = -Y * S + cy;
          if (!penDown) { ctx.moveTo(sx, sy); penDown = true; } else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      return;
    }

    if (!hypercube.current) return;
    const { line_width } = mp.current;
    const s = Math.min(cnv.width, cnv.height) * 0.19;
    const hc = hypercube.current;
    const p2d = hc.points.map(pt => {
      const p = pt.slice();
      transforms.current.forEach(t => t.apply(p));
      if (perspRef.current) {
        const d = mp.current.persp_dist;
        const f = d / Math.max(d - p[3], 0.1);
        return [p[0] * f * s + cx, cy - p[1] * f * s];
      }
      return [p[0] * s + cx, cy - p[1] * s];
    });
    const glowAmt = mp.current.glow;
    if (glowAmt > 0) { ctx.shadowBlur = glowAmt * 0.7; ctx.shadowColor = "#fff"; }
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
        ctx.arc(x, y, mp.current.vertex_size * 0.25, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.shadowBlur = 0;
  }, []);

  // Projects N-D → 3D for cube (orthographic) or S³ (stereographic).
  const draw3D = useCallback(() => {
    const ts = threeRef.current;
    if (!ts) return;
    const isSphere = shapeRef.current === "sphere";

    if (isSphere && sphereRef.current) {
      ts.spheres.forEach(m => { m.visible = false; });
      ts.edgeCylinders.forEach(m => { m.visible = false; });
      if (ts.faceMesh) ts.faceMesh.visible = false;
      if (ts.sphereLines) {
        ts.sphereLines.visible = true;
        const S = 2.0;
        const sphere = sphereRef.current;
        const pos = ts.sphereLines.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        let idx = 0;
        sphere.curves.forEach(curve => {
          const proj = curve.map(pt => {
            const p = pt.slice();
            transforms.current.forEach(t => t.apply(p));
            const [X, Y, Z] = stereographic(p);
            return [isFinite(X) ? X * S : 0, isFinite(Y) ? Y * S : 0, isFinite(Z) ? Z * S : 0];
          });
          for (let i = 0; i < sphere.segmentsPerCurve; i++) {
            arr[idx++] = proj[i][0];   arr[idx++] = proj[i][1];   arr[idx++] = proj[i][2];
            arr[idx++] = proj[i+1][0]; arr[idx++] = proj[i+1][1]; arr[idx++] = proj[i+1][2];
          }
        });
        pos.needsUpdate = true;
      }
    } else if (!isSphere && hypercube.current) {
      if (ts.sphereLines) ts.sphereLines.visible = false;
      const S = 1.5;
      const hc = hypercube.current;
      const pts = hc.points.map(pt => {
        const p = pt.slice();
        transforms.current.forEach(t => t.apply(p));
        if (perspRef.current) {
          const d = mp.current.persp_dist;
          const f = d / Math.max(d - p[3], 0.1);
          return new THREE.Vector3(p[0]*f*S, p[1]*f*S, p[2]*f*S);
        }
        return new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);
      });
      const vScale = mp.current.vertex_size / 10;
      pts.forEach((v, i) => { const m = ts.spheres[i]; if (m) { m.position.copy(v); m.scale.setScalar(vScale); } });
      const yAxis = new THREE.Vector3(0, 1, 0);
      hc.edges.forEach(([a, b], i) => {
        const mesh = ts.edgeCylinders[i];
        if (!mesh) return;
        const dir = pts[b].clone().sub(pts[a]);
        const len = dir.length();
        if (len < 1e-6) return;
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
    }

    // Emissive intensity is the lightweight 3D glow (no post-processing needed)
    const emissive = mp.current.glow / 30;
    ts.sphereMat.emissiveIntensity = emissive;
    ts.cylinderMat.emissiveIntensity = emissive;
    ts.controls.update();
    ts.renderer.render(ts.scene, ts.camera);
  }, []);

  // ── Three.js scene init (lazy: runs only on first 3D switch) ─────────────────

  const initThree = useCallback(() => {
    const container = threeContainerRef.current;
    if (!container) return;
    threeRef.current = createThreeScene(container);
    createThreeObjects();
    if (sphereRef.current) rebuildSphereLines(threeRef.current, sphereRef.current);
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
      if (saved.toggles) {
        showVerticesRef.current = saved.toggles.vertices;
        showEdgesRef.current    = saved.toggles.edges;
        showFacesRef.current    = saved.toggles.faces;
        setShowVertices(saved.toggles.vertices);
        setShowEdges(saved.toggles.edges);
        setShowFaces(saved.toggles.faces);
      }
    }

    sphereRef.current = generateSphere(SPHERE_RINGS, SPHERE_STEPS);
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

  // Rebuild Three.js meshes when shape changes while in 3D mode
  useEffect(() => {
    if (mode === "3d" && threeRef.current) createThreeObjects();
  }, [shape, mode, createThreeObjects]);

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
    if (next === "2d") {
      // Snapshot dimensions from the visible Three.js container before the canvas is un-hidden
      const cont = threeContainerRef.current;
      const cnv = canvasRef.current;
      if (cont && cnv) { cnv.width = cont.clientWidth; cnv.height = cont.clientHeight; }
    }
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

  const selectShape = (s: "cube" | "sphere" | "24cell" | "600cell") => {
    shapeRef.current = s;
    setShape(s);
    if (s === "24cell") { hypercube.current = cell24Ref.current; createThreeObjects(); }
    else if (s === "600cell") { hypercube.current = cell600Ref.current; createThreeObjects(); }
    else if (s === "cube") { createHypercube(mp.current.n_dimensions); }
  };

  const copySettings = () => {
    const state = {
      d: mp.current.n_dimensions,
      v: Math.log2(mp.current.n_divisions),
      s: mp.current.speed,
      a: mp.current.accentuation,
      w: mp.current.line_width,
      fa: mp.current.face_alpha,
      g: mp.current.glow,
      pd: mp.current.persp_dist,
      vs: mp.current.vertex_size,
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
  const gh: React.CSSProperties = { fontSize: "0.6rem", color: "#555", borderBottom: "0.5px solid #333", padding: "1px 0", marginTop: "6px", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.05em" };
  const sr = (label: string, title: string, min: number, max: number, value: number, display: number | string, onChange: (v: number) => void) => (
    <tr key={label}>
      <td style={{ ...td, fontSize: "0.62rem", whiteSpace: "nowrap" }} title={title}>{label}</td>
      <td style={{ padding: "2px" }}>
        <input className="k-range" type="range" min={min} max={max} value={value}
          onChange={e => onChange(parseInt(e.target.value))} />
      </td>
      <td style={{ ...td, whiteSpace: "nowrap", fontSize: "0.65rem" }}>&nbsp;{display}&nbsp;</td>
    </tr>
  );

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

        {/* left panel — grouped controls */}
        <div style={{ width: "15%", height: "100%", borderRight: "0.5px solid dimgrey", padding: "4px", overflowY: "auto" }}>

          <div style={gh}>object</div>
          <select
            value={shape}
            onChange={e => selectShape(e.target.value as "cube" | "sphere" | "24cell" | "600cell")}
            style={{ background: "black", color: "#aaa", border: "0.5px solid dimgrey", width: "100%", padding: "2px 4px", fontSize: "0.7rem", cursor: "pointer", outline: "none", marginBottom: "2px" }}
          >
            <option value="cube">hypercube</option>
            <option value="sphere">S³ hypersphere</option>
            <option value="24cell">24-cell (icositetrachoron)</option>
            <option value="600cell">600-cell (hexacosichoron)</option>
          </select>
          {shape === "cube" && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
              {sr("dimensions", "number of dimensions", 2, 8, params.n_dimensions, params.n_dimensions, onDim)}
            </tbody></table>
          )}

          <div style={gh}>animation</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {sr("divisions", "angle divisions (2^n)", 1, 5, Math.log2(params.n_divisions), params.n_divisions, onDiv)}
            {sr("speed", "animation speed", 0, 10, params.speed, params.speed, v => setP("speed", v))}
            {sr("accentuation", "accentuation", 0, 99, params.accentuation, params.accentuation, v => setP("accentuation", v))}
          </tbody></table>

          <div style={gh}>vertices</div>
          <Toggle label="show" on={showVertices} onToggle={() => { showVerticesRef.current = !showVerticesRef.current; setShowVertices(v => !v); }} />
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {sr("radius", "vertex radius", 1, 30, params.vertex_size, params.vertex_size, v => setP("vertex_size", v))}
          </tbody></table>

          <div style={gh}>edges</div>
          <Toggle label="show" on={showEdges} onToggle={() => { showEdgesRef.current = !showEdgesRef.current; setShowEdges(e => !e); }} />
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {sr("width", "line width", 1, 20, params.line_width, params.line_width, v => setP("line_width", v))}
          </tbody></table>

          <div style={gh}>faces</div>
          <Toggle label="show" on={showFaces} onToggle={() => { showFacesRef.current = !showFacesRef.current; setShowFaces(f => !f); }} />
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {sr("opacity", "face opacity %", 0, 100, params.face_alpha, params.face_alpha, v => setP("face_alpha", v))}
          </tbody></table>

          <div style={gh}>view</div>
          <Toggle label="perspective" on={persp} onToggle={() => { perspRef.current = !perspRef.current; setPersp(p => !p); }} />
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {sr("glow", "glow intensity", 0, 30, params.glow, params.glow, v => setP("glow", v))}
            {sr("distance", "perspective distance", 2, 8, params.persp_dist, params.persp_dist, v => setP("persp_dist", v))}
          </tbody></table>

          <button onClick={copySettings} style={{
            marginTop: "8px", width: "100%", background: "transparent",
            border: "0.5px solid dimgrey", color: "#888",
            fontSize: "0.7rem", padding: "4px", cursor: "pointer",
          }}>copy link</button>
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
