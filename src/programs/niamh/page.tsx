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
        } else {
          const gl = new PathTracerRenderer(canvas);
          gl.setScene(currentScene());
          gl.setEngine(glEngineRef.current);
          webglRef.current = gl;
          renderer = gl;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        return;
      }

      const resize = () => {
        const width = Math.round(container.clientWidth);
        const height = Math.round(width * 0.75);
        // A canvas that already owns a WebGPU context is resized by the renderer when it rebuilds.
        if (backend === "webgl2") {
          canvas.width = width;
          canvas.height = height;
        }
        renderer!.setSize(width, height);
      };
      resize();
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
              <li key={n}>Not on the WebGPU backend yet: {n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NiamhPage;
