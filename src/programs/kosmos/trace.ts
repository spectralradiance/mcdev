// Array traces: an algorithm runs once against a Recorder, which keeps its own copy of the array and
// logs every operation as five ints (op, a, b, c, d) together with whatever is needed to undo it.
// A Player then replays that log over a second copy in either direction, so the UI can play,
// step, scrub and rewind without re-running the algorithm.

export enum Op {
  Compare = 0, // a, b: indices compared
  CompareValue = 1, // a: index compared against the search target
  Swap = 2, // a, b
  Write = 3, // a: index, b: new value, c: old value
  Read = 4, // a: index
  Pivot = 5, // a: new pivot (-1 clears), b: old pivot
  Done = 6, // a: index marked final, b: old flag
  Range = 7, // a, b: new active range, c, d: old range
  Found = 8, // a: index found (-1 = not present)
  CompareHeld = 9, // a: index compared against a value the algorithm holds (b: that value)
}

const STRIDE = 5;

export class OpLog {
  data = new Int32Array(STRIDE * 1024);
  length = 0;

  push(op: number, a = 0, b = 0, c = 0, d = 0) {
    if ((this.length + 1) * STRIDE > this.data.length) {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const o = this.length++ * STRIDE;
    const data = this.data;
    data[o] = op; data[o + 1] = a; data[o + 2] = b; data[o + 3] = c; data[o + 4] = d;
  }
}

/** Raised by the Recorder when a trace grows past its budget (bogosort, mostly). */
export class TraceLimit extends Error {}

export class Recorder {
  readonly a: number[];
  readonly n: number;
  readonly log = new OpLog();
  readonly limit: number;
  readonly target: number;
  private pivotIdx = -1;
  private done: Uint8Array;
  private lo: number;
  private hi: number;

  constructor(values: number[], limit = 4_000_000, target = 0) {
    this.a = values.slice();
    this.n = values.length;
    this.limit = limit;
    this.target = target;
    this.done = new Uint8Array(this.n);
    this.lo = 0;
    this.hi = this.n - 1;
  }

  private push(op: number, a = 0, b = 0, c = 0, d = 0) {
    if (this.log.length >= this.limit) throw new TraceLimit();
    this.log.push(op, a, b, c, d);
  }

  get(i: number) {
    this.push(Op.Read, i);
    return this.a[i];
  }
  /** Compare a[i] with a[j]: negative, zero or positive. */
  cmp(i: number, j: number) {
    this.push(Op.Compare, i, j);
    return this.a[i] - this.a[j];
  }
  /** Compare a[i] with the search target. */
  cmpTarget(i: number) {
    this.push(Op.CompareValue, i);
    return this.a[i] - this.target;
  }
  /** Compare a[i] with a value the algorithm is holding (insertion sort's key, a merge's head). */
  cmpValue(i: number, v: number) {
    this.push(Op.CompareHeld, i, v);
    return this.a[i] - v;
  }
  /** Compare two values held outside the array (a merge's buffer), lighting the slots they came from. */
  cmpHeld(vi: number, vj: number, i: number, j: number) {
    this.push(Op.Compare, i, j);
    return vi - vj;
  }
  swap(i: number, j: number) {
    if (i === j) return;
    this.push(Op.Swap, i, j);
    const t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t;
  }
  set(i: number, v: number) {
    this.push(Op.Write, i, v, this.a[i]);
    this.a[i] = v;
  }
  pivot(i: number) {
    if (i === this.pivotIdx) return;
    this.push(Op.Pivot, i, this.pivotIdx);
    this.pivotIdx = i;
  }
  markDone(i: number) {
    if (this.done[i]) return;
    this.push(Op.Done, i, 0);
    this.done[i] = 1;
  }
  range(lo: number, hi: number) {
    if (lo === this.lo && hi === this.hi) return;
    this.push(Op.Range, lo, hi, this.lo, this.hi);
    this.lo = lo; this.hi = hi;
  }
  found(i: number) {
    this.push(Op.Found, i);
  }
}

export type Stats = { compares: number; swaps: number; writes: number; reads: number };

/** Per-index highlight kinds, also used to pick the tone's timbre. */
export enum Hl { None = 0, Compare = 1, Swap = 2, Write = 3, Read = 4, Found = 5 }

/** Replays an OpLog over its own array, forwards or backwards. */
export class ArrayPlayer {
  readonly initial: number[];
  readonly values: Float64Array;
  readonly done: Uint8Array;
  readonly log: OpLog;
  readonly target: number;
  pos = 0;
  pivot = -1;
  lo: number;
  hi: number;
  found = -2; // -2: search still running, -1: not present
  stats: Stats = { compares: 0, swaps: 0, writes: 0, reads: 0 };
  /** Highlight intensity per index, decayed by the view each frame. */
  readonly heat: Float32Array;
  readonly kind: Uint8Array;
  /** Indices touched since the sound engine last drained them. */
  touched: { i: number; kind: Hl }[] = [];

  constructor(initial: number[], log: OpLog, target = 0) {
    this.initial = initial;
    this.values = Float64Array.from(initial);
    this.done = new Uint8Array(initial.length);
    this.heat = new Float32Array(initial.length);
    this.kind = new Uint8Array(initial.length);
    this.log = log;
    this.target = target;
    this.lo = 0;
    this.hi = initial.length - 1;
  }

  get length() { return this.log.length; }
  get finished() { return this.pos >= this.log.length; }

  private touch(i: number, kind: Hl) {
    if (i < 0 || i >= this.values.length) return;
    this.heat[i] = 1;
    this.kind[i] = kind;
    this.touched.push({ i, kind });
  }

  /** Apply op `pos` and advance. */
  forward(quiet = false) {
    if (this.pos >= this.log.length) return;
    const d = this.log.data, o = this.pos * STRIDE, v = this.values, s = this.stats;
    const a = d[o + 1], b = d[o + 2];
    switch (d[o]) {
      case Op.Compare: s.compares++; if (!quiet) { this.touch(a, Hl.Compare); this.touch(b, Hl.Compare); } break;
      case Op.CompareValue: case Op.CompareHeld: s.compares++; if (!quiet) this.touch(a, Hl.Compare); break;
      case Op.Swap: { s.swaps++; const t = v[a]; v[a] = v[b]; v[b] = t; if (!quiet) { this.touch(a, Hl.Swap); this.touch(b, Hl.Swap); } break; }
      case Op.Write: s.writes++; v[a] = b; if (!quiet) this.touch(a, Hl.Write); break;
      case Op.Read: s.reads++; if (!quiet) this.touch(a, Hl.Read); break;
      case Op.Pivot: this.pivot = a; break;
      case Op.Done: this.done[a] = 1; break;
      case Op.Range: this.lo = a; this.hi = b; break;
      case Op.Found: this.found = a; if (!quiet) this.touch(a, Hl.Found); break;
    }
    this.pos++;
  }

  /** Undo op `pos - 1` and step back. */
  backward() {
    if (this.pos <= 0) return;
    this.pos--;
    const d = this.log.data, o = this.pos * STRIDE, v = this.values, s = this.stats;
    const a = d[o + 1], b = d[o + 2];
    switch (d[o]) {
      case Op.Compare: case Op.CompareValue: case Op.CompareHeld: s.compares--; break;
      case Op.Swap: { s.swaps--; const t = v[a]; v[a] = v[b]; v[b] = t; break; }
      case Op.Write: s.writes--; v[a] = d[o + 3]; break;
      case Op.Read: s.reads--; break;
      case Op.Pivot: this.pivot = b; break;
      case Op.Done: this.done[a] = b; break;
      case Op.Range: this.lo = d[o + 3]; this.hi = d[o + 4]; break;
      case Op.Found: this.found = -2; break;
    }
    // Light the op we just undid so stepping backwards is still visible (and audible).
    const op = d[o];
    if (op === Op.Compare || op === Op.Swap) { this.touch(a, op === Op.Swap ? Hl.Swap : Hl.Compare); this.touch(b, op === Op.Swap ? Hl.Swap : Hl.Compare); }
    else if (op === Op.Write || op === Op.Read || op === Op.CompareValue || op === Op.CompareHeld) this.touch(a, op === Op.Write ? Hl.Write : op === Op.Read ? Hl.Read : Hl.Compare);
  }

  /** Jump to an op index; only the last few ops before the target are highlighted. */
  seek(target: number) {
    target = Math.max(0, Math.min(this.log.length, target));
    if (target > this.pos) {
      while (this.pos < target - 8) this.forward(true);
      while (this.pos < target) this.forward();
    } else {
      while (this.pos > target) this.backward();
    }
    this.touched.length = 0;
  }

  /** Operation at `pos - 1`, for the status line. */
  lastOp(): { op: Op; a: number; b: number } | null {
    if (this.pos === 0) return null;
    const o = (this.pos - 1) * STRIDE, d = this.log.data;
    return { op: d[o] as Op, a: d[o + 1], b: d[o + 2] };
  }
}

/** Run an algorithm against a Recorder and wrap the result in a Player. */
export function record(
  values: number[],
  algorithm: (r: Recorder) => void,
  opts: { limit?: number; target?: number } = {},
): { player: ArrayPlayer; truncated: boolean; result: number[] } {
  const r = new Recorder(values, opts.limit, opts.target ?? 0);
  let truncated = false;
  try {
    algorithm(r);
  } catch (e) {
    if (!(e instanceof TraceLimit)) throw e;
    truncated = true;
  }
  return { player: new ArrayPlayer(values.slice(), r.log, opts.target ?? 0), truncated, result: r.a };
}
