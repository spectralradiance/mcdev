var e=`/*
 * Seed of Life: sacred-geometry patterns built from circles of one radius.
 *
 * Two layouts generate the circle centers:
 *
 * - Ring: \`count\` centers spaced evenly around a ring. Six circles on a ring
 *   whose radius equals the circle radius gives the classic Seed of Life
 *   petals; two circles half a radius from the middle give the Vesica Piscis.
 *
 * - Lattice: centers on a hexagonal (triangular) lattice, grown outward in
 *   generations. Generation 0 is one circle, generation 1 adds the six around
 *   it (Seed of Life), generation 2 adds twelve more (Flower of Life), and so
 *   on: generation g holds every lattice point within g steps of the middle.
 *   When the spacing equals the radius, each circle passes through its
 *   neighbours' centers, which is what makes the overlapping "petals".
 *
 * The traditional Flower of Life is drawn inside a boundary circle with the
 * next generation's circles cut off at that boundary, so the outer petals are
 * complete. "Complete petals" does exactly that with an SVG clipPath.
 *
 * Everything is plain SVG, so the same markup is what gets downloaded: as SVG
 * directly, or drawn onto a canvas for PNG/JPG.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';

const SIZE = 600;
const CENTER = SIZE / 2;
const SQRT3_2 = Math.sqrt(3) / 2;
const EXPORT_SCALE = 2; // PNG/JPG are rendered at 2x for crisp lines.

const BLEND_MODES = ['normal', 'multiply', 'screen', 'difference'];

// Each preset sets the geometry; colors and line style are left alone.
const PRESETS = {
  'Vesica Piscis': { layout: 'ring', radius: 110, count: 2, ringRadius: 55, withCenter: false, boundary: false, petals: false },
  'Seed of Life': { layout: 'lattice', radius: 80, generations: 1, spacing: 1, boundary: true, petals: false },
  'Egg of Life': { layout: 'lattice', radius: 60, generations: 1, spacing: 2, boundary: false, petals: false },
  'Flower of Life': { layout: 'lattice', radius: 70, generations: 2, spacing: 1, boundary: true, petals: true },
};

const DEFAULT_SHAPE = {
  layout: 'lattice',
  radius: 80,
  count: 6,
  ringRadius: 80,
  withCenter: true,
  generations: 1,
  spacing: 1,
  boundary: true,
  petals: false,
  ...PRESETS['Seed of Life'],
};

// ---- Geometry (pure) -------------------------------------------------------

function ringCenters(count, ringRadius, withCenter) {
  const centers = Array.from({ length: count }, (_, i) => {
    const t = (i / count) * 2 * Math.PI;
    return { x: ringRadius * Math.cos(t), y: ringRadius * Math.sin(t) };
  });
  return withCenter ? [{ x: 0, y: 0 }, ...centers] : centers;
}

// Hex lattice in axial coordinates (q, r). The hex distance from the origin is
// max(|q|, |r|, |q + r|), so "generation g" is every point with distance <= g.
function latticeCenters(generations, step) {
  const centers = [];
  for (let q = -generations; q <= generations; q++) {
    for (let r = -generations; r <= generations; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > generations) continue;
      centers.push({ x: step * (q + r / 2), y: step * r * SQRT3_2 });
    }
  }
  return centers;
}

// Circle centers (relative to the middle) plus the radius of the circle that
// encloses the pattern, which is also where the boundary and clip are drawn.
function buildPattern(shape) {
  const { layout, radius } = shape;
  if (layout === 'ring') {
    const centers = ringCenters(shape.count, shape.ringRadius, shape.withCenter);
    return { centers, extent: shape.ringRadius + radius };
  }
  const step = shape.spacing * radius;
  const extent = shape.generations * step + radius;
  // With petals on, draw one generation further and let the clip trim it.
  const centers = latticeCenters(shape.generations + (shape.petals ? 1 : 0), step);
  return { centers, extent };
}

// ---- Export ----------------------------------------------------------------

function triggerDownload(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

function downloadSvg(svg, type) {
  const markup = new XMLSerializer().serializeToString(svg);
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  if (type === 'svg') return triggerDownload(svgUrl, 'seed-of-life.svg');

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE * EXPORT_SCALE;
    const ctx = canvas.getContext('2d');
    if (type === 'jpg') {
      // JPEG has no alpha channel, so flatten onto white first.
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    triggerDownload(canvas.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png'), \`seed-of-life.\${type}\`);
  };
  image.src = svgUrl;
}

// ---- Controls --------------------------------------------------------------

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function NumberControl({ label, value, min, max, step = 1, onChange }) {
  const set = (event) => onChange(clamp(Number(event.target.value) || 0, min, max));
  return (
    <label className="block text-sm text-gray-300">
      <span className="flex items-center justify-between">
        {label}
        <input type="number" value={value} min={min} max={max} step={step} onChange={set}
          className="w-16 border border-gray-700 bg-gray-800 px-1 text-right text-white" />
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={set} className="mt-1 w-full" />
    </label>
  );
}

// Text field for #rrggbbaa (the color picker can't do alpha) plus a swatch.
function ColorControl({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between text-sm text-gray-300">
      {label}
      <span className="flex items-center gap-2">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
          className="w-24 border border-gray-700 bg-gray-800 px-1 font-mono text-white" />
        <input type="color" value={value.slice(0, 7)} aria-label={\`\${label} picker\`}
          onChange={(e) => onChange(e.target.value + value.slice(7))}
          className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" />
      </span>
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const sectionTitle = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
const buttonClass = 'rounded bg-gray-800 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700';

// ---- Component -------------------------------------------------------------

export default function SeedOfLife() {
  const [shape, setShape] = useState(DEFAULT_SHAPE);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff00');
  const [lineColor, setLineColor] = useState('#000000ff');
  const [fillColor, setFillColor] = useState('#3b82f6');
  const [fillOpacity, setFillOpacity] = useState(0);
  const [blendMode, setBlendMode] = useState('normal');
  const [lineWidth, setLineWidth] = useState(3);
  const [angleOffset, setAngleOffset] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinSpeed, setSpinSpeed] = useState(10); // degrees per second
  const [spin, setSpin] = useState(0);
  const svgRef = useRef(null);
  // useId can contain characters that are awkward inside url(#...).
  const clipId = 'seed-clip-' + useId().replace(/[^\\w-]/g, '');

  const setField = (key) => (value) => setShape((s) => ({ ...s, [key]: value }));
  const { centers, extent } = useMemo(() => buildPattern(shape), [shape]);

  // Rotation runs on requestAnimationFrame and is applied as a transform on
  // the group, so the geometry above is not recomputed every frame.
  useEffect(() => {
    if (!spinning) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setSpin((a) => (a + spinSpeed * dt) % 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning, spinSpeed]);

  const applyPreset = (name) => {
    setShape((s) => ({ ...s, ...PRESETS[name] }));
    setAngleOffset(0);
    setSpin(0);
  };

  const clipped = shape.petals;
  const rotation = angleOffset + spin;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="space-y-2">
          <h3 className={sectionTitle}>Presets</h3>
          <div className="flex flex-wrap gap-2">
            {Object.keys(PRESETS).map((name) => (
              <button key={name} type="button" onClick={() => applyPreset(name)} className={buttonClass}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className={sectionTitle}>Layout</h3>
          <div role="radiogroup" aria-label="Layout" className="flex gap-2">
            {['ring', 'lattice'].map((layout) => (
              <button key={layout} type="button" role="radio" aria-checked={shape.layout === layout}
                onClick={() => setField('layout')(layout)}
                className={\`\${buttonClass} capitalize \${shape.layout === layout ? 'ring-1 ring-gray-400' : ''}\`}>
                {layout}
              </button>
            ))}
          </div>
          <NumberControl label="Circle radius" value={shape.radius} min={5} max={200} onChange={setField('radius')} />
          {shape.layout === 'ring' ? (
            <>
              <NumberControl label="Circles" value={shape.count} min={1} max={40} onChange={setField('count')} />
              <NumberControl label="Ring radius" value={shape.ringRadius} min={0} max={250} onChange={setField('ringRadius')} />
              <Toggle label="Center circle" checked={shape.withCenter} onChange={setField('withCenter')} />
            </>
          ) : (
            <>
              <NumberControl label="Generations" value={shape.generations} min={0} max={8} onChange={setField('generations')} />
              <NumberControl label="Spacing (× radius)" value={shape.spacing} min={0.25} max={3} step={0.25}
                onChange={setField('spacing')} />
              <Toggle label="Complete petals (clip to boundary)" checked={shape.petals} onChange={setField('petals')} />
            </>
          )}
          <Toggle label="Boundary circle" checked={shape.boundary} onChange={setField('boundary')} />
        </div>

        <div className="space-y-3">
          <h3 className={sectionTitle}>Style</h3>
          <ColorControl label="Background" value={backgroundColor} onChange={setBackgroundColor} />
          <ColorControl label="Line" value={lineColor} onChange={setLineColor} />
          <NumberControl label="Line width" value={lineWidth} min={0.5} max={16} step={0.5} onChange={setLineWidth} />
          <ColorControl label="Fill" value={fillColor} onChange={setFillColor} />
          <NumberControl label="Fill opacity" value={fillOpacity} min={0} max={1} step={0.05} onChange={setFillOpacity} />
          <label className="flex items-center justify-between text-sm text-gray-300">
            Blend
            <select value={blendMode} onChange={(e) => setBlendMode(e.target.value)}
              className="border border-gray-700 bg-gray-800 px-1 text-white">
              {BLEND_MODES.map((mode) => <option key={mode}>{mode}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <h3 className={sectionTitle}>Rotation</h3>
          <NumberControl label="Angle offset" value={angleOffset} min={0} max={360} onChange={setAngleOffset} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSpinning((s) => !s)} aria-pressed={spinning} className={buttonClass}>
              {spinning ? 'Stop spinning' : 'Spin'}
            </button>
            <div className="flex-1">
              <NumberControl label="°/s" value={spinSpeed} min={-90} max={90} onChange={setSpinSpeed} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm text-gray-400">Download</span>
          {['svg', 'png', 'jpg'].map((type) => (
            <button key={type} type="button" onClick={() => downloadSvg(svgRef.current, type)}
              className={\`\${buttonClass} uppercase\`}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={\`0 0 \${SIZE} \${SIZE}\`} width={SIZE} height={SIZE}
        role="img" aria-label={\`\${centers.length} circles\`}
        className="h-auto w-full rounded border border-gray-700 bg-[#fafafa]">
        <defs>
          <clipPath id={clipId}>
            <circle cx={0} cy={0} r={extent} />
          </clipPath>
        </defs>
        <rect width={SIZE} height={SIZE} fill={backgroundColor} />
        <g transform={\`translate(\${CENTER} \${CENTER}) rotate(\${rotation})\`}>
          {/* isolation keeps the blend mode between the circles themselves,
              rather than blending with the page behind the SVG. */}
          <g clipPath={clipped ? \`url(#\${clipId})\` : undefined} style={{ isolation: 'isolate' }}>
            {centers.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={shape.radius} fill={fillColor} fillOpacity={fillOpacity}
                stroke={lineColor} strokeWidth={lineWidth} style={{ mixBlendMode: blendMode }} />
            ))}
          </g>
          {shape.boundary && (
            <circle cx={0} cy={0} r={extent} fill="none" stroke={lineColor} strokeWidth={lineWidth} />
          )}
        </g>
      </svg>
    </div>
  );
}
`;export{e as default};