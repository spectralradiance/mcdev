"use client";

import { useEffect, useRef, useState } from "react";
import { cornellBoxScene } from "./scene";
import { PathTracerRenderer } from "./gpu/renderer";

const NiamhPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const samplesRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

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
    };
  }, []);

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: "1200px" }}>
        <h1>Niamh</h1>
        <p style={{ color: "#888", fontSize: "0.85rem" }}>
          GPU path tracer (next-event estimation with multiple importance sampling) running in a WebGL2 fragment
          shader. Drag to orbit, scroll to zoom.
        </p>
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
