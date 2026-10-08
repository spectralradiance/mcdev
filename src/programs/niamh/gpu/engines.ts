// The three integrators compiled into pathtracer.frag.glsl (see RENDER_MODE
// there). Keep RENDER_MODE_CODE in sync with the shader's MODE_* #defines.

export type RenderEngine = "whitted" | "path" | "nee-mis";

export const RENDER_MODE_CODE: Record<RenderEngine, number> = {
  whitted: 0,
  path: 1,
  "nee-mis": 2,
};

export const RENDER_ENGINES: { id: RenderEngine; label: string; description: string }[] = [
  { id: "whitted", label: "Backward ray tracing", description: "Direct lighting + recursive mirror/glass bounces; diffuse surfaces terminate the ray, so no color bleeding." },
  { id: "path", label: "Path tracing", description: "Every bounce importance-samples the BSDF alone; full global illumination, no explicit light sampling." },
  { id: "nee-mis", label: "Path tracing (NEE + MIS)", description: "Path tracing with next-event estimation and multiple importance sampling for faster convergence." },
];

// The two rendering backends. WebGL2 is the fallback every browser has; WebGPU runs the wavefront tracer ported from
// niamh's rtoptimized (compute shaders, BVH, ReSTIR) and needs a WebGPU-capable browser.
export type Backend = "webgl2" | "webgpu";

export const BACKENDS: { id: Backend; label: string }[] = [
  { id: "webgl2", label: "WebGL2 (fragment shader)" },
  { id: "webgpu", label: "WebGPU (wavefront compute)" },
];

export type WebGpuEngineId = "whitted" | "path" | "nee-mis" | "realtime";

export const WEBGPU_ENGINES: { id: WebGpuEngineId; label: string; description: string }[] = [
  { id: "whitted", label: "Backward ray tracing", description: "Direct lighting + mirror/glass bounces over a BVH; diffuse surfaces terminate the ray, so no color bleeding." },
  { id: "path", label: "Path tracing", description: "Every bounce importance-samples the BSDF alone; full global illumination, no explicit light sampling." },
  { id: "nee-mis", label: "Path tracing (NEE + MIS)", description: "Queue-based wavefront path tracer with next-event estimation, MIS and Russian roulette." },
  { id: "realtime", label: "Real-time (ReSTIR + denoise)", description: "One sample per pixel per frame; ReSTIR light resampling, temporal accumulation and an à-trous filter. Biased but fast." },
];
