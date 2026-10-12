import { useMemo, useRef, useState } from 'react';

const size = 600;
const center = size / 2;

const download = (href, filename) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
};

function NumberControl({ label, value, min, max, onChange }) {
  return (
    <label className="block text-sm text-gray-300">
      <span className="flex items-center justify-between">
        {label}
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-16 border border-gray-700 bg-gray-800 px-1 text-right text-white"
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

function ColorControl({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between text-sm text-gray-300">
      {label}
      <span className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-28 border border-gray-700 bg-gray-800 px-1 font-mono text-white"
        />
        <input
          type="color"
          value={value.slice(0, 7)}
          onChange={(event) => onChange(event.target.value + value.slice(7))}
          className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
        />
      </span>
    </label>
  );
}

// Circles of one radius, spaced evenly around a ring: six give the Seed of Life.
export default function SeedOfLife() {
  const [backgroundColor, setBackgroundColor] = useState('#ffffff00');
  const [lineColor, setLineColor] = useState('#000000ff');
  const [nCircles, setNCircles] = useState(6);
  const [innerRadius, setInnerRadius] = useState(50);
  const [outerRadius, setOuterRadius] = useState(50);
  const [lineWidth, setLineWidth] = useState(4);
  const [angleOffset, setAngleOffset] = useState(0);
  const svgRef = useRef(null);

  const circles = useMemo(() => {
    const count = Number(nCircles) || 1;
    return Array.from({ length: count }, (_, i) => {
      const t = (i / count) * 2 * Math.PI + (angleOffset / 180) * Math.PI;
      return { x: center + outerRadius * Math.cos(t), y: center + outerRadius * Math.sin(t) };
    });
  }, [nCircles, outerRadius, angleOffset]);

  const handleDownload = (type) => {
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    if (type === 'svg') {
      download(svgUrl, 'seed-of-life.svg');
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (type === 'jpg') {
        // JPEG has no alpha, so flatten onto white.
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, size, size);
      }
      ctx.drawImage(image, 0, 0);
      download(canvas.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png'), `seed-of-life.${type}`);
    };
    image.src = svgUrl;
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
        <ColorControl label="Background" value={backgroundColor} onChange={setBackgroundColor} />
        <ColorControl label="Line" value={lineColor} onChange={setLineColor} />
        <NumberControl label="Circles" value={nCircles} min={1} max={40} onChange={setNCircles} />
        <NumberControl label="Inner radius" value={innerRadius} min={0} max={200} onChange={setInnerRadius} />
        <NumberControl label="Outer radius" value={outerRadius} min={0} max={200} onChange={setOuterRadius} />
        <NumberControl label="Line width" value={lineWidth} min={1} max={16} onChange={setLineWidth} />
        <NumberControl label="Angle offset" value={angleOffset} min={0} max={360} onChange={setAngleOffset} />
        <div className="flex gap-2 pt-1">
          {['svg', 'png', 'jpg'].map((type) => (
            <button
              key={type}
              onClick={() => handleDownload(type)}
              className="rounded bg-gray-800 px-3 py-1 text-xs uppercase text-gray-200 hover:bg-gray-700"
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="h-auto w-full rounded border border-gray-700 bg-[#fafafa]"
      >
        <circle cx={center} cy={center} r={outerRadius + innerRadius} fill={backgroundColor} />
        {circles.map((circle, index) => (
          <circle
            key={index}
            cx={circle.x}
            cy={circle.y}
            r={innerRadius}
            fill="transparent"
            stroke={lineColor}
            strokeWidth={lineWidth}
          />
        ))}
      </svg>
    </div>
  );
}
