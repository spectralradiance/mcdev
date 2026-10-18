var e=`import { useDeferredValue, useMemo, useState } from 'react';
import { EC_LEVELS, encode } from './qr.js';

// A QR code generator. Type text or a URL and the symbol redraws as you type; the encoder in qr.js is
// written from scratch (mode selection, Reed–Solomon error correction, interleaving, masking) and is
// commented as a walkthrough of the QR standard.
//
// This file is the UI around it: it turns the boolean module grid into an SVG (one <path> per color,
// so even a 177×177 version-40 code is a handful of DOM nodes), exports SVG and PNG, and can color the
// "function patterns" (the finders, timing lines, alignment marks and format/version information a
// reader uses to locate and decode the code) so you can see which modules carry data and which don't.

const QUIET_ZONE = 4; // the standard asks for a 4-module light margin around the symbol
const PNG_MODULE_PX = 12;

// Highlight colors for each kind of function module, as reported by encode()'s \`kind\` grid.
const PATTERNS = [
  { kind: 'finder', label: 'Finder', color: '#ef4444' },
  { kind: 'timing', label: 'Timing', color: '#22c55e' },
  { kind: 'alignment', label: 'Alignment', color: '#3b82f6' },
  { kind: 'format', label: 'Format info', color: '#f59e0b' },
  { kind: 'version', label: 'Version info', color: '#a855f7' },
];

// One SVG path covering every module that matches \`test\`. Each module is a 1×1 square drawn as
// "move, right 1, down 1, left 1, close"; the viewBox does the scaling.
function modulePath(qr, offset, test) {
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (test(x, y)) d += \`M\${x + offset} \${y + offset}h1v1h-1z\`;
    }
  }
  return d;
}

// A standalone SVG document for download: just the code, never the highlighting.
function svgDocument(qr, { quiet, dark, light }) {
  const margin = quiet ? QUIET_ZONE : 0;
  const dim = qr.size + 2 * margin;
  const d = modulePath(qr, margin, (x, y) => qr.modules[y][x]);
  return (
    \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${dim} \${dim}" shape-rendering="crispEdges">\` +
    \`<rect width="\${dim}" height="\${dim}" fill="\${light}"/><path d="\${d}" fill="\${dark}"/></svg>\`
  );
}

function pngBlob(qr, { quiet, dark, light }) {
  const margin = quiet ? QUIET_ZONE : 0;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (qr.size + 2 * margin) * PNG_MODULE_PX;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        ctx.fillRect((x + margin) * PNG_MODULE_PX, (y + margin) * PNG_MODULE_PX, PNG_MODULE_PX, PNG_MODULE_PX);
      }
    }
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick; revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Relative luminance (WCAG) of a #rrggbb color, to warn when the "dark" color isn't darker. Most
// readers look for dark modules on a light background, and many can't read an inverted code.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function tryEncode(text, options) {
  try {
    return { qr: encode(text, options) };
  } catch (error) {
    return { error: error.message };
  }
}

const buttonClass =
  'rounded border border-line bg-raised px-3 py-1.5 text-sm text-soft hover:bg-strong ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-40';

export default function QrCode() {
  const [text, setText] = useState('https://example.com/');
  const [ecLevel, setEcLevel] = useState('M');
  const [mask, setMask] = useState('auto');
  const [quiet, setQuiet] = useState(true);
  const [dark, setDark] = useState('#000000');
  const [light, setLight] = useState('#ffffff');
  const [highlight, setHighlight] = useState(false);

  // Big codes take a few milliseconds to encode (8 masks are tried and scored), so let typing stay
  // responsive and re-encode with the deferred value.
  const deferredText = useDeferredValue(text);
  const { qr, error } = useMemo(
    () => tryEncode(deferredText, { ecLevel, mask: mask === 'auto' ? undefined : Number(mask) }),
    [deferredText, ecLevel, mask],
  );

  const margin = quiet ? QUIET_ZONE : 0;
  const colors = { quiet, dark, light };
  const lowContrast = luminance(light) - luminance(dark) < 0.4;

  const paths = useMemo(() => {
    if (!qr) return null;
    const isData = (x, y) => qr.kind[y][x] === null;
    return {
      dark: modulePath(qr, margin, (x, y) => qr.modules[y][x] && (!highlight || isData(x, y))),
      patterns: highlight
        ? PATTERNS.map(({ kind, color }) => ({
            kind,
            color,
            dark: modulePath(qr, margin, (x, y) => qr.kind[y][x] === kind && qr.modules[y][x]),
            light: modulePath(qr, margin, (x, y) => qr.kind[y][x] === kind && !qr.modules[y][x]),
          }))
        : [],
    };
  }, [qr, margin, highlight]);

  const dim = qr ? qr.size + 2 * margin : 1;
  const bytes = qr ? Math.ceil(qr.dataBits / 8) : 0;

  return (
    <div className="flex flex-col gap-4 text-soft sm:flex-row-reverse sm:items-start">
      <figure className="mx-auto w-full max-w-xs shrink-0 sm:mx-0">
        <div className="aspect-square w-full overflow-hidden rounded border border-line" style={{ background: light }}>
          {qr && (
            <svg
              viewBox={\`0 0 \${dim} \${dim}\`}
              shapeRendering="crispEdges"
              className="h-full w-full"
              role="img"
              aria-label={\`QR code for: \${deferredText || '(empty)'}\`}
            >
              <path d={paths.dark} fill={dark} />
              {paths.patterns.map((p) => (
                <g key={p.kind} fill={p.color}>
                  <path d={p.light} opacity={0.3} />
                  <path d={p.dark} />
                </g>
              ))}
            </svg>
          )}
        </div>
        <figcaption className="mt-2 text-xs text-muted" aria-live="polite">
          {qr ? (
            <>
              Version {qr.version} ({qr.size}×{qr.size}) · {qr.mode} mode · mask {qr.mask} · {bytes}/
              {qr.capacityBits / 8} bytes ({Math.round((qr.dataBits / qr.capacityBits) * 100)}% used)
            </>
          ) : (
            <span className="text-orange-400">{error}</span>
          )}
        </figcaption>
        {highlight && (
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {PATTERNS.filter((p) => p.kind !== 'version' || qr?.version >= 7).map((p) => (
              <li key={p.kind} className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: p.color }} />
                {p.label}
              </li>
            ))}
            <li className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm border border-gray-600" style={{ background: dark }} />
              Data + error correction
            </li>
          </ul>
        )}
      </figure>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Text or URL
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full resize-y rounded border border-line bg-panel p-2 font-mono text-sm text-white focus:border-gray-400 focus:outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">Error correction</legend>
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(EC_LEVELS).map(([level, { recovers }]) => (
              <label
                key={level}
                className={
                  'cursor-pointer rounded border px-2 py-1 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-400 ' +
                  (ecLevel === level ? 'border-gray-400 bg-strong text-white' : 'border-line bg-panel hover:bg-raised')
                }
              >
                <input
                  type="radio"
                  name="qr-ec-level"
                  value={level}
                  checked={ecLevel === level}
                  onChange={() => setEcLevel(level)}
                  className="sr-only"
                />
                <span className="font-mono font-bold">{level}</span>
                <span className="block text-xs text-muted">{recovers}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            Mask
            <select
              value={mask}
              onChange={(e) => setMask(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-white focus:border-gray-400 focus:outline-none"
            >
              <option value="auto">Auto (lowest penalty)</option>
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Dark
            <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} className="h-7 w-9 bg-transparent" />
          </label>
          <label className="flex items-center gap-2">
            Light
            <input type="color" value={light} onChange={(e) => setLight(e.target.value)} className="h-7 w-9 bg-transparent" />
          </label>
        </div>
        {lowContrast && (
          <p className="-mt-2 text-xs text-orange-400">
            Low contrast or inverted colors: many readers need a clearly darker foreground.
          </p>
        )}

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />
            Quiet zone (4-module margin)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
            Highlight function patterns
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!qr}
            onClick={() => download(new Blob([svgDocument(qr, colors)], { type: 'image/svg+xml' }), 'qr-code.svg')}
          >
            Download SVG
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!qr}
            onClick={async () => download(await pngBlob(qr, colors), 'qr-code.png')}
          >
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}
`;export{e as default};