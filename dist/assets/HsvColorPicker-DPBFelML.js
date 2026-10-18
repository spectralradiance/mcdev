var e=`import { useEffect, useMemo, useRef, useState } from 'react';\r
\r
/*\r
 * Named Color Picker\r
 *\r
 * About five thousand named colors from the color.pizza API, laid out as a\r
 * slice through a color space. You pick three components from hue,\r
 * saturation, lightness, value and red/green/blue: one for the y-axis, one to\r
 * sort along the x-axis, and one for the slider. Only colors whose slider\r
 * component sits near the slider's value are shown; those are bucketed into\r
 * rows by their y component and sorted within each row by their x component.\r
 * The default (lightness down, hue across, saturation on the slider) is the\r
 * classic picker layout; other choices give odd, useful views, like every\r
 * color with roughly the same amount of red.\r
 *\r
 * Hue is an angle, so the slider window for it wraps: a window around 355°\r
 * also catches colors at 5°.\r
 *\r
 * Typing a hex finds the nearest named color. "Nearest" is measured in OKLab,\r
 * a color space built so that straight-line distance roughly matches how\r
 * different two colors look. Distance in RGB would rank a slightly-off dark\r
 * blue as far away and a visibly different green as close, because the eye\r
 * is far more sensitive to some changes than others.\r
 */\r
\r
const API_URL = 'https://api.color.pizza/v1/?goodnamesonly=true';\r
const ROWS = 20;\r
\r
// Every component, in its native range. hsl.s is HSL saturation; v is the HSV\r
// "value" (the brightest channel), which the API doesn't supply.\r
const COMPONENTS = {\r
  h: { label: 'Hue', max: 360, unit: '°', circular: true },\r
  s: { label: 'Saturation', max: 100, unit: '%' },\r
  l: { label: 'Lightness', max: 100, unit: '%' },\r
  v: { label: 'Value', max: 100, unit: '%' },\r
  r: { label: 'Red', max: 255 },\r
  g: { label: 'Green', max: 255 },\r
  b: { label: 'Blue', max: 255 },\r
};\r
\r
// ---------------------------------------------------------------------------\r
// Pure helpers\r
\r
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);\r
\r
function normalizeHex(text) {\r
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());\r
  if (!m) return null;\r
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];\r
  return '#' + digits.toLowerCase();\r
}\r
\r
// sRGB -> linear light -> OKLab (https://bottosson.github.io/posts/oklab/).\r
function rgbToOklab(rgb) {\r
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));\r
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
const oklabDistance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);\r
\r
// Flatten an API record into the fields the picker reads, computed once.\r
function toEntry(color) {\r
  const { r, g, b } = color.rgb;\r
  return {\r
    name: color.name,\r
    hex: color.hex,\r
    textColor: color.bestContrast,\r
    h: color.hsl.h,\r
    s: color.hsl.s,\r
    l: color.hsl.l,\r
    v: (Math.max(r, g, b) / 255) * 100,\r
    r,\r
    g,\r
    b,\r
    lab: rgbToOklab([r / 255, g / 255, b / 255]),\r
  };\r
}\r
\r
// How far apart two values of a component are, wrapping round for hue.\r
function componentDistance(key, a, b) {\r
  const d = Math.abs(a - b);\r
  return COMPONENTS[key].circular ? Math.min(d, COMPONENTS[key].max - d) : d;\r
}\r
\r
// The colors near the slider value, bucketed into rows on the y component\r
// (highest first, like a chart) and sorted along x within each row.\r
function layoutGrid(entries, { x, y, slider }, sliderValue, windowPercent) {\r
  const window = (windowPercent / 100) * COMPONENTS[slider].max;\r
  const visible = entries.filter((e) => componentDistance(slider, e[slider], sliderValue) <= window);\r
  const rows = Array.from({ length: ROWS }, () => []);\r
  for (const e of visible) {\r
    // min() puts the very top value (e.g. 100% lightness) into the last bucket.\r
    const bucket = Math.min(ROWS - 1, Math.floor((e[y] / COMPONENTS[y].max) * ROWS));\r
    rows[ROWS - 1 - bucket].push(e);\r
  }\r
  rows.forEach((row) => row.sort((a, b) => a[x] - b[x]));\r
  return { rows, count: visible.length };\r
}\r
\r
function nearestColor(entries, hex) {\r
  const target = rgbToOklab(hexToRgb(hex));\r
  let best = null;\r
  let bestDistance = Infinity;\r
  for (const e of entries) {\r
    const d = oklabDistance(target, e.lab);\r
    if (d < bestDistance) [best, bestDistance] = [e, d];\r
  }\r
  return best && { color: best, distance: bestDistance };\r
}\r
\r
// ---------------------------------------------------------------------------\r
// Components\r
\r
function ComponentSelect({ id, label, value, onChange }) {\r
  return (\r
    <label htmlFor={id} className="flex flex-col text-xs text-muted">\r
      {label}\r
      <select\r
        id={id}\r
        value={value}\r
        onChange={(event) => onChange(event.target.value)}\r
        className="mt-1 w-full min-w-0 rounded border border-line bg-panel px-1 py-1 text-sm text-white"\r
      >\r
        {Object.entries(COMPONENTS).map(([key, c]) => (\r
          <option key={key} value={key}>\r
            {c.label}\r
          </option>\r
        ))}\r
      </select>\r
    </label>\r
  );\r
}\r
\r
function Selected({ color, distance }) {\r
  const [copied, setCopied] = useState(false);\r
  const timer = useRef(null);\r
  useEffect(() => () => clearTimeout(timer.current), []);\r
\r
  const copy = async () => {\r
    try {\r
      await navigator.clipboard.writeText(color.hex);\r
      setCopied(true);\r
      clearTimeout(timer.current);\r
      timer.current = setTimeout(() => setCopied(false), 1200);\r
    } catch {\r
      // Clipboard can be unavailable (insecure context, denied permission).\r
    }\r
  };\r
\r
  return (\r
    <div className="flex items-stretch gap-3 rounded border border-line bg-panel p-2">\r
      <div\r
        className="flex h-20 w-20 shrink-0 items-end rounded p-1 text-[10px] leading-tight"\r
        style={{ backgroundColor: color.hex, color: color.textColor }}\r
      >\r
        {color.hex}\r
      </div>\r
      <div className="min-w-0 text-sm">\r
        <div className="truncate font-semibold text-white">{color.name}</div>\r
        <div className="text-xs text-muted">\r
          rgb({color.r}, {color.g}, {color.b}) · hsl({Math.round(color.h)}°, {Math.round(color.s)}%, {Math.round(color.l)}%)\r
        </div>\r
        {distance !== undefined && (\r
          <div className="text-xs text-subtle">\r
            OKLab distance {distance.toFixed(3)}\r
            {distance < 0.02 ? ' (barely distinguishable)' : ''}\r
          </div>\r
        )}\r
        <button\r
          type="button"\r
          onClick={copy}\r
          className="mt-1 rounded border border-line px-2 py-0.5 text-xs text-soft hover:bg-raised"\r
        >\r
          {copied ? 'Copied' : 'Copy hex'}\r
        </button>\r
      </div>\r
    </div>\r
  );\r
}\r
\r
export default function HsvColorPicker() {\r
  const [entries, setEntries] = useState([]);\r
  const [error, setError] = useState(null);\r
  const [axes, setAxes] = useState({ x: 'h', y: 'l', slider: 's' });\r
  const [sliderValue, setSliderValue] = useState(50);\r
  const [windowPercent, setWindowPercent] = useState(10);\r
  const [search, setSearch] = useState('');\r
  const [hexInput, setHexInput] = useState('');\r
  const [selected, setSelected] = useState(null); // { color, distance? }\r
\r
  useEffect(() => {\r
    const controller = new AbortController();\r
    fetch(API_URL, { signal: controller.signal })\r
      .then((response) => {\r
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);\r
        return response.json();\r
      })\r
      .then((data) => setEntries(data.colors.map(toEntry)))\r
      .catch((requestError) => {\r
        if (requestError.name !== 'AbortError') setError(requestError.message);\r
      });\r
    return () => controller.abort();\r
  }, []);\r
\r
  const { rows, count } = useMemo(\r
    () => layoutGrid(entries, axes, sliderValue, windowPercent),\r
    [entries, axes, sliderValue, windowPercent],\r
  );\r
\r
  const query = search.trim().toLowerCase();\r
  const matches = useMemo(\r
    () => (query ? entries.filter((e) => e.name.toLowerCase().includes(query)) : []),\r
    [entries, query],\r
  );\r
  const matchSet = useMemo(() => new Set(matches), [matches]);\r
\r
  // Choosing a component that another role already uses swaps the two, so\r
  // the three roles always name three different components.\r
  const assign = (role, key) =>\r
    setAxes((current) => {\r
      const next = { ...current, [role]: key };\r
      const clash = Object.keys(current).find((r) => r !== role && current[r] === key);\r
      if (clash) next[clash] = current[role];\r
      return next;\r
    });\r
\r
  // Keep the slider's position proportionally when its component changes.\r
  const sliderMax = COMPONENTS[axes.slider].max;\r
  const prevMax = useRef(sliderMax);\r
  useEffect(() => {\r
    setSliderValue((v) => Math.round((v / prevMax.current) * sliderMax));\r
    prevMax.current = sliderMax;\r
  }, [sliderMax]);\r
\r
  const findNearest = (event) => {\r
    event.preventDefault();\r
    const hex = normalizeHex(hexInput);\r
    if (hex && entries.length) setSelected(nearestColor(entries, hex));\r
  };\r
\r
  const sliderComponent = COMPONENTS[axes.slider];\r
  const hexInvalid = hexInput.trim() !== '' && !normalizeHex(hexInput);\r
\r
  return (\r
    <div className="text-soft">\r
      <div className="mb-3 grid grid-cols-3 gap-2">\r
        <ComponentSelect id="ncp-y" label="Y axis (rows)" value={axes.y} onChange={(k) => assign('y', k)} />\r
        <ComponentSelect id="ncp-x" label="X axis (sorted)" value={axes.x} onChange={(k) => assign('x', k)} />\r
        <ComponentSelect id="ncp-slider" label="Slider" value={axes.slider} onChange={(k) => assign('slider', k)} />\r
      </div>\r
\r
      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">\r
        <label className="flex min-w-40 flex-1 flex-col text-xs text-muted">\r
          {sliderComponent.label}: {sliderValue}\r
          {sliderComponent.unit}\r
          <input\r
            type="range"\r
            min="0"\r
            max={sliderMax}\r
            value={sliderValue}\r
            onChange={(event) => setSliderValue(Number(event.target.value))}\r
            className="mt-1 w-full"\r
          />\r
        </label>\r
        <label className="flex w-32 flex-col text-xs text-muted">\r
          Window: ±{windowPercent}%\r
          <input\r
            type="range"\r
            min="1"\r
            max="50"\r
            value={windowPercent}\r
            onChange={(event) => setWindowPercent(Number(event.target.value))}\r
            className="mt-1 w-full"\r
          />\r
        </label>\r
      </div>\r
\r
      <div className="mb-3 grid gap-2 sm:grid-cols-2">\r
        <label className="flex flex-col text-xs text-muted">\r
          Search names\r
          <input\r
            type="search"\r
            value={search}\r
            onChange={(event) => setSearch(event.target.value)}\r
            placeholder="e.g. moss"\r
            className="mt-1 rounded border border-line bg-panel px-2 py-1 text-sm text-white"\r
          />\r
        </label>\r
        <form onSubmit={findNearest} className="flex flex-col text-xs text-muted">\r
          <label htmlFor="ncp-hex">Nearest name to a hex</label>\r
          <div className="mt-1 flex gap-1">\r
            <input\r
              id="ncp-hex"\r
              value={hexInput}\r
              onChange={(event) => setHexInput(event.target.value)}\r
              placeholder="#3a7bd5"\r
              spellCheck={false}\r
              aria-invalid={hexInvalid}\r
              className={\`min-w-0 flex-1 rounded border bg-panel px-2 py-1 font-mono text-sm text-white \${\r
                hexInvalid ? 'border-red-500' : 'border-line'\r
              }\`}\r
            />\r
            <button type="submit" className="rounded border border-line px-3 text-sm hover:bg-raised">\r
              Find\r
            </button>\r
          </div>\r
        </form>\r
      </div>\r
\r
      {query && (\r
        <div className="mb-3 flex flex-wrap gap-1 text-xs">\r
          <span className="mr-1 text-subtle">\r
            {matches.length} match{matches.length === 1 ? '' : 'es'}\r
          </span>\r
          {matches.slice(0, 24).map((e) => (\r
            <button\r
              key={e.hex + e.name}\r
              type="button"\r
              onClick={() => setSelected({ color: e })}\r
              className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 hover:bg-raised"\r
            >\r
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: e.hex }} />\r
              {e.name}\r
            </button>\r
          ))}\r
          {matches.length > 24 && <span className="text-subtle">…</span>}\r
        </div>\r
      )}\r
\r
      {selected && (\r
        <div className="mb-3">\r
          <Selected color={selected.color} distance={selected.distance} />\r
        </div>\r
      )}\r
\r
      {error && <p className="text-red-400">Couldn&apos;t load colors: {error}</p>}\r
      {!error && entries.length === 0 && <p className="text-muted">Loading colors…</p>}\r
\r
      {entries.length > 0 && (\r
        <p className="mb-1 text-xs text-subtle">\r
          Showing {count} of {entries.length} colors · rows: {COMPONENTS[axes.y].label.toLowerCase()} (high at top) ·\r
          sorted by {COMPONENTS[axes.x].label.toLowerCase()}\r
        </p>\r
      )}\r
\r
      <div className="flex flex-col">\r
        {rows.map((row, i) => (\r
          <div key={i} className="flex min-h-5">\r
            {row.map((color) => {\r
              const isSelected = selected?.color === color;\r
              const dimmed = query && !matchSet.has(color);\r
              return (\r
                <button\r
                  key={color.hex + color.name}\r
                  type="button"\r
                  title={\`\${color.name} \${color.hex}\`}\r
                  aria-label={\`\${color.name} \${color.hex}\`}\r
                  onClick={() => setSelected({ color })}\r
                  className={\`h-5 min-w-0 flex-1 cursor-pointer transition-all duration-200 hover:z-10 hover:scale-200 hover:shadow-lg focus-visible:z-10 focus-visible:scale-200 \${\r
                    isSelected ? 'z-10 scale-150 outline-2 outline-white' : ''\r
                  } \${dimmed ? 'opacity-15' : ''}\`}\r
                  style={{ backgroundColor: color.hex }}\r
                />\r
              );\r
            })}\r
          </div>\r
        ))}\r
      </div>\r
    </div>\r
  );\r
}\r
`;export{e as default};