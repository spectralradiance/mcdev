var e=`/*\r
 * Division patterns: every pixel is one fraction n/d, shaded by a property of\r
 * that division. Rows are numerators (n grows downward) and columns are\r
 * denominators (d grows to the right), so the plane is a multiplication table\r
 * turned inside out, and its number theory shows up as rays and lattices.\r
 *\r
 * Three rules pick the shade:\r
 *\r
 * - Decimal length: how many characters JavaScript prints for |n/d|. This is\r
 *   the original pen's rule. Terminating decimals print short, repeating ones\r
 *   run to ~17 digits of float precision, so it is a cheap stand-in for\r
 *   "does this fraction terminate?".\r
 *\r
 * - Repeating period: the exact length of the repeating block of n/d's\r
 *   decimal expansion (1/7 = 0.(142857) has period 6). Reduce the fraction to\r
 *   n'/q, drop every factor of 2 and 5 from q (those only delay the repeat),\r
 *   and the period is the multiplicative order of 10 mod q: the smallest k\r
 *   with 10^k = 1 (mod q). It depends only on q, so it is cached per q.\r
 *\r
 * - Remainder: n mod d, the integer leftover of the division.\r
 *\r
 * Each rule returns a small integer "level"; the palette turns levels into\r
 * colors (greyscale clamps, hue cycles). Division by zero is left white.\r
 *\r
 * Drag to pan, scroll or use the buttons to zoom (1/3x to 4x), click a cell to\r
 * pin it and see its full repeating decimal.\r
 */\r
import { useCallback, useEffect, useRef, useState } from 'react';\r
\r
const SIZE = 501; // Canvas pixels per side.\r
const INITIAL_VIEW = { left: -250, top: 0, zoom: 1 }; // left/top are (d, n) at the canvas corner.\r
const ZOOMS = [1 / 3, 1 / 2, 1, 2, 3, 4];\r
const MAX_COORD = 1e6; // Keeps the period search (and float math) in a sane range.\r
const MAX_PERIOD_SEARCH = 20000;\r
const DRAG_THRESHOLD = 3; // Pixels of movement before a press counts as a drag.\r
\r
// ---- Number theory (pure) --------------------------------------------------\r
\r
function gcd(a, b) {\r
  while (b) [a, b] = [b, a % b];\r
  return a;\r
}\r
\r
// Denominator of n/d in lowest terms with every factor of 2 and 5 removed.\r
// The period of the decimal expansion depends only on this number.\r
function repeatingModulus(n, d) {\r
  let q = Math.abs(d) / gcd(Math.abs(n), Math.abs(d));\r
  while (q % 2 === 0) q /= 2;\r
  while (q % 5 === 0) q /= 5;\r
  return q;\r
}\r
\r
const periodCache = new Map();\r
\r
// Multiplicative order of 10 mod q, by stepping 10^k mod q until it hits 1.\r
// 0 means the decimal terminates. Capped so huge denominators stay fast.\r
function periodOf(q) {\r
  if (q === 1) return 0;\r
  let k = periodCache.get(q);\r
  if (k !== undefined) return k;\r
  let r = 10 % q;\r
  for (k = 1; r !== 1 && k < MAX_PERIOD_SEARCH; k++) r = (r * 10) % q;\r
  periodCache.set(q, k);\r
  return k;\r
}\r
\r
const RULES = {\r
  length: {\r
    label: 'Decimal length',\r
    level: (n, d) => String(Math.abs(n / d)).length,\r
  },\r
  period: {\r
    label: 'Repeating period',\r
    // Periods range up to q - 1, so use a log scale to keep levels small.\r
    level: (n, d) => {\r
      const p = periodOf(repeatingModulus(n, d));\r
      return p === 0 ? 0 : 1 + Math.floor(Math.log2(p));\r
    },\r
  },\r
  remainder: {\r
    label: 'Remainder n mod d',\r
    level: (n, d) => Math.abs(n % d),\r
  },\r
};\r
\r
// Long division with remainder tracking: a remainder seen before means the\r
// digits from that point on repeat. Returns e.g. "-0.1(6)" for -1/6.\r
function exactDecimal(n, d, maxDigits = 120) {\r
  const sign = n * d < 0 ? '-' : '';\r
  const a = Math.abs(n);\r
  const b = Math.abs(d);\r
  let rem = a % b;\r
  const digits = [];\r
  const seenAt = new Map();\r
  while (rem !== 0 && !seenAt.has(rem) && digits.length < maxDigits) {\r
    seenAt.set(rem, digits.length);\r
    rem *= 10;\r
    digits.push(Math.floor(rem / b));\r
    rem %= b;\r
  }\r
  const whole = sign + Math.floor(a / b);\r
  if (rem === 0) return digits.length ? \`\${whole}.\${digits.join('')}\` : whole;\r
  if (!seenAt.has(rem)) return \`\${whole}.\${digits.join('')}…\`;\r
  const start = seenAt.get(rem);\r
  return \`\${whole}.\${digits.slice(0, start).join('')}(\${digits.slice(start).join('')})\`;\r
}\r
\r
// ---- Palettes --------------------------------------------------------------\r
\r
const WHITE = [255, 255, 255];\r
\r
// Original greyscale: level 1 is light grey, level 6 and up is black.\r
const GREYS = Array.from({ length: 7 }, (_, i) => {\r
  const c = Math.floor((1 - i / 6) * 255);\r
  return [c, c, c];\r
});\r
\r
function hslToRgb(h, s, l) {\r
  const f = (k) => {\r
    const t = (k + h / 30) % 12;\r
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(t - 3, 9 - t, 1))));\r
  };\r
  return [f(0), f(8), f(4)];\r
}\r
\r
const HUES = Array.from({ length: 12 }, (_, i) => hslToRgb(i * 30, 0.7, 0.55));\r
\r
const PALETTES = {\r
  grey: { label: 'Greyscale', color: (level) => GREYS[Math.min(level, GREYS.length - 1)] },\r
  hue: { label: 'Color', color: (level) => (level === 0 ? [20, 20, 20] : HUES[level % HUES.length]) },\r
};\r
\r
// ---- Rendering -------------------------------------------------------------\r
\r
const clampCoord = (v) => Math.max(-MAX_COORD, Math.min(MAX_COORD, v));\r
\r
// Integer (d, n) under a canvas pixel for the given view.\r
function cellAt(view, px, py) {\r
  return { d: Math.floor(view.left + px / view.zoom), n: Math.floor(view.top + py / view.zoom) };\r
}\r
\r
function drawPattern(ctx, view, rule, palette) {\r
  const img = ctx.createImageData(SIZE, SIZE);\r
  const { level } = RULES[rule];\r
  const { color } = PALETTES[palette];\r
  for (let y = 0; y < SIZE; y++) {\r
    for (let x = 0; x < SIZE; x++) {\r
      const { d, n } = cellAt(view, x, y);\r
      const rgb = d === 0 ? WHITE : color(level(n, d));\r
      const k = 4 * (x + y * SIZE);\r
      img.data[k] = rgb[0];\r
      img.data[k + 1] = rgb[1];\r
      img.data[k + 2] = rgb[2];\r
      img.data[k + 3] = 255;\r
    }\r
  }\r
  ctx.putImageData(img, 0, 0);\r
}\r
\r
// Zoom so the value under canvas pixel (px, py) stays under that pixel.\r
function zoomAbout(view, nextZoom, px, py) {\r
  return {\r
    zoom: nextZoom,\r
    left: clampCoord(view.left + px / view.zoom - px / nextZoom),\r
    top: clampCoord(view.top + py / view.zoom - py / nextZoom),\r
  };\r
}\r
\r
function stepZoom(zoom, direction) {\r
  const i = ZOOMS.findIndex((z) => Math.abs(z - zoom) < 1e-9);\r
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + direction))];\r
}\r
\r
const formatZoom = (z) => (z < 1 ? \`1/\${Math.round(1 / z)}×\` : \`\${z}×\`);\r
\r
// ---- Component -------------------------------------------------------------\r
\r
export default function DivisionPattern() {\r
  const canvasRef = useRef(null);\r
  // The in-progress drag lives in a ref: it changes on every pointer move but\r
  // only the resulting view needs to trigger a render.\r
  const dragRef = useRef(null);\r
  const [view, setView] = useState(INITIAL_VIEW);\r
  const [rule, setRule] = useState('length');\r
  const [palette, setPalette] = useState('grey');\r
  const [hover, setHover] = useState(null);\r
  const [pinned, setPinned] = useState(null);\r
\r
  // Redraw on the next frame; cancelling coalesces bursts of view changes\r
  // (fast drags, wheel spins) into one draw per frame.\r
  useEffect(() => {\r
    const ctx = canvasRef.current?.getContext('2d');\r
    if (!ctx) return undefined;\r
    const frame = requestAnimationFrame(() => drawPattern(ctx, view, rule, palette));\r
    return () => cancelAnimationFrame(frame);\r
  }, [view, rule, palette]);\r
\r
  // Map a pointer event to canvas pixels; the canvas may be scaled by CSS.\r
  const toCanvas = useCallback((e) => {\r
    const rect = canvasRef.current.getBoundingClientRect();\r
    return {\r
      px: ((e.clientX - rect.left) * SIZE) / rect.width,\r
      py: ((e.clientY - rect.top) * SIZE) / rect.height,\r
      fx: (e.clientX - rect.left) / rect.width, // 0..1, for positioning the tooltip\r
      fy: (e.clientY - rect.top) / rect.height,\r
    };\r
  }, []);\r
\r
  // React's onWheel is passive, so preventDefault (to stop the page from\r
  // scrolling) needs a native listener.\r
  useEffect(() => {\r
    const canvas = canvasRef.current;\r
    const onWheel = (e) => {\r
      e.preventDefault();\r
      const { px, py } = toCanvas(e);\r
      setView((v) => zoomAbout(v, stepZoom(v.zoom, e.deltaY < 0 ? 1 : -1), px, py));\r
    };\r
    canvas.addEventListener('wheel', onWheel, { passive: false });\r
    return () => canvas.removeEventListener('wheel', onWheel);\r
  }, [toCanvas]);\r
\r
  const handlePointerDown = (e) => {\r
    e.currentTarget.setPointerCapture(e.pointerId);\r
    dragRef.current = { x: e.clientX, y: e.clientY, view, moved: false };\r
  };\r
\r
  const handlePointerMove = (e) => {\r
    const pos = toCanvas(e);\r
    const drag = dragRef.current;\r
    if (drag) {\r
      const dx = e.clientX - drag.x;\r
      const dy = e.clientY - drag.y;\r
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;\r
      if (drag.moved) {\r
        const scale = SIZE / canvasRef.current.getBoundingClientRect().width / drag.view.zoom;\r
        setView({\r
          ...drag.view,\r
          left: clampCoord(drag.view.left - dx * scale),\r
          top: clampCoord(drag.view.top - dy * scale),\r
        });\r
        setHover(null);\r
        return;\r
      }\r
    }\r
    setHover({ ...cellAt(view, pos.px, pos.py), fx: pos.fx, fy: pos.fy });\r
  };\r
\r
  const handlePointerUp = (e) => {\r
    const drag = dragRef.current;\r
    dragRef.current = null;\r
    if (drag && !drag.moved) {\r
      const { px, py } = toCanvas(e);\r
      const cell = cellAt(view, px, py);\r
      setPinned((p) => (p && p.n === cell.n && p.d === cell.d ? null : cell));\r
    }\r
  };\r
\r
  const zoomCenter = (direction) =>\r
    setView((v) => zoomAbout(v, stepZoom(v.zoom, direction), SIZE / 2, SIZE / 2));\r
\r
  const handleKeyDown = (e) => {\r
    const step = 25 / view.zoom;\r
    const pans = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };\r
    if (pans[e.key]) {\r
      const [dx, dy] = pans[e.key];\r
      setView((v) => ({ ...v, left: clampCoord(v.left + dx), top: clampCoord(v.top + dy) }));\r
    } else if (e.key === '+' || e.key === '=') zoomCenter(1);\r
    else if (e.key === '-') zoomCenter(-1);\r
    else if (e.key === '0') setView(INITIAL_VIEW);\r
    else if (e.key === 'Escape') setPinned(null);\r
    else return;\r
    e.preventDefault();\r
  };\r
\r
  const fraction = ({ n, d }) => (d === 0 ? \`\${n}/0 is undefined\` : \`\${n}/\${d} = \${n / d}\`);\r
\r
  // Pinned-cell marker, positioned in percentages so it tracks CSS scaling.\r
  const cellPct = 100 * (view.zoom / SIZE);\r
\r
  const select = 'border border-line bg-raised px-1 py-0.5 text-white';\r
  const button = 'rounded bg-raised px-2 py-0.5 text-sm text-soft hover:bg-strong disabled:opacity-40';\r
\r
  return (\r
    <div className="max-w-[501px] space-y-3">\r
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-soft">\r
        <label className="flex items-center gap-2">\r
          Rule\r
          <select value={rule} onChange={(e) => setRule(e.target.value)} className={select}>\r
            {Object.entries(RULES).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}\r
          </select>\r
        </label>\r
        <label className="flex items-center gap-2">\r
          Palette\r
          <select value={palette} onChange={(e) => setPalette(e.target.value)} className={select}>\r
            {Object.entries(PALETTES).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}\r
          </select>\r
        </label>\r
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">\r
          <button type="button" className={button} onClick={() => zoomCenter(-1)} disabled={view.zoom === ZOOMS[0]}\r
            aria-label="Zoom out">−</button>\r
          <span className="w-10 text-center font-mono text-xs" aria-live="polite">{formatZoom(view.zoom)}</span>\r
          <button type="button" className={button} onClick={() => zoomCenter(1)} disabled={view.zoom === ZOOMS.at(-1)}\r
            aria-label="Zoom in">+</button>\r
          <button type="button" className={button} onClick={() => setView(INITIAL_VIEW)}>Reset</button>\r
        </div>\r
      </div>\r
\r
      <div className="relative inline-block max-w-full touch-none select-none border border-line">\r
        <canvas\r
          ref={canvasRef}\r
          width={SIZE}\r
          height={SIZE}\r
          tabIndex={0}\r
          aria-label="Division pattern. Drag or use arrow keys to pan, scroll or plus and minus to zoom, click to pin a cell."\r
          className="block h-auto max-w-full cursor-crosshair focus:outline focus:outline-2 focus:outline-gray-400"\r
          onPointerDown={handlePointerDown}\r
          onPointerMove={handlePointerMove}\r
          onPointerUp={handlePointerUp}\r
          onPointerCancel={() => {\r
            dragRef.current = null;\r
          }}\r
          onPointerLeave={() => setHover(null)}\r
          onKeyDown={handleKeyDown}\r
        />\r
        {pinned && (\r
          // Own clipping box, so a marker panned off-canvas is hidden while the\r
          // tooltip is still free to overflow the canvas edge.\r
          <div className="pointer-events-none absolute inset-0 overflow-hidden">\r
            <div\r
              className="absolute outline outline-2 outline-red-500"\r
              style={{\r
                left: \`\${(pinned.d - view.left) * cellPct}%\`,\r
                top: \`\${(pinned.n - view.top) * cellPct}%\`,\r
                width: \`max(\${cellPct}%, 3px)\`,\r
                height: \`max(\${cellPct}%, 3px)\`,\r
              }}\r
            />\r
          </div>\r
        )}\r
        {hover && (\r
          <div\r
            className="pointer-events-none absolute z-10 whitespace-nowrap border border-line bg-black px-1 font-mono text-xs text-soft"\r
            style={{\r
              left: \`\${hover.fx * 100}%\`,\r
              top: \`\${hover.fy * 100}%\`,\r
              // Flip to the other side of the cursor near the right/bottom edges.\r
              transform: \`translate(\${hover.fx > 0.5 ? 'calc(-100% - 6px)' : '6px'}, \${hover.fy > 0.85 ? 'calc(-100% - 6px)' : '6px'})\`,\r
            }}\r
          >\r
            {fraction(hover)}\r
          </div>\r
        )}\r
      </div>\r
\r
      <div className="min-h-[3.5rem] rounded border border-line-soft bg-panel p-2 font-mono text-xs text-soft">\r
        {pinned ? (\r
          <>\r
            <div>{fraction(pinned)}</div>\r
            {pinned.d !== 0 && (\r
              <>\r
                <div className="mt-1 break-all text-muted">exact: {exactDecimal(pinned.n, pinned.d)}</div>\r
                <div className="text-muted">\r
                  printed length {RULES.length.level(pinned.n, pinned.d)} · period{' '}\r
                  {periodOf(repeatingModulus(pinned.n, pinned.d))} · remainder {pinned.n % pinned.d}\r
                </div>\r
              </>\r
            )}\r
          </>\r
        ) : (\r
          <span className="text-subtle">Click a cell to pin it. Drag to pan, scroll to zoom.</span>\r
        )}\r
      </div>\r
    </div>\r
  );\r
}\r
`;export{e as default};