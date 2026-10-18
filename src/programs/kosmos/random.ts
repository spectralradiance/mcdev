// Seeded randomness, so a race gives every lane the same input and a shared link reproduces a run.

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function shuffle<T>(values: T[], rand: () => number) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export type Distribution = 'random' | 'nearly-sorted' | 'reversed' | 'few-unique' | 'sorted' | 'sawtooth' | 'organ-pipe' | 'duplicates';

export const DISTRIBUTIONS: { id: Distribution; name: string }[] = [
  { id: 'random', name: 'Shuffled' },
  { id: 'nearly-sorted', name: 'Nearly sorted' },
  { id: 'reversed', name: 'Reversed' },
  { id: 'few-unique', name: 'Few unique' },
  { id: 'duplicates', name: 'Random with repeats' },
  { id: 'sawtooth', name: 'Sawtooth' },
  { id: 'organ-pipe', name: 'Organ pipe' },
  { id: 'sorted', name: 'Sorted' },
];

/** n values in 1..n laid out according to the distribution. */
export function makeArray(n: number, dist: Distribution, seed: number): number[] {
  const rand = mulberry32(seed);
  const ramp = Array.from({ length: n }, (_, i) => i + 1);
  switch (dist) {
    case 'random': return shuffle(ramp, rand);
    case 'sorted': return ramp;
    case 'reversed': return ramp.reverse();
    case 'nearly-sorted': {
      for (let k = 0; k < Math.max(1, n / 20); k++) {
        const i = Math.floor(rand() * n), j = Math.min(n - 1, Math.max(0, i + Math.floor((rand() - 0.5) * 12)));
        [ramp[i], ramp[j]] = [ramp[j], ramp[i]];
      }
      return ramp;
    }
    case 'few-unique': {
      const levels = 6;
      return shuffle(ramp.map((v) => Math.ceil((Math.ceil((v * levels) / n) * n) / levels)), rand);
    }
    case 'duplicates': return ramp.map(() => 1 + Math.floor(rand() * n));
    case 'sawtooth': {
      const teeth = 4, len = Math.ceil(n / teeth);
      return ramp.map((_, i) => Math.max(1, Math.round((((i % len) + 1) / len) * n)));
    }
    case 'organ-pipe': {
      const half = Math.ceil(n / 2);
      return ramp.map((_, i) => Math.max(1, Math.round(((i < half ? i + 1 : n - i) / half) * n)));
    }
  }
}
