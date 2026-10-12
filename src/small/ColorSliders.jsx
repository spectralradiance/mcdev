import { useEffect, useRef, useState } from 'react';

const sliderWidth = 300;
const sliderHeight = 20;
const lineHeight = 15;

const toHex = (v) => v.toString(16).toUpperCase().padStart(2, '0');
const toRGBText = ({ r, g, b }) => `rgb(${r},${g},${b})`;
const toHexText = ({ r, g, b }) => '#' + toHex(r) + toHex(g) + toHex(b);

// https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately
function HSVtoRGB(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return { r: Math.floor(r * 255), g: Math.floor(g * 255), b: Math.floor(b * 255) };
}

function RGBtoHSV(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h;
  switch (max) {
    case min: h = 0; break;
    case r: h = (g - b + d * (g < b ? 6 : 0)) / (6 * d); break;
    case g: h = (b - r + d * 2) / (6 * d); break;
    default: h = (r - g + d * 4) / (6 * d); break;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

const toRGB = (mode, v1, v2, v3) =>
  mode === 'rgb'
    ? { r: Math.floor(v1 * 255), g: Math.floor(v2 * 255), b: Math.floor(v3 * 255) }
    : HSVtoRGB(v1, v2, v3);

// Each slider is drawn across its full range with the other two held fixed,
// so it shows exactly the colors that moving it would reach.
function drawSlider(canvas, mode, values, index) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, sliderWidth, sliderHeight);

  ctx.lineWidth = 1;
  const marker = Math.floor(values[index] * sliderWidth) + 0.5;
  ctx.strokeStyle = toRGBText(toRGB(mode, ...values));
  ctx.beginPath();
  ctx.moveTo(marker, 0);
  ctx.lineTo(marker, sliderHeight);
  ctx.stroke();

  ctx.lineWidth = 2;
  const offset = (sliderHeight - lineHeight) / 2;
  for (let i = 0; i < sliderWidth; ++i) {
    const sample = [...values];
    sample[index] = i / sliderWidth;
    ctx.strokeStyle = toRGBText(toRGB(mode, ...sample));
    ctx.beginPath();
    ctx.moveTo(i, offset);
    ctx.lineTo(i, offset + lineHeight);
    ctx.stroke();
  }
}

export default function ColorSliders() {
  const [mode, setMode] = useState('rgb');
  const [values, setValues] = useState(() => [Math.random(), Math.random(), Math.random()]);
  const canvases = useRef([]);
  const dragging = useRef(null);

  useEffect(() => {
    canvases.current.forEach((canvas, index) => drawSlider(canvas, mode, values, index));
  }, [mode, values]);

  const setFromPointer = (index, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const v = Math.min(1, Math.max(0, (event.clientX - rect.left + 1) / rect.width));
    setValues((current) => current.map((value, i) => (i === index ? v : value)));
  };

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'rgb') {
      const rgb = HSVtoRGB(...values);
      setValues([rgb.r / 255, rgb.g / 255, rgb.b / 255]);
    } else {
      const hsv = RGBtoHSV(values[0] * 255, values[1] * 255, values[2] * 255);
      setValues([hsv.h, hsv.s, hsv.v]);
    }
    setMode(next);
  };

  const rgb = toRGB(mode, ...values);
  const border = `1px solid ${toRGBText(rgb)}`;

  return (
    <div className="font-mono text-white select-none">
      <div className="inline-block max-w-full" style={{ border }}>
        {[0, 1, 2].map((index) => (
          <canvas
            key={index}
            ref={(element) => { canvases.current[index] = element; }}
            width={sliderWidth}
            height={sliderHeight}
            onPointerDown={(event) => {
              dragging.current = index;
              event.currentTarget.setPointerCapture(event.pointerId);
              setFromPointer(index, event);
            }}
            onPointerMove={(event) => {
              if (dragging.current === index) setFromPointer(index, event);
            }}
            onPointerUp={() => { dragging.current = null; }}
            className="block max-w-full cursor-default touch-none"
            style={index === 1 ? { borderTop: border, borderBottom: border } : undefined}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {['rgb', 'hsv'].map((name) => (
          <button
            key={name}
            onClick={() => switchMode(name)}
            className={mode === name ? 'text-white' : 'text-gray-600 hover:text-gray-400'}
          >
            [{name}]
          </button>
        ))}
        <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: toRGBText(rgb) }} />
        <span>{toHexText(rgb)}</span>
      </div>
    </div>
  );
}
