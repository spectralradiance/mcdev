import { useEffect, useRef, useState } from 'react';

const width = 500;
const height = 500;
const nPoints = 100;
const galaxyRadius = 50;
const velocityScale = 0.12;
const timescale = 0.01;
const g = 1;
// Softening, so close passes don't produce infinite forces.
const a = 40;

const createPoints = () => {
  const points = [];
  for (let i = 0; i < nPoints; ++i) {
    const angle = Math.random() * Math.PI * 2;
    const px = galaxyRadius * Math.cos(angle);
    const py = galaxyRadius * Math.sin(angle);
    const mass = 1 + Math.random() * 10;
    points.push({
      px,
      py,
      vx: py * velocityScale,
      vy: -px * velocityScale,
      mass,
      size: mass / 2,
    });
  }
  return points;
};

// A ring of bodies set orbiting a common center, each pair pulling on the other.
export default function NBodyGravity() {
  const canvasRef = useRef(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.setTransform(1, 0, 0, -1, width / 2, height / 2);
    const points = createPoints();
    let lastTimestamp = null;
    let frame;

    const step = (timestamp) => {
      ctx.clearRect(-width / 2, -height / 2, width, height);
      if (lastTimestamp == null) lastTimestamp = timestamp;
      // Cap the step so a backgrounded tab doesn't fling everything apart.
      const dt = Math.min(timestamp - lastTimestamp, 50) * timescale;
      lastTimestamp = timestamp;

      ctx.fillStyle = 'white';
      for (let i = 0; i < points.length; ++i) {
        const p1 = points[i];
        p1.px += dt * p1.vx;
        p1.py += dt * p1.vy;
        ctx.fillRect(p1.px - p1.size / 2, p1.py - p1.size / 2, p1.size, p1.size);

        for (let j = i + 1; j < points.length; ++j) {
          const p2 = points[j];
          let dx = p2.px - p1.px;
          let dy = p2.py - p1.py;
          const r2 = dx * dx + dy * dy + a;
          const f = (g * (p1.mass * p1.mass)) / r2;
          const r = Math.sqrt(r2);
          dx /= r;
          dy /= r;
          p1.vx += (f * dx) / p1.mass;
          p1.vy += (f * dy) / p1.mass;
          p2.vx -= (f * dx) / p2.mass;
          p2.vy -= (f * dy) / p2.mass;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [run]);

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block h-auto w-full max-w-[500px] border border-gray-700 bg-black"
      />
      <button
        onClick={() => setRun((n) => n + 1)}
        className="rounded bg-gray-800 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
      >
        Restart
      </button>
    </div>
  );
}
