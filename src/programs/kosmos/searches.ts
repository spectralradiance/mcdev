// Array searches (traced with the same Recorder as the sorts, comparing against r.target) and
// string matching (traced with its own small log of alignments and character comparisons).

import type { Recorder } from './trace';

export type ArraySearch = {
  id: string;
  name: string;
  needsSorted: boolean;
  average: string;
  worst: string;
  about: string;
  run: (r: Recorder) => void;
};

function linear(r: Recorder) {
  for (let i = 0; i < r.n; i++) {
    r.range(i, r.n - 1);
    if (r.cmpTarget(i) === 0) { r.found(i); return; }
  }
  r.found(-1);
}

function sentinelBinary(r: Recorder, lo: number, hi: number) {
  while (lo <= hi) {
    r.range(lo, hi);
    const mid = (lo + hi) >> 1;
    r.pivot(mid);
    const c = r.cmpTarget(mid);
    if (c === 0) { r.found(mid); return; }
    if (c < 0) lo = mid + 1; else hi = mid - 1;
  }
  r.pivot(-1);
  r.found(-1);
}

function binary(r: Recorder) { sentinelBinary(r, 0, r.n - 1); }

function lowerBound(r: Recorder) {
  // Branch-light variant that always halves: find the first value ≥ target, then check it.
  let lo = 0, len = r.n;
  while (len > 0) {
    r.range(lo, lo + len - 1);
    const half = len >> 1;
    r.pivot(lo + half);
    if (r.cmpTarget(lo + half) < 0) { lo += half + 1; len -= half + 1; } else len = half;
  }
  r.pivot(-1);
  if (lo < r.n && r.cmpTarget(lo) === 0) r.found(lo); else r.found(-1);
}

function ternary(r: Recorder) {
  let lo = 0, hi = r.n - 1;
  while (lo <= hi) {
    r.range(lo, hi);
    const third = Math.floor((hi - lo) / 3);
    const m1 = lo + third, m2 = hi - third;
    r.pivot(m1);
    const c1 = r.cmpTarget(m1);
    if (c1 === 0) { r.found(m1); return; }
    r.pivot(m2);
    const c2 = r.cmpTarget(m2);
    if (c2 === 0) { r.found(m2); return; }
    if (c1 > 0) hi = m1 - 1;
    else if (c2 < 0) lo = m2 + 1;
    else { lo = m1 + 1; hi = m2 - 1; }
  }
  r.pivot(-1);
  r.found(-1);
}

function jump(r: Recorder) {
  const step = Math.max(1, Math.floor(Math.sqrt(r.n)));
  let prev = 0, cur = Math.min(step, r.n) - 1;
  while (cur < r.n - 1) {
    r.range(prev, r.n - 1);
    r.pivot(cur);
    if (r.cmpTarget(cur) >= 0) break;
    prev = cur + 1;
    cur = Math.min(cur + step, r.n - 1);
  }
  r.pivot(-1);
  for (let i = prev; i <= cur; i++) {
    r.range(i, cur);
    const c = r.cmpTarget(i);
    if (c === 0) { r.found(i); return; }
    if (c > 0) break;
  }
  r.found(-1);
}

function interpolation(r: Recorder) {
  let lo = 0, hi = r.n - 1;
  while (lo <= hi) {
    r.range(lo, hi);
    const vlo = r.get(lo), vhi = r.get(hi);
    if (r.target < vlo || r.target > vhi) break;
    const pos = vhi === vlo ? lo : lo + Math.floor(((r.target - vlo) * (hi - lo)) / (vhi - vlo));
    r.pivot(pos);
    const c = r.cmpTarget(pos);
    if (c === 0) { r.found(pos); return; }
    if (c < 0) lo = pos + 1; else hi = pos - 1;
  }
  r.pivot(-1);
  r.found(-1);
}

function exponential(r: Recorder) {
  if (r.n === 0) { r.found(-1); return; }
  let bound = 1;
  r.pivot(0);
  if (r.cmpTarget(0) === 0) { r.found(0); return; }
  while (bound < r.n) {
    r.range(bound >> 1, r.n - 1);
    r.pivot(bound);
    if (r.cmpTarget(bound) >= 0) break;
    bound *= 2;
  }
  sentinelBinary(r, bound >> 1, Math.min(bound, r.n - 1));
}

function fibonacci(r: Recorder) {
  let f2 = 0, f1 = 1, f = 1;
  while (f < r.n) { f2 = f1; f1 = f; f = f1 + f2; }
  let offset = -1;
  while (f > 1) {
    const i = Math.min(offset + f2, r.n - 1);
    r.range(offset + 1, Math.min(offset + f, r.n - 1));
    r.pivot(i);
    const c = r.cmpTarget(i);
    if (c < 0) { f = f1; f1 = f2; f2 = f - f1; offset = i; }
    else if (c > 0) { f = f2; f1 = f1 - f2; f2 = f - f1; }
    else { r.found(i); return; }
  }
  if (f1 && offset + 1 < r.n && r.cmpTarget(offset + 1) === 0) { r.found(offset + 1); return; }
  r.pivot(-1);
  r.found(-1);
}

export const ARRAY_SEARCHES: ArraySearch[] = [
  { id: 'linear', name: 'Linear search', needsSorted: false, average: 'n', worst: 'n', run: linear,
    about: 'Checks every value from the start until it finds the target. The only option when the data has no order.' },
  { id: 'binary', name: 'Binary search', needsSorted: true, average: 'log n', worst: 'log n', run: binary,
    about: 'Looks at the middle of the remaining range and throws away the half the target can’t be in. A million values take at most 20 looks.' },
  { id: 'lower-bound', name: 'Lower bound', needsSorted: true, average: 'log n', worst: 'log n', run: lowerBound,
    about: 'The binary search inside std::lower_bound and Python’s bisect_left: it never stops early, always narrowing to the first position whose value is not less than the target.' },
  { id: 'ternary', name: 'Ternary search', needsSorted: true, average: 'log₃ n', worst: 'log₃ n', run: ternary,
    about: 'Splits the range in three with two probes. Fewer rounds than binary search but more comparisons in total, so it rarely wins on arrays.' },
  { id: 'jump', name: 'Jump search', needsSorted: true, average: '√n', worst: '√n', run: jump,
    about: 'Leaps ahead √n positions at a time until it passes the target, then walks back through the last block. Useful where stepping backwards is expensive.' },
  { id: 'interpolation', name: 'Interpolation search', needsSorted: true, average: 'log log n', worst: 'n', run: interpolation,
    about: 'Guesses where the target should be from its value, like opening a dictionary near the back for “W”. Astonishingly fast on evenly spread data, slow on skewed data.' },
  { id: 'exponential', name: 'Exponential search', needsSorted: true, average: 'log i', worst: 'log n', run: exponential,
    about: 'Probes positions 1, 2, 4, 8 … until it overshoots, then binary searches the last span. Cost depends on where the target is, not on n.' },
  { id: 'fibonacci', name: 'Fibonacci search', needsSorted: true, average: 'log n', worst: 'log n', run: fibonacci,
    about: 'Divides the range at Fibonacci numbers instead of halves, needing only addition and subtraction, which once mattered on machines without fast division.' },
];

// ─── string matching ─────────────────────────────────────────────────────────

export enum SOp {
  Align = 0, // a: new shift, b: old shift
  Match = 1, // a: text index, b: pattern index
  Mismatch = 2, // a: text index, b: pattern index
  Found = 3, // a: shift
  Hash = 4, // a: shift whose window hash was compared, b: 1 if equal
}

export type StringStep = { op: SOp; a: number; b: number };

export type StringTrace = {
  steps: StringStep[];
  /** Algorithm-specific table shown under the pattern (KMP failure function, bad-character shifts). */
  table?: { label: string; values: (number | string)[] };
  matches: number[];
};

class StringRecorder {
  steps: StringStep[] = [];
  matches: number[] = [];
  shift = -1;
  align(s: number) { this.steps.push({ op: SOp.Align, a: s, b: this.shift }); this.shift = s; }
  eq(text: string, pattern: string, i: number, j: number) {
    const ok = text[i] === pattern[j];
    this.steps.push({ op: ok ? SOp.Match : SOp.Mismatch, a: i, b: j });
    return ok;
  }
  found(s: number) { this.steps.push({ op: SOp.Found, a: s, b: 0 }); this.matches.push(s); }
}

function naive(text: string, pat: string): StringTrace {
  const r = new StringRecorder();
  for (let s = 0; s + pat.length <= text.length; s++) {
    r.align(s);
    let j = 0;
    while (j < pat.length && r.eq(text, pat, s + j, j)) j++;
    if (j === pat.length) r.found(s);
  }
  return { steps: r.steps, matches: r.matches };
}

export function failureFunction(pat: string) {
  const fail = new Array(pat.length).fill(0);
  for (let i = 1, k = 0; i < pat.length; i++) {
    while (k > 0 && pat[i] !== pat[k]) k = fail[k - 1];
    if (pat[i] === pat[k]) k++;
    fail[i] = k;
  }
  return fail;
}

function kmp(text: string, pat: string): StringTrace {
  const r = new StringRecorder();
  const fail = failureFunction(pat);
  let j = 0;
  r.align(0);
  for (let i = 0; i < text.length; i++) {
    while (j > 0 && !r.eq(text, pat, i, j)) { j = fail[j - 1]; r.align(i - j); }
    if (j === 0 && !r.eq(text, pat, i, 0)) { if (i + 1 + pat.length <= text.length) r.align(i + 1); continue; }
    j++;
    if (j === pat.length) {
      r.found(i - pat.length + 1);
      j = fail[j - 1];
      if (i + 1 - j + pat.length <= text.length) r.align(i + 1 - j);
    }
  }
  return { steps: r.steps, matches: r.matches, table: { label: 'failure', values: fail } };
}

function horspool(text: string, pat: string): StringTrace {
  const r = new StringRecorder();
  const m = pat.length;
  const shift = new Map<string, number>();
  for (let i = 0; i < m - 1; i++) shift.set(pat[i], m - 1 - i);
  let s = 0;
  while (s + m <= text.length) {
    r.align(s);
    let j = m - 1;
    while (j >= 0 && r.eq(text, pat, s + j, j)) j--;
    if (j < 0) r.found(s);
    s += shift.get(text[s + m - 1]) ?? m;
  }
  return {
    steps: r.steps, matches: r.matches,
    table: { label: 'skip', values: pat.split('').map((c, i) => (i === m - 1 ? (shift.get(c) ?? m) : shift.get(c)!)) },
  };
}

function boyerMoore(text: string, pat: string): StringTrace {
  // Bad character plus good suffix rules.
  const r = new StringRecorder();
  const m = pat.length;
  const last = new Map<string, number>();
  for (let i = 0; i < m; i++) last.set(pat[i], i);
  const suffix = new Array(m + 1).fill(0), border = new Array(m + 1).fill(0);
  let i = m, j = m + 1;
  border[i] = j;
  while (i > 0) {
    while (j <= m && pat[i - 1] !== pat[j - 1]) { if (suffix[j] === 0) suffix[j] = j - i; j = border[j]; }
    i--; j--; border[i] = j;
  }
  j = border[0];
  for (i = 0; i <= m; i++) { if (suffix[i] === 0) suffix[i] = j; if (i === j) j = border[j]; }
  let s = 0;
  while (s + m <= text.length) {
    r.align(s);
    let k = m - 1;
    while (k >= 0 && r.eq(text, pat, s + k, k)) k--;
    if (k < 0) { r.found(s); s += suffix[0]; }
    else s += Math.max(suffix[k + 1], k - (last.get(text[s + k]) ?? -1));
  }
  return { steps: r.steps, matches: r.matches, table: { label: 'last', values: pat.split('').map((c) => last.get(c)!) } };
}

function rabinKarp(text: string, pat: string): StringTrace {
  const r = new StringRecorder();
  const B = 256, M = 101, m = pat.length;
  if (m > text.length) return { steps: [], matches: [] };
  let hp = 0, ht = 0, h = 1;
  for (let i = 0; i < m - 1; i++) h = (h * B) % M;
  for (let i = 0; i < m; i++) { hp = (hp * B + pat.charCodeAt(i)) % M; ht = (ht * B + text.charCodeAt(i)) % M; }
  for (let s = 0; s + m <= text.length; s++) {
    r.align(s);
    r.steps.push({ op: SOp.Hash, a: s, b: hp === ht ? 1 : 0 });
    if (hp === ht) {
      let j = 0;
      while (j < m && r.eq(text, pat, s + j, j)) j++;
      if (j === m) r.found(s);
    }
    if (s + m < text.length) ht = ((ht - text.charCodeAt(s) * h % M + M) * B + text.charCodeAt(s + m)) % M;
  }
  return { steps: r.steps, matches: r.matches, table: { label: 'hash', values: [`pattern ≡ ${hp} (mod ${M})`] } };
}

function zAlgorithm(text: string, pat: string): StringTrace {
  // Z-array over pattern + '\u0000' + text; comparisons are mapped back onto text/pattern positions.
  const r = new StringRecorder();
  const s = pat + '\u0000' + text, n = s.length, m = pat.length;
  const z = new Array(n).fill(0);
  const toText = (k: number) => k - m - 1;
  for (let k = 1, l = 0, rr = 0; k < n; k++) {
    if (k < rr) z[k] = Math.min(rr - k, z[k - l]);
    if (k > m) r.align(toText(k));
    while (k + z[k] < n && z[k] < m) {
      const a = k + z[k], b = z[k];
      const ok = s[a] === s[b];
      if (k > m) r.steps.push({ op: ok ? SOp.Match : SOp.Mismatch, a: toText(a), b });
      if (!ok) break;
      z[k]++;
    }
    if (k + z[k] > rr) { l = k; rr = k + z[k]; }
    if (k > m && z[k] === m) r.found(toText(k));
  }
  return { steps: r.steps, matches: r.matches, table: { label: 'Z', values: z.slice(0, m) } };
}

export type StringSearch = { id: string; name: string; average: string; worst: string; about: string; run: (text: string, pat: string) => StringTrace };

export const STRING_SEARCHES: StringSearch[] = [
  { id: 'naive', name: 'Brute force', average: 'n', worst: 'nm', run: naive,
    about: 'Lines the pattern up at every position and compares left to right until a character differs.' },
  { id: 'kmp', name: 'Knuth–Morris–Pratt', average: 'n + m', worst: 'n + m', run: kmp,
    about: 'Never moves backwards in the text. On a mismatch, the failure table says how much of the pattern is still matched (its longest border), so the pattern slides forward without rechecking.' },
  { id: 'horspool', name: 'Boyer–Moore–Horspool', average: 'n / m', worst: 'nm', run: horspool,
    about: 'Compares right to left, then shifts by how far the text character under the pattern’s last slot is from the end of the pattern. Long patterns skip most of the text.' },
  { id: 'boyer-moore', name: 'Boyer–Moore', average: 'n / m', worst: 'n + m', run: boyerMoore,
    about: 'Right-to-left matching with two shift rules, bad character and good suffix, taking whichever jumps further. The standard for searching in text editors.' },
  { id: 'rabin-karp', name: 'Rabin–Karp', average: 'n + m', worst: 'nm', run: rabinKarp,
    about: 'Keeps a rolling hash of the window under the pattern, updated in constant time per shift, and only compares characters when the hashes agree.' },
  { id: 'z', name: 'Z algorithm', average: 'n + m', worst: 'n + m', run: zAlgorithm,
    about: 'Computes, for every position, the length of the longest substring starting there that matches a prefix of the pattern, reusing the rightmost match box to skip work.' },
];

export const STRING_PRESETS: { name: string; text: string; pattern: string }[] = [
  { name: 'DNA', text: 'GATTACAGATCGGATTACATTAGATTACAGGCATGATTACA', pattern: 'GATTACA' },
  { name: 'Repetitive (worst case)', text: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB', pattern: 'AAAAAAB' },
  { name: 'Abracadabra', text: 'ABRACADABRA ABRACADABRA CADABRA ABRA', pattern: 'ABRA' },
  { name: 'Prose', text: 'it was the best of times it was the worst of times it was the age of wisdom', pattern: 'the age' },
  { name: 'Borders', text: 'ABABDABACDABABCABABABABCABAB', pattern: 'ABABCABAB' },
];
