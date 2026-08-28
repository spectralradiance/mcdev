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
