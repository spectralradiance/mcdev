import { useMemo, useRef, useState } from 'react';
import { SORTS, sortById } from '../sorts';
import { DISTRIBUTIONS, makeArray, newSeed, type Distribution } from '../random';
import { Hl, Op, record, type ArrayPlayer } from '../trace';
import { ARRAY_STYLES, drawArray, type ArrayStyle } from '../drawArray';
import { sound, type Note, type Waveform } from '../sound';
import { AlgorithmCard, Button, COLORS, Field, Legend, Range, Select, Stat, Transport, decay, useCanvas, usePlayback } from '../ui';
import { useParam } from '../params';

/** Notes for the ops a player performed this frame: pitch from the value, pan from the position. */
export function arrayNotes(p: ArrayPlayer, max: number, opts: { pan?: number; wave?: Waveform } = {}): Note[] {
  const n = p.values.length, notes: Note[] = [];
  for (const { i, kind } of p.touched) {
    if (kind === Hl.Read && p.touched.length > 2) continue; // reads are quiet unless they're all there is
    notes.push({
      t: p.values[i] / max,
      pan: opts.pan ?? (n > 1 ? (i / (n - 1)) * 1.6 - 0.8 : 0),
      wave: opts.wave,
      gain: kind === Hl.Read ? 0.5 : 1,
      detune: kind === Hl.Swap ? 4 : 0,
    });
  }
  p.touched.length = 0;
  return notes;
}

/** The finishing sweep: walks the sorted array in green, ascending in pitch. */
export function useSweep() {
  const sweep = useRef(-1);
  const sweeping = useRef(false);
  return {
    sweep,
    start() { sweep.current = 0; sweeping.current = true; },
    reset() { sweep.current = -1; sweeping.current = false; },
    advance(p: ArrayPlayer, dt: number, max: number, play: boolean) {
      if (!p.finished) { sweep.current = -1; sweeping.current = false; return; }
      if (!sweeping.current) return;
      const n = p.values.length;
      const from = sweep.current;
      sweep.current = Math.min(n - 1, sweep.current + Math.max(1, (n / 1.1) * dt));
      if (play) {
        const notes: Note[] = [];
        for (let i = Math.floor(from); i <= Math.floor(sweep.current); i++) notes.push({ t: p.values[i] / max, pan: (i / n) * 1.6 - 0.8, wave: 'sine', gain: 0.7 });
        sound.play(notes, 2);
      }
      if (sweep.current >= n - 1) sweeping.current = false;
    },
  };
}

export function describeOp(p: ArrayPlayer, search = false): string {
  const op = p.lastOp();
  if (!op) return search ? 'Ready to search.' : 'Ready to sort.';
  const v = (i: number) => p.values[i];
  switch (op.op) {
    case Op.Compare: return `Compare [${op.a}] = ${v(op.a)} with [${op.b}] = ${v(op.b)}`;
    case Op.CompareValue: return `Probe [${op.a}] = ${v(op.a)} against target ${p.target}`;
    case Op.CompareHeld: return `Compare [${op.a}] = ${v(op.a)} with held value ${op.b}`;
    case Op.Swap: return `Swap [${op.a}] and [${op.b}]`;
    case Op.Write: return `Write ${op.b} into [${op.a}]`;
    case Op.Read: return `Read [${op.a}] = ${v(op.a)}`;
    case Op.Pivot: return op.a >= 0 ? `Pivot at [${op.a}] = ${v(op.a)}` : 'Pivot placed';
    case Op.Done: return `[${op.a}] is in its final place`;
    case Op.Range: return `Working on [${op.a} … ${op.b}]`;
    case Op.Found: return op.a >= 0 ? `Found ${p.target} at [${op.a}]` : `${p.target} is not in the array`;
  }
  return '';
}

export const SORT_LEGEND = [
  { color: COLORS.compare, label: 'Compare' },
  { color: COLORS.swap, label: 'Swap' },
  { color: COLORS.write, label: 'Write' },
  { color: COLORS.read, label: 'Read' },
  { color: COLORS.pivot, label: 'Pivot' },
  { color: '#6ee7b7', label: 'In final place' },
];

export default function SortView() {
  const [algoId, setAlgoId] = useParam('sort', 'quick-hoare');
  const [n, setN] = useParam('n', 256, Number);
  const [dist, setDist] = useParam<Distribution>('dist', 'random');
  const [style, setStyle] = useParam<ArrayStyle>('view', 'bars');
  const [seed, setSeed] = useState(newSeed);
  const algo = sortById(algoId);
  const size = Math.min(n, algo.maxN);

  const { player, truncated } = useMemo(() => record(makeArray(size, dist, seed), algo.run), [algo, size, dist, seed]);
  const players = useMemo(() => [player], [player]);
  const { wrap, canvas, size: cs, context } = useCanvas(0.48, 520);
  const sweep = useSweep();

  const pb = usePlayback({
    players,
    duration: 14,
    keys: true,
    onFinish: () => { sweep.start(); sound.chord([0.5, 0.625, 0.75, 1], 0.07); },
    frame: (dt) => {
      sound.play(arrayNotes(player, size));
      sweep.advance(player, dt, size, true);
      decay(player.heat, dt);
      const ctx = context();
      if (ctx) drawArray(ctx, player, cs.w, cs.h, { style, sweep: sweep.sweep.current, max: size, showRange: true });
    },
  });

  const s = player.stats;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Algorithm">
          <Select value={algo.id} onChange={(id) => { setAlgoId(id); sweep.reset(); }} groups options={SORTS.map((a) => ({ id: a.id, name: a.name, group: a.family }))} />
        </Field>
        <Field label="Input">
          <Select value={dist} onChange={(d) => { setDist(d); sweep.reset(); }} options={DISTRIBUTIONS} />
        </Field>
        <Field label={`Values${size < n ? ` (capped at ${algo.maxN})` : ''}`}>
          <Range value={n} min={8} max={2048} step={8} onChange={(v) => { setN(v); sweep.reset(); }} />
        </Field>
        <Field label="Style">
          <Select value={style} onChange={setStyle} options={ARRAY_STYLES} />
        </Field>
        <Button onClick={() => { setSeed(newSeed()); sweep.reset(); }} title="New random input">Shuffle</Button>
      </div>

      <div ref={wrap} className="overflow-hidden rounded-lg border border-line-soft">
        <canvas ref={canvas} className="block" onPointerDown={() => sound.unlock()} />
      </div>

      <Transport pb={pb} label="ops" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted">{describeOp(player)}</p>
        <Legend items={SORT_LEGEND} />
      </div>

      {truncated && <p className="text-sm text-amber-400">The trace hit its length limit and stops before the end.</p>}

      <div className="flex flex-wrap gap-6 rounded-lg border border-line-soft bg-deep px-4 py-3">
        <Stat label="Comparisons" value={s.compares.toLocaleString()} color={COLORS.compare} />
        <Stat label="Swaps" value={s.swaps.toLocaleString()} color={COLORS.swap} />
        <Stat label="Writes" value={s.writes.toLocaleString()} color={COLORS.write} />
        <Stat label="Reads" value={s.reads.toLocaleString()} color={COLORS.read} />
        <Stat label="Values" value={size.toLocaleString()} />
      </div>

      <AlgorithmCard
        name={algo.name}
        tag={algo.family}
        about={algo.about}
        facts={[['best', `O(${algo.best})`], ['average', `O(${algo.average})`], ['worst', `O(${algo.worst})`], ['space', `O(${algo.space})`], ['stable', algo.stable ? 'yes' : 'no']]}
      />
    </div>
  );
}
