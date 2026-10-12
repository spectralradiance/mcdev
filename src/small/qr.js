// A QR code encoder written from scratch, following ISO/IEC 18004 (the QR code standard).
//
// A QR code ("symbol") is a square grid of dark and light "modules". Making one is a pipeline:
//
//   1. Data analysis      Pick the most compact encoding "mode" for the text: numeric, alphanumeric or byte.
//   2. Data encoding      Turn the text into a bit stream: mode indicator, character count, the data, a
//                         terminator, then padding up to the symbol's data capacity.
//   3. Version choice     There are 40 sizes ("versions"), 21×21 to 177×177. Use the smallest that fits.
//   4. Error correction   Split the data codewords (bytes) into blocks and append Reed–Solomon check bytes
//                         to each, so a reader can repair damage. Four levels: L, M, Q, H recover roughly
//                         7%, 15%, 25% and 30% of the codewords.
//   5. Interleaving       Weave the blocks together byte by byte, so a smudge hurts many blocks a little
//                         rather than one block a lot.
//   6. Module placement   Draw the "function patterns" a reader uses to find and orient the code (finders,
//                         timing, alignment), then snake the bits through the remaining area.
//   7. Masking            XOR the data area with one of 8 patterns, scoring each for features that confuse
//                         readers (big blobs, long runs, finder look-alikes) and keeping the best.
//   8. Format/version     Record the EC level and mask (and, for version 7+, the version) in BCH-protected
//                         bit strings placed next to the finders.
//
// Each step below is a small function. The only export most callers need is `encode`.

// ---------------------------------------------------------------------------------------------------
// Galois field GF(256) and Reed–Solomon
// ---------------------------------------------------------------------------------------------------
//
// Reed–Solomon works on bytes as elements of the finite field GF(2^8). Addition is XOR; multiplication is
// polynomial multiplication modulo a degree-8 "primitive" polynomial, for QR codes
// x^8 + x^4 + x^3 + x^2 + 1 (0x11D). Because 2 (written α) is a generator of the field, every non-zero
// element is α^i for some i in 0..254, so we multiply with log/antilog tables: a·b = α^(log a + log b).

export const GF_EXP = new Uint8Array(512); // α^i, doubled in length so log a + log b never needs a mod
export const GF_LOG = new Uint8Array(256); // inverse of GF_EXP (GF_LOG[0] is meaningless)

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1; // multiply by α
    if (x & 0x100) x ^= 0x11d; // reduce modulo the primitive polynomial
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

export function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// The generator polynomial for `degree` check bytes is g(x) = (x - α^0)(x - α^1)…(x - α^(degree-1)).
// Coefficients are returned highest power first, leading 1 included. (In GF(2^8), minus is plus is XOR.)
export function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]; // poly · x
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]); // poly · α^i
    }
    poly = next;
  }
  return poly;
}

// The check bytes are the remainder of data(x) · x^degree divided by g(x): appending them makes the whole
// codeword divisible by g(x), which is what lets a decoder detect and locate errors. This is ordinary
// long division, one leading term at a time.
export function rsRemainder(data, degree) {
  const gen = rsGeneratorPoly(degree);
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ---------------------------------------------------------------------------------------------------
// Tables from the standard
// ---------------------------------------------------------------------------------------------------

// Order matters: it's the index into the tables below. `bits` is the 2-bit value in the format information.
export const EC_LEVELS = {
  L: { index: 0, bits: 0b01, recovers: '~7%' },
  M: { index: 1, bits: 0b00, recovers: '~15%' },
  Q: { index: 2, bits: 0b11, recovers: '~25%' },
  H: { index: 3, bits: 0b10, recovers: '~30%' },
};

// Table 9 of the standard, per EC level [L, M, Q, H], indexed by version (index 0 unused):
// how many Reed–Solomon check bytes each block gets, and how many blocks the codewords are split into.
const EC_CODEWORDS_PER_BLOCK = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const EC_BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

export const sizeOfVersion = (version) => 17 + 4 * version;

// Number of modules left for codewords once the function patterns are drawn, derived by subtracting
// each pattern's area from size². Rather than a 40-entry table, it's computed: finders + separators +
// format info take 3·64 + 31; timing takes 2·(size-16); each alignment pattern 25 (minus overlap with
// timing); version info 2·18. Divided by 8 (rounding down) it gives the total codeword count; for some
// versions a few "remainder bits" are left over and stay zero.
export function rawDataModules(version) {
  const size = sizeOfVersion(version);
  let modules = size * size - 3 * 64 - 31 - 2 * (size - 16);
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2; // alignment patterns per row/column
    modules -= 25 * (n * n - 3) - 10 * (n - 2); // n²-3 patterns (3 corners hold finders), minus timing overlap
  }
  if (version >= 7) modules -= 36;
  return modules;
}

export function dataCodewordCount(version, ecLevel) {
  const e = EC_LEVELS[ecLevel].index;
  return Math.floor(rawDataModules(version) / 8) - EC_CODEWORDS_PER_BLOCK[e][version] * EC_BLOCKS[e][version];
}

// Centres of the alignment patterns along each axis (Annex E). They start at 6, end at size-7, and are
// evenly spaced in between with an even step — version 32 is the one exception to the formula.
export function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const last = sizeOfVersion(version) - 7;
  const step = version === 32 ? 26 : Math.ceil((last - 6) / (count - 1) / 2) * 2;
  const positions = [6];
  for (let i = count - 2; i >= 0; i--) positions.push(last - i * step);
  return positions;
}

// ---------------------------------------------------------------------------------------------------
// Steps 1–2: choose a mode and encode the data as bits
// ---------------------------------------------------------------------------------------------------

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Each mode has a 4-bit indicator and a character-count field whose width depends on the version range
// (1–9, 10–26, 27–40), since bigger symbols can hold longer strings.
export const MODES = {
  numeric: { indicator: 0b0001, countBits: [10, 12, 14] },
  alphanumeric: { indicator: 0b0010, countBits: [9, 11, 13] },
  byte: { indicator: 0b0100, countBits: [8, 16, 16] },
};

// Numeric packs 3 digits into 10 bits (3.33 bits/char), alphanumeric 2 chars into 11 bits (5.5),
// byte mode 8 bits per byte. One segment in the densest mode that covers the whole text keeps this
// simple; real encoders sometimes mix modes for slightly smaller codes.
export function chooseMode(text) {
  if (/^[0-9]*$/.test(text)) return 'numeric';
  if ([...text].every((c) => ALPHANUMERIC.includes(c))) return 'alphanumeric';
  return 'byte';
}

class BitBuffer {
  bits = [];
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

// The segment's payload bits, without header. Returns them with the "character count" the header records
// (characters for numeric/alphanumeric, bytes for byte mode).
function encodePayload(text, mode) {
  const buf = new BitBuffer();
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3);
      buf.push(Number(group), group.length * 3 + 1); // 3 digits → 10 bits, 2 → 7, 1 → 4
    }
    return { bits: buf.bits, count: text.length };
  }
  if (mode === 'alphanumeric') {
    for (let i = 0; i < text.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(text[i]);
      if (i + 1 < text.length) buf.push(a * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
      else buf.push(a, 6);
    }
    return { bits: buf.bits, count: text.length };
  }
  // Byte mode carries arbitrary bytes; we send UTF-8, which modern readers assume.
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) buf.push(b, 8);
  return { bits: buf.bits, count: bytes.length };
}

const countBitsFor = (mode, version) => MODES[mode].countBits[version < 10 ? 0 : version < 27 ? 1 : 2];

// Build the full data codeword sequence for a version: header, payload, terminator, padding.
function buildDataCodewords(payload, mode, version, ecLevel) {
  const capacityBits = dataCodewordCount(version, ecLevel) * 8;
  const buf = new BitBuffer();
  buf.push(MODES[mode].indicator, 4);
  buf.push(payload.count, countBitsFor(mode, version));
  buf.bits.push(...payload.bits);
  // Terminator: up to four 0 bits, then zero-fill to a byte boundary.
  buf.push(0, Math.min(4, capacityBits - buf.bits.length));
  buf.push(0, (8 - (buf.bits.length % 8)) % 8);
  // Fill remaining capacity with the alternating pad bytes 11101100 and 00010001 the standard specifies.
  for (let pad = 0xec; buf.bits.length < capacityBits; pad ^= 0xec ^ 0x11) buf.push(pad, 8);

  const bytes = [];
  for (let i = 0; i < buf.bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | buf.bits[i + j];
    bytes.push(b);
  }
  return bytes;
}

// ---------------------------------------------------------------------------------------------------
// Steps 4–5: error correction blocks and interleaving
// ---------------------------------------------------------------------------------------------------

// The data codewords are divided into blocks; when they don't divide evenly, the later blocks ("group 2")
// get one more data byte than the earlier ones. Every block gets the same number of check bytes.
// The final sequence is data byte 0 of every block, then data byte 1 of every block, …, then the check
// bytes interleaved the same way.
export function addErrorCorrection(data, version, ecLevel) {
  const e = EC_LEVELS[ecLevel].index;
  const numBlocks = EC_BLOCKS[e][version];
  const ecLen = EC_CODEWORDS_PER_BLOCK[e][version];
  const totalCodewords = Math.floor(rawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (totalCodewords % numBlocks);
  const shortDataLen = Math.floor(totalCodewords / numBlocks) - ecLen;

  const blocks = [];
  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const len = shortDataLen + (i < numShortBlocks ? 0 : 1);
    const blockData = data.slice(offset, offset + len);
    offset += len;
    blocks.push({ data: blockData, ec: rsRemainder(blockData, ecLen) });
  }

  const result = [];
  for (let i = 0; i <= shortDataLen; i++) {
    for (const block of blocks) if (i < block.data.length) result.push(block.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const block of blocks) result.push(block.ec[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Step 6: the module matrix and function patterns
// ---------------------------------------------------------------------------------------------------

// `kind` records what each module is for: a function-pattern name, or null for data. Data placement
// and masking skip every module with a kind; the UI uses it to highlight the patterns.
function createMatrix(size) {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    kind: Array.from({ length: size }, () => new Array(size).fill(null)),
  };
}

function setFunction(m, x, y, dark, kind) {
  m.modules[y][x] = dark;
  m.kind[y][x] = kind;
}

// Finder pattern: the 7×7 "bullseye" (dark ring, light ring, 3×3 dark core) in three corners, with a
// 1-module light separator around it. Its 1:1:3:1:1 ratio along any line through the centre is what lets
// a reader find the code at any rotation.
function drawFinder(m, cx, cy) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= m.size || y >= m.size) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance from the centre
      setFunction(m, x, y, ring !== 2 && ring !== 4, 'finder');
    }
  }
}

// Alignment pattern: a smaller 5×5 bullseye that helps correct perspective distortion in larger codes.
function drawAlignment(m, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(m, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, 'alignment');
    }
  }
}

// BCH error-correcting code used by the format and version information: append the remainder of
// value · x^(degree) divided by the generator, in ordinary GF(2) polynomial arithmetic (XOR, no field).
function bchRemainder(value, generator, degree) {
  let rem = value << degree;
  for (let bit = 31 - Math.clz32(rem); bit >= degree; bit--) {
    if ((rem >>> bit) & 1) rem ^= generator << (bit - degree);
  }
  return rem;
}

// Format information: 2 bits of EC level + 3 bits of mask, protected by a (15,5) BCH code with generator
// 0x537, then XORed with 0x5412 so it's never all-zero. Two copies are written: around the top-left finder,
// and split between the other two finders. Also places the "dark module" that always sits beside the
// bottom-left copy.
export function formatBits(ecLevel, mask) {
  const data = (EC_LEVELS[ecLevel].bits << 3) | mask;
  return ((data << 10) | bchRemainder(data, 0x537, 10)) ^ 0x5412;
}

function drawFormat(m, ecLevel, mask) {
  const bits = formatBits(ecLevel, mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  const s = m.size;
  // Copy 1: down column 8 then along row 8, hopping over the timing pattern at index 6.
  for (let i = 0; i <= 5; i++) setFunction(m, 8, i, bit(i), 'format');
  setFunction(m, 8, 7, bit(6), 'format');
  setFunction(m, 8, 8, bit(7), 'format');
  setFunction(m, 7, 8, bit(8), 'format');
  for (let i = 9; i < 15; i++) setFunction(m, 14 - i, 8, bit(i), 'format');
  // Copy 2: along row 8 at the right, then up column 8 at the bottom.
  for (let i = 0; i < 8; i++) setFunction(m, s - 1 - i, 8, bit(i), 'format');
  for (let i = 8; i < 15; i++) setFunction(m, 8, s - 15 + i, bit(i), 'format');
  setFunction(m, 8, s - 8, true, 'format'); // the dark module
}

// Version information (versions 7+): 6 version bits protected by an (18,6) BCH code with generator
// 0x1F25, written as a 6×3 block above the bottom-left finder and its transpose left of the top-right one.
export function versionBits(version) {
  return (version << 12) | bchRemainder(version, 0x1f25, 12);
}

function drawVersion(m, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = m.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(m, a, b, dark, 'version');
    setFunction(m, b, a, dark, 'version');
  }
}

function drawFunctionPatterns(m, version, ecLevel) {
  const s = m.size;
  // Timing patterns: alternating modules along row 6 and column 6, so a reader can count module pitch.
  for (let i = 0; i < s; i++) {
    setFunction(m, 6, i, i % 2 === 0, 'timing');
    setFunction(m, i, 6, i % 2 === 0, 'timing');
  }
  drawFinder(m, 3, 3);
  drawFinder(m, s - 4, 3);
  drawFinder(m, 3, s - 4);
  // Alignment patterns go at every pair of positions, except the three corners the finders occupy.
  const pos = alignmentPositions(version);
  const last = pos.length - 1;
  pos.forEach((y, i) =>
    pos.forEach((x, j) => {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (!onFinder) drawAlignment(m, x, y);
    }),
  );
  // Reserve the format area now (mask 0 as a placeholder) so data placement skips it; it's redrawn later.
  drawFormat(m, ecLevel, 0);
  drawVersion(m, version);
}

// Data placement: codeword bits go in a zigzag through two-module-wide columns, starting at the bottom
// right, going up, then down the next column pair to the left, and so on. Column 6 (vertical timing) is
// skipped entirely. Within each pair, the right module is filled before the left. Function modules are
// stepped over.
function placeData(m, codewords) {
  const s = m.size;
  let i = 0;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < s; vert++) {
      const y = upward ? s - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (m.kind[y][x] !== null) continue;
        if (i < codewords.length * 8) {
          m.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
        // Any remainder bits past the last codeword stay light (0).
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Step 7: masking and penalty scoring
// ---------------------------------------------------------------------------------------------------

// The 8 mask patterns (x = column, y = row). Where the condition is true, the data module is inverted.
export const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// XOR is its own inverse, so applying the same mask twice undoes it.
function applyMask(m, mask) {
  const fn = MASKS[mask];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.kind[y][x] === null && fn(x, y)) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

// Penalty rules from section 7.8.3; lower is better.
//   N1: each run of 5+ same-colored modules in a row/column scores 3, plus 1 per module beyond 5.
//   N2: each 2×2 block of one color scores 3.
//   N3: each finder look-alike 1:1:3:1:1 (dark:light:dark:light:dark) with 4 light modules on one side
//       scores 40. Off-symbol modules count as light, as the quiet zone would be.
//   N4: 10 points per 5% that the dark proportion strays from 50%.
export function penaltyScore(modules) {
  const size = modules.length;
  let score = 0;
  const finderA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const finderB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  const scoreLine = (get) => {
    let runColor = null;
    let runLen = 0;
    for (let i = 0; i < size; i++) {
      const c = get(i);
      if (c === runColor) runLen++;
      else {
        if (runLen >= 5) score += runLen - 2;
        runColor = c;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen - 2;
    for (let i = -10; i < size; i++) {
      const at = (k) => (i + k >= 0 && i + k < size && get(i + k) ? 1 : 0);
      if (finderA.every((v, k) => at(k) === v) || finderB.every((v, k) => at(k) === v)) score += 40;
    }
  };

  let dark = 0;
  for (let y = 0; y < size; y++) {
    scoreLine((i) => modules[y][i]);
    scoreLine((i) => modules[i][y]);
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
      if (x < size - 1 && y < size - 1) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
      }
    }
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

// ---------------------------------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------------------------------

/**
 * Encode text as a QR code.
 * @param {string} text
 * @param {{ ecLevel?: 'L'|'M'|'Q'|'H', mask?: number, minVersion?: number }} [options]
 *   `mask` forces one of the 8 masks (0–7); by default the lowest-penalty mask is chosen.
 * @returns {{ size, version, ecLevel, mask, mode, modules: boolean[][], kind: (string|null)[][],
 *   dataBits: number, capacityBits: number }}
 *   `modules[y][x]` is true for dark. `kind[y][x]` names the function pattern a module belongs to
 *   ('finder', 'timing', 'alignment', 'format', 'version') or is null for data/EC modules.
 */
export function encode(text, { ecLevel = 'M', mask, minVersion = 1 } = {}) {
  if (!(ecLevel in EC_LEVELS)) throw new Error(`Unknown error correction level ${ecLevel}`);
  if (mask !== undefined && mask !== null && !(mask >= 0 && mask <= 7)) throw new Error('Mask must be 0–7');

  const mode = chooseMode(text);
  const payload = encodePayload(text, mode);

  // The header's count-field width depends on the version, so the fit is checked per version.
  let version = Math.max(1, minVersion);
  let dataBits;
  for (; version <= 40; version++) {
    dataBits = 4 + countBitsFor(mode, version) + payload.bits.length;
    const countFits = payload.count < 2 ** countBitsFor(mode, version);
    if (countFits && dataBits <= dataCodewordCount(version, ecLevel) * 8) break;
  }
  if (version > 40) throw new Error('Text is too long for a QR code at this error correction level');

  const data = buildDataCodewords(payload, mode, version, ecLevel);
  const codewords = addErrorCorrection(data, version, ecLevel);

  const m = createMatrix(sizeOfVersion(version));
  drawFunctionPatterns(m, version, ecLevel);
  placeData(m, codewords);

  let chosen = mask;
  if (chosen === undefined || chosen === null) {
    // Try every mask with its real format information in place (it affects the score) and keep the best.
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      applyMask(m, k);
      drawFormat(m, ecLevel, k);
      const score = penaltyScore(m.modules);
      if (score < best) {
        best = score;
        chosen = k;
      }
      applyMask(m, k); // undo
    }
  }
  applyMask(m, chosen);
  drawFormat(m, ecLevel, chosen);

  return {
    size: m.size,
    version,
    ecLevel,
    mask: chosen,
    mode,
    modules: m.modules,
    kind: m.kind,
    dataBits,
    capacityBits: dataCodewordCount(version, ecLevel) * 8,
  };
}
