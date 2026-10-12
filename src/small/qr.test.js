import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import {
  GF_EXP,
  GF_LOG,
  gfMul,
  rsGeneratorPoly,
  rsRemainder,
  encode,
  chooseMode,
  formatBits,
  versionBits,
  alignmentPositions,
  dataCodewordCount,
  rawDataModules,
} from './qr.js';

// Render a symbol to RGBA pixels (with a 4-module quiet zone) and decode it with jsQR.
function decode(qr, scale = 4) {
  const quiet = 4;
  const dim = (qr.size + 2 * quiet) * scale;
  const pixels = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const i = (((y + quiet) * scale + py) * dim + (x + quiet) * scale + px) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    }
  }
  return jsQR(pixels, dim, dim, { inversionAttempts: 'dontInvert' });
}

const LEVELS = ['L', 'M', 'Q', 'H'];

describe('GF(256)', () => {
  it('builds the exp/log tables from 0x11D', () => {
    expect(GF_EXP[0]).toBe(1);
    expect(GF_EXP[7]).toBe(128);
    expect(GF_EXP[8]).toBe(0x1d); // α^8 = x^4 + x^3 + x^2 + 1
    expect(GF_EXP[25]).toBe(3);
    expect(GF_EXP[255]).toBe(1); // the multiplicative group has order 255
    expect(GF_LOG[2]).toBe(1);
    expect(GF_LOG[3]).toBe(25);
    for (let i = 1; i < 256; i++) expect(GF_EXP[GF_LOG[i]]).toBe(i);
  });

  it('multiplies', () => {
    expect(gfMul(0, 77)).toBe(0);
    expect(gfMul(1, 77)).toBe(77);
    expect(gfMul(2, 0x80)).toBe(0x1d);
    expect(gfMul(3, 7)).toBe(9); // (x+1)(x²+x+1) = x³+1
    for (let a = 1; a < 256; a += 17) {
      for (let b = 1; b < 256; b += 13) expect(gfMul(a, b)).toBe(gfMul(b, a));
    }
  });
});

describe('Reed–Solomon', () => {
  it('builds the degree-7 and degree-10 generator polynomials', () => {
    // Exponents of α for each coefficient, from the standard's Annex A.
    expect(rsGeneratorPoly(7).map((c) => GF_LOG[c])).toEqual([0, 87, 229, 146, 149, 238, 102, 21]);
    expect(rsGeneratorPoly(10).map((c) => GF_LOG[c])).toEqual([0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
  });

  it('computes the check bytes for "HELLO WORLD" at 1-M', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('produces a codeword divisible by the generator', () => {
    const data = [1, 2, 3, 4, 5, 250, 251, 252];
    const codeword = [...data, ...rsRemainder(data, 12)];
    expect(rsRemainder(codeword, 12)).toEqual(new Array(12).fill(0));
  });
});

describe('tables and BCH codes', () => {
  it('matches known format and version information', () => {
    expect(formatBits('M', 5)).toBe(0b100000011001110);
    expect(formatBits('L', 4)).toBe(0b110011000101111);
    expect(versionBits(7)).toBe(0b000111110010010100);
    expect(versionBits(40)).toBe(0b101000110001101001);
  });

  it('knows alignment positions and capacities', () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(23)).toEqual([6, 30, 54, 78, 102]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
    expect(rawDataModules(1)).toBe(208);
    expect(Math.floor(rawDataModules(40) / 8)).toBe(3706);
    expect(dataCodewordCount(1, 'L')).toBe(19);
    expect(dataCodewordCount(1, 'H')).toBe(9);
    expect(dataCodewordCount(40, 'L')).toBe(2956);
    expect(dataCodewordCount(40, 'H')).toBe(1276);
  });

  it('chooses the densest mode', () => {
    expect(chooseMode('0123456789')).toBe('numeric');
    expect(chooseMode('HELLO WORLD $%*+-./:')).toBe('alphanumeric');
    expect(chooseMode('hello')).toBe('byte');
    expect(chooseMode('héllo ✓')).toBe('byte');
  });
});

describe('encode', () => {
  it('encodes HELLO WORLD as 1-Q, as in the standard example', () => {
    const qr = encode('HELLO WORLD', { ecLevel: 'Q' });
    expect(qr.version).toBe(1);
    expect(qr.size).toBe(21);
    expect(qr.mode).toBe('alphanumeric');
  });

  const samples = [
    'Hello, world!',
    'https://example.com/projects/qr-code-generator?x=1&y=2',
    '0123456789012345678901234567890',
    'HELLO WORLD 123 $%*+-./:',
    'héllo ✓ — 日本語 🎉',
    '',
    'The quick brown fox jumps over the lazy dog. '.repeat(12),
  ];

  for (const level of LEVELS) {
    for (const text of samples) {
      it(`round-trips ${JSON.stringify(text.slice(0, 24))}${text.length > 24 ? '…' : ''} at ${level}`, () => {
        const qr = encode(text, { ecLevel: level });
        const result = decode(qr);
        expect(result, `v${qr.version} mask ${qr.mask}`).not.toBeNull();
        expect(Array.from(result.binaryData)).toEqual(
          qr.mode === 'byte' ? Array.from(new TextEncoder().encode(text)) : Array.from(text, (c) => c.charCodeAt(0)),
        );
        expect(result.data).toBe(text);
      });
    }
  }

  it('round-trips every forced mask', () => {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encode('mask test', { ecLevel: 'M', mask });
      expect(qr.mask).toBe(mask);
      expect(decode(qr)?.data).toBe('mask test');
    }
  });

  it('round-trips every version 1–40 at every level', () => {
    for (const level of LEVELS) {
      for (let v = 1; v <= 40; v++) {
        // Fill each version to capacity with byte-mode text so the full block structure is exercised.
        const header = 4 + (v < 10 ? 8 : 16);
        const len = Math.floor((dataCodewordCount(v, level) * 8 - header) / 8);
        const text = Array.from({ length: len }, (_, i) => 'abcdefghijklmnopqrstuvwxyz'[(i * 7 + v) % 26]).join('');
        const qr = encode(text, { ecLevel: level });
        expect(qr.version, `${level} v${v}`).toBe(v);
        // jsQR 1.4's table lists version 23's alignment centres as 6, 30, 54, 74, 102 (the standard says 78),
        // so it misreads those modules. M/Q/H have enough redundancy to absorb that; L at full capacity
        // doesn't. The positions themselves are checked against the standard above.
        if (!(v === 23 && level === 'L')) expect(decode(qr, v > 25 ? 3 : 4)?.data, `${level} v${v}`).toBe(text);
        if (v < 40) expect(encode(text + 'x', { ecLevel: level }).version).toBe(v + 1);
      }
    }
  }, 120_000);

  it('rejects text that is too long', () => {
    expect(() => encode('a'.repeat(2954), { ecLevel: 'L' })).toThrow(/too long/);
    expect(() => encode('a'.repeat(1274), { ecLevel: 'H' })).toThrow(/too long/);
  });
});
