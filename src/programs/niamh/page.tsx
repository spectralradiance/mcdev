"use client";

import { useEffect, useRef, useState } from "react";
import { cornellBoxScene } from "./scene";
import { RENDER_ENGINES, type RenderEngine } from "./gpu/engines";
import { PathTracerRenderer } from "./gpu/renderer";

const NiamhPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const samplesRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<PathTracerRenderer | null>(null);
  const rafRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<RenderEngine>("nee-mis");

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: PathTracerRenderer;
    try {
      renderer = new PathTracerRenderer(canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    rendererRef.current = renderer;
    renderer.setScene(cornellBoxScene);

    const resize = () => {
      const width = Math.round(container.clientWidth);
      const height = Math.round(width * 0.75);
      canvas.width = width;
      canvas.height = height;
      renderer.setSize(width, height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const loop = () => {
      renderer.renderFrame();
      if (samplesRef.current) samplesRef.current.textContent = String(renderer.sampleCount);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const selectEngine = (next: RenderEngine) => {
    setEngine(next);
    rendererRef.current?.setEngine(next);
  };

  const activeEngine = RENDER_ENGINES.find((e) => e.id === engine) ?? RENDER_ENGINES[0];

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: "1200px" }}>
        <h1>Niamh</h1>
        <p style={{ color: "#888", fontSize: "0.85rem" }}>
          GPU renderer running in a WebGL2 fragment shader. Drag to orbit, scroll to zoom.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <select
            value={engine}
            onChange={(e) => selectEngine(e.target.value as RenderEngine)}
            style={{
              background: "black",
              color: "#ccc",
              border: "0.5px solid dimgrey",
              padding: "4px 8px",
              fontSize: "0.75rem",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {RENDER_ENGINES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <span style={{ color: "#666", fontSize: "0.72rem" }}>{activeEngine.description}</span>
        </div>
        <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block", border: "1px solid #333", cursor: "grab" }} />
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
      </div>
    </div>
  );
};

export default NiamhPage;
