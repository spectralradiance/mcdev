var e=`/*
 * N-body gravity
 *
 * Every body pulls on every other body with Newton's law of gravitation,
 * F = G·m1·m2 / r², directed along the line between them. There is no closed
 * form for more than two bodies, so we step time forward in small increments:
 * sum the forces on each body, turn force into acceleration (a = F / m), and
 * nudge velocities and positions. Summing over every pair is O(n²), which is
 * fine for a few hundred bodies.
 *
 * Two details keep it well behaved:
 *
 * Softening. Two bodies that pass very close would feel an enormous force and
 * be flung out of the system. Replacing r² with r² + ε² ("Plummer softening")
 * caps the force at short range while leaving long-range gravity untouched.
 * It is the exact force of the potential U = −G·m1·m2 / √(r² + ε²), which is
 * what the energy readout uses, so energy is still a conserved quantity.
 *
 * Leapfrog integration. The obvious scheme (move by velocity, then update
 * velocity) is Euler's method; it adds a little energy every step, so orbits
 * slowly spiral outwards. Leapfrog ("kick-drift-kick", a form of velocity
 * Verlet) gives half a velocity kick, a full position drift, then the other
 * half kick using the new forces. It costs the same one force evaluation per
 * step, but it is time-reversible and symplectic, so energy error stays
 * bounded and oscillates instead of drifting. That only holds with a fixed
 * step size, so real elapsed time is fed into an accumulator and consumed in
 * fixed STEP-sized chunks rather than integrating with a variable frame time.
 *
 * World coordinates have the origin at the center of the canvas with y up.
 */
import { useEffect, useRef, useState } from 'react';

const SIZE = 500; // canvas and world size, in world units
const STEP = 0.04; // fixed integration step, in simulation time units
const SIM_RATE = 10; // simulation time per real second at timescale 1
const MAX_STEPS_PER_FRAME = 60; // beyond this we drop time rather than freeze
const STEPS_PER_CLICK = 10; // how far the Step button advances
const FLING_SCALE = 0.05; // drag length (world units) to launch speed
const NEW_BODY_MASS = 10;
const STATS_EVERY = 10; // frames between energy readouts; computing E is O(n²)

// ---------------------------------------------------------------------------
// Physics: plain functions over an array of { px, py, vx, vy, ax, ay, mass }.

const body = (px, py, vx, vy, mass) => ({ px, py, vx, vy, ax: 0, ay: 0, mass });

// Fills in each body's acceleration from every pairwise pull. Each pair is
// visited once and applied to both bodies with opposite signs (Newton's third
// law), halving the work.
function computeAccelerations(bodies, G, eps2) {
  for (const b of bodies) b.ax = b.ay = 0;
  for (let i = 0; i < bodies.length; ++i) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; ++j) {
      const b = bodies[j];
      const dx = b.px - a.px;
      const dy = b.py - a.py;
      const r2 = dx * dx + dy * dy + eps2;
      // Force magnitude G·ma·mb / r², times the unit vector (dx, dy) / r,
      // gives G·ma·mb·(dx, dy) / r³. Dividing by each body's own mass leaves
      // the *other* body's mass in its acceleration. (The original pen used
      // ma·ma here instead of ma·mb, which broke momentum conservation.)
      const s = G / (r2 * Math.sqrt(r2));
      a.ax += s * b.mass * dx;
      a.ay += s * b.mass * dy;
      b.ax -= s * a.mass * dx;
      b.ay -= s * a.mass * dy;
    }
  }
}

// One kick-drift-kick step. Expects accelerations to be current on entry and
// leaves them current on exit, so consecutive steps share force evaluations.
function leapfrogStep(bodies, h, G, eps2) {
  for (const b of bodies) {
    b.vx += 0.5 * h * b.ax;
    b.vy += 0.5 * h * b.ay;
    b.px += h * b.vx;
    b.py += h * b.vy;
  }
  computeAccelerations(bodies, G, eps2);
  for (const b of bodies) {
    b.vx += 0.5 * h * b.ax;
    b.vy += 0.5 * h * b.ay;
  }
}

// Kinetic plus (softened) potential energy. In an isolated system this should
// stay constant; how far it wanders is a direct measure of integration error.
function totalEnergy(bodies, G, eps2) {
  let kinetic = 0;
  let potential = 0;
  for (let i = 0; i < bodies.length; ++i) {
    const a = bodies[i];
    kinetic += 0.5 * a.mass * (a.vx * a.vx + a.vy * a.vy);
    for (let j = i + 1; j < bodies.length; ++j) {
      const b = bodies[j];
      const dx = b.px - a.px;
      const dy = b.py - a.py;
      potential -= (G * a.mass * b.mass) / Math.sqrt(dx * dx + dy * dy + eps2);
    }
  }
  return kinetic + potential;
}

// Speed for a circular orbit of radius r around mass M under softened gravity:
// set centripetal v²/r equal to the softened pull G·M·r / (r² + ε²)^(3/2).
const circularSpeed = (M, r, G, eps2) => Math.sqrt((G * M * r * r) / (r * r + eps2) ** 1.5);

const randomBetween = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Starting configurations. Each builds bodies for the current G and softening,
// and suggests a softening that suits it.

const PRESETS = {
  ring: {
    label: 'Ring galaxy',
    hint: 'The original pen: a spinning ring of bodies that collapses into a rotating core and flings out a halo.',
    softening: 6.3,
    create(count) {
      return Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const px = 50 * Math.cos(angle);
        const py = 50 * Math.sin(angle);
        // Tangential speed proportional to radius, i.e. the whole ring turns
        // like a rigid wheel. The pen used 0.12, which leaves the ring with
        // positive total energy (unbound) once the force is corrected, so it
        // simply flies off screen; 0.04 keeps it bound.
        return body(px, py, py * 0.04, -px * 0.04, randomBetween(1, 11));
      });
    },
  },
  binary: {
    label: 'Binary star',
    hint: 'Two heavy stars in a circular orbit, with light planets circling both.',
    softening: 3,
    create(count, G, eps2) {
      const M = 2000;
      const d = 20; // each star's distance from the shared center
      // Each star feels the other at distance 2d and circles the center at d,
      // so v²/d = G·M·2d / ((2d)² + ε²)^(3/2).
      const v = Math.sqrt((G * M * 2 * d * d) / (4 * d * d + eps2) ** 1.5);
      const bodies = [body(d, 0, 0, v, M), body(-d, 0, 0, -v, M)];
      for (let i = 2; i < count; ++i) {
        const r = randomBetween(120, 235);
        const angle = Math.random() * Math.PI * 2;
        const speed = circularSpeed(2 * M, r, G, eps2);
        const [c, s] = [Math.cos(angle), Math.sin(angle)];
        bodies.push(body(r * c, r * s, -speed * s, speed * c, 0.2));
      }
      return bodies;
    },
  },
  cloud: {
    label: 'Random cloud',
    hint: 'A slowly turning cloud collapses under its own weight and settles into clumps.',
    softening: 6,
    create(count) {
      return Array.from({ length: count }, () => {
        // sqrt makes the density uniform over the disc rather than bunched at the center.
        const r = 160 * Math.sqrt(Math.random());
        const angle = Math.random() * Math.PI * 2;
        const [px, py] = [r * Math.cos(angle), r * Math.sin(angle)];
        return body(px, py, -py * 0.01 + randomBetween(-0.3, 0.3), px * 0.01 + randomBetween(-0.3, 0.3), randomBetween(1, 11));
      });
    },
  },
  figureEight: {
    label: 'Figure-eight',
    hint: 'Three equal masses chasing each other along one figure-eight (Chenciner–Montgomery, 2000). It is unstable, so small errors grow.',
    softening: 0.5,
    fixedCount: 3,
    create(_count, G) {
      // The published solution is for G = m = 1 and unit length. Scaling
      // lengths by L and masses by m keeps it a solution if velocities scale
      // by √(G·m / L).
      const [m, L] = [1000, 120];
      const k = Math.sqrt((G * m) / L);
      const [x, y] = [0.97000436 * L, -0.24308753 * L];
      const [vx, vy] = [-0.93240737 * k, -0.86473146 * k];
      return [body(x, y, -vx / 2, -vy / 2, m), body(-x, -y, -vx / 2, -vy / 2, m), body(0, 0, vx, vy, m)];
    },
  },
};

// ---------------------------------------------------------------------------
// Drawing

// Radius grows with the cube root of mass (as if density were constant), capped
// so the binary's stars don't swallow the screen.
const drawRadius = (mass) => Math.min(Math.cbrt(mass), 7);

function draw(ctx, bodies, drag, trails) {
  // With trails on, paint a translucent black wash instead of clearing, so
  // earlier frames fade out over a few dozen frames.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = trails ? 'rgba(0, 0, 0, 0.08)' : 'black';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.setTransform(1, 0, 0, -1, SIZE / 2, SIZE / 2); // origin at center, y up

  ctx.fillStyle = 'white';
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(b.px, b.py, drawRadius(b.mass), 0, Math.PI * 2);
    ctx.fill();
  }

  if (drag) {
    ctx.strokeStyle = 'rgb(156, 163, 175)';
    ctx.beginPath();
    ctx.moveTo(drag.x0, drag.y0);
    ctx.lineTo(drag.x1, drag.y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(drag.x0, drag.y0, drawRadius(NEW_BODY_MASS), 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// UI

function Slider({ label, value, min, max, step, onChange, format = String, disabled = false }) {
  return (
    <label className={\`block text-sm \${disabled ? 'text-gray-600' : 'text-gray-300'}\`}>
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
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 block w-full accent-gray-300"
      />
    </label>
  );
}

const buttonClass = 'rounded bg-gray-800 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700';

export default function NBodyGravity() {
  const canvasRef = useRef(null);
  const [preset, setPreset] = useState('ring');
  const [count, setCount] = useState(100);
  const [G, setG] = useState(1);
  const [softening, setSoftening] = useState(PRESETS.ring.softening);
  const [timescale, setTimescale] = useState(1);
  const [trails, setTrails] = useState(true);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [stats, setStats] = useState({ count: 0, energy: 0, drift: 0 });

  // The simulation lives in a ref, not state: it changes every frame and
  // re-rendering React that often would be wasted work. \`baseline\` is the
  // energy we measure drift against; it's cleared whenever something outside
  // the physics (a new body, a new G) legitimately changes the energy.
  const sim = useRef({ bodies: [], accelStale: true, baseline: null, drag: null, pendingSteps: 0 });

  // Likewise, the animation loop reads settings through a ref so that moving a
  // slider doesn't tear down and restart the loop.
  const settings = useRef(null);
  useEffect(() => {
    settings.current = { G, eps2: softening * softening, timescale, trails, paused };
  }, [G, softening, timescale, trails, paused]);

  useEffect(() => {
    sim.current.accelStale = true;
    sim.current.baseline = null;
  }, [G, softening]);

  useEffect(() => {
    const { G: g, eps2 } = settings.current;
    Object.assign(sim.current, {
      bodies: PRESETS[preset].create(count, g, eps2),
      accelStale: true,
      baseline: null,
    });
  }, [preset, count, run]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let frame;
    let last = null;
    let pendingTime = 0;
    let frameCount = 0;

    const tick = (now) => {
      const s = sim.current;
      const { G: g, eps2, timescale: ts, trails: showTrails, paused: isPaused } = settings.current;
      // Cap elapsed time so a backgrounded tab doesn't come back to a huge step.
      const elapsed = last == null ? 0 : Math.min(now - last, 50) / 1000;
      last = now;

      if (s.accelStale) {
        computeAccelerations(s.bodies, g, eps2);
        s.accelStale = false;
      }
      if (s.baseline == null) s.baseline = totalEnergy(s.bodies, g, eps2);

      let steps = s.pendingSteps;
      s.pendingSteps = 0;
      if (!isPaused) {
        pendingTime += elapsed * SIM_RATE * ts;
        const due = Math.floor(pendingTime / STEP);
        pendingTime -= due * STEP;
        steps += Math.min(due, MAX_STEPS_PER_FRAME);
      }
      for (let i = 0; i < steps; ++i) leapfrogStep(s.bodies, STEP, g, eps2);

      draw(ctx, s.bodies, s.drag, showTrails);

      if (++frameCount % STATS_EVERY === 0) {
        const energy = totalEnergy(s.bodies, g, eps2);
        const drift = s.baseline ? (energy - s.baseline) / Math.abs(s.baseline) : 0;
        setStats({ count: s.bodies.length, energy, drift });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Canvas pixels to world coordinates, allowing for CSS scaling of the canvas.
  const toWorld = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * SIZE,
      y: (0.5 - (event.clientY - rect.top) / rect.height) * SIZE,
    };
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = toWorld(event);
    sim.current.drag = { x0: x, y0: y, x1: x, y1: y };
  };
  const onPointerMove = (event) => {
    const drag = sim.current.drag;
    if (!drag) return;
    const { x, y } = toWorld(event);
    drag.x1 = x;
    drag.y1 = y;
  };
  const onPointerUp = () => {
    const s = sim.current;
    if (!s.drag) return;
    const { x0, y0, x1, y1 } = s.drag;
    s.bodies.push(body(x0, y0, (x1 - x0) * FLING_SCALE, (y1 - y0) * FLING_SCALE, NEW_BODY_MASS));
    s.drag = null;
    s.accelStale = true;
    s.baseline = null;
  };

  const choosePreset = (key) => {
    setPreset(key);
    setSoftening(PRESETS[key].softening);
  };

  const { fixedCount } = PRESETS[preset];

  return (
    <div className="max-w-[500px] space-y-4 text-gray-300">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        aria-label="N-body simulation. Click to add a body, or drag to launch one."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (sim.current.drag = null)}
        className="block h-auto w-full cursor-crosshair touch-none border border-gray-700 bg-black"
      />
      <p className="text-xs text-gray-400">Click to drop a body; drag to launch it in that direction.</p>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPaused((p) => !p)} className={\`\${buttonClass} w-20\`}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => (sim.current.pendingSteps += STEPS_PER_CLICK)}
          disabled={!paused}
          className={\`\${buttonClass} disabled:opacity-40\`}
        >
          Step
        </button>
        <button onClick={() => setRun((n) => n + 1)} className={buttonClass}>
          Restart
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} className="accent-gray-300" />
          Trails
        </label>
      </div>

      <div className="text-sm tabular-nums text-gray-400" aria-live="off">
        {stats.count} bodies · energy {stats.energy.toFixed(1)} · drift {(stats.drift * 100).toFixed(3)}%
      </div>

      <label className="block text-sm">
        Preset
        <select
          value={preset}
          onChange={(e) => choosePreset(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 p-1 text-gray-200"
        >
          {Object.entries(PRESETS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-gray-400">{PRESETS[preset].hint}</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Slider
          label="Bodies"
          value={fixedCount ?? count}
          min={3}
          max={300}
          step={1}
          onChange={setCount}
          disabled={fixedCount != null}
        />
        <Slider label="Gravity (G)" value={G} min={0.1} max={5} step={0.1} onChange={setG} format={(v) => v.toFixed(1)} />
        <Slider
          label="Softening (ε)"
          value={softening}
          min={0.1}
          max={20}
          step={0.1}
          onChange={setSoftening}
          format={(v) => v.toFixed(1)}
        />
        <Slider
          label="Timescale"
          value={timescale}
          min={0.1}
          max={4}
          step={0.1}
          onChange={setTimescale}
          format={(v) => \`\${v.toFixed(1)}×\`}
        />
      </div>
    </div>
  );
}
`;export{e as default};