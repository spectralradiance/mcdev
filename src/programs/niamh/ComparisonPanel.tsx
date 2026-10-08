"use client";

import { useEffect, useRef } from "react";
import type { DisplaySettings } from "./display";
import { expectedMse, verdict, type Comparison } from "./webgpu/compare";

const tone = (v: number, map: DisplaySettings["toneMap"]) => {
  const x = Math.max(v, 0);
  if (map === "reinhard") return x / (1 + x);
  if (map === "aces") return Math.min((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 1);
  return Math.min(x, 1);
};

const srgb = (c: number) => {
  const v = Math.min(Math.max(c, 0), 1);
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};

// Paints linear RGB (three floats per pixel) with the page's exposure and tone map, then sRGB encodes it.
function paint(canvas: HTMLCanvasElement, rgb: Float32Array, width: number, height: number, display: DisplaySettings, gain = 1) {
  canvas.width = width;
  canvas.height = height;
  const image = new ImageData(width, height);
  const exposure = 2 ** display.exposure * gain;
  for (let i = 0; i < width * height; ++i) {
    for (let c = 0; c < 3; ++c) image.data[4 * i + c] = srgb(tone(rgb[3 * i + c] * exposure, display.toneMap));
    image.data[4 * i + 3] = 255;
  }
  canvas.getContext("2d")?.putImageData(image, 0, 0);
}

const canvasStyle = { width: 256, imageRendering: "pixelated", border: "1px solid #333", display: "block" } as const;
const captionStyle = { color: "#777", fontSize: "0.68rem", marginBottom: 2 } as const;

/** The CPU and GPU renders side by side, their difference, and what the numbers say. */
export function ComparisonPanel({ comparison, display }: { comparison: Comparison; display: DisplaySettings }) {
  const cpuRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<HTMLCanvasElement>(null);
  const diffRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const { cpu, gpu, width, height } = comparison;
    if (cpuRef.current) paint(cpuRef.current, cpu, width, height, display);
    if (gpuRef.current) paint(gpuRef.current, gpu, width, height, display);
    if (diffRef.current) {
      // Magnified, so differences too small to see in the renders still show.
      const diff = new Float32Array(cpu.length);
      for (let i = 0; i < cpu.length; ++i) diff[i] = Math.abs(cpu[i] - gpu[i]);
      paint(diffRef.current, diff, width, height, display, 4);
    }
  }, [comparison, display]);

  const c = comparison;
  return (
    <div style={{ marginTop: "0.75rem", color: "#888", fontSize: "0.72rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <div style={captionStyle}>CPU (rtadvanced), {c.cpuSpp} spp</div>
          <canvas ref={cpuRef} style={canvasStyle} />
        </div>
        <div>
          <div style={captionStyle}>GPU (this tracer), {c.gpuSpp} spp</div>
          <canvas ref={gpuRef} style={canvasStyle} />
        </div>
        <div>
          <div style={captionStyle}>difference × 4</div>
          <canvas ref={diffRef} style={canvasStyle} />
        </div>
      </div>
      <p style={{ margin: "0.5rem 0 0", lineHeight: 1.5 }}>
        {c.width}×{c.height}. CPU {c.cpuSeconds.toFixed(2)} s on one thread ({((c.width * c.height * c.cpuSpp) / c.cpuSeconds / 1e6).toFixed(2)} M paths/s),
        GPU {c.gpuSeconds.toFixed(2)} s.
        <br />
        Relative MSE {c.mse.toFixed(4)}; noise alone predicts about {expectedMse(c).toFixed(4)} (from two GPU renders, {c.noiseMse.toFixed(4)}
        apart). Mean radiance, CPU over GPU: {c.ratio.toFixed(3)}.
        <br />
        {verdict(c)}
      </p>
      {c.notes.map((note) => (
        <p key={note} style={{ margin: "0.25rem 0 0", color: "#a80" }}>
          {note}
        </p>
      ))}
    </div>
  );
}
