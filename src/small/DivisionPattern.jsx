/*
 * Division patterns: every pixel is one fraction n/d, shaded by a property of
 * that division. Rows are numerators (n grows downward) and columns are
 * denominators (d grows to the right), so the plane is a multiplication table
 * turned inside out, and its number theory shows up as rays and lattices.
 *
 * Three rules pick the shade:
 *
 * - Decimal length: how many characters JavaScript prints for |n/d|. This is
 *   the original pen's rule. Terminating decimals print short, repeating ones
 *   run to ~17 digits of float precision, so it is a cheap stand-in for
 *   "does this fraction terminate?".
 *
 * - Repeating period: the exact length of the repeating block of n/d's
 *   decimal expansion (1/7 = 0.(142857) has period 6). Reduce the fraction to
 *   n'/q, drop every factor of 2 and 5 from q (those only delay the repeat),
 *   and the period is the multiplicative order of 10 mod q: the smallest k
 *   with 10^k = 1 (mod q). It depends only on q, so it is cached per q.
 *
 * - Remainder: n mod d, the integer leftover of the division.
 *
 * Each rule returns a small integer "level"; the palette turns levels into
 * colors (greyscale clamps, hue cycles). Division by zero is left white.
 *
 * Drag to pan, scroll or use the buttons to zoom (1/3x to 4x), click a cell to
 * pin it and see its full repeating decimal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const SIZE = 501; // Canvas pixels per side.
const INITIAL_VIEW = { left: -250, top: 0, zoom: 1 }; // left/top are (d, n) at the canvas corner.
const ZOOMS = [1 / 3, 1 / 2, 1, 2, 3, 4];
const MAX_COORD = 1e6; // Keeps the period search (and float math) in a sane range.
const MAX_PERIOD_SEARCH = 20000;
const DRAG_THRESHOLD = 3; // Pixels of movement before a press counts as a drag.

// ---- Number theory (pure) --------------------------------------------------

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// Denominator of n/d in lowest terms with every factor of 2 and 5 removed.
// The period of the decimal expansion depends only on this number.
function repeatingModulus(n, d) {
  let q = Math.abs(d) / gcd(Math.abs(n), Math.abs(d));
  while (q % 2 === 0) q /= 2;
  while (q % 5 === 0) q /= 5;
  return q;
}

const periodCache = new Map();

// Multiplicative order of 10 mod q, by stepping 10^k mod q until it hits 1.
// 0 means the decimal terminates. Capped so huge denominators stay fast.
function periodOf(q) {
  if (q === 1) return 0;
  let k = periodCache.get(q);
  if (k !== undefined) return k;
  let r = 10 % q;
  for (k = 1; r !== 1 && k < MAX_PERIOD_SEARCH; k++) r = (r * 10) % q;
  periodCache.set(q, k);
  return k;
}

const RULES = {
  length: {
    label: 'Decimal length',
    level: (n, d) => String(Math.abs(n / d)).length,
  },
  period: {
    label: 'Repeating period',
    // Periods range up to q - 1, so use a log scale to keep levels small.
    level: (n, d) => {
      const p = periodOf(repeatingModulus(n, d));
      return p === 0 ? 0 : 1 + Math.floor(Math.log2(p));
    },
  },
  remainder: {
    label: 'Remainder n mod d',
    level: (n, d) => Math.abs(n % d),
  },
};

// Long division with remainder tracking: a remainder seen before means the
// digits from that point on repeat. Returns e.g. "-0.1(6)" for -1/6.
function exactDecimal(n, d, maxDigits = 120) {
  const sign = n * d < 0 ? '-' : '';
  const a = Math.abs(n);
  const b = Math.abs(d);
  let rem = a % b;
  const digits = [];
  const seenAt = new Map();
  while (rem !== 0 && !seenAt.has(rem) && digits.length < maxDigits) {
    seenAt.set(rem, digits.length);
    rem *= 10;
    digits.push(Math.floor(rem / b));
    rem %= b;
  }
  const whole = sign + Math.floor(a / b);
  if (rem === 0) return digits.length ? `${whole}.${digits.join('')}` : whole;
  if (!seenAt.has(rem)) return `${whole}.${digits.join('')}…`;
  const start = seenAt.get(rem);
  return `${whole}.${digits.slice(0, start).join('')}(${digits.slice(start).join('')})`;
}

// ---- Palettes --------------------------------------------------------------

const WHITE = [255, 255, 255];

// Original greyscale: level 1 is light grey, level 6 and up is black.
const GREYS = Array.from({ length: 7 }, (_, i) => {
  const c = Math.floor((1 - i / 6) * 255);
  return [c, c, c];
});

function hslToRgb(h, s, l) {
  const f = (k) => {
    const t = (k + h / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(t - 3, 9 - t, 1))));
  };
  return [f(0), f(8), f(4)];
}

const HUES = Array.from({ length: 12 }, (_, i) => hslToRgb(i * 30, 0.7, 0.55));

const PALETTES = {
  grey: { label: 'Greyscale', color: (level) => GREYS[Math.min(level, GREYS.length - 1)] },
  hue: { label: 'Color', color: (level) => (level === 0 ? [20, 20, 20] : HUES[level % HUES.length]) },
};

// ---- Rendering -------------------------------------------------------------

const clampCoord = (v) => Math.max(-MAX_COORD, Math.min(MAX_COORD, v));

// Integer (d, n) under a canvas pixel for the given view.
function cellAt(view, px, py) {
  return { d: Math.floor(view.left + px / view.zoom), n: Math.floor(view.top + py / view.zoom) };
}

function drawPattern(ctx, view, rule, palette) {
  const img = ctx.createImageData(SIZE, SIZE);
  const { level } = RULES[rule];
  const { color } = PALETTES[palette];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const { d, n } = cellAt(view, x, y);
      const rgb = d === 0 ? WHITE : color(level(n, d));
      const k = 4 * (x + y * SIZE);
      img.data[k] = rgb[0];
      img.data[k + 1] = rgb[1];
      img.data[k + 2] = rgb[2];
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Zoom so the value under canvas pixel (px, py) stays under that pixel.
function zoomAbout(view, nextZoom, px, py) {
  return {
    zoom: nextZoom,
    left: clampCoord(view.left + px / view.zoom - px / nextZoom),
    top: clampCoord(view.top + py / view.zoom - py / nextZoom),
  };
}

function stepZoom(zoom, direction) {
  const i = ZOOMS.findIndex((z) => Math.abs(z - zoom) < 1e-9);
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + direction))];
}

const formatZoom = (z) => (z < 1 ? `1/${Math.round(1 / z)}×` : `${z}×`);

// ---- Component -------------------------------------------------------------

export default function DivisionPattern() {
  const canvasRef = useRef(null);
  // The in-progress drag lives in a ref: it changes on every pointer move but
  // only the resulting view needs to trigger a render.
  const dragRef = useRef(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [rule, setRule] = useState('length');
  const [palette, setPalette] = useState('grey');
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);

  // Redraw on the next frame; cancelling coalesces bursts of view changes
  // (fast drags, wheel spins) into one draw per frame.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return undefined;
    const frame = requestAnimationFrame(() => drawPattern(ctx, view, rule, palette));
    return () => cancelAnimationFrame(frame);
  }, [view, rule, palette]);

  // Map a pointer event to canvas pixels; the canvas may be scaled by CSS.
  const toCanvas = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      px: ((e.clientX - rect.left) * SIZE) / rect.width,
      py: ((e.clientY - rect.top) * SIZE) / rect.height,
      fx: (e.clientX - rect.left) / rect.width, // 0..1, for positioning the tooltip
      fy: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  // React's onWheel is passive, so preventDefault (to stop the page from
  // scrolling) needs a native listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const { px, py } = toCanvas(e);
      setView((v) => zoomAbout(v, stepZoom(v.zoom, e.deltaY < 0 ? 1 : -1), px, py));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [toCanvas]);

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, view, moved: false };
  };

  const handlePointerMove = (e) => {
    const pos = toCanvas(e);
    const drag = dragRef.current;
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;
      if (drag.moved) {
        const scale = SIZE / canvasRef.current.getBoundingClientRect().width / drag.view.zoom;
        setView({
          ...drag.view,
          left: clampCoord(drag.view.left - dx * scale),
          top: clampCoord(drag.view.top - dy * scale),
        });
        setHover(null);
        return;
      }
    }
    setHover({ ...cellAt(view, pos.px, pos.py), fx: pos.fx, fy: pos.fy });
  };

  const handlePointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      const { px, py } = toCanvas(e);
      const cell = cellAt(view, px, py);
      setPinned((p) => (p && p.n === cell.n && p.d === cell.d ? null : cell));
    }
  };

  const zoomCenter = (direction) =>
    setView((v) => zoomAbout(v, stepZoom(v.zoom, direction), SIZE / 2, SIZE / 2));

  const handleKeyDown = (e) => {
    const step = 25 / view.zoom;
    const pans = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (pans[e.key]) {
      const [dx, dy] = pans[e.key];
      setView((v) => ({ ...v, left: clampCoord(v.left + dx), top: clampCoord(v.top + dy) }));
    } else if (e.key === '+' || e.key === '=') zoomCenter(1);
    else if (e.key === '-') zoomCenter(-1);
    else if (e.key === '0') setView(INITIAL_VIEW);
    else if (e.key === 'Escape') setPinned(null);
    else return;
    e.preventDefault();
  };

  const fraction = ({ n, d }) => (d === 0 ? `${n}/0 is undefined` : `${n}/${d} = ${n / d}`);

  // Pinned-cell marker, positioned in percentages so it tracks CSS scaling.
  const cellPct = 100 * (view.zoom / SIZE);

  const select = 'border border-line bg-raised px-1 py-0.5 text-white';
  const button = 'rounded bg-raised px-2 py-0.5 text-sm text-soft hover:bg-strong disabled:opacity-40';

  return (
    <div className="max-w-[501px] space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-soft">
        <label className="flex items-center gap-2">
          Rule
          <select value={rule} onChange={(e) => setRule(e.target.value)} className={select}>
            {Object.entries(RULES).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Palette
          <select value={palette} onChange={(e) => setPalette(e.target.value)} className={select}>
            {Object.entries(PALETTES).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" className={button} onClick={() => zoomCenter(-1)} disabled={view.zoom === ZOOMS[0]}
            aria-label="Zoom out">−</button>
          <span className="w-10 text-center font-mono text-xs" aria-live="polite">{formatZoom(view.zoom)}</span>
          <button type="button" className={button} onClick={() => zoomCenter(1)} disabled={view.zoom === ZOOMS.at(-1)}
            aria-label="Zoom in">+</button>
          <button type="button" className={button} onClick={() => setView(INITIAL_VIEW)}>Reset</button>
        </div>
      </div>

      <div className="relative inline-block max-w-full touch-none select-none border border-line">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          tabIndex={0}
          aria-label="Division pattern. Drag or use arrow keys to pan, scroll or plus and minus to zoom, click to pin a cell."
          className="block h-auto max-w-full cursor-crosshair focus:outline focus:outline-2 focus:outline-gray-400"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={handleKeyDown}
        />
        {pinned && (
          // Own clipping box, so a marker panned off-canvas is hidden while the
          // tooltip is still free to overflow the canvas edge.
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute outline outline-2 outline-red-500"
              style={{
                left: `${(pinned.d - view.left) * cellPct}%`,
                top: `${(pinned.n - view.top) * cellPct}%`,
                width: `max(${cellPct}%, 3px)`,
                height: `max(${cellPct}%, 3px)`,
              }}
            />
          </div>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap border border-line bg-black px-1 font-mono text-xs text-soft"
            style={{
              left: `${hover.fx * 100}%`,
              top: `${hover.fy * 100}%`,
              // Flip to the other side of the cursor near the right/bottom edges.
              transform: `translate(${hover.fx > 0.5 ? 'calc(-100% - 6px)' : '6px'}, ${hover.fy > 0.85 ? 'calc(-100% - 6px)' : '6px'})`,
            }}
          >
            {fraction(hover)}
          </div>
        )}
      </div>

      <div className="min-h-[3.5rem] rounded border border-line-soft bg-panel p-2 font-mono text-xs text-soft">
        {pinned ? (
          <>
            <div>{fraction(pinned)}</div>
            {pinned.d !== 0 && (
              <>
                <div className="mt-1 break-all text-muted">exact: {exactDecimal(pinned.n, pinned.d)}</div>
                <div className="text-muted">
                  printed length {RULES.length.level(pinned.n, pinned.d)} · period{' '}
                  {periodOf(repeatingModulus(pinned.n, pinned.d))} · remainder {pinned.n % pinned.d}
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-subtle">Click a cell to pin it. Drag to pan, scroll to zoom.</span>
        )}
      </div>
    </div>
  );
}
