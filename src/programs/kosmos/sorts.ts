// Sorting algorithms, written against the Recorder so every comparison, swap and write is traced.
// Each works in place on r.a; reads of r.a directly are only made right after a traced read.

import type { Recorder } from './trace';
import { mulberry32 } from './random';

export type SortAlgorithm = {
  id: string;
  name: string;
  family: 'Exchange' | 'Insertion' | 'Selection' | 'Merge' | 'Distribution' | 'Network' | 'Hybrid' | 'Joke';
  best: string;
  average: string;
  worst: string;
  space: string;
  stable: boolean;
  /** Largest n the trace is recorded for; bigger arrays are trimmed. */
  maxN: number;
  about: string;
  run: (r: Recorder) => void;
};

// ─── exchange sorts ──────────────────────────────────────────────────────────

function bubble(r: Recorder) {
  for (let end = r.n - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      if (r.cmp(i, i + 1) > 0) { r.swap(i, i + 1); swapped = true; }
    }
    r.markDone(end);
    if (!swapped) break;
  }
}

function cocktail(r: Recorder) {
  let lo = 0, hi = r.n - 1;
  while (lo < hi) {
    let last = lo;
    for (let i = lo; i < hi; i++) if (r.cmp(i, i + 1) > 0) { r.swap(i, i + 1); last = i; }
    for (let k = last + 1; k <= hi; k++) r.markDone(k);
    hi = last;
    if (lo >= hi) break;
    last = hi;
    for (let i = hi; i > lo; i--) if (r.cmp(i - 1, i) > 0) { r.swap(i - 1, i); last = i; }
    for (let k = lo; k < last; k++) r.markDone(k);
    lo = last;
  }
}

function oddEven(r: Recorder) {
  let sorted = false;
  while (!sorted) {
    sorted = true;
    for (let start = 1; start >= 0; start--) {
      for (let i = start; i + 1 < r.n; i += 2) {
        if (r.cmp(i, i + 1) > 0) { r.swap(i, i + 1); sorted = false; }
      }
    }
  }
}

function comb(r: Recorder) {
  let gap = r.n, sorted = false;
  while (!sorted) {
    gap = Math.floor(gap / 1.3);
    if (gap <= 1) { gap = 1; sorted = true; }
    for (let i = 0; i + gap < r.n; i++) {
      if (r.cmp(i, i + gap) > 0) { r.swap(i, i + gap); sorted = false; }
    }
  }
}

function gnome(r: Recorder) {
  let i = 1;
  while (i < r.n) {
    if (i === 0 || r.cmp(i - 1, i) <= 0) i++;
    else { r.swap(i - 1, i); i--; }
  }
}

function circle(r: Recorder) {
  const pass = (lo: number, hi: number): boolean => {
    if (lo >= hi) return false;
    let swapped = false, l = lo, h = hi;
    while (l < h) {
      if (r.cmp(l, h) > 0) { r.swap(l, h); swapped = true; }
      l++; h--;
    }
    if (l === h && h + 1 <= hi && r.cmp(l, h + 1) > 0) { r.swap(l, h + 1); swapped = true; }
    const mid = lo + Math.floor((hi - lo) / 2);
    const left = pass(lo, mid);
    const right = pass(mid + 1, hi);
    return swapped || left || right;
  };
  while (pass(0, r.n - 1));
}

// Lomuto partition around the last element, after moving the median of three there.
function medianToEnd(r: Recorder, lo: number, hi: number) {
  const mid = lo + ((hi - lo) >> 1);
  if (r.cmp(mid, lo) < 0) r.swap(mid, lo);
  if (r.cmp(hi, lo) < 0) r.swap(hi, lo);
  if (r.cmp(mid, hi) < 0) r.swap(mid, hi);
}

function quickLomuto(r: Recorder) {
  const sort = (lo: number, hi: number) => {
    if (lo >= hi) { if (lo === hi) r.markDone(lo); return; }
    r.range(lo, hi);
    medianToEnd(r, lo, hi);
    r.pivot(hi);
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (r.cmp(j, hi) < 0) { r.swap(i, j); i++; }
    }
    r.swap(i, hi);
    r.pivot(-1);
    r.markDone(i);
    sort(lo, i - 1);
    sort(i + 1, hi);
  };
  sort(0, r.n - 1);
}

function quickHoare(r: Recorder) {
  const sort = (lo: number, hi: number) => {
    if (lo >= hi) return;
    r.range(lo, hi);
    // Move the median of three to lo, then partition around the value held there.
    const mid = lo + ((hi - lo) >> 1);
    if (r.cmp(mid, lo) < 0) r.swap(mid, lo);
    if (r.cmp(hi, lo) < 0) r.swap(hi, lo);
    if (r.cmp(hi, mid) < 0) r.swap(hi, mid);
    r.swap(lo, mid);
    const p = r.get(lo);
    r.pivot(lo);
    let i = lo - 1, j = hi + 1;
    for (;;) {
      do i++; while (r.cmpValue(i, p) < 0);
      do j--; while (r.cmpValue(j, p) > 0);
      if (i >= j) break;
      r.swap(i, j);
    }
    r.pivot(-1);
    sort(lo, j);
    sort(j + 1, hi);
  };
  sort(0, r.n - 1);
}

function quickDualPivot(r: Recorder) {
  const sort = (lo: number, hi: number) => {
    if (hi <= lo) { if (hi === lo) r.markDone(lo); return; }
    r.range(lo, hi);
    if (r.cmp(lo, hi) > 0) r.swap(lo, hi);
    r.pivot(lo);
    let lt = lo + 1, gt = hi - 1, i = lo + 1;
    while (i <= gt) {
      if (r.cmp(i, lo) < 0) { r.swap(i, lt); lt++; i++; }
      else if (r.cmp(i, hi) > 0) { r.swap(i, gt); gt--; }
      else i++;
    }
    lt--; gt++;
    r.swap(lo, lt);
    r.swap(hi, gt);
    r.pivot(-1);
    r.markDone(lt); r.markDone(gt);
    sort(lo, lt - 1);
    if (r.cmp(lt, gt) < 0) sort(lt + 1, gt - 1);
    else for (let k = lt + 1; k < gt; k++) r.markDone(k);
    sort(gt + 1, hi);
  };
  sort(0, r.n - 1);
}

function quickThreeWay(r: Recorder) {
  const sort = (lo: number, hi: number) => {
    if (hi <= lo) { if (hi === lo) r.markDone(lo); return; }
    r.range(lo, hi);
    r.swap(lo, lo + ((hi - lo) >> 1));
    const v = r.get(lo);
    let lt = lo, gt = hi, i = lo + 1;
    r.pivot(lt);
    while (i <= gt) {
      const c = r.cmpValue(i, v);
      if (c < 0) { r.swap(lt, i); lt++; i++; r.pivot(lt); }
      else if (c > 0) { r.swap(i, gt); gt--; }
      else i++;
    }
    r.pivot(-1);
    for (let k = lt; k <= gt; k++) r.markDone(k);
    sort(lo, lt - 1);
    sort(gt + 1, hi);
  };
  sort(0, r.n - 1);
}

// ─── insertion sorts ─────────────────────────────────────────────────────────

function insertionRange(r: Recorder, lo: number, hi: number) {
  for (let i = lo + 1; i <= hi; i++) {
    const key = r.get(i);
    let j = i - 1;
    while (j >= lo && r.cmpValue(j, key) > 0) { r.set(j + 1, r.a[j]); j--; }
    if (j + 1 !== i) r.set(j + 1, key);
  }
}

function insertion(r: Recorder) { insertionRange(r, 0, r.n - 1); }

function binaryInsertionRange(r: Recorder, lo: number, start: number, hi: number) {
  for (let i = Math.max(start, lo + 1); i <= hi; i++) {
    const key = r.get(i);
    let left = lo, right = i;
    while (left < right) {
      const mid = (left + right) >> 1;
      if (r.cmpValue(mid, key) > 0) right = mid; else left = mid + 1;
    }
    for (let j = i; j > left; j--) r.set(j, r.a[j - 1]);
    if (left !== i) r.set(left, key);
  }
}

function binaryInsertion(r: Recorder) { binaryInsertionRange(r, 0, 1, r.n - 1); }

function shell(r: Recorder) {
  const gaps = [1, 4, 10, 23, 57, 132, 301, 701, 1750];
  while (gaps[gaps.length - 1] < r.n) gaps.push(Math.floor(gaps[gaps.length - 1] * 2.25));
  for (let g = gaps.length - 1; g >= 0; g--) {
    const gap = gaps[g];
    if (gap >= r.n) continue;
    for (let i = gap; i < r.n; i++) {
      const key = r.get(i);
      let j = i;
      while (j >= gap && r.cmpValue(j - gap, key) > 0) { r.set(j, r.a[j - gap]); j -= gap; }
      if (j !== i) r.set(j, key);
    }
  }
}

// ─── selection sorts ─────────────────────────────────────────────────────────

function selection(r: Recorder) {
  for (let i = 0; i < r.n - 1; i++) {
    let min = i;
    r.pivot(min);
    for (let j = i + 1; j < r.n; j++) if (r.cmp(j, min) < 0) { min = j; r.pivot(min); }
    r.swap(i, min);
    r.markDone(i);
  }
  r.pivot(-1);
}

function doubleSelection(r: Recorder) {
  let lo = 0, hi = r.n - 1;
  while (lo < hi) {
    let min = lo, max = lo;
    for (let j = lo + 1; j <= hi; j++) {
      if (r.cmp(j, min) < 0) min = j;
      else if (r.cmp(j, max) > 0) max = j;
    }
    r.swap(lo, min);
    if (max === lo) max = min;
    r.swap(hi, max);
    r.markDone(lo); r.markDone(hi);
    lo++; hi--;
  }
}

function heapSort(r: Recorder) { heapRange(r, 0, r.n - 1); }

function heapRange(r: Recorder, lo: number, hi: number) {
  const n = hi - lo + 1;
  const sift = (root: number, end: number) => {
    for (;;) {
      let child = 2 * root + 1;
      if (child >= end) return;
      if (child + 1 < end && r.cmp(lo + child + 1, lo + child) > 0) child++;
      if (r.cmp(lo + child, lo + root) <= 0) return;
      r.swap(lo + root, lo + child);
      root = child;
    }
  };
  for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) {
    r.swap(lo, lo + end);
    r.markDone(lo + end);
    sift(0, end);
  }
}

function cycle(r: Recorder) {
  for (let start = 0; start < r.n - 1; start++) {
    let item = r.get(start);
    r.pivot(start);
    let pos = start;
    for (let i = start + 1; i < r.n; i++) if (r.cmpValue(i, item) < 0) pos++;
    if (pos === start) { r.markDone(start); continue; }
    while (r.cmpValue(pos, item) === 0) pos++;
    let held = r.a[pos];
    r.set(pos, item);
    r.markDone(pos);
    item = held;
    while (pos !== start) {
      pos = start;
      for (let i = start + 1; i < r.n; i++) if (r.cmpValue(i, item) < 0) pos++;
      while (pos !== start && r.cmpValue(pos, item) === 0) pos++;
      held = r.a[pos];
      r.set(pos, item);
      r.markDone(pos);
      item = held;
    }
  }
  r.pivot(-1);
}

function pancake(r: Recorder) {
  const flip = (k: number) => { for (let i = 0, j = k; i < j; i++, j--) r.swap(i, j); };
  for (let size = r.n; size > 1; size--) {
    let max = 0;
    for (let i = 1; i < size; i++) if (r.cmp(i, max) > 0) max = i;
    if (max === size - 1) { r.markDone(size - 1); continue; }
    r.pivot(max);
    if (max > 0) flip(max);
    r.pivot(0);
    flip(size - 1);
    r.pivot(-1);
    r.markDone(size - 1);
  }
}

// ─── merge sorts ─────────────────────────────────────────────────────────────

/** Merge sorted r.a[lo..mid] and r.a[mid+1..hi] through a buffer, writing back in order. */
function merge(r: Recorder, lo: number, mid: number, hi: number) {
  if (r.cmp(mid, mid + 1) <= 0) return; // already in order
  const left: number[] = [];
  for (let k = lo; k <= mid; k++) left.push(r.get(k));
  let i = 0, j = mid + 1, k = lo;
  while (i < left.length && j <= hi) {
    if (r.cmpHeld(left[i], r.a[j], lo + i, j) <= 0) r.set(k++, left[i++]);
    else r.set(k++, r.a[j++]);
  }
  while (i < left.length) r.set(k++, left[i++]);
}

function mergeTopDown(r: Recorder) {
  const sort = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    sort(lo, mid);
    sort(mid + 1, hi);
    r.range(lo, hi);
    merge(r, lo, mid, hi);
  };
  sort(0, r.n - 1);
}

function mergeBottomUp(r: Recorder) {
  for (let width = 1; width < r.n; width *= 2) {
    for (let lo = 0; lo < r.n - width; lo += 2 * width) {
      const hi = Math.min(lo + 2 * width - 1, r.n - 1);
      r.range(lo, hi);
      merge(r, lo, lo + width - 1, hi);
    }
  }
}

/** Timsort without galloping: natural runs extended to minrun by binary insertion, merged on a stack. */
function tim(r: Recorder) {
  const n = r.n;
  let rn = n, bit = 0;
  while (rn >= 32) { bit |= rn & 1; rn >>= 1; }
  const minRun = rn + bit;
  const runs: { lo: number; len: number }[] = [];

  const mergeAt = (i: number) => {
    const a = runs[i], b = runs[i + 1];
    r.range(a.lo, b.lo + b.len - 1);
    merge(r, a.lo, a.lo + a.len - 1, b.lo + b.len - 1);
    runs.splice(i, 2, { lo: a.lo, len: a.len + b.len });
  };
  const collapse = () => {
    while (runs.length > 1) {
      let i = runs.length - 2;
      if (i > 0 && runs[i - 1].len <= runs[i].len + runs[i + 1].len) {
        if (runs[i - 1].len < runs[i + 1].len) i--;
      } else if (runs[i].len > runs[i + 1].len) break;
      mergeAt(i);
    }
  };

  let lo = 0;
  while (lo < n) {
    let hi = lo + 1;
    if (hi < n) {
      if (r.cmp(hi, lo) < 0) {
        while (hi + 1 < n && r.cmp(hi + 1, hi) < 0) hi++;
        for (let i = lo, j = hi; i < j; i++, j--) r.swap(i, j);
      } else {
        while (hi + 1 < n && r.cmp(hi + 1, hi) >= 0) hi++;
      }
    } else hi = lo;
    const end = Math.min(n - 1, Math.max(hi, lo + minRun - 1));
    r.range(lo, end);
    binaryInsertionRange(r, lo, hi + 1, end);
    runs.push({ lo, len: end - lo + 1 });
    collapse();
    lo = end + 1;
  }
  while (runs.length > 1) mergeAt(runs.length - 2);
}

// ─── distribution sorts ──────────────────────────────────────────────────────

function counting(r: Recorder) {
  let max = 0;
  const vals: number[] = [];
  for (let i = 0; i < r.n; i++) { const v = r.get(i); vals.push(v); if (v > max) max = v; }
  const counts = new Array(max + 1).fill(0);
  for (const v of vals) counts[v]++;
  let k = 0;
  for (let v = 0; v <= max; v++) for (let c = 0; c < counts[v]; c++) r.set(k++, v);
}

function radixLSD(base: number) {
  return (r: Recorder) => {
    let max = 0;
    for (let i = 0; i < r.n; i++) max = Math.max(max, r.get(i));
    for (let exp = 1; Math.floor(max / exp) > 0; exp *= base) {
      const buckets: number[][] = Array.from({ length: base }, () => []);
      for (let i = 0; i < r.n; i++) { const v = r.get(i); buckets[Math.floor(v / exp) % base].push(v); }
      let k = 0;
      for (const bucket of buckets) for (const v of bucket) r.set(k++, v);
    }
  };
}

function radixMSD(base: number) {
  return (r: Recorder) => {
    let max = 0;
    for (let i = 0; i < r.n; i++) max = Math.max(max, r.get(i));
    let exp = 1;
    while (exp * base <= max) exp *= base;
    const sort = (lo: number, hi: number, exp: number) => {
      if (hi <= lo || exp < 1) { for (let k = lo; k <= hi; k++) r.markDone(k); return; }
      r.range(lo, hi);
      const buckets: number[][] = Array.from({ length: base }, () => []);
      for (let i = lo; i <= hi; i++) { const v = r.get(i); buckets[Math.floor(v / exp) % base].push(v); }
      let k = lo;
      const bounds: number[] = [];
      for (const bucket of buckets) { bounds.push(k); for (const v of bucket) r.set(k++, v); }
      bounds.push(k);
      for (let b = 0; b < base; b++) sort(bounds[b], bounds[b + 1] - 1, exp / base);
    };
    sort(0, r.n - 1, exp);
  };
}

/** Gravity (bead) sort: beads fall column by column; shown as the rows they settle into. */
function gravity(r: Recorder) {
  let max = 0;
  for (let i = 0; i < r.n; i++) max = Math.max(max, r.get(i));
  // Number of beads in each column (level) is the count of values ≥ that level.
  const counts = new Array(max + 1).fill(0);
  for (let i = 0; i < r.n; i++) counts[r.a[i]]++;
  const atLeast = new Array(max + 2).fill(0);
  for (let v = max; v >= 0; v--) atLeast[v] = atLeast[v + 1] + counts[v];
  // After falling, row i (from the bottom, i.e. the end) holds the number of columns with > i beads.
  for (let i = r.n - 1, row = 0; i >= 0; i--, row++) {
    let v = 0;
    while (v + 1 <= max && atLeast[v + 1] > row) v++;
    r.set(i, v);
  }
}

// ─── sorting networks ────────────────────────────────────────────────────────

function compareSwap(r: Recorder, i: number, j: number, ascending: boolean) {
  if ((r.cmp(i, j) > 0) === ascending) r.swap(i, j);
}

/** Bitonic sort for any n (merging with the greatest power of two below the length). */
function bitonic(r: Recorder) {
  const pow2Below = (n: number) => { let k = 1; while (k < n) k <<= 1; return k >> 1; };
  const mergeB = (lo: number, n: number, up: boolean) => {
    if (n <= 1) return;
    const m = pow2Below(n);
    for (let i = lo; i < lo + n - m; i++) compareSwap(r, i, i + m, up);
    mergeB(lo, m, up);
    mergeB(lo + m, n - m, up);
  };
  const sort = (lo: number, n: number, up: boolean) => {
    if (n <= 1) return;
    const m = n >> 1;
    sort(lo, m, !up);
    sort(lo + m, n - m, up);
    r.range(lo, lo + n - 1);
    mergeB(lo, n, up);
  };
  sort(0, r.n, true);
}

function oddEvenMergesort(r: Recorder) {
  // Batcher's network, run over the next power of two and skipping comparators that fall off the end.
  let size = 1;
  while (size < r.n) size <<= 1;
  for (let p = 1; p < size; p <<= 1) {
    for (let k = p; k >= 1; k >>= 1) {
      for (let j = k % p; j + k < size; j += 2 * k) {
        for (let i = 0; i < k; i++) {
          const a = i + j, b = i + j + k;
          if (Math.floor(a / (2 * p)) === Math.floor(b / (2 * p)) && b < r.n) compareSwap(r, a, b, true);
        }
      }
    }
  }
}

// ─── hybrids and jokes ───────────────────────────────────────────────────────

function intro(r: Recorder) {
  const depthLimit = 2 * Math.floor(Math.log2(Math.max(2, r.n)));
  const sort = (lo: number, hi: number, depth: number) => {
    while (hi - lo > 16) {
      r.range(lo, hi);
      if (depth-- === 0) { heapRange(r, lo, hi); return; }
      medianToEnd(r, lo, hi);
      r.pivot(hi);
      let i = lo;
      for (let j = lo; j < hi; j++) if (r.cmp(j, hi) < 0) { r.swap(i, j); i++; }
      r.swap(i, hi);
      r.pivot(-1);
      r.markDone(i);
      // Recurse into the smaller side, loop on the larger.
      if (i - lo < hi - i) { sort(lo, i - 1, depth); lo = i + 1; }
      else { sort(i + 1, hi, depth); hi = i - 1; }
    }
  };
  sort(0, r.n - 1, depthLimit);
  r.range(0, r.n - 1);
  insertionRange(r, 0, r.n - 1);
}

function stooge(r: Recorder) {
  const sort = (lo: number, hi: number) => {
    if (r.cmp(lo, hi) > 0) r.swap(lo, hi);
    if (hi - lo + 1 > 2) {
      const t = Math.floor((hi - lo + 1) / 3);
      r.range(lo, hi);
      sort(lo, hi - t);
      sort(lo + t, hi);
      sort(lo, hi - t);
    }
  };
  if (r.n > 1) sort(0, r.n - 1);
}

function bogo(r: Recorder) {
  const rand = mulberry32(r.n * 7919 + r.a[0]);
  const sorted = () => { for (let i = 0; i + 1 < r.n; i++) if (r.cmp(i, i + 1) > 0) return false; return true; };
  while (!sorted()) {
    for (let i = r.n - 1; i > 0; i--) r.swap(i, Math.floor(rand() * (i + 1)));
  }
}

// ─── catalogue ───────────────────────────────────────────────────────────────

const Q = 1024; // cap for quadratic sorts
const ALL = 4096;

export const SORTS: SortAlgorithm[] = [
  { id: 'bubble', name: 'Bubble sort', family: 'Exchange', best: 'n', average: 'n²', worst: 'n²', space: '1', stable: true, maxN: Q, run: bubble,
    about: 'Sweeps left to right swapping neighbours that are out of order, so each pass carries the largest remaining value to the end. Stops early after a pass with no swaps.' },
  { id: 'cocktail', name: 'Cocktail shaker sort', family: 'Exchange', best: 'n', average: 'n²', worst: 'n²', space: '1', stable: true, maxN: Q, run: cocktail,
    about: 'Bubble sort in both directions. The backward pass carries small values (the "turtles" that slow bubble sort down) to the front quickly, and each pass shrinks the range to the last swap.' },
  { id: 'odd-even', name: 'Odd–even sort', family: 'Exchange', best: 'n', average: 'n²', worst: 'n²', space: '1', stable: true, maxN: Q, run: oddEven,
    about: 'Alternates between comparing all (odd, even) and all (even, odd) neighbour pairs. Every comparison within a phase is independent, which made it a classic for parallel processors.' },
  { id: 'comb', name: 'Comb sort', family: 'Exchange', best: 'n log n', average: 'n²/2ᵖ', worst: 'n²', space: '1', stable: false, maxN: ALL, run: comb,
    about: 'Bubble sort with a gap that starts at n and shrinks by a factor of 1.3 each pass, so out-of-place values travel far early. The last passes, with gap 1, are plain bubble sort.' },
  { id: 'gnome', name: 'Gnome sort', family: 'Exchange', best: 'n', average: 'n²', worst: 'n²', space: '1', stable: true, maxN: Q, run: gnome,
    about: 'A garden gnome walks along the pots: if the pot behind is bigger it swaps them and steps back, otherwise it steps forward. Insertion sort done with swaps and a single loop.' },
  { id: 'circle', name: 'Circle sort', family: 'Exchange', best: 'n log n', average: 'n log n', worst: 'n log² n', space: 'log n', stable: false, maxN: ALL, run: circle,
    about: 'Compares values that mirror each other across the middle of a range, like the rim of a circle, then recurses into both halves. Passes repeat until one makes no swaps.' },
  { id: 'quick-lomuto', name: 'Quicksort (Lomuto)', family: 'Exchange', best: 'n log n', average: 'n log n', worst: 'n²', space: 'log n', stable: false, maxN: ALL, run: quickLomuto,
    about: 'Picks a pivot (median of three, moved to the end), sweeps the range once moving everything smaller to the front, then drops the pivot into its final place and recurses on both sides.' },
  { id: 'quick-hoare', name: 'Quicksort (Hoare)', family: 'Exchange', best: 'n log n', average: 'n log n', worst: 'n²', space: 'log n', stable: false, maxN: ALL, run: quickHoare,
    about: 'Hoare’s original partition: two cursors walk inwards from both ends and swap pairs that are on the wrong side of the pivot. Fewer swaps than Lomuto, and fine with many duplicates.' },
  { id: 'quick-dual', name: 'Dual-pivot quicksort', family: 'Exchange', best: 'n log n', average: 'n log n', worst: 'n²', space: 'log n', stable: false, maxN: ALL, run: quickDualPivot,
    about: 'Yaroslavskiy’s scheme from Java’s Arrays.sort: two pivots split the range into three parts (less than the first, between them, greater than the second).' },
  { id: 'quick-3way', name: 'Three-way quicksort', family: 'Exchange', best: 'n', average: 'n log n', worst: 'n²', space: 'log n', stable: false, maxN: ALL, run: quickThreeWay,
    about: 'Dijkstra’s Dutch national flag partition: less than, equal to and greater than the pivot. Every value equal to the pivot is finished at once, so few-unique inputs fly.' },
  { id: 'insertion', name: 'Insertion sort', family: 'Insertion', best: 'n', average: 'n²', worst: 'n²', space: '1', stable: true, maxN: Q, run: insertion,
    about: 'Grows a sorted prefix one value at a time, shifting larger values right to open a gap for the new one. Very fast on nearly sorted input, and the base case of most practical sorts.' },
  { id: 'binary-insertion', name: 'Binary insertion sort', family: 'Insertion', best: 'n log n', average: 'n²', worst: 'n²', space: '1', stable: true, maxN: Q, run: binaryInsertion,
    about: 'Insertion sort that finds each value’s place with a binary search, cutting comparisons to O(n log n). The shifting still costs O(n²) writes.' },
  { id: 'shell', name: 'Shell sort', family: 'Insertion', best: 'n log n', average: 'n^1.3', worst: 'n^1.5', space: '1', stable: false, maxN: ALL, run: shell,
    about: 'Insertion sort over interleaved subsequences with shrinking gaps (Ciura’s sequence, 701, 301, 132, 57, 23, 10, 4, 1), so values make long jumps before the final, nearly free, gap-1 pass.' },
  { id: 'selection', name: 'Selection sort', family: 'Selection', best: 'n²', average: 'n²', worst: 'n²', space: '1', stable: false, maxN: Q, run: selection,
    about: 'Scans the unsorted part for its minimum and swaps it to the front. Always n²/2 comparisons, but never more than n swaps.' },
  { id: 'double-selection', name: 'Double selection sort', family: 'Selection', best: 'n²', average: 'n²', worst: 'n²', space: '1', stable: false, maxN: Q, run: doubleSelection,
    about: 'Finds the minimum and maximum in the same scan and places both, closing in from both ends.' },
  { id: 'heap', name: 'Heap sort', family: 'Selection', best: 'n log n', average: 'n log n', worst: 'n log n', space: '1', stable: false, maxN: ALL, run: heapSort,
    about: 'Builds a max-heap in place (the array read as a binary tree), then repeatedly swaps the root, the largest value, to the end and sifts the new root down.' },
  { id: 'cycle', name: 'Cycle sort', family: 'Selection', best: 'n²', average: 'n²', worst: 'n²', space: '1', stable: false, maxN: Q, run: cycle,
    about: 'Counts how many values are smaller to find exactly where each value belongs, and rotates values around their permutation cycles. Writes each value at most once: the fewest writes possible.' },
  { id: 'pancake', name: 'Pancake sort', family: 'Selection', best: 'n²', average: 'n²', worst: 'n²', space: '1', stable: false, maxN: Q, run: pancake,
    about: 'The only allowed move is flipping a prefix, like a spatula under a stack of pancakes. Flip the largest to the top, then flip it down to the bottom of the unsorted stack.' },
  { id: 'merge', name: 'Merge sort', family: 'Merge', best: 'n log n', average: 'n log n', worst: 'n log n', space: 'n', stable: true, maxN: ALL, run: mergeTopDown,
    about: 'Splits the array in half, sorts both halves recursively, then merges them by repeatedly taking the smaller head. Skips the merge when the halves are already in order.' },
  { id: 'merge-bottom-up', name: 'Bottom-up merge sort', family: 'Merge', best: 'n log n', average: 'n log n', worst: 'n log n', space: 'n', stable: true, maxN: ALL, run: mergeBottomUp,
    about: 'Merge sort without recursion: merge pairs of 1s into 2s, 2s into 4s, and so on, sweeping the whole array at each width.' },
  { id: 'tim', name: 'Timsort (simplified)', family: 'Hybrid', best: 'n', average: 'n log n', worst: 'n log n', space: 'n', stable: true, maxN: ALL, run: tim,
    about: 'Python’s and Java’s object sort: finds natural ascending or descending runs, extends short ones to a minimum length with binary insertion, and merges them on a stack that keeps run lengths balanced. (No galloping here.)' },
  { id: 'intro', name: 'Introsort', family: 'Hybrid', best: 'n log n', average: 'n log n', worst: 'n log n', space: 'log n', stable: false, maxN: ALL, run: intro,
    about: 'C++’s std::sort: quicksort that switches to heap sort if recursion gets too deep, and leaves small ranges for one insertion sort pass at the end.' },
  { id: 'counting', name: 'Counting sort', family: 'Distribution', best: 'n + k', average: 'n + k', worst: 'n + k', space: 'k', stable: true, maxN: ALL, run: counting,
    about: 'Counts how many times each value appears, then writes the values back out in order. No comparisons at all, but the counts need room for every possible value.' },
  { id: 'radix-lsd-10', name: 'Radix sort (LSD, base 10)', family: 'Distribution', best: 'nk', average: 'nk', worst: 'nk', space: 'n + b', stable: true, maxN: ALL, run: radixLSD(10),
    about: 'Stable-sorts by the ones digit, then the tens, then the hundreds. Each pass keeps the order of the previous one, so after the last digit everything is in place.' },
  { id: 'radix-lsd-2', name: 'Radix sort (LSD, base 2)', family: 'Distribution', best: 'nk', average: 'nk', worst: 'nk', space: 'n + b', stable: true, maxN: ALL, run: radixLSD(2),
    about: 'Binary least-significant-digit radix sort: one pass per bit, each splitting values into zeros then ones.' },
  { id: 'radix-msd-4', name: 'Radix sort (MSD, base 4)', family: 'Distribution', best: 'nk', average: 'nk', worst: 'nk', space: 'n + b', stable: true, maxN: ALL, run: radixMSD(4),
    about: 'Buckets by the most significant digit first, then recurses into each bucket on the next digit, like sorting mail by country, then city, then street.' },
  { id: 'gravity', name: 'Gravity (bead) sort', family: 'Distribution', best: 'n', average: 'S', worst: 'S', space: 'n·max', stable: false, maxN: ALL, run: gravity,
    about: 'Each value is a row of beads on vertical rods; let them fall and each row ends up holding the next smallest value. Only works for positive integers.' },
  { id: 'bitonic', name: 'Bitonic sort', family: 'Network', best: 'n log² n', average: 'n log² n', worst: 'n log² n', space: '1', stable: false, maxN: ALL, run: bitonic,
    about: 'A sorting network: a fixed pattern of compare-and-swaps that doesn’t depend on the data. Builds bitonic sequences (up then down) and merges them, which suits GPUs.' },
  { id: 'odd-even-merge', name: 'Batcher odd–even mergesort', family: 'Network', best: 'n log² n', average: 'n log² n', worst: 'n log² n', space: '1', stable: false, maxN: ALL, run: oddEvenMergesort,
    about: 'Batcher’s other sorting network: merges sorted halves by merging their odd and even elements separately, then fixing neighbours. Same comparators every time.' },
  { id: 'stooge', name: 'Stooge sort', family: 'Joke', best: 'n^2.71', average: 'n^2.71', worst: 'n^2.71', space: 'n', stable: false, maxN: 128, run: stooge,
    about: 'Sorts the first two thirds, then the last two thirds, then the first two thirds again. Correct, recursive, and slower than bubble sort.' },
  { id: 'bogo', name: 'Bogosort', family: 'Joke', best: 'n', average: 'n·n!', worst: '∞', space: '1', stable: false, maxN: 7, run: bogo,
    about: 'Shuffle, check, repeat. Expected n! shuffles, so it is limited to seven values here.' },
];

export const sortById = (id: string) => SORTS.find((s) => s.id === id) ?? SORTS[0];
