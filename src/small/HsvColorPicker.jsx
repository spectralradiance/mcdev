import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * Named Color Picker
 *
 * About five thousand named colors from the color.pizza API, laid out as a
 * slice through a color space. You pick three components from hue,
 * saturation, lightness, value and red/green/blue: one for the y-axis, one to
 * sort along the x-axis, and one for the slider. Only colors whose slider
 * component sits near the slider's value are shown; those are bucketed into
 * rows by their y component and sorted within each row by their x component.
 * The default (lightness down, hue across, saturation on the slider) is the
 * classic picker layout; other choices give odd, useful views, like every
 * color with roughly the same amount of red.
 *
 * Hue is an angle, so the slider window for it wraps: a window around 355°
 * also catches colors at 5°.
 *
 * Typing a hex finds the nearest named color. "Nearest" is measured in OKLab,
 * a color space built so that straight-line distance roughly matches how
 * different two colors look. Distance in RGB would rank a slightly-off dark
 * blue as far away and a visibly different green as close, because the eye
 * is far more sensitive to some changes than others.
 */

const API_URL = 'https://api.color.pizza/v1/?goodnamesonly=true';
const ROWS = 20;

// Every component, in its native range. hsl.s is HSL saturation; v is the HSV
// "value" (the brightest channel), which the API doesn't supply.
const COMPONENTS = {
  h: { label: 'Hue', max: 360, unit: '°', circular: true },
  s: { label: 'Saturation', max: 100, unit: '%' },
  l: { label: 'Lightness', max: 100, unit: '%' },
  v: { label: 'Value', max: 100, unit: '%' },
  r: { label: 'Red', max: 255 },
  g: { label: 'Green', max: 255 },
  b: { label: 'Blue', max: 255 },
};

// ---------------------------------------------------------------------------
// Pure helpers

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function normalizeHex(text) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return '#' + digits.toLowerCase();
}

// sRGB -> linear light -> OKLab (https://bottosson.github.io/posts/oklab/).
function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const oklabDistance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// Flatten an API record into the fields the picker reads, computed once.
function toEntry(color) {
  const { r, g, b } = color.rgb;
  return {
    name: color.name,
    hex: color.hex,
    textColor: color.bestContrast,
    h: color.hsl.h,
    s: color.hsl.s,
    l: color.hsl.l,
    v: (Math.max(r, g, b) / 255) * 100,
    r,
    g,
    b,
    lab: rgbToOklab([r / 255, g / 255, b / 255]),
  };
}

// How far apart two values of a component are, wrapping round for hue.
function componentDistance(key, a, b) {
  const d = Math.abs(a - b);
  return COMPONENTS[key].circular ? Math.min(d, COMPONENTS[key].max - d) : d;
}

// The colors near the slider value, bucketed into rows on the y component
// (highest first, like a chart) and sorted along x within each row.
function layoutGrid(entries, { x, y, slider }, sliderValue, windowPercent) {
  const window = (windowPercent / 100) * COMPONENTS[slider].max;
  const visible = entries.filter((e) => componentDistance(slider, e[slider], sliderValue) <= window);
  const rows = Array.from({ length: ROWS }, () => []);
  for (const e of visible) {
    // min() puts the very top value (e.g. 100% lightness) into the last bucket.
    const bucket = Math.min(ROWS - 1, Math.floor((e[y] / COMPONENTS[y].max) * ROWS));
    rows[ROWS - 1 - bucket].push(e);
  }
  rows.forEach((row) => row.sort((a, b) => a[x] - b[x]));
  return { rows, count: visible.length };
}

function nearestColor(entries, hex) {
  const target = rgbToOklab(hexToRgb(hex));
  let best = null;
  let bestDistance = Infinity;
  for (const e of entries) {
    const d = oklabDistance(target, e.lab);
    if (d < bestDistance) [best, bestDistance] = [e, d];
  }
  return best && { color: best, distance: bestDistance };
}

// ---------------------------------------------------------------------------
// Components

function ComponentSelect({ id, label, value, onChange }) {
  return (
    <label htmlFor={id} className="flex flex-col text-xs text-muted">
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 rounded border border-line bg-panel px-1 py-1 text-sm text-white"
      >
        {Object.entries(COMPONENTS).map(([key, c]) => (
          <option key={key} value={key}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Selected({ color, distance }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(color.hex);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
    }
  };

  return (
    <div className="flex items-stretch gap-3 rounded border border-line bg-panel p-2">
      <div
        className="flex h-20 w-20 shrink-0 items-end rounded p-1 text-[10px] leading-tight"
        style={{ backgroundColor: color.hex, color: color.textColor }}
      >
        {color.hex}
      </div>
      <div className="min-w-0 text-sm">
        <div className="truncate font-semibold text-white">{color.name}</div>
        <div className="text-xs text-muted">
          rgb({color.r}, {color.g}, {color.b}) · hsl({Math.round(color.h)}°, {Math.round(color.s)}%, {Math.round(color.l)}%)
        </div>
        {distance !== undefined && (
          <div className="text-xs text-subtle">
            OKLab distance {distance.toFixed(3)}
            {distance < 0.02 ? ' (barely distinguishable)' : ''}
          </div>
        )}
        <button
          type="button"
          onClick={copy}
          className="mt-1 rounded border border-line px-2 py-0.5 text-xs text-soft hover:bg-raised"
        >
          {copied ? 'Copied' : 'Copy hex'}
        </button>
      </div>
    </div>
  );
}

export default function HsvColorPicker() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [axes, setAxes] = useState({ x: 'h', y: 'l', slider: 's' });
  const [sliderValue, setSliderValue] = useState(50);
  const [windowPercent, setWindowPercent] = useState(10);
  const [search, setSearch] = useState('');
  const [hexInput, setHexInput] = useState('');
  const [selected, setSelected] = useState(null); // { color, distance? }

  useEffect(() => {
    const controller = new AbortController();
    fetch(API_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setEntries(data.colors.map(toEntry)))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, []);

  const { rows, count } = useMemo(
    () => layoutGrid(entries, axes, sliderValue, windowPercent),
    [entries, axes, sliderValue, windowPercent],
  );

  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () => (query ? entries.filter((e) => e.name.toLowerCase().includes(query)) : []),
    [entries, query],
  );
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Choosing a component that another role already uses swaps the two, so
  // the three roles always name three different components.
  const assign = (role, key) =>
    setAxes((current) => {
      const next = { ...current, [role]: key };
      const clash = Object.keys(current).find((r) => r !== role && current[r] === key);
      if (clash) next[clash] = current[role];
      return next;
    });

  // Keep the slider's position proportionally when its component changes.
  const sliderMax = COMPONENTS[axes.slider].max;
  const prevMax = useRef(sliderMax);
  useEffect(() => {
    setSliderValue((v) => Math.round((v / prevMax.current) * sliderMax));
    prevMax.current = sliderMax;
  }, [sliderMax]);

  const findNearest = (event) => {
    event.preventDefault();
    const hex = normalizeHex(hexInput);
    if (hex && entries.length) setSelected(nearestColor(entries, hex));
  };

  const sliderComponent = COMPONENTS[axes.slider];
  const hexInvalid = hexInput.trim() !== '' && !normalizeHex(hexInput);

  return (
    <div className="text-soft">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <ComponentSelect id="ncp-y" label="Y axis (rows)" value={axes.y} onChange={(k) => assign('y', k)} />
        <ComponentSelect id="ncp-x" label="X axis (sorted)" value={axes.x} onChange={(k) => assign('x', k)} />
        <ComponentSelect id="ncp-slider" label="Slider" value={axes.slider} onChange={(k) => assign('slider', k)} />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <label className="flex min-w-40 flex-1 flex-col text-xs text-muted">
          {sliderComponent.label}: {sliderValue}
          {sliderComponent.unit}
          <input
            type="range"
            min="0"
            max={sliderMax}
            value={sliderValue}
            onChange={(event) => setSliderValue(Number(event.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="flex w-32 flex-col text-xs text-muted">
          Window: ±{windowPercent}%
          <input
            type="range"
            min="1"
            max="50"
            value={windowPercent}
            onChange={(event) => setWindowPercent(Number(event.target.value))}
            className="mt-1 w-full"
          />
        </label>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-muted">
          Search names
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. moss"
            className="mt-1 rounded border border-line bg-panel px-2 py-1 text-sm text-white"
          />
        </label>
        <form onSubmit={findNearest} className="flex flex-col text-xs text-muted">
          <label htmlFor="ncp-hex">Nearest name to a hex</label>
          <div className="mt-1 flex gap-1">
            <input
              id="ncp-hex"
              value={hexInput}
              onChange={(event) => setHexInput(event.target.value)}
              placeholder="#3a7bd5"
              spellCheck={false}
              aria-invalid={hexInvalid}
              className={`min-w-0 flex-1 rounded border bg-panel px-2 py-1 font-mono text-sm text-white ${
                hexInvalid ? 'border-red-500' : 'border-line'
              }`}
            />
            <button type="submit" className="rounded border border-line px-3 text-sm hover:bg-raised">
              Find
            </button>
          </div>
        </form>
      </div>

      {query && (
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          <span className="mr-1 text-subtle">
            {matches.length} match{matches.length === 1 ? '' : 'es'}
          </span>
          {matches.slice(0, 24).map((e) => (
            <button
              key={e.hex + e.name}
              type="button"
              onClick={() => setSelected({ color: e })}
              className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 hover:bg-raised"
            >
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: e.hex }} />
              {e.name}
            </button>
          ))}
          {matches.length > 24 && <span className="text-subtle">…</span>}
        </div>
      )}

      {selected && (
        <div className="mb-3">
          <Selected color={selected.color} distance={selected.distance} />
        </div>
      )}

      {error && <p className="text-red-400">Couldn&apos;t load colors: {error}</p>}
      {!error && entries.length === 0 && <p className="text-muted">Loading colors…</p>}

      {entries.length > 0 && (
        <p className="mb-1 text-xs text-subtle">
          Showing {count} of {entries.length} colors · rows: {COMPONENTS[axes.y].label.toLowerCase()} (high at top) ·
          sorted by {COMPONENTS[axes.x].label.toLowerCase()}
        </p>
      )}

      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div key={i} className="flex min-h-5">
            {row.map((color) => {
              const isSelected = selected?.color === color;
              const dimmed = query && !matchSet.has(color);
              return (
                <button
                  key={color.hex + color.name}
                  type="button"
                  title={`${color.name} ${color.hex}`}
                  aria-label={`${color.name} ${color.hex}`}
                  onClick={() => setSelected({ color })}
                  className={`h-5 min-w-0 flex-1 cursor-pointer transition-all duration-200 hover:z-10 hover:scale-200 hover:shadow-lg focus-visible:z-10 focus-visible:scale-200 ${
                    isSelected ? 'z-10 scale-150 outline-2 outline-white' : ''
                  } ${dimmed ? 'opacity-15' : ''}`}
                  style={{ backgroundColor: color.hex }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
