/** N-dimensional hypercube: vertices as binary ±1 vectors, edges connecting vertices differing in exactly one coordinate. */
export class Hypercube {
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

  /** Applies this rotation in-place to point p. */
  apply(p: number[]) {
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
