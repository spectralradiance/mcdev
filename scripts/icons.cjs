// Generates the project icons in public/art: 64x64, line style, one accent each.
// Run from the repo root: node scripts/icons.cjs
const fs = require('fs');
const path = require('path');
const outDir = process.argv[2] ?? path.join(__dirname, '..', 'public', 'art');

const W = '#e5e7eb'; // primary line
const G = '#6b7280'; // secondary line
const line = (c = W, w = 2) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

const svg = (label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${label}">\n${body.trim()}\n</svg>\n`;

const mono = (x, y, text, fill, size = 13) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${size}" font-weight="600" text-anchor="middle">${text}</text>`;

const icons = {
  // A ray leaves the camera, reflects off a sphere and reaches the light.
  niamh: ['Ray reflecting off a sphere toward a light', `
<circle cx="36" cy="40" r="14" ${line()}/>
<path d="M8 18 L25 31 L44 10" ${line('#f59e0b')}/>
<circle cx="8" cy="18" r="2.5" fill="#f59e0b"/>
<circle cx="49" cy="9" r="4" ${line(W)}/>`],

  // A phone showing a schedule; one set has moved.
  nemeton: ['Phone with a festival schedule', `
<rect x="18" y="6" width="28" height="52" rx="5" ${line()}/>
<path d="M28 52 H36" ${line(G)}/>
<rect x="23" y="14" width="8" height="10" rx="1.5" ${line(G, 1.5)}/>
<rect x="33" y="14" width="8" height="16" rx="1.5" ${line(G, 1.5)}/>
<rect x="23" y="27" width="8" height="16" rx="1.5" fill="#34d399" fill-opacity="0.25" stroke="#34d399" stroke-width="1.5"/>
<rect x="33" y="33" width="8" height="10" rx="1.5" ${line(G, 1.5)}/>`],

  // A document with notes in its margin.
  ogma: ['Document with notes beside its text', `
<rect x="8" y="10" width="48" height="44" rx="4" ${line()}/>
<path d="M40 10 V54" ${line(G, 1.5)}/>
<path d="M14 20 H34 M14 27 H30 M14 34 H34 M14 41 H26" ${line(W, 2)}/>
<path d="M14 27 H30" ${line('#818cf8', 2.5)}/>
<path d="M45 26 H51 M45 31 H50" ${line('#818cf8', 1.5)}/>`],

  // A street tree and a chart of counts.
  'portland-tree-data': ['Tree beside a bar chart', `
<circle cx="22" cy="24" r="13" fill="#4ade80" fill-opacity="0.2" stroke="#4ade80" stroke-width="2"/>
<path d="M22 37 V54 M22 44 L16 39 M22 41 L27 36" ${line()}/>
<path d="M12 54 H56" ${line(G)}/>
<path d="M42 54 V22 M49 54 V32 M56 54 V42" ${line(W, 3.5)}/>`],

  // Deasil: sunwise, clockwise around the sun.
  deasil: ['Sunwise arrow around the sun', `
<circle cx="32" cy="32" r="7" fill="#fbbf24" fill-opacity="0.25" stroke="#fbbf24" stroke-width="2"/>
<path d="M32 10 A22 22 0 1 1 10 32" ${line()}/>
<path d="M5 37 L10 31 L15 37" ${line()}/>`],

  // Tesseract: a cube within a cube.
  kybos: ['Tesseract, a cube within a cube', `
<rect x="10" y="10" width="44" height="44" ${line()}/>
<rect x="23" y="23" width="18" height="18" ${line('#a78bfa')}/>
<path d="M10 10 L23 23 M54 10 L41 23 M10 54 L23 41 M54 54 L41 41" ${line(G)}/>`],

  // A pixel motif reflected across both axes.
  apax: ['Pixel pattern mirrored across two axes', (() => {
    const cells = [[1, 0], [0, 1], [1, 1], [2, 2], [2, 1]];
    const s = 7, o = 32;
    const rects = [];
    for (const [i, j] of cells) {
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = sx > 0 ? o + 1 + i * s : o - 1 - (i + 1) * s;
        const y = sy > 0 ? o + 1 + j * s : o - 1 - (j + 1) * s;
        const quadrant = sx < 0 && sy < 0;
        rects.push(`<rect x="${x}" y="${y}" width="${s - 1}" height="${s - 1}" fill="${quadrant ? '#e879f9' : W}" fill-opacity="${quadrant ? 1 : 0.55}"/>`);
      }
    }
    return `<path d="M32 6 V58 M6 32 H58" ${line(G, 1.5)} stroke-dasharray="3 3"/>\n` + rects.join('\n');
  })()],

  // The Seed of Life: six circles around a seventh.
  'seed-of-life': ['Seed of Life, six circles around a center circle', (() => {
    const r = 11, c = 32;
    const ring = Array.from({ length: 6 }, (_, i) => {
      const t = (i / 6) * 2 * Math.PI - Math.PI / 2;
      return `<circle cx="${(c + r * Math.cos(t)).toFixed(2)}" cy="${(c + r * Math.sin(t)).toFixed(2)}" r="${r}" ${line(W, 1.5)}/>`;
    });
    return [...ring, `<circle cx="${c}" cy="${c}" r="${r}" ${line('#facc15', 2)}/>`].join('\n');
  })()],

  // A melody across a staff.
  aria: ['Melody line across a staff', `
<path d="M6 20 H58 M6 28 H58 M6 36 H58 M6 44 H58" ${line(G, 1)}/>
<path d="M12 40 L24 24 L36 32 L50 16" ${line('#34d399')}/>
<circle cx="12" cy="40" r="3.5" fill="${W}"/>
<circle cx="24" cy="24" r="3.5" fill="${W}"/>
<circle cx="36" cy="32" r="3.5" fill="${W}"/>
<circle cx="50" cy="16" r="3.5" fill="${W}"/>`],

  // Nine buttons, nine hues, one lit.
  simone: ['Three by three grid of colored buttons, one lit', (() => {
    const out = [];
    for (let i = 0; i < 9; ++i) {
      const hue = Math.round((i / 9) * 360);
      const x = 9 + (i % 3) * 16, y = 9 + Math.floor(i / 3) * 16;
      const lit = i === 5;
      out.push(`<rect x="${x}" y="${y}" width="14" height="14" rx="3" fill="hsl(${hue} 90% 60%)" fill-opacity="${lit ? 1 : 0.15}" stroke="hsl(${hue} 90% 60%)" stroke-width="1.5"/>`);
    }
    return out.join('\n');
  })()],

  // A body on its orbit around a heavier one.
  'n-body-gravity-simulator': ['Small body orbiting a larger one', `
<ellipse cx="32" cy="32" rx="25" ry="15" transform="rotate(-25 32 32)" ${line(G, 1.5)} stroke-dasharray="3 3"/>
<circle cx="30" cy="33" r="6" fill="${W}"/>
<circle cx="52" cy="20" r="3.5" fill="#38bdf8"/>
<path d="M52 20 L45 12 M45 12 L46 17 M45 12 L50 12.5" ${line('#38bdf8', 1.5)}/>`],

  // Two balls merge into one of the same total area.
  'merging-balls': ['Two circles merging into one', `
<circle cx="13" cy="22" r="7" ${line()}/>
<circle cx="13" cy="44" r="5" ${line()}/>
<path d="M24 33 H32 M28 29 L32 33 L28 37" ${line(G)}/>
<circle cx="46" cy="33" r="8.6" fill="#60a5fa" fill-opacity="0.25" stroke="#60a5fa" stroke-width="2"/>`],

  // Scrambled letters resolving into a word.
  'decoding-text': ['Scrambled letters resolving into a word', `
${mono(32, 27, 'R#A%', '#a3e635')}
${mono(32, 45, 'REAL', W)}`],

  // A terminal prompt with a block cursor.
  'hacker-typer': ['Terminal prompt with a cursor', `
<rect x="6" y="12" width="52" height="40" rx="4" ${line()}/>
<path d="M14 26 L20 32 L14 38" ${line(W)}/>
<rect x="25" y="34" width="10" height="4" fill="#a3e635"/>`],

  // The same number in two bases.
  'numeric-base-converter': ['255 and FF, the same number in two bases', `
${mono(32, 25, 'FF', '#fb923c', 14)}
${mono(32, 50, '255', W, 14)}
<path d="M22 31 V40 M19 37 L22 40 L25 37 M42 40 V31 M39 34 L42 31 L45 34" ${line(G, 1.5)}/>`],

  // Three channel sliders.
  'color-picker-sliders': ['Red, green and blue sliders', `
<defs>
<linearGradient id="r"><stop offset="0" stop-color="#004a8c"/><stop offset="1" stop-color="#ff4a8c"/></linearGradient>
<linearGradient id="g"><stop offset="0" stop-color="#d8008c"/><stop offset="1" stop-color="#d8ff8c"/></linearGradient>
<linearGradient id="b"><stop offset="0" stop-color="#d84a00"/><stop offset="1" stop-color="#d84aff"/></linearGradient>
</defs>
<rect x="8" y="14" width="48" height="7" rx="2" fill="url(#r)"/>
<rect x="8" y="29" width="48" height="7" rx="2" fill="url(#g)"/>
<rect x="8" y="44" width="48" height="7" rx="2" fill="url(#b)"/>
<path d="M49 11 V24 M22 26 V39 M34 41 V54" ${line(W, 2)}/>`],

  // Swatches by hue and lightness, one chosen.
  'hsv-color-picker': ['Grid of color swatches with one selected', (() => {
    const out = [];
    for (let row = 0; row < 4; ++row) {
      for (let col = 0; col < 4; ++col) {
        const hue = col * 80 + 10, light = 30 + row * 15;
        out.push(`<rect x="${9 + col * 12}" y="${9 + row * 12}" width="10" height="10" rx="1.5" fill="hsl(${hue} 60% ${light}%)"/>`);
      }
    }
    out.push(`<rect x="30" y="31" width="14" height="14" rx="2" fill="hsl(170 60% 45%)" stroke="${W}" stroke-width="2"/>`);
    return out.join('\n');
  })()],

  // Rays of equal ratio fanning out from the origin.
  'draw-division-remainder-pattern': ['Lines of equal ratio fanning from a point', `
<path d="M32 8 L6 56 M32 8 L18 56 M32 8 L46 56 M32 8 L58 56" ${line(G, 1.5)}/>
<path d="M32 8 V56" ${line(W)}/>
<path d="M32 8 L24 56 M32 8 L40 56" ${line('#2dd4bf')}/>
<circle cx="32" cy="8" r="2.5" fill="${W}"/>`],

  // Three finder patterns, a few data modules and the alignment pattern.
  'qr-code-generator': ['QR code finder patterns', (() => {
    const finder = (x, y) =>
      `<rect x="${x + 1}" y="${y + 1}" width="16" height="16" rx="2" ${line(W)}/>\n<rect x="${x + 6}" y="${y + 6}" width="6" height="6" fill="${W}"/>`;
    // Data modules fill the gaps between the finders; the alignment pattern sits bottom right.
    const modules = [[30, 10], [30, 22], [10, 30], [22, 30], [30, 30], [40, 30], [30, 40], [30, 51], [51, 30], [40, 51]]
      .map(([x, y]) => `<rect x="${x}" y="${y}" width="5" height="5" fill="${G}"/>`);
    return [finder(8, 8), finder(38, 8), finder(8, 38), ...modules,
      `<rect x="42" y="41" width="9" height="9" rx="1" ${line('#22d3ee', 2)}/>`].join('\n');
  })()],

  // A filtered list, one item selected.
  'media-list': ['List of items with one selected', `
<rect x="8" y="8" width="20" height="8" rx="4" fill="#db2d6c"/>
<rect x="31" y="8" width="16" height="8" rx="4" ${line(G, 1.5)}/>
<path d="M10 28 H16 M22 28 H52 M10 38 H16 M10 48 H16 M22 48 H44" ${line(W)}/>
<path d="M22 38 H48" ${line('#db2d6c', 2.5)}/>`],
};

for (const [slug, [label, body]] of Object.entries(icons)) {
  fs.writeFileSync(path.join(outDir, `${slug}.svg`), svg(label, body));
}
console.log(Object.keys(icons).length, 'icons');
