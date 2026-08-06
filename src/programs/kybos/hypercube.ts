/** Shared interface for 4D polytopes: a set of vertices and a connectivity list. */
export interface Polytope {
  points: number[][];
  edges: [number, number][];
  faces: [number, number, number, number][];
}

/** N-dimensional hypercube: vertices as binary ±1 vectors, edges connecting vertices differing in exactly one coordinate. */
export class Hypercube implements Polytope {
  points: number[][];
  edges: [number, number][];
  faces: [number, number, number, number][];

  constructor(n: number) {
    const nPts = 1 << n;
    this.points = [];
    for (let i = 0; i < nPts; i++) {
      let t = i;
      const p: number[] = [];
      // Each bit of i encodes ±1 for one axis
      for (let j = 0; j < nPts; j++) {
        p.push(t % 2 === 0 ? -1 : 1);
        t = Math.floor(t / 2);
      }
      this.points.push(p);
    }
    this.edges = [];
    for (let i = 0; i < nPts; i++) {
      for (let j = i + 1; j < nPts; j++) {
        let diff = 0;
        for (let k = 0; k < n; k++) {
          if (this.points[i][k] !== this.points[j][k] && ++diff >= 2) break;
        }
        if (diff === 1) this.edges.push([i, j]);
      }
    }

    // Enumerate all 2D square faces: fix n-2 axes, vary two
    this.faces = [];
    for (let di = 0; di < n; di++) {
      for (let dj = di + 1; dj < n; dj++) {
        const mask = (1 << di) | (1 << dj);
        for (let base = 0; base < (1 << n); base++) {
          if ((base & mask) === 0)
            this.faces.push([base, base | (1 << di), base | (1 << di) | (1 << dj), base | (1 << dj)]);
        }
      }
    }
  }
}

/** Rotation in the (index_i, index_j) coordinate plane. */
export class Transform {
  angle: number;
  index_i: number;
  index_j: number;
  cosA: number;
  sinA: number;
  /** -1 = spinning left, 0 = stopped, 1 = spinning right */
  animate = 0;
  /** Target angle for smooth snap; -1 means no active goal. */
  goalAngle = -1;
  angleIndex = 0;

  constructor(a: number, i: number, j: number) {
    this.angle = a;
    this.index_i = i;
    this.index_j = j;
    this.cosA = Math.cos(a);
    this.sinA = Math.sin(a);
  }

  update() {
    this.cosA = Math.cos(this.angle);
    this.sinA = Math.sin(this.angle);
  }

  /** Applies this rotation in-place to point p; skips if indices exceed the point's dimensionality. */
  apply(p: number[]) {
    if (this.index_i >= p.length || this.index_j >= p.length) return;
    const pi = p[this.index_i] * this.cosA - p[this.index_j] * this.sinA;
    const pj = p[this.index_i] * this.sinA + p[this.index_j] * this.cosA;
    p[this.index_i] = pi;
    p[this.index_j] = pj;
  }
}

/** Wraps an angle to [0, 2π). */
export function wrap(a: number): number {
  const pi2 = Math.PI * 2;
  while (a < 0) a += pi2;
  while (a > pi2) a -= pi2;
  return a;
}

/** Maps a continuous angle to the nearest discrete division index. */
export function toIndex(angle: number, n: number): number {
  const ind = (angle / (Math.PI * 2)) * n;
  return ind > n - 0.5 ? 0 : Math.round(ind);
}

/** Converts a division index back to its corresponding angle. */
export function toAngle(idx: number, n: number): number {
  return (Math.PI * 2 * idx) / n;
}

// ─── Regular 4D polytopes ───────────────────────────────────────────────────────────────

/**
 * 24-Cell (Icositetrachoron) — 24 vertices, 96 edges.
 * Vertices: all permutations of (±1/√2, ±1/√2, 0, 0). Circumradius = 1, edge length = 1.
 */
export class Cell24 implements Polytope {
  points: number[][];
  edges: [number, number][];
  faces: [number, number, number, number][];

  constructor() {
    const s = 1 / Math.sqrt(2);
    this.points = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        for (const si of [-s, s])
          for (const sj of [-s, s]) {
            const v = [0, 0, 0, 0]; v[i] = si; v[j] = sj;
            this.points.push(v);
          }
    this.edges = [];
    for (let i = 0; i < this.points.length; i++)
      for (let j = i + 1; j < this.points.length; j++) {
        let d2 = 0;
        for (let k = 0; k < 4; k++) d2 += (this.points[i][k] - this.points[j][k]) ** 2;
        if (Math.abs(d2 - 1) < 1e-6) this.edges.push([i, j]);
      }
    this.faces = [];
  }
}

// Even permutations of [0,1,2,3] — used by Cell600
const EVEN_PERMS_4 = [
  [0,1,2,3],[0,2,3,1],[0,3,1,2],
  [1,0,3,2],[1,2,0,3],[1,3,2,0],
  [2,0,1,3],[2,1,3,0],[2,3,0,1],
  [3,0,2,1],[3,1,0,2],[3,2,1,0],
];

/**
 * 600-Cell (Hexacosichoron) — 120 vertices, 720 edges.
 * Vertices are the 120 unit quaternions of the binary icosahedral group on S³.
 * Edge length = 1/φ where φ = (1+√5)/2.
 */
export class Cell600 implements Polytope {
  points: number[][];
  edges: [number, number][];
  faces: [number, number, number, number][];

  constructor() {
    const phi = (1 + Math.sqrt(5)) / 2;
    const seen = new Set<string>();
    const pts: number[][] = [];

    const add = (v: number[]) => {
      const key = v.map(x => Math.round(x * 100000)).join(',');
      if (!seen.has(key)) { seen.add(key); pts.push(v); }
    };

    // (±1, 0, 0, 0) and permutations
    for (let i = 0; i < 4; i++)
      for (const s of [-1, 1]) { const v = [0,0,0,0]; v[i] = s; add(v); }

    // ½(±1, ±1, ±1, ±1)
    for (const a of [-1,1]) for (const b of [-1,1])
      for (const c of [-1,1]) for (const d of [-1,1])
        add([a/2, b/2, c/2, d/2]);

    // All even permutations of ½(0, ±1, ±1/φ, ±φ)
    for (const perm of EVEN_PERMS_4)
      for (const s1 of [-1,1]) for (const s2 of [-1,1]) for (const s3 of [-1,1]) {
        const base = [0, s1, s2 / phi, s3 * phi];
        add(perm.map(i => base[i] / 2));
      }

    this.points = pts;
    // Edge length squared = 1/φ² = φ - 1
    const edgeD2 = 1 / (phi * phi);
    this.edges = [];
    const n = pts.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let d2 = 0;
        for (let k = 0; k < 4; k++) d2 += (pts[i][k] - pts[j][k]) ** 2;
        if (Math.abs(d2 - edgeD2) < 1e-4) this.edges.push([i, j]);
      }
    this.faces = [];
  }
}

/**
 * N-sphere wireframe: one great circle per coordinate-plane pair, forming C(n,2) closed loops.
 * Responds to the dimensions slider; shows how an n-sphere rotates in n-dimensional space.
 */
export class NSpherePolytope implements Polytope {
  points: number[][];
  edges: [number, number][];
  faces: [number, number, number, number][];

  constructor(n: number, steps = 32) {
    this.points = []; this.edges = []; this.faces = [];
    let base = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        for (let k = 0; k < steps; k++) {
          const t = (k / steps) * 2 * Math.PI;
          const p = new Array(n).fill(0);
          p[i] = Math.cos(t); p[j] = Math.sin(t);
          this.points.push(p);
        }
        for (let k = 0; k < steps; k++) this.edges.push([base + k, base + (k + 1) % steps]);
        base += steps;
      }
  }
}
