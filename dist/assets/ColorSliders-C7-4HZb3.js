var e=`import { useEffect, useRef, useState } from 'react';\r
\r
/*\r
 * Color Sliders\r
 *\r
 * Three sliders pick a color in one of four color models: RGB, HSV, HSL or\r
 * OKLCH. Each slider's track is painted with the colors it would reach if you\r
 * moved only that slider, holding the other two fixed. Drag a track and the\r
 * other two repaint, so the tracks always describe the neighborhood of the\r
 * current color.\r
 *\r
 * Every model is described by two functions, toRgb and fromRgb, over three\r
 * channels normalized to 0..1. The sliders work in the chosen model's own\r
 * space; switching models converts through RGB. Keeping the model's own values\r
 * (rather than RGB) as the state matters: a gray has no hue, so if the state\r
 * were RGB, dragging HSV saturation to zero and back would forget the hue.\r
 *\r
 * OKLCH is Björn Ottosson's OKLab in polar form (lightness, chroma, hue). Unlike\r
 * HSL, equal steps in its lightness look like equal steps to the eye, but many\r
 * of its colors lie outside what a screen can show. Out-of-gamut parts of a\r
 * track are drawn as a thin line, and the readout says when the current color\r
 * has been clipped.\r
 *\r
 * Around the sliders: a text box that accepts hex, rgb() or hsl(), one-click\r
 * copies of the color in four CSS notations, the WCAG contrast ratio against\r
 * white and black text, and a row of saved swatches kept in localStorage.\r
 */\r
\r
// ---------------------------------------------------------------------------\r
// Color math (pure; colors are [r, g, b] floats in 0..1 unless noted)\r
\r
const clamp01 = (x) => Math.min(1, Math.max(0, x));\r
const wrap01 = (x) => x - Math.floor(x);\r
\r
function hsvToRgb([h, s, v]) {\r
  // The hue circle is six 60° sectors; in each, one channel is at v, one at\r
  // v(1-s), and the third ramps between them.\r
  const sector = Math.floor(wrap01(h) * 6);\r
  const f = wrap01(h) * 6 - sector;\r
  const p = v * (1 - s);\r
  const q = v * (1 - f * s);\r
  const t = v * (1 - (1 - f) * s);\r
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][sector];\r
}\r
\r
function rgbToHsv([r, g, b]) {\r
  const max = Math.max(r, g, b);\r
  const d = max - Math.min(r, g, b);\r
  let h = 0;\r
  if (d > 0) {\r
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);\r
    else if (max === g) h = (b - r) / d + 2;\r
    else h = (r - g) / d + 4;\r
  }\r
  return [h / 6, max === 0 ? 0 : d / max, max];\r
}\r
\r
// HSL and HSV share a hue; only the other two axes differ, so convert between\r
// them directly rather than writing a second RGB conversion.\r
function hslToHsv([h, s, l]) {\r
  const v = l + s * Math.min(l, 1 - l);\r
  return [h, v === 0 ? 0 : 2 * (1 - l / v), v];\r
}\r
\r
function hsvToHsl([h, s, v]) {\r
  const l = v * (1 - s / 2);\r
  const m = Math.min(l, 1 - l);\r
  return [h, m === 0 ? 0 : (v - l) / m, l];\r
}\r
\r
// sRGB stores light with a gamma curve; OKLab and WCAG need linear light.\r
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);\r
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055);\r
\r
// OKLab: linear RGB -> cone-like LMS response -> cube root -> opponent axes.\r
// Matrices from https://bottosson.github.io/posts/oklab/\r
function rgbToOklab(rgb) {\r
  const [r, g, b] = rgb.map(toLinear);\r
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);\r
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);\r
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);\r
  return [\r
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,\r
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,\r
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,\r
  ];\r
}\r
\r
function oklabToRgb([L, a, b]) {\r
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;\r
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;\r
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;\r
  return [\r
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,\r
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,\r
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,\r
  ].map(fromLinear);\r
}\r
\r
// The most saturated sRGB colors reach about 0.32 chroma, so the C slider\r
// spans 0..0.37 and its last stretch is always out of gamut.\r
const MAX_CHROMA = 0.37;\r
\r
// units: what 1.0 on each slider means in the model's usual notation, for the\r
// readout beside the track.\r
const MODES = {\r
  rgb: { channels: ['R', 'G', 'B'], units: [255, 255, 255], toRgb: (v) => v, fromRgb: (rgb) => rgb },\r
  hsv: { channels: ['H', 'S', 'V'], units: [360, 100, 100], toRgb: hsvToRgb, fromRgb: rgbToHsv },\r
  hsl: {\r
    channels: ['H', 'S', 'L'],\r
    units: [360, 100, 100],\r
    toRgb: (v) => hsvToRgb(hslToHsv(v)),\r
    fromRgb: (rgb) => hsvToHsl(rgbToHsv(rgb)),\r
  },\r
  oklch: {\r
    channels: ['L', 'C', 'H'],\r
    units: [100, MAX_CHROMA, 360],\r
    toRgb: ([l, c, h]) => {\r
      const angle = h * 2 * Math.PI;\r
      return oklabToRgb([l, c * MAX_CHROMA * Math.cos(angle), c * MAX_CHROMA * Math.sin(angle)]);\r
    },\r
    fromRgb: (rgb) => {\r
      const [l, a, b] = rgbToOklab(rgb);\r
      return [l, Math.hypot(a, b) / MAX_CHROMA, wrap01(Math.atan2(b, a) / (2 * Math.PI))];\r
    },\r
  },\r
};\r
\r
// A tiny tolerance so float noise at the gamut edge doesn't count as clipping.\r
const inGamut = (rgb) => rgb.every((c) => c > -1e-4 && c < 1 + 1e-4);\r
const to255 = (rgb) => rgb.map((c) => Math.round(clamp01(c) * 255));\r
const toHex = (rgb) => '#' + to255(rgb).map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();\r
const toCss = (rgb) => \`rgb(\${to255(rgb).join(' ')})\`;\r
\r
const round = (x, digits = 0) => Number(x.toFixed(digits));\r
\r
function formats(rgb) {\r
  const [h, s, l] = MODES.hsl.fromRgb(rgb.map(clamp01));\r
  const [L, C, H] = MODES.oklch.fromRgb(rgb.map(clamp01));\r
  return {\r
    hex: toHex(rgb),\r
    rgb: \`rgb(\${to255(rgb).join(', ')})\`,\r
    hsl: \`hsl(\${round(h * 360)} \${round(s * 100)}% \${round(l * 100)}%)\`,\r
    // A gray's hue is just float noise, so print 0 rather than a random angle.\r
    oklch: \`oklch(\${round(L * 100, 1)}% \${round(C * MAX_CHROMA, 3)} \${C < 0.002 ? 0 : round(H * 360, 1)})\`,\r
  };\r
}\r
\r
// Accepts #rgb, #rrggbb, rgb(r g b) / rgb(r, g, b) and hsl(h s% l%).\r
function parseColor(text) {\r
  const t = text.trim().toLowerCase();\r
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);\r
  if (m) {\r
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];\r
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);\r
  }\r
  const numbers = (t.match(/-?[\\d.]+/g) ?? []).map(Number);\r
  if (numbers.length < 3 || numbers.some(Number.isNaN)) return null;\r
  m = /^(rgba?|hsla?)\\(/.exec(t);\r
  if (m?.[1].startsWith('rgb')) return numbers.slice(0, 3).map((n) => clamp01(n / 255));\r
  if (m?.[1].startsWith('hsl')) {\r
    const [h, s, l] = numbers;\r
    return MODES.hsl.toRgb([wrap01(h / 360), clamp01(s / 100), clamp01(l / 100)]);\r
  }\r
  return null;\r
}\r
\r
// WCAG 2 contrast: relative luminance from linear light, then\r
// (lighter + 0.05) / (darker + 0.05). 4.5 passes AA for body text, 7 AAA.\r
const luminance = (rgb) => {\r
  const [r, g, b] = rgb.map((c) => toLinear(clamp01(c)));\r
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;\r
};\r
const contrast = (y1, y2) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);\r
const grade = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'fail');\r
\r
// ---------------------------------------------------------------------------\r
// Drawing\r
\r
const TRACK_WIDTH = 300;\r
const TRACK_HEIGHT = 24;\r
const BAND = 16; // height of the color band; the marker shows above and below it\r
\r
function drawTrack(canvas, mode, values, index) {\r
  const ctx = canvas.getContext('2d');\r
  ctx.clearRect(0, 0, TRACK_WIDTH, TRACK_HEIGHT);\r
\r
  // The marker goes in first and the band is painted over it, so only its\r
  // ends poke out: a tick that's the color itself, at the slider's value.\r
  ctx.fillStyle = toCss(MODES[mode].toRgb(values));\r
  ctx.fillRect(Math.min(TRACK_WIDTH - 2, Math.floor(values[index] * TRACK_WIDTH)), 0, 2, TRACK_HEIGHT);\r
\r
  const top = (TRACK_HEIGHT - BAND) / 2;\r
  const sample = [...values];\r
  for (let x = 0; x < TRACK_WIDTH; x++) {\r
    sample[index] = x / (TRACK_WIDTH - 1);\r
    const rgb = MODES[mode].toRgb(sample);\r
    ctx.fillStyle = toCss(rgb);\r
    if (inGamut(rgb)) ctx.fillRect(x, top, 1, BAND);\r
    else ctx.fillRect(x, TRACK_HEIGHT / 2 - 1, 1, 2);\r
  }\r
}\r
\r
// ---------------------------------------------------------------------------\r
// Persistence (localStorage can throw in private modes or when blocked)\r
\r
const SWATCH_KEY = 'color-sliders:swatches';\r
const MAX_SWATCHES = 12;\r
\r
function loadSwatches() {\r
  try {\r
    const saved = JSON.parse(localStorage.getItem(SWATCH_KEY));\r
    return Array.isArray(saved) ? saved.filter((s) => parseColor(s)).slice(0, MAX_SWATCHES) : [];\r
  } catch {\r
    return [];\r
  }\r
}\r
\r
function saveSwatches(swatches) {\r
  try {\r
    localStorage.setItem(SWATCH_KEY, JSON.stringify(swatches));\r
  } catch {\r
    // Not fatal: the swatches just won't survive a reload.\r
  }\r
}\r
\r
// ---------------------------------------------------------------------------\r
// Components\r
\r
function Track({ mode, values, index, onChange }) {\r
  const canvasRef = useRef(null);\r
\r
  useEffect(() => {\r
    drawTrack(canvasRef.current, mode, values, index);\r
  }, [mode, values, index]);\r
\r
  const setFromPointer = (event) => {\r
    const rect = event.currentTarget.getBoundingClientRect();\r
    onChange(index, clamp01((event.clientX - rect.left) / rect.width));\r
  };\r
\r
  const onKeyDown = (event) => {\r
    const step = event.shiftKey ? 0.1 : 0.01;\r
    const next = {\r
      ArrowRight: values[index] + step,\r
      ArrowUp: values[index] + step,\r
      ArrowLeft: values[index] - step,\r
      ArrowDown: values[index] - step,\r
      Home: 0,\r
      End: 1,\r
    }[event.key];\r
    if (next === undefined) return;\r
    event.preventDefault();\r
    onChange(index, clamp01(next));\r
  };\r
\r
  const name = MODES[mode].channels[index];\r
  const unit = MODES[mode].units[index];\r
  const readout = unit < 1 ? (values[index] * unit).toFixed(3) : Math.round(values[index] * unit);\r
  return (\r
    <div className="flex items-center gap-2">\r
      <span className="w-4 text-gray-400">{name}</span>\r
      <canvas\r
        ref={canvasRef}\r
        width={TRACK_WIDTH}\r
        height={TRACK_HEIGHT}\r
        role="slider"\r
        tabIndex={0}\r
        aria-label={\`\${mode.toUpperCase()} \${name}\`}\r
        aria-valuemin={0}\r
        aria-valuemax={100}\r
        aria-valuenow={Math.round(values[index] * 100)}\r
        onKeyDown={onKeyDown}\r
        onPointerDown={(event) => {\r
          // Capture keeps the drag going when the pointer leaves the track.\r
          event.currentTarget.setPointerCapture(event.pointerId);\r
          setFromPointer(event);\r
        }}\r
        onPointerMove={(event) => {\r
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event);\r
        }}\r
        className="block h-6 w-full max-w-[300px] min-w-0 cursor-pointer touch-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300"\r
      />\r
      <span className="w-10 shrink-0 text-right text-xs text-gray-500">{readout}</span>\r
    </div>\r
  );\r
}\r
\r
function CopyRow({ label, text, copied, onCopy }) {\r
  return (\r
    <button\r
      type="button"\r
      onClick={() => onCopy(label, text)}\r
      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-gray-300"\r
      title={\`Copy \${text}\`}\r
    >\r
      <span className="truncate">{text}</span>\r
      <span className="shrink-0 text-xs text-gray-500">{copied === label ? 'copied' : 'copy'}</span>\r
    </button>\r
  );\r
}\r
\r
function ContrastBadge({ background, text, ratio }) {\r
  return (\r
    <div className="flex items-center gap-2 rounded border border-gray-700 px-2 py-1" style={{ background, color: text }}>\r
      <span className="font-bold">Aa</span>\r
      <span className="text-xs">\r
        {ratio.toFixed(2)}:1 {grade(ratio)}\r
      </span>\r
    </div>\r
  );\r
}\r
\r
export default function ColorSliders() {\r
  const [mode, setMode] = useState('rgb');\r
  const [values, setValues] = useState(() => [Math.random(), Math.random(), Math.random()]);\r
  const [draft, setDraft] = useState(null); // text box contents while it's being edited\r
  const [copied, setCopied] = useState(null);\r
  const [swatches, setSwatches] = useState(loadSwatches);\r
  const copiedTimer = useRef(null);\r
\r
  useEffect(() => () => clearTimeout(copiedTimer.current), []);\r
\r
  const raw = MODES[mode].toRgb(values);\r
  const rgb = raw.map(clamp01);\r
  const clipped = !inGamut(raw);\r
  const strings = formats(rgb);\r
  const y = luminance(rgb);\r
\r
  const setChannel = (index, value) => setValues((current) => current.map((v, i) => (i === index ? value : v)));\r
\r
  const switchMode = (next) => {\r
    if (next === mode) return;\r
    setValues(MODES[next].fromRgb(rgb).map(clamp01));\r
    setMode(next);\r
  };\r
\r
  const setFromRgb = (color) => setValues(MODES[mode].fromRgb(color).map(clamp01));\r
\r
  const commitDraft = () => {\r
    const parsed = draft === null ? null : parseColor(draft);\r
    if (parsed) {\r
      setFromRgb(parsed);\r
      setDraft(null);\r
    }\r
  };\r
\r
  const copy = async (label, text) => {\r
    try {\r
      await navigator.clipboard.writeText(text);\r
      setCopied(label);\r
    } catch {\r
      setCopied(null);\r
    }\r
    clearTimeout(copiedTimer.current);\r
    copiedTimer.current = setTimeout(() => setCopied(null), 1200);\r
  };\r
\r
  const updateSwatches = (next) => {\r
    setSwatches(next);\r
    saveSwatches(next);\r
  };\r
  const saveSwatch = () => updateSwatches([strings.hex, ...swatches.filter((s) => s !== strings.hex)].slice(0, MAX_SWATCHES));\r
\r
  const draftInvalid = draft !== null && draft.trim() !== '' && !parseColor(draft);\r
\r
  return (\r
    <div className="max-w-xl font-mono text-sm text-gray-300">\r
      <div role="radiogroup" aria-label="Color model" className="mb-3 flex flex-wrap gap-1">\r
        {Object.keys(MODES).map((name) => (\r
          <button\r
            key={name}\r
            type="button"\r
            role="radio"\r
            aria-checked={mode === name}\r
            onClick={() => switchMode(name)}\r
            className={\`rounded border px-3 py-1 uppercase \${\r
              mode === name ? 'border-gray-300 bg-gray-800 text-white' : 'border-gray-700 text-gray-500 hover:text-gray-300'\r
            }\`}\r
          >\r
            {name}\r
          </button>\r
        ))}\r
      </div>\r
\r
      <div className="space-y-1">\r
        {[0, 1, 2].map((index) => (\r
          <Track key={index} mode={mode} values={values} index={index} onChange={setChannel} />\r
        ))}\r
      </div>\r
\r
      <div className="mt-4 flex flex-wrap items-start gap-4">\r
        <div className="h-24 w-24 shrink-0 rounded border border-gray-700" style={{ background: toCss(rgb) }} />\r
        <div className="min-w-0 flex-1 basis-48">\r
          <label className="block text-xs text-gray-500" htmlFor="color-sliders-input">\r
            Type a color (hex, rgb(), hsl()) and press Enter\r
          </label>\r
          <input\r
            id="color-sliders-input"\r
            value={draft ?? strings.hex}\r
            onFocus={(event) => {\r
              setDraft(strings.hex);\r
              event.target.select();\r
            }}\r
            onChange={(event) => setDraft(event.target.value)}\r
            onBlur={() => {\r
              commitDraft();\r
              setDraft(null);\r
            }}\r
            onKeyDown={(event) => {\r
              if (event.key === 'Enter') commitDraft();\r
              if (event.key === 'Escape') setDraft(strings.hex);\r
            }}\r
            spellCheck={false}\r
            aria-invalid={draftInvalid}\r
            className={\`mt-1 w-full rounded border bg-gray-900 px-2 py-1 text-white outline-none focus:border-gray-300 \${\r
              draftInvalid ? 'border-red-500' : 'border-gray-700'\r
            }\`}\r
          />\r
          {clipped && (\r
            <p className="mt-1 text-xs text-amber-400">Outside the sRGB gamut; showing the nearest clipped color.</p>\r
          )}\r
        </div>\r
      </div>\r
\r
      <div className="mt-3 grid gap-x-4 sm:grid-cols-2">\r
        {Object.entries(strings).map(([label, text]) => (\r
          <CopyRow key={label} label={label} text={text} copied={copied} onCopy={copy} />\r
        ))}\r
      </div>\r
\r
      <div className="mt-3 flex flex-wrap gap-2">\r
        <ContrastBadge background={toCss(rgb)} text="#fff" ratio={contrast(y, 1)} />\r
        <ContrastBadge background={toCss(rgb)} text="#000" ratio={contrast(y, 0)} />\r
      </div>\r
\r
      <div className="mt-4">\r
        <div className="flex items-center gap-3">\r
          <span className="text-xs text-gray-500">Swatches</span>\r
          <button type="button" onClick={saveSwatch} className="rounded border border-gray-700 px-2 py-0.5 text-xs hover:bg-gray-800">\r
            + save\r
          </button>\r
          {swatches.length > 0 && (\r
            <button type="button" onClick={() => updateSwatches([])} className="text-xs text-gray-500 hover:text-gray-300">\r
              clear\r
            </button>\r
          )}\r
        </div>\r
        <div className="mt-2 flex flex-wrap gap-1.5">\r
          {swatches.map((hex) => (\r
            <button\r
              key={hex}\r
              type="button"\r
              title={\`Load \${hex}\`}\r
              aria-label={\`Load \${hex}\`}\r
              onClick={() => setFromRgb(parseColor(hex))}\r
              className={\`h-7 w-7 rounded border \${hex === strings.hex ? 'border-white' : 'border-gray-700'} focus-visible:outline-2 focus-visible:outline-gray-300\`}\r
              style={{ background: hex }}\r
            />\r
          ))}\r
          {swatches.length === 0 && <span className="text-xs text-gray-600">Saved colors appear here.</span>}\r
        </div>\r
      </div>\r
    </div>\r
  );\r
}\r
`;export{e as default};