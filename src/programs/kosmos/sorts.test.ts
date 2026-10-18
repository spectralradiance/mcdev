import { describe, expect, it } from 'vitest';
import { SORTS } from './sorts';
import { DISTRIBUTIONS, makeArray } from './random';
import { record } from './trace';

const sorted = (values: number[]) => values.slice().sort((a, b) => a - b);

describe('sorts', () => {
  for (const sort of SORTS) {
    describe(sort.name, () => {
      const sizes = sort.maxN <= 8 ? [1, 2, 5, 7] : [1, 2, 3, 17, 64, Math.min(sort.maxN, 200)];
      for (const dist of DISTRIBUTIONS) {
        it(`sorts ${dist.name.toLowerCase()} input`, () => {
          for (const n of sizes) {
            const input = makeArray(n, dist.id, n * 31 + 7);
            const { player, truncated, result } = record(input, sort.run);
            expect(truncated).toBe(false);
            expect(result).toEqual(sorted(input));
            // Replaying the trace forwards reaches the same array, and rewinding restores the input.
            player.seek(player.length);
            expect(Array.from(player.values)).toEqual(sorted(input));
            player.seek(0);
            expect(Array.from(player.values)).toEqual(input);
            expect(player.stats).toEqual({ compares: 0, swaps: 0, writes: 0, reads: 0 });
          }
        });
      }
    });
  }

  it('keeps equal values in order for the stable sorts', () => {
    // Encode (key, original index) as key * 1000 + index and sort on key alone through a wrapper
    // that compares only the key part: check the indices of equal keys stay increasing.
    const n = 120;
    const keys = makeArray(n, 'few-unique', 99);
    const tagged = keys.map((k, i) => k * 1000 + i);
    for (const sort of SORTS.filter((s) => s.stable && s.family !== 'Distribution')) {
      const { result } = record(tagged, (r) => {
        const raw = r.a;
        // Compare on the key only by temporarily viewing the values through a proxy recorder.
        const proxy = Object.create(r);
        proxy.cmp = (i: number, j: number) => { r.cmp(i, j); return Math.floor(raw[i] / 1000) - Math.floor(raw[j] / 1000); };
        proxy.cmpValue = (i: number, v: number) => { r.cmpValue(i, v); return Math.floor(raw[i] / 1000) - Math.floor(v / 1000); };
        proxy.cmpHeld = (a: number, b: number, i: number, j: number) => { r.cmpHeld(a, b, i, j); return Math.floor(a / 1000) - Math.floor(b / 1000); };
        sort.run(proxy);
      });
      for (let i = 1; i < n; i++) {
        const [a, b] = [result[i - 1], result[i]];
        expect(Math.floor(a / 1000), sort.name).toBeLessThanOrEqual(Math.floor(b / 1000));
        if (Math.floor(a / 1000) === Math.floor(b / 1000)) expect(a % 1000, sort.name).toBeLessThan(b % 1000);
      }
    }
  });
});
