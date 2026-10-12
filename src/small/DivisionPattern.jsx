import { useEffect, useRef, useState } from 'react';

// Port of the CodePen "Draw Division Remainder Pattern".
// Each pixel is shaded by the length of the decimal string of a division.

const WIDTH = 501;
const HEIGHT = 501;
const CX = 0;
const CY = -Math.floor(WIDTH / 2);

const N_GREYSCALE = 7;
const GREYSCALE_COLORS = Array.from({ length: N_GREYSCALE }, (_, i) => {
  const c = Math.floor((1 - i / (N_GREYSCALE - 1)) * 256);
  return [c, c, c, 255];
});

function drawPattern(ctx) {
  const img = ctx.createImageData(WIDTH, HEIGHT);
  for (let i = 0; i < WIDTH; ++i) {
    for (let j = 0; j < HEIGHT; ++j) {
      const x = (CX + i) / (CY + j);
      let color;
      if (Number.isFinite(x)) {
        const len = Math.abs(x).toString().length;
        color = GREYSCALE_COLORS[Math.min(len, N_GREYSCALE - 1)];
      } else {
        color = [255, 255, 255, 255];
      }
      // As in the original, i indexes rows and j indexes columns.
      const k = 4 * (j + i * HEIGHT);
      for (let m = 0; m < 4; ++m) img.data[k + m] = color[m];
    }
  }
  ctx.putImageData(img, 0, 0);
}

export default function DivisionPattern() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPattern(ctx);
  }, []);

  const handleMove = (e) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = canvas.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    // Map the (possibly scaled) on-screen position back to canvas pixels.
    const px = Math.min(WIDTH - 1, Math.max(0, Math.floor(((e.clientX - rect.left) * WIDTH) / rect.width)));
    const py = Math.min(HEIGHT - 1, Math.max(0, Math.floor(((e.clientY - rect.top) * HEIGHT) / rect.height)));
    const mx = px + CY;
    const my = py + CX;
    const left = e.clientX - box.left;
    setTip({
      text: mx + '/' + my + ' = ' + mx / my,
      left: left + 2,
      top: e.clientY - box.top + 2,
      flip: left > box.width / 2,
    });
  };

  return (
    <div ref={containerRef} className="relative inline-block max-w-full">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="block h-auto max-w-full cursor-none border border-gray-700"
        onPointerMove={handleMove}
        onPointerLeave={() => setTip(null)}
      />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap border border-gray-700 bg-black p-0.5 font-mono text-xs text-gray-300"
          style={{
            left: tip.left,
            top: tip.top,
            transform: tip.flip ? 'translateX(calc(-100% - 4px))' : undefined,
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
