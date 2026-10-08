"use client";

import { useEffect, useRef, useState } from "react";
import { isNative, SCENES } from "./scene";
import {
  BACKENDS,
  RENDER_ENGINES,
  WEBGPU_ENGINES,
  type Backend,
  type RenderEngine,
  type WebGpuEngineId,
} from "./gpu/engines";
import { PathTracerRenderer } from "./gpu/renderer";
import { defaultDisplay, type DisplaySettings, type ToneMap } from "./display";
import { defaultRealtime, type RealtimeOptions } from "./webgpu/realtime";
import { webGpuAvailable, WebGpuRenderer } from "./webgpu/renderer";

// What the page needs from either backend.
interface ActiveRenderer {
  setSize(width: number, height: number): void;
  renderFrame(): void;
  readonly sampleCount: number;
  dispose(): void;
}

const selectStyle = {
  background: "black",
  color: "#ccc",
  border: "0.5px solid dimgrey",
  padding: "4px 8px",
  fontSize: "0.75rem",
  cursor: "pointer",
  outline: "none",
} as const;

const labelStyle = { display: "flex", alignItems: "center", gap: "0.4rem" } as const;

const NiamhPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const samplesRef = useRef<HTMLSpanElement>(null);
  const webglRef = useRef<PathTracerRenderer | null>(null);
  const webgpuRef = useRef<WebGpuRenderer | null>(null);
  const rafRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const statsRef = useRef<HTMLDivElement>(null);
  const [backend, setBackend] = useState<Backend>("webgl2");
  const [glEngine, setGlEngine] = useState<RenderEngine>("nee-mis");
  const [gpuEngine, setGpuEngine] = useState<WebGpuEngineId>("nee-mis");
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;
  const gpuAvailable = webGpuAvailable();

  // Render settings. Both backends take bounces, resolution scale and display settings; the ReSTIR block is WebGPU-only.
  const [bounces, setBounces] = useState<number | null>(null); // null keeps the scene's own limit
  const [renderScale, setRenderScale] = useState(1);
  const [display, setDisplay] = useState<DisplaySettings>({ ...defaultDisplay });
  const [realtime, setRealtime] = useState<RealtimeOptions>({ ...defaultRealtime });
  // WebGPU-only view controls.
  const [running, setRunning] = useState(true);
  const [channel, setChannel] = useState(0);
  const [sortMaterials, setSortMaterials] = useState(true);
  const [alive, setAlive] = useState<number[]>([]);
  const settingsRef = useRef({ bounces, renderScale, display, realtime, running, channel, sortMaterials });
  settingsRef.current = { bounces, renderScale, display, realtime, running, channel, sortMaterials };
  const resizeRef = useRef<(() => void) | null>(null);


  const applySettings = () => {
    const { bounces: b, display: d, realtime: r, running: run, channel: ch, sortMaterials: sort } = settingsRef.current;
    for (const renderer of [webglRef.current, webgpuRef.current]) {
      if (!renderer) continue;
      if (b !== null) renderer.setMaxBounces(b);
      renderer.setDisplay(d);
    }
    webgpuRef.current?.setRealtimeOptions(r);
    webgpuRef.current?.setPaused(!run);
    webgpuRef.current?.setChannel(ch);
    webgpuRef.current?.setSortMaterials(sort);
  };
  useEffect(applySettings, [bounces, display, realtime, running, channel, sortMaterials]);
  useEffect(() => resizeRef.current?.(), [renderScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const currentScene = () => {
      const entry = SCENES.find((x) => x.id === sceneIdRef.current) ?? SCENES[0];
      // Native rtadvanced scenes only exist on the WebGPU backend.
      return backend === "webgl2" && isNative(entry.scene) ? SCENES[0].scene : entry.scene;
    };
    let cancelled = false;
    let renderer: ActiveRenderer | null = null;
    let observer: ResizeObserver | null = null;
    setError(null);
    setNotes([]);

    const start = async () => {
      try {
        if (backend === "webgpu") {
          const gpu = await WebGpuRenderer.create(canvas);
          if (cancelled) {
            gpu.dispose();
            return;
          }
          gpu.setScene(currentScene());
          gpu.setEngine(gpuEngineRef.current);
          webgpuRef.current = gpu;
          renderer = gpu;
          applySettings();
        } else {
          const gl = new PathTracerRenderer(canvas);
          gl.setScene(currentScene());
          gl.setEngine(glEngineRef.current);
          webglRef.current = gl;
          renderer = gl;
          applySettings();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        return;
      }

      const resize = () => {
        // Render below display resolution when asked; CSS stretches the canvas back up.
        const width = Math.max(1, Math.round(container.clientWidth * settingsRef.current.renderScale));
        const height = Math.round(width * 0.75);
        // A canvas that already owns a WebGPU context is resized by the renderer when it rebuilds.
        if (backend === "webgl2") {
          canvas.width = width;
          canvas.height = height;
        }
        renderer!.setSize(width, height);
      };
      resize();
      resizeRef.current = resize;
      observer = new ResizeObserver(resize);
      observer.observe(container);

      const loop = () => {
        try {
          renderer!.renderFrame();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          return;
        }
        if (samplesRef.current) samplesRef.current.textContent = String(renderer!.sampleCount);
        if (statsRef.current) {
          statsRef.current.textContent = backend === "webgpu" ? (webgpuRef.current?.statsText() ?? "") : "";
        }
        if (webgpuRef.current && backend === "webgpu") {
          // A scene that fails to load reports here and leaves the previous render running.
          const loadError = webgpuRef.current.loadError ?? null;
          setError((prev) => (prev === loadError ? prev : loadError));
          const nextAlive = webgpuRef.current.alive;
          setAlive((prev) => (prev.length === nextAlive.length && prev.every((v, i) => v === nextAlive[i]) ? prev : nextAlive));
          const next = webgpuRef.current.unsupported;
          setNotes((prev) => (prev.join("|") === next.join("|") ? prev : next));
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    };
    start();

    return () => {
      cancelled = true;
      resizeRef.current = null;
      cancelAnimationFrame(rafRef.current);
      observer?.disconnect();
      renderer?.dispose();
      webglRef.current = null;
      webgpuRef.current = null;
    };
  }, [backend]);

  // The effect above reads the current engine choices through refs so changing an engine doesn't tear down the context.
  const glEngineRef = useRef(glEngine);
  const gpuEngineRef = useRef(gpuEngine);
  glEngineRef.current = glEngine;
  gpuEngineRef.current = gpuEngine;

  const selectScene = (id: string) => {
    setSceneId(id);
    const scene = (SCENES.find((x) => x.id === id) ?? SCENES[0]).scene;
    webgpuRef.current?.setScene(scene);
    if (!isNative(scene)) webglRef.current?.setScene(scene);
  };
  const selectGlEngine = (next: RenderEngine) => {
    setGlEngine(next);
    webglRef.current?.setEngine(next);
  };
  const selectGpuEngine = (next: WebGpuEngineId) => {
    setGpuEngine(next);
    webgpuRef.current?.setEngine(next);
  };

  const description =
    backend === "webgpu"
      ? WEBGPU_ENGINES.find((e) => e.id === gpuEngine)?.description
      : (RENDER_ENGINES.find((e) => e.id === glEngine) ?? RENDER_ENGINES[0]).description;

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: "1200px" }}>
        <h1>Niamh</h1>
        <p style={{ color: "#888", fontSize: "0.85rem" }}>
          GPU ray tracer with a WebGL2 fragment-shader backend and a WebGPU wavefront backend. Drag to orbit, scroll to
          zoom.{" "}
          <a href="https://github.com/spectralradiance/niamh" target="_blank" rel="noopener noreferrer" style={{ color: "#aaa" }}>
            Source on GitHub
          </a>
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <select
            value={backend}
            onChange={(e) => {
              const next = e.target.value as Backend;
              // The WebGL2 backend can't load rtadvanced's scene files.
              const current = SCENES.find((x) => x.id === sceneId);
              if (next === "webgl2" && current && isNative(current.scene)) setSceneId(SCENES[0].id);
              setBackend(next);
            }}
            style={selectStyle}
          >
            {BACKENDS.map((b) => (
              <option key={b.id} value={b.id} disabled={b.id === "webgpu" && !gpuAvailable}>
                {b.label}
                {b.id === "webgpu" && !gpuAvailable ? " — unavailable" : ""}
              </option>
            ))}
          </select>
          {backend === "webgpu" ? (
            <select value={gpuEngine} onChange={(e) => selectGpuEngine(e.target.value as WebGpuEngineId)} style={selectStyle}>
              {WEBGPU_ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          ) : (
            <select value={glEngine} onChange={(e) => selectGlEngine(e.target.value as RenderEngine)} style={selectStyle}>
              {RENDER_ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          )}
          <select value={sceneId} onChange={(e) => selectScene(e.target.value)} style={selectStyle}>
            {SCENES.filter((x) => backend === "webgpu" || !isNative(x.scene)).map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <span style={{ color: "#666", fontSize: "0.72rem" }}>{description}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem", flexWrap: "wrap", color: "#888", fontSize: "0.72rem" }}>
          <label style={labelStyle}>
            bounces {bounces ?? 6}
            <input type="range" min={1} max={16} value={bounces ?? 6} onChange={(e) => setBounces(Number(e.target.value))} />
          </label>
          <label style={labelStyle}>
            resolution {Math.round(renderScale * 100)}%
            <input type="range" min={0.25} max={1} step={0.25} value={renderScale} onChange={(e) => setRenderScale(Number(e.target.value))} />
          </label>
          <label style={labelStyle}>
            exposure {display.exposure.toFixed(1)}
            <input type="range" min={-4} max={4} step={0.25} value={display.exposure} onChange={(e) => setDisplay({ ...display, exposure: Number(e.target.value) })} />
          </label>
          <select value={display.toneMap} onChange={(e) => setDisplay({ ...display, toneMap: e.target.value as ToneMap })} style={selectStyle}>
            <option value="clamp">Clamp</option>
            <option value="reinhard">Reinhard</option>
            <option value="aces">ACES</option>
          </select>
        </div>
        {backend === "webgpu" && (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem", flexWrap: "wrap", color: "#888", fontSize: "0.72rem" }}>
            <label style={labelStyle}>
              <input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} />
              running
            </label>
            <select value={channel} onChange={(e) => setChannel(Number(e.target.value))} style={selectStyle}>
              <option value={0}>Radiance</option>
              <option value={1}>Albedo</option>
              <option value={2}>Normal</option>
              <option value={3}>Depth</option>
            </select>
            <label style={labelStyle} title="Sort paths into per-material queues to cut shader divergence">
              <input type="checkbox" checked={sortMaterials} onChange={(e) => setSortMaterials(e.target.checked)} />
              sort by material
            </label>
            {gpuEngine !== "realtime" && alive.length > 0 && (
              <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24 }} title="paths still alive entering each bounce">
                {alive.map((fraction, bounce) => (
                  <span
                    key={bounce}
                    title={`bounce ${bounce}: ${(fraction * 100).toFixed(0)}% alive`}
                    style={{ width: 6, height: `${Math.max(1, fraction * 100)}%`, background: "#58a" }}
                  />
                ))}
              </span>
            )}
          </div>
        )}
        {backend === "webgpu" && gpuEngine === "realtime" && (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem", flexWrap: "wrap", color: "#888", fontSize: "0.72rem" }}>
            <label style={labelStyle}>
              candidates {realtime.candidates}
              <input type="range" min={1} max={32} value={realtime.candidates} onChange={(e) => setRealtime({ ...realtime, candidates: Number(e.target.value) })} />
            </label>
            <label style={labelStyle}>
              <input type="checkbox" checked={realtime.temporalReuse} onChange={(e) => setRealtime({ ...realtime, temporalReuse: e.target.checked })} />
              temporal reuse
            </label>
            <label style={labelStyle}>
              <input type="checkbox" checked={realtime.spatialReuse} onChange={(e) => setRealtime({ ...realtime, spatialReuse: e.target.checked })} />
              spatial reuse
            </label>
            <label style={labelStyle}>
              history {realtime.maxHistory}
              <input type="range" min={1} max={64} value={realtime.maxHistory} onChange={(e) => setRealtime({ ...realtime, maxHistory: Number(e.target.value) })} />
            </label>
            <label style={labelStyle}>
              filter passes {realtime.filterPasses}
              <input type="range" min={0} max={5} value={realtime.filterPasses} onChange={(e) => setRealtime({ ...realtime, filterPasses: Number(e.target.value) })} />
            </label>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
          <canvas
            key={backend}
            ref={canvasRef}
            style={{ width: "100%", height: "auto", display: "block", border: "1px solid #333", cursor: "grab" }}
          />
          {error ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f66",
                background: "#000",
                padding: "1rem",
                textAlign: "center",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          ) : (
            <div style={{ position: "absolute", top: 8, right: 8, color: "#888", fontSize: "0.7rem", fontFamily: "monospace" }}>
              samples: <span ref={samplesRef}>0</span>
            </div>
          )}
        </div>
        <div ref={statsRef} style={{ color: "#666", fontSize: "0.68rem", fontFamily: "monospace", marginTop: "0.4rem" }} />
        {notes.length > 0 && (
          <ul style={{ color: "#a80", fontSize: "0.72rem", margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
            {notes.map((n) => (
              <li key={n}>WebGPU limitation: {n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NiamhPage;
