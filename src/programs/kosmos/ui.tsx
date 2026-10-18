// Shared controls and the playback loop. All animation state lives in refs; React state is only
// touched for things the controls show (playing, speed, and a throttled position for the scrubber).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type Playable = {
  readonly length: number;
  pos: number;
  readonly finished: boolean;
  forward(): void;
  backward(): void;
  seek(target: number): void;
};

export const COLORS = {
  compare: '#facc15',
  swap: '#f87171',
  write: '#38bdf8',
  read: '#a78bfa',
  pivot: '#f472b6',
  done: '#34d399',
  found: '#4ade80',
  bar: '#d1d5db',
  dim: '#374151',
};

const MIN_SPEED = 0.5, MAX_SPEED = 400_000;
const toSlider = (speed: number) => Math.round((Math.log(speed / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED)) * 1000);
const fromSlider = (v: number) => MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** (v / 1000);
export const speedFor = (length: number, seconds: number) => Math.min(MAX_SPEED, Math.max(1, length / seconds));

export function formatSpeed(speed: number) {
  if (speed >= 10_000) return `${Math.round(speed / 1000)}k ops/s`;
  if (speed >= 1000) return `${(speed / 1000).toFixed(1)}k ops/s`;
  return `${speed < 10 ? speed.toFixed(1) : Math.round(speed)} ops/s`;
}

/**
 * Drives one or more players from a single requestAnimationFrame loop. `frame` runs every frame
 * (playing or not) so views can decay highlights and redraw; `onFinish` fires when the lead player
 * reaches its end while playing.
 */
export function usePlayback(opts: {
  players: Playable[];
  frame: (dt: number, advanced: boolean) => void;
  onFinish?: () => void;
  /** Seconds a fresh trace should take at the automatic speed. */
  duration: number;
  keys?: boolean;
}) {
  const { players, duration } = opts;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(100);
  const [pos, setPos] = useState(0);
  const playingRef = useRef(false);
  const speedRef = useRef(speed);
  const carry = useRef(0);
  const frameRef = useRef(opts.frame);
  const finishRef = useRef(opts.onFinish);
  const playersRef = useRef(players);
  frameRef.current = opts.frame;
  finishRef.current = opts.onFinish;
  playersRef.current = players;
  playingRef.current = playing;
  speedRef.current = speed;

  const lead = players[0] ?? null;
  const length = players.reduce((m, p) => Math.max(m, p.length), 0);

  // New trace: rewind the clock and pick a speed that plays it in about `duration` seconds.
  useEffect(() => {
    carry.current = 0;
    setPos(0);
    if (length) setSpeed(speedFor(length, duration));
  }, [players, length, duration]);

  useEffect(() => {
    let raf = 0, last = performance.now(), lastPos = -1, sinceUi = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let advanced = false;
      const ps = playersRef.current;
      if (playingRef.current && ps.length) {
        carry.current += speedRef.current * dt;
        const steps = Math.floor(carry.current);
        carry.current -= steps;
        for (const p of ps) for (let k = 0; k < steps && !p.finished; k++) { p.forward(); advanced = true; }
        if (ps.every((p) => p.finished)) {
          playingRef.current = false;
          setPlaying(false);
          finishRef.current?.();
        }
      }
      frameRef.current(dt, advanced);
      sinceUi += dt;
      const p = ps.reduce((m, q) => Math.max(m, q.pos), 0);
      if (p !== lastPos && sinceUi > 0.06) { lastPos = p; sinceUi = 0; setPos(p); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sync = () => setPos(playersRef.current.reduce((m, q) => Math.max(m, q.pos), 0));
  const play = useCallback(() => {
    const ps = playersRef.current;
    if (!ps.length) return;
    if (ps.every((p) => p.finished)) for (const p of ps) p.seek(0);
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [play, pause]);
  const step = useCallback((dir: 1 | -1) => {
    setPlaying(false);
    for (const p of playersRef.current) dir > 0 ? p.forward() : p.backward();
    sync();
  }, []);
  const seek = useCallback((target: number) => {
    for (const p of playersRef.current) p.seek(target);
    carry.current = 0;
    sync();
  }, []);

  useEffect(() => {
    if (!opts.keys) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if ((el instanceof Element && el.closest('input, textarea, select, [contenteditable]')) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); setPlaying(false); seek(0); }
      else if (e.key === 'End') { e.preventDefault(); setPlaying(false); seek(Number.MAX_SAFE_INTEGER); }
      else if (e.key === ']') setSpeed((s) => Math.min(MAX_SPEED, s * 1.5));
      else if (e.key === '[') setSpeed((s) => Math.max(MIN_SPEED, s / 1.5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.keys, toggle, step, seek]);

  return { playing, play, pause, toggle, step, seek, speed, setSpeed, pos, length, lead };
}

export type Playback = ReturnType<typeof usePlayback>;

// ─── canvas sizing ───────────────────────────────────────────────────────────

/** A canvas that fills its container's width at device resolution; height = width × aspect, capped. */
export function useCanvas(aspect: number, maxHeight = 560) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 400, dpr: 1 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = Math.min(maxHeight, Math.round(w * aspect));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      setSize((s) => (s.w === w && s.h === h && s.dpr === dpr ? s : { w, h, dpr }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, maxHeight]);
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
  }, [size]);
  /** 2D context scaled to CSS pixels. */
  const context = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    return ctx;
  }, [size]);
  return { wrap, canvas, size, context };
}

// ─── controls ────────────────────────────────────────────────────────────────

const inputClass = 'rounded border border-line bg-panel px-2 py-1 text-sm text-gray-100 focus:border-gray-400 focus:outline-none';

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={'flex flex-col gap-1 ' + className}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-subtle">{label}</span>
      {children}
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options, groups }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; name: string; group?: string }[];
  groups?: boolean;
}) {
  if (groups) {
    const names = [...new Set(options.map((o) => o.group ?? ''))];
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {names.map((g) => (
          <optgroup key={g} label={g}>
            {options.filter((o) => (o.group ?? '') === g).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

export function Range({ value, min, max, step = 1, onChange, format }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" className="w-32 accent-white" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-12 text-right text-xs tabular-nums text-muted">{format ? format(value) : value}</span>
    </div>
  );
}

export function TextInput({ value, onChange, className = '', maxLength }: { value: string; onChange: (v: string) => void; className?: string; maxLength?: number }) {
  return <input className={inputClass + ' font-mono ' + className} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
}

export function Button({ children, onClick, primary, title, disabled, active }: {
  children: ReactNode; onClick: () => void; primary?: boolean; title?: string; disabled?: boolean; active?: boolean;
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const look = primary
    ? 'bg-white text-black hover:bg-gray-200'
    : active
      ? 'border border-gray-300 bg-strong text-white'
      : 'border border-line bg-panel text-soft hover:border-line-strong hover:text-white';
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`${base} ${look}`}>{children}</button>;
}

const Icon = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  play: 'M7 4v16l13-8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  back: 'M18 5v14l-9-7zM6 5h2v14H6z',
  fwd: 'M6 5v14l9-7zM16 5h2v14h-2z',
  start: 'M6 5h2v14H6zM20 5v14l-10-7z',
};

/** Play/pause, step, restart, a scrubber and the speed slider. */
export function Transport({ pb, extra, label }: { pb: Playback; extra?: ReactNode; label?: string }) {
  const done = pb.length > 0 && pb.pos >= pb.length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-soft bg-deep px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Button title="Restart (Home)" onClick={() => { pb.pause(); pb.seek(0); }} disabled={!pb.length}><Icon d={ICONS.start} /></Button>
        <Button title="Step back (←)" onClick={() => pb.step(-1)} disabled={!pb.length || pb.pos === 0}><Icon d={ICONS.back} /></Button>
        <Button primary title={pb.playing ? 'Pause (space)' : 'Play (space)'} onClick={pb.toggle} disabled={!pb.length}>
          <Icon d={pb.playing ? ICONS.pause : ICONS.play} />
          <span className="w-12 text-left">{pb.playing ? 'Pause' : done ? 'Replay' : 'Play'}</span>
        </Button>
        <Button title="Step forward (→)" onClick={() => pb.step(1)} disabled={!pb.length || done}><Icon d={ICONS.fwd} /></Button>
      </div>
      <div className="flex min-w-[12rem] flex-1 items-center gap-2">
        <input
          type="range"
          aria-label="Position"
          className="flex-1 accent-white"
          min={0}
          max={Math.max(1, pb.length)}
          value={pb.pos}
          onChange={(e) => { pb.pause(); pb.seek(Number(e.target.value)); }}
        />
        <span className="w-28 text-right text-xs tabular-nums text-muted">{pb.pos.toLocaleString()} / {pb.length.toLocaleString()}{label ? ` ${label}` : ''}</span>
      </div>
      <div className="flex items-center gap-2" title="Speed ([ and ])">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-subtle">Speed</span>
        <input
          type="range"
          aria-label="Speed"
          className="w-28 accent-white"
          min={0}
          max={1000}
          value={toSlider(pb.speed)}
          onChange={(e) => pb.setSpeed(fromSlider(Number(e.target.value)))}
        />
        <span className="w-20 text-xs tabular-nums text-muted">{formatSpeed(pb.speed)}</span>
      </div>
      {extra}
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-subtle">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; ring?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={it.ring ? { border: `2px solid ${it.color}` } : { background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function AlgorithmCard({ name, tag, about, facts }: { name: string; tag?: string; about: string; facts: [string, string][] }) {
  return (
    <section className="rounded-lg border border-line-soft bg-deep p-4">
      {tag && <p className="text-[11px] font-semibold uppercase tracking-widest text-subtle">{tag}</p>}
      <h3 className="mt-0.5 text-lg font-semibold">{name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-soft">{about}</p>
      {facts.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-2 text-xs">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded border border-line-soft px-2 py-1">
              <dt className="inline text-subtle">{k} </dt>
              <dd className="inline font-mono text-soft">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Exponential decay of highlight heat, frame-rate independent. */
export function decay(heat: Float32Array, dt: number, halfLife = 0.12) {
  const k = Math.pow(0.5, dt / halfLife);
  for (let i = 0; i < heat.length; i++) if (heat[i] > 0.002) heat[i] *= k; else heat[i] = 0;
}

export const hue = (t: number, from = 0, span = 300, s = 85, l = 60) => `hsl(${from + t * span}, ${s}%, ${l}%)`;
