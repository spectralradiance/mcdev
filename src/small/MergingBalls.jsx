import { useEffect, useRef, useState } from 'react';

const width = 500;
const height = 500;
const nBalls = 1000;
const g = 0.1;
const friction = 0.99;
const buffer = 0.1;

const interpolate = (a, b, t) => (1 - t) * a + b * t;

const createBalls = () => {
  const balls = [];
  for (let i = 0; i < nBalls; ++i) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 10 * Math.random();
    balls.push({
      px: Math.random() * width,
      py: Math.random() * height,
      radius: 1 + Math.random(),
      mass: 1,
      vx: speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
    });
  }
  return balls;
};

// A thousand balls bounce under gravity; any two that touch merge into one,
// conserving area and averaging position and velocity by mass.
export default function MergingBalls() {
  const canvasRef = useRef(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    const balls = createBalls();
    let frame;

    const step = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'white';

      for (let i = 0; i < balls.length; ++i) {
        const b = balls[i];
        b.px += b.vx;
        b.py += b.vy;
        b.vy += g;

        if (b.px + b.radius > width) {
          b.px = width - b.radius - buffer;
          b.vx *= -1;
          b.vy *= friction;
        } else if (b.px - b.radius < 0) {
          b.px = b.radius + buffer;
          b.vx *= -1;
          b.vy *= friction;
        } else if (b.py + b.radius > height) {
          b.py = height - b.radius - buffer;
          b.vy *= -1;
          b.vy *= friction;
        } else if (b.py - b.radius < 0) {
          b.py = b.radius + buffer;
          b.vy *= -1;
          b.vy *= friction;
        }

        for (let j = i + 1; j < balls.length; ++j) {
          const b2 = balls[j];
          const dx = b.px - b2.px;
          const dy = b.py - b2.py;
          if (Math.sqrt(dx * dx + dy * dy) < b.radius + b2.radius) {
            balls.splice(j, 1);
            // pi*rc^2 = pi*r1^2 + pi*r2^2
            b.radius = Math.sqrt(b.radius * b.radius + b2.radius * b2.radius);
            b.mass += b2.mass;
            const t = b2.mass / b.mass;
            b.px = interpolate(b.px, b2.px, t);
            b.py = interpolate(b.py, b2.py, t);
            b.vx = interpolate(b.vx, b2.vx, t);
            b.vy = interpolate(b.vy, b2.vy, t);
          }
        }

        ctx.beginPath();
        ctx.arc(b.px, b.py, b.radius, 0, 2 * Math.PI);
        ctx.stroke();
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
