/*
 * Merging balls
 *
 * Hundreds of small balls bounce around a box under gravity. Whenever two
 * touch, they merge into one, so over time the swarm condenses into a few
 * large balls.
 *
 * A merge conserves two things:
 *  - Area. Mass is taken to be proportional to area (a flat disc of constant
 *    density), so mass = r² and the merged radius is √(r1² + r2²).
 *  - Momentum. The merged ball's velocity is the mass-weighted average of the
 *    two, m1·v1 + m2·v2 = (m1 + m2)·v, and it sits at their center of mass.
 * Kinetic energy is *not* conserved: like two lumps of clay sticking
 * together, each merge is a perfectly inelastic collision.
 *
 * Finding touching pairs naively means testing every pair, n²/2 checks per
 * frame: half a million for 1,000 balls. Instead the box is divided into a
 * grid of square cells at least as wide as the largest ball's diameter. Two
 * balls can only touch if their centers are closer than r1 + r2 ≤ one cell
 * width, so each ball needs to be compared only with balls in its own cell
 * and the eight around it. While balls are small and spread out this is close
 * to linear in n. As one ball grows, the cells grow with it and the grid
 * degrades back towards n², but by then there are few balls left.
 *
 * The simulation advances one step per animation frame, like the original pen.
 */
import { useEffect, useRef, useState } from 'react';

const WIDTH = 500;
const HEIGHT = 500;
const MIN_CELL = 8; // smallest grid cell, so tiny balls don't make a huge grid
const SPRAY_PER_FRAME = 3; // balls added per frame while the pointer is held
const MAX_BALLS = 4000;
const STATS_EVERY = 10; // frames between stats updates

// ---------------------------------------------------------------------------
// Simulation: plain functions over an array of { x, y, vx, vy, r, mass }.

const randomBetween = (lo, hi) => lo + Math.random() * (hi - lo);

function makeBall(x, y, maxSpeed) {
  const angle = Math.random() * Math.PI * 2;
  const speed = maxSpeed * Math.random();
  const r = randomBetween(1, 2);
  return { x, y, vx: speed * Math.cos(angle), vy: speed * Math.sin(angle), r, mass: r * r };
}

const createBalls = (count) =>
  Array.from({ length: count }, () => makeBall(Math.random() * WIDTH, Math.random() * HEIGHT, 10));

// Moves one ball a frame forward and bounces it off the walls. Only the
// velocity component normal to a wall is reflected and damped; sliding along
// the floor keeps its horizontal speed. Each wall is checked independently so
// a ball in a corner bounces off both.
function moveBall(b, gravity, bounce) {
  b.vy += gravity;
  b.x += b.vx;
  b.y += b.vy;
  if (b.x < b.r) {
    b.x = b.r;
    b.vx = Math.abs(b.vx) * bounce;
  } else if (b.x > WIDTH - b.r) {
    b.x = WIDTH - b.r;
    b.vx = -Math.abs(b.vx) * bounce;
  }
  if (b.y < b.r) {
    b.y = b.r;
    b.vy = Math.abs(b.vy) * bounce;
  } else if (b.y > HEIGHT - b.r) {
    b.y = HEIGHT - b.r;
    b.vy = -Math.abs(b.vy) * bounce;
  }
}

// Absorbs b into a, conserving area (mass) and momentum. See header.
function absorb(a, b) {
  const mass = a.mass + b.mass;
  const t = b.mass / mass; // b's share of the merged mass
  a.x += (b.x - a.x) * t;
  a.y += (b.y - a.y) * t;
  a.vx += (b.vx - a.vx) * t;
  a.vy += (b.vy - a.vy) * t;
  a.mass = mass;
  a.r = Math.sqrt(mass);
  b.absorbed = true;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Merges every touching pair, using a uniform grid to find candidates (see
// header). The grid is stored as linked lists in typed arrays: head[cell] is
// the first ball in that cell and next[i] the ball after i, so building it
// allocates two arrays rather than one array per cell. Returns the number of
// merges and removes absorbed balls from the array in place.
function mergeTouching(balls) {
  let maxR = 0;
  for (const b of balls) maxR = Math.max(maxR, b.r);
  const cell = Math.max(2 * maxR, MIN_CELL);
  const cols = Math.ceil(WIDTH / cell);
  const rows = Math.ceil(HEIGHT / cell);
  const cellX = (b) => clamp(Math.floor(b.x / cell), 0, cols - 1);
  const cellY = (b) => clamp(Math.floor(b.y / cell), 0, rows - 1);

  const head = new Int32Array(cols * rows).fill(-1);
  const next = new Int32Array(balls.length);
  balls.forEach((b, i) => {
    const c = cellY(b) * cols + cellX(b);
    next[i] = head[c];
    head[c] = i;
  });

  let merges = 0;
  for (let i = 0; i < balls.length; ++i) {
    const a = balls[i];
    if (a.absorbed) continue;
    const cx = cellX(a);
    const cy = cellY(a);
    for (let y = Math.max(cy - 1, 0); y <= Math.min(cy + 1, rows - 1); ++y) {
      for (let x = Math.max(cx - 1, 0); x <= Math.min(cx + 1, cols - 1); ++x) {
        for (let j = head[y * cols + x]; j !== -1; j = next[j]) {
          // j > i visits each pair once. A merge moves `a` and may grow it
          // past the cell size; any pair this misses is caught next frame.
          const b = balls[j];
          if (j <= i || b.absorbed) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const reach = a.r + b.r;
          if (dx * dx + dy * dy < reach * reach) {
            absorb(a, b);
            ++merges;
          }
        }
      }
    }
  }

  if (merges) {
    let kept = 0;
    for (const b of balls) if (!b.absorbed) balls[kept++] = b;
    balls.length = kept;
  }
  return merges;
}

// Hue runs from cyan for the starting balls to red for the largest possible
// ball, on a log scale because mass spans three orders of magnitude.
const LOG_MAX_MASS = Math.log(3000);
const colorFor = (mass) => `hsl(${190 - 190 * clamp(Math.log(mass) / LOG_MAX_MASS, 0, 1)}, 90%, 60%)`;

function draw(ctx, balls, colorBySize) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = 'white';
  for (const b of balls) {
    if (colorBySize) ctx.strokeStyle = colorFor(b.mass);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// UI

function Slider({ label, value, min, max, step, onChange, format = String }) {
  return (
    <label className="block text-sm text-gray-300">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-gray-400">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 block w-full accent-gray-300"
      />
    </label>
  );
}

const buttonClass = 'rounded bg-gray-800 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700';

export default function MergingBalls() {
  const canvasRef = useRef(null);
  const [count, setCount] = useState(1000);
  const [gravity, setGravity] = useState(0.1);
  const [bounce, setBounce] = useState(0.99);
  const [colorBySize, setColorBySize] = useState(true);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [stats, setStats] = useState({ balls: 0, largest: 0, merges: 0 });

  // The balls and the pointer live in refs: they change every frame, and the
  // animation loop needs the latest values without React re-rendering.
  const balls = useRef([]);
  const merges = useRef(0);
  const spray = useRef(null); // { x, y } while the pointer is held down

  // Settings reach the loop through a ref so a slider doesn't restart it.
  const settings = useRef(null);
  useEffect(() => {
    settings.current = { gravity, bounce, colorBySize, paused };
  }, [gravity, bounce, colorBySize, paused]);

  useEffect(() => {
    balls.current = createBalls(count);
    merges.current = 0;
  }, [count, run]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let frame;
    let frameCount = 0;

    const tick = () => {
      const { gravity: g, bounce: e, colorBySize: colored, paused: isPaused } = settings.current;
      const list = balls.current;

      if (spray.current && list.length < MAX_BALLS) {
        for (let i = 0; i < SPRAY_PER_FRAME; ++i) list.push(makeBall(spray.current.x, spray.current.y, 3));
      }
      if (!isPaused) {
        for (const b of list) moveBall(b, g, e);
        merges.current += mergeTouching(list);
      }
      draw(ctx, list, colored);

      if (++frameCount % STATS_EVERY === 0) {
        let largest = 0;
        for (const b of list) largest = Math.max(largest, b.r);
        setStats({ balls: list.length, largest, merges: merges.current });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Pointer position in canvas units, allowing for CSS scaling of the canvas.
  const aim = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    spray.current = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  return (
    <div className="max-w-[500px] space-y-4 text-gray-300">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label="Merging balls simulation. Press and hold to spray new balls."
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          aim(event);
        }}
        onPointerMove={(event) => spray.current && aim(event)}
        onPointerUp={() => (spray.current = null)}
        onPointerCancel={() => (spray.current = null)}
        className="block h-auto w-full cursor-crosshair touch-none border border-gray-700 bg-black"
      />
      <p className="text-xs text-gray-400">Press and hold on the box to spray in more balls.</p>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPaused((p) => !p)} className={`${buttonClass} w-20`}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => setRun((n) => n + 1)} className={buttonClass}>
          Restart
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={colorBySize}
            onChange={(e) => setColorBySize(e.target.checked)}
            className="accent-gray-300"
          />
          Color by size
        </label>
      </div>

      <div className="text-sm tabular-nums text-gray-400">
        {stats.balls} balls · largest radius {stats.largest.toFixed(1)} · {stats.merges} merges
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Slider label="Starting balls" value={count} min={50} max={3000} step={50} onChange={setCount} />
        <Slider label="Gravity" value={gravity} min={0} max={0.5} step={0.01} onChange={setGravity} format={(v) => v.toFixed(2)} />
        <Slider label="Bounce" value={bounce} min={0.5} max={1} step={0.01} onChange={setBounce} format={(v) => v.toFixed(2)} />
      </div>
    </div>
  );
}
