import { INIT, type Params } from "./types";

/** Decodes base64-JSON hypercube state from the ?k= URL parameter. Returns null if absent or malformed. */
export function parseUrlState(): { params: Partial<Params>; transforms: [number, number][]; toggles?: { vertices: boolean; edges: boolean; faces: boolean } } | null {
  try {
    const k = new URLSearchParams(window.location.search).get("k");
    if (!k) return null;
    const s = JSON.parse(atob(k));
    return {
      params: {
        n_dimensions: s.d ?? INIT.n_dimensions,
        n_divisions: Math.pow(2, s.v ?? 3),
        speed: s.s ?? INIT.speed,
        accentuation: s.a ?? INIT.accentuation,
        line_width: s.w ?? INIT.line_width,
        face_alpha: s.fa ?? INIT.face_alpha,
      },
      transforms: Array.isArray(s.t) ? s.t : [],
      toggles: s.sv !== undefined ? { vertices: !!s.sv, edges: !!s.se, faces: !!s.sf } : undefined,
    };
  } catch {
    return null;
  }
}
