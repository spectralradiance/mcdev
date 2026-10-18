import { describe, expect, it } from 'vitest';
import { ARRAY_SEARCHES, STRING_PRESETS, STRING_SEARCHES } from './searches';
import { makeArray, mulberry32 } from './random';
import { record } from './trace';

describe('array searches', () => {
  for (const search of ARRAY_SEARCHES) {
    it(`${search.name} finds present values and reports missing ones`, () => {
      for (const n of [1, 2, 3, 10, 64, 257]) {
        for (const dist of ['sorted', 'duplicates'] as const) {
          const values = makeArray(n, dist, n).sort((a, b) => a - b);
          // Targets: every value present, plus values below, between and above.
          const targets = [...new Set(values), 0, n + 5, ...values.map((v) => v + 0.5)];
          for (const target of targets) {
            const { player } = record(values, search.run, { target });
            player.seek(player.length);
            const present = values.includes(target);
            if (present) expect(values[player.found], `${search.name} n=${n} target=${target}`).toBe(target);
            else expect(player.found, `${search.name} n=${n} target=${target}`).toBe(-1);
          }
        }
      }
    });
  }
});

describe('string searches', () => {
  const rand = mulberry32(5);
  const cases = [
    ...STRING_PRESETS.map((p) => [p.text, p.pattern]),
    ['aaaa', 'aa'], ['abc', 'abcd'], ['abababab', 'abab'], ['x', 'x'],
    ...Array.from({ length: 40 }, () => {
      const word = (len: number) => Array.from({ length: len }, () => 'ab'[Math.floor(rand() * 2)]).join('');
      return [word(30), word(1 + Math.floor(rand() * 4))];
    }),
  ];
  const expected = (text: string, pat: string) => {
    const out: number[] = [];
    for (let s = 0; s + pat.length <= text.length; s++) if (text.startsWith(pat, s)) out.push(s);
    return out;
  };
  for (const search of STRING_SEARCHES) {
    it(`${search.name} finds every occurrence`, () => {
      for (const [text, pat] of cases) expect(search.run(text, pat).matches, `${text} / ${pat}`).toEqual(expected(text, pat));
    });
  }
});
