import { useEffect, useMemo, useState } from 'react';

const numberOfRows = 20;
const saturationWindow = 10;

// Named colors from the color.pizza API, laid out by lightness (rows) and hue
// (columns) for the colors within 10% of the chosen saturation.
export default function HsvColorPicker() {
  const [colors, setColors] = useState([]);
  const [error, setError] = useState(null);
  const [saturation, setSaturation] = useState(50);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.color.pizza/v1/?goodnamesonly=true', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setColors(data.colors))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    const inSaturation = colors.filter(
      (color) => color.hsl.s > saturation - saturationWindow && color.hsl.s < saturation + saturationWindow,
    );
    const step = 100 / numberOfRows;
    return Array.from({ length: numberOfRows }, (_, i) =>
      inSaturation
        .filter((color) => color.hsl.l > i * step && color.hsl.l < (i + 1) * step)
        .sort((a, b) => a.hsl.h - b.hsl.h),
    );
  }, [colors, saturation]);

  return (
    <div className="text-white">
      <div className="mb-4 flex items-center justify-between gap-4">
        <label className="text-sm">
          <input
            type="range"
            min="0"
            max="100"
            value={saturation}
            onChange={(event) => setSaturation(parseInt(event.target.value, 10))}
            className="block"
          />
          Saturation: {saturation}%
        </label>
        {selected && (
          <div
            className="flex h-24 w-24 shrink-0 flex-col justify-end border border-white p-1 text-xs"
            style={{ backgroundColor: selected.hex, color: selected.bestContrast }}
          >
            {selected.name}
            <br />
            {selected.hex}
          </div>
        )}
      </div>

      {error && <p className="text-red-400">Couldn&apos;t load colors: {error}</p>}
      {!error && colors.length === 0 && <p className="text-gray-400">Loading colors…</p>}

      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div key={i} className="flex">
            {row.map((color) => (
              <button
                key={color.hex + color.name}
                title={`${color.name} ${color.hex}`}
                onClick={() => setSelected(color)}
                className="h-5 w-2.5 grow cursor-pointer transition-all duration-250 hover:z-10 hover:scale-200 hover:shadow-lg"
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
