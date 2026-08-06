/** Generates three families of polyline curves on S³ via hyperspherical coordinates. */
export interface SphereCurves {
  curves: number[][][];                      // curves[i] = ordered 4D points on one curve
  familyStarts: [number, number, number];    // index into curves[] where each family begins
  segmentsPerCurve: number;                  // line segments per curve = steps
}

function s3(chi: number, theta: number, phi: number): number[] {
  const sc = Math.sin(chi), cc = Math.cos(chi);
  const st = Math.sin(theta), ct = Math.cos(theta);
  return [sc * st * Math.cos(phi), sc * st * Math.sin(phi), sc * ct, cc];
}

export function generateSphere(rings: number, steps: number): SphereCurves {
  const grid = (n: number, max: number) =>
    Array.from({ length: n + 1 }, (_, i) => (i / n) * max);
  const chis   = grid(rings, Math.PI);
  const thetas = grid(rings, Math.PI);
  const phis   = grid(rings, 2 * Math.PI);
  const curve  = (fn: (t: number) => number[]): number[][] =>
    Array.from({ length: steps + 1 }, (_, i) => fn(i / steps));

  const all: number[][][] = [];

  // Parallels: vary χ ∈ [0,π], hold θ and φ fixed
  const f0 = 0;
  for (const theta of thetas)
    for (const phi of phis)
      all.push(curve(t => s3(t * Math.PI, theta, phi)));

  // Meridians: vary θ ∈ [0,π], hold χ and φ fixed
  const f1 = all.length;
  for (const chi of chis)
    for (const phi of phis)
      all.push(curve(t => s3(chi, t * Math.PI, phi)));

  // Hypermeridians: vary φ ∈ [0,2π), hold χ and θ fixed
  const f2 = all.length;
  for (const chi of chis)
    for (const theta of thetas)
      all.push(curve(t => s3(chi, theta, t * 2 * Math.PI)));

  return { curves: all, familyStarts: [f0, f1, f2], segmentsPerCurve: steps };
}

/** Stereographic projection ℝ⁴→ℝ³ from north pole (0,0,0,1). Clamps near w≈1. */
export function stereographic(p: number[]): [number, number, number] {
  const d = 1 - p[3];
  if (Math.abs(d) < 1e-5) return [0, 0, 0];
  return [p[0] / d, p[1] / d, p[2] / d];
}
