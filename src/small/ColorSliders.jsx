import { useEffect, useRef, useState } from 'react';

/*
 * Color Sliders
 *
 * Three sliders pick a color in one of four color models: RGB, HSV, HSL or
 * OKLCH. Each slider's track is painted with the colors it would reach if you
 * moved only that slider, holding the other two fixed. Drag a track and the
 * other two repaint, so the tracks always describe the neighborhood of the
 * current color.
 *
 * Every model is described by two functions, toRgb and fromRgb, over three
 * channels normalized to 0..1. The sliders work in the chosen model's own
 * space; switching models converts through RGB. Keeping the model's own values
 * (rather than RGB) as the state matters: a gray has no hue, so if the state
 * were RGB, dragging HSV saturation to zero and back would forget the hue.
 *
 * OKLCH is Björn Ottosson's OKLab in polar form (lightness, chroma, hue). Unlike
 * HSL, equal steps in its lightness look like equal steps to the eye, but many
 * of its colors lie outside what a screen can show. Out-of-gamut parts of a
 * track are drawn as a thin line, and the readout says when the current color
 * has been clipped.
 *
 * Around the sliders: a text box that accepts hex, rgb() or hsl(), one-click
 * copies of the color in four CSS notations, the WCAG contrast ratio against
 * white and black text, and a row of saved swatches kept in localStorage.
 */

// ---------------------------------------------------------------------------
// Color math (pure; colors are [r, g, b] floats in 0..1 unless noted)

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const wrap01 = (x) => x - Math.floor(x);

function hsvToRgb([h, s, v]) {
  // The hue circle is six 60° sectors; in each, one channel is at v, one at
  // v(1-s), and the third ramps between them.
  const sector = Math.floor(wrap01(h) * 6);
  const f = wrap01(h) * 6 - sector;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][sector];
}

function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h / 6, max === 0 ? 0 : d / max, max];
}

// HSL and HSV share a hue; only the other two axes differ, so convert between
// them directly rather than writing a second RGB conversion.
function hslToHsv([h, s, l]) {
  const v = l + s * Math.min(l, 1 - l);
  return [h, v === 0 ? 0 : 2 * (1 - l / v), v];
}

function hsvToHsl([h, s, v]) {
  const l = v * (1 - s / 2);
  const m = Math.min(l, 1 - l);
  return [h, m === 0 ? 0 : (v - l) / m, l];
}

// sRGB stores light with a gamma curve; OKLab and WCAG need linear light.
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055);

// OKLab: linear RGB -> cone-like LMS response -> cube root -> opponent axes.
// Matrices from https://bottosson.github.io/posts/oklab/
function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear);
}

// The most saturated sRGB colors reach about 0.32 chroma, so the C slider
// spans 0..0.37 and its last stretch is always out of gamut.
const MAX_CHROMA = 0.37;

// units: what 1.0 on each slider means in the model's usual notation, for the
// readout beside the track.
const MODES = {
  rgb: { channels: ['R', 'G', 'B'], units: [255, 255, 255], toRgb: (v) => v, fromRgb: (rgb) => rgb },
  hsv: { channels: ['H', 'S', 'V'], units: [360, 100, 100], toRgb: hsvToRgb, fromRgb: rgbToHsv },
  hsl: {
    channels: ['H', 'S', 'L'],
    units: [360, 100, 100],
    toRgb: (v) => hsvToRgb(hslToHsv(v)),
    fromRgb: (rgb) => hsvToHsl(rgbToHsv(rgb)),
  },
  oklch: {
    channels: ['L', 'C', 'H'],
    units: [100, MAX_CHROMA, 360],
    toRgb: ([l, c, h]) => {
      const angle = h * 2 * Math.PI;
      return oklabToRgb([l, c * MAX_CHROMA * Math.cos(angle), c * MAX_CHROMA * Math.sin(angle)]);
    },
    fromRgb: (rgb) => {
      const [l, a, b] = rgbToOklab(rgb);
      return [l, Math.hypot(a, b) / MAX_CHROMA, wrap01(Math.atan2(b, a) / (2 * Math.PI))];
    },
  },
};

// A tiny tolerance so float noise at the gamut edge doesn't count as clipping.
const inGamut = (rgb) => rgb.every((c) => c > -1e-4 && c < 1 + 1e-4);
const to255 = (rgb) => rgb.map((c) => Math.round(clamp01(c) * 255));
const toHex = (rgb) => '#' + to255(rgb).map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
const toCss = (rgb) => `rgb(${to255(rgb).join(' ')})`;

const round = (x, digits = 0) => Number(x.toFixed(digits));

function formats(rgb) {
  const [h, s, l] = MODES.hsl.fromRgb(rgb.map(clamp01));
  const [L, C, H] = MODES.oklch.fromRgb(rgb.map(clamp01));
  return {
    hex: toHex(rgb),
    rgb: `rgb(${to255(rgb).join(', ')})`,
    hsl: `hsl(${round(h * 360)} ${round(s * 100)}% ${round(l * 100)}%)`,
    // A gray's hue is just float noise, so print 0 rather than a random angle.
    oklch: `oklch(${round(L * 100, 1)}% ${round(C * MAX_CHROMA, 3)} ${C < 0.002 ? 0 : round(H * 360, 1)})`,
  };
}

// Accepts #rgb, #rrggbb, rgb(r g b) / rgb(r, g, b) and hsl(h s% l%).
function parseColor(text) {
  const t = text.trim().toLowerCase();
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (m) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  }
  const numbers = (t.match(/-?[\d.]+/g) ?? []).map(Number);
  if (numbers.length < 3 || numbers.some(Number.isNaN)) return null;
  m = /^(rgba?|hsla?)\(/.exec(t);
  if (m?.[1].startsWith('rgb')) return numbers.slice(0, 3).map((n) => clamp01(n / 255));
  if (m?.[1].startsWith('hsl')) {
    const [h, s, l] = numbers;
    return MODES.hsl.toRgb([wrap01(h / 360), clamp01(s / 100), clamp01(l / 100)]);
  }
  return null;
}

// WCAG 2 contrast: relative luminance from linear light, then
// (lighter + 0.05) / (darker + 0.05). 4.5 passes AA for body text, 7 AAA.
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => toLinear(clamp01(c)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (y1, y2) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
const grade = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'fail');

// ---------------------------------------------------------------------------
// Drawing

const TRACK_WIDTH = 300;
const TRACK_HEIGHT = 24;
const BAND = 16; // height of the color band; the marker shows above and below it

function drawTrack(canvas, mode, values, index) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TRACK_WIDTH, TRACK_HEIGHT);

  // The marker goes in first and the band is painted over it, so only its
  // ends poke out: a tick that's the color itself, at the slider's value.
  ctx.fillStyle = toCss(MODES[mode].toRgb(values));
  ctx.fillRect(Math.min(TRACK_WIDTH - 2, Math.floor(values[index] * TRACK_WIDTH)), 0, 2, TRACK_HEIGHT);

  const top = (TRACK_HEIGHT - BAND) / 2;
  const sample = [...values];
  for (let x = 0; x < TRACK_WIDTH; x++) {
    sample[index] = x / (TRACK_WIDTH - 1);
    const rgb = MODES[mode].toRgb(sample);
    ctx.fillStyle = toCss(rgb);
    if (inGamut(rgb)) ctx.fillRect(x, top, 1, BAND);
    else ctx.fillRect(x, TRACK_HEIGHT / 2 - 1, 1, 2);
  }
}

// ---------------------------------------------------------------------------
// Persistence (localStorage can throw in private modes or when blocked)

const SWATCH_KEY = 'color-sliders:swatches';
const MAX_SWATCHES = 12;

function loadSwatches() {
  try {
    const saved = JSON.parse(localStorage.getItem(SWATCH_KEY));
    return Array.isArray(saved) ? saved.filter((s) => parseColor(s)).slice(0, MAX_SWATCHES) : [];
  } catch {
    return [];
  }
}

function saveSwatches(swatches) {
  try {
    localStorage.setItem(SWATCH_KEY, JSON.stringify(swatches));
  } catch {
    // Not fatal: the swatches just won't survive a reload.
  }
}

// ---------------------------------------------------------------------------
// Components

function Track({ mode, values, index, onChange }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    drawTrack(canvasRef.current, mode, values, index);
  }, [mode, values, index]);

  const setFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(index, clamp01((event.clientX - rect.left) / rect.width));
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const next = {
      ArrowRight: values[index] + step,
      ArrowUp: values[index] + step,
      ArrowLeft: values[index] - step,
      ArrowDown: values[index] - step,
      Home: 0,
      End: 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(index, clamp01(next));
  };

  const name = MODES[mode].channels[index];
  const unit = MODES[mode].units[index];
  const readout = unit < 1 ? (values[index] * unit).toFixed(3) : Math.round(values[index] * unit);
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-muted">{name}</span>
      <canvas
        ref={canvasRef}
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
        role="slider"
        tabIndex={0}
        aria-label={`${mode.toUpperCase()} ${name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(values[index] * 100)}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          // Capture keeps the drag going when the pointer leaves the track.
          event.currentTarget.setPointerCapture(event.pointerId);
          setFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event);
        }}
        className="block h-6 w-full max-w-[300px] min-w-0 cursor-pointer touch-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300"
      />
      <span className="w-10 shrink-0 text-right text-xs text-subtle">{readout}</span>
    </div>
  );
}

function CopyRow({ label, text, copied, onCopy }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(label, text)}
      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-raised focus-visible:outline-2 focus-visible:outline-gray-300"
      title={`Copy ${text}`}
    >
      <span className="truncate">{text}</span>
      <span className="shrink-0 text-xs text-subtle">{copied === label ? 'copied' : 'copy'}</span>
    </button>
  );
}

function ContrastBadge({ background, text, ratio }) {
  return (
    <div className="flex items-center gap-2 rounded border border-line px-2 py-1" style={{ background, color: text }}>
      <span className="font-bold">Aa</span>
      <span className="text-xs">
        {ratio.toFixed(2)}:1 {grade(ratio)}
      </span>
    </div>
  );
}

export default function ColorSliders() {
  const [mode, setMode] = useState('rgb');
  const [values, setValues] = useState(() => [Math.random(), Math.random(), Math.random()]);
  const [draft, setDraft] = useState(null); // text box contents while it's being edited
  const [copied, setCopied] = useState(null);
  const [swatches, setSwatches] = useState(loadSwatches);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const raw = MODES[mode].toRgb(values);
  const rgb = raw.map(clamp01);
  const clipped = !inGamut(raw);
  const strings = formats(rgb);
  const y = luminance(rgb);

  const setChannel = (index, value) => setValues((current) => current.map((v, i) => (i === index ? value : v)));

  const switchMode = (next) => {
    if (next === mode) return;
    setValues(MODES[next].fromRgb(rgb).map(clamp01));
    setMode(next);
  };

  const setFromRgb = (color) => setValues(MODES[mode].fromRgb(color).map(clamp01));

  const commitDraft = () => {
    const parsed = draft === null ? null : parseColor(draft);
    if (parsed) {
      setFromRgb(parsed);
      setDraft(null);
    }
  };

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied(null);
    }
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1200);
  };

  const updateSwatches = (next) => {
    setSwatches(next);
    saveSwatches(next);
  };
  const saveSwatch = () => updateSwatches([strings.hex, ...swatches.filter((s) => s !== strings.hex)].slice(0, MAX_SWATCHES));

  const draftInvalid = draft !== null && draft.trim() !== '' && !parseColor(draft);

  return (
    <div className="max-w-xl font-mono text-sm text-soft">
      <div role="radiogroup" aria-label="Color model" className="mb-3 flex flex-wrap gap-1">
        {Object.keys(MODES).map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={mode === name}
            onClick={() => switchMode(name)}
            className={`rounded border px-3 py-1 uppercase ${
              mode === name ? 'border-gray-300 bg-raised text-white' : 'border-line text-subtle hover:text-soft'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {[0, 1, 2].map((index) => (
          <Track key={index} mode={mode} values={values} index={index} onChange={setChannel} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="h-24 w-24 shrink-0 rounded border border-line" style={{ background: toCss(rgb) }} />
        <div className="min-w-0 flex-1 basis-48">
          <label className="block text-xs text-subtle" htmlFor="color-sliders-input">
            Type a color (hex, rgb(), hsl()) and press Enter
          </label>
          <input
            id="color-sliders-input"
            value={draft ?? strings.hex}
            onFocus={(event) => {
              setDraft(strings.hex);
              event.target.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              commitDraft();
              setDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitDraft();
              if (event.key === 'Escape') setDraft(strings.hex);
            }}
            spellCheck={false}
            aria-invalid={draftInvalid}
            className={`mt-1 w-full rounded border bg-panel px-2 py-1 text-white outline-none focus:border-gray-300 ${
              draftInvalid ? 'border-red-500' : 'border-line'
            }`}
          />
          {clipped && (
            <p className="mt-1 text-xs text-amber-400">Outside the sRGB gamut; showing the nearest clipped color.</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
        {Object.entries(strings).map(([label, text]) => (
          <CopyRow key={label} label={label} text={text} copied={copied} onCopy={copy} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ContrastBadge background={toCss(rgb)} text="#fff" ratio={contrast(y, 1)} />
        <ContrastBadge background={toCss(rgb)} text="#000" ratio={contrast(y, 0)} />
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-subtle">Swatches</span>
          <button type="button" onClick={saveSwatch} className="rounded border border-line px-2 py-0.5 text-xs hover:bg-raised">
            + save
          </button>
          {swatches.length > 0 && (
            <button type="button" onClick={() => updateSwatches([])} className="text-xs text-subtle hover:text-soft">
              clear
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {swatches.map((hex) => (
            <button
              key={hex}
              type="button"
              title={`Load ${hex}`}
              aria-label={`Load ${hex}`}
              onClick={() => setFromRgb(parseColor(hex))}
              className={`h-7 w-7 rounded border ${hex === strings.hex ? 'border-white' : 'border-line'} focus-visible:outline-2 focus-visible:outline-gray-300`}
              style={{ background: hex }}
            />
          ))}
          {swatches.length === 0 && <span className="text-xs text-faint">Saved colors appear here.</span>}
        </div>
      </div>
    </div>
  );
}
