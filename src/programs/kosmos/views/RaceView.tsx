import { useMemo, useRef, useState } from 'react';
import { SORTS, sortById } from '../sorts';
import { DISTRIBUTIONS, makeArray, newSeed, type Distribution } from '../random';
import { record, type ArrayPlayer } from '../trace';
import { ARRAY_STYLES, drawArray, type ArrayStyle } from '../drawArray';
import { sound, type Waveform } from '../sound';
import { Button, Field, Legend, Range, Select, Transport, decay, useCanvas, usePlayback } from '../ui';
import { arrayNotes, SORT_LEGEND } from './SortView';
import { useParam } from '../params';

const LANE_WAVES: Waveform[] = ['triangle', 'sine', 'square', 'sawtooth'];
const LANE_PANS = [-0.75, -0.25, 0.25, 0.75];
const ORDINAL = ['1st', '2nd', '3rd', '4th'];

type Slot = { draw?: (p: ArrayPlayer, style: ArrayStyle, max: number) => void };

function Lane({ slot, player, name, place, ops, total }: { slot: Slot; player: ArrayPlayer; name: string; place: number; ops: number; total: number }) {
  const { wrap, canvas, size, context } = useCanvas(0.42, 300);
  slot.draw = (p, style, max) => {
    const ctx = context();
    if (ctx) drawArray(ctx, p, size.w, size.h, { style, sweep: -1, max, showRange: true });
  };
  const finished = player.finished;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{name}</span>
        <span className={'tabular-nums text-xs ' + (finished ? 'text-emerald-400' : 'text-subtle')}>
          {finished ? `${ORDINAL[place]} · ${total.toLocaleString()} ops` : `${ops.toLocaleString()} / ${total.toLocaleString()}`}
        </span>
      </div>
      <div ref={wrap} className={'overflow-hidden rounded-lg border ' + (finished ? 'border-emerald-700' : 'border-line-soft')}>
        <canvas ref={canvas} className="block" onPointerDown={() => sound.unlock()} />
      </div>
    </div>
  );
}

export default function RaceView() {
  const [lanes, setLanes] = useState(['quick-hoare', 'merge', 'heap', 'shell']);
  const [n, setN] = useParam('rn', 192, Number);
  const [dist, setDist] = useParam<Distribution>('rdist', 'random');
  const [style, setStyle] = useParam<ArrayStyle>('rview', 'rainbow');
  const [seed, setSeed] = useState(newSeed);
  const algos = lanes.map(sortById);
  const cap = Math.min(n, ...algos.map((a) => a.maxN));

  const players = useMemo(() => {
    const input = makeArray(cap, dist, seed);
    return algos.map((a) => record(input, a.run).player);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes.join(), cap, dist, seed]);
  const slots = useMemo(() => players.map((): Slot => ({})), [players]);
  // Finishing order is just trace length: every lane runs at the same ops per second.
  const places = useMemo(() => {
    const order = players.map((p, i) => [p.length, i]).sort((a, b) => a[0] - b[0]);
    const out: number[] = [];
    order.forEach(([, i], k) => { out[i] = k; });
    return out;
  }, [players]);

  const wasFinished = useRef<boolean[]>([]);
  const pb = usePlayback({
    players,
    duration: 16,
    keys: true,
    onFinish: () => sound.chord([0.5, 0.75, 1], 0.08),
    frame: (dt) => {
      players.forEach((p, k) => {
        sound.play(arrayNotes(p, cap, { pan: LANE_PANS[k], wave: LANE_WAVES[k] }), 2);
        // A bell as each lane crosses the line, higher for earlier finishers.
        if (p.finished && !wasFinished.current[k] && p.pos > 0) sound.chord([0.95 - 0.15 * places[k]], 0, 'sine');
        wasFinished.current[k] = p.finished;
        decay(p.heat, dt);
        slots[k].draw?.(p, style, cap);
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {lanes.map((id, k) => (
          <Field key={k} label={`Lane ${k + 1}`}>
            <Select
              value={id}
              onChange={(v) => setLanes((ls) => ls.map((x, j) => (j === k ? v : x)))}
              groups
              options={SORTS.filter((s) => s.maxN > 8).map((a) => ({ id: a.id, name: a.name, group: a.family }))}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Input"><Select value={dist} onChange={setDist} options={DISTRIBUTIONS} /></Field>
        <Field label={`Values${cap < n ? ` (capped at ${cap})` : ''}`}><Range value={n} min={16} max={1024} step={16} onChange={setN} /></Field>
        <Field label="Style"><Select value={style} onChange={setStyle} options={ARRAY_STYLES} /></Field>
        <Button onClick={() => setSeed(newSeed())}>Shuffle</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {players.map((p, k) => (
          <Lane key={k} slot={slots[k]} player={p} name={algos[k].name} place={places[k]} ops={Math.min(pb.pos, p.length)} total={p.length} />
        ))}
      </div>

      <Transport pb={pb} label="ops" />
      <Legend items={SORT_LEGEND} />
      <p className="text-sm leading-relaxed text-muted">
        Every lane gets the same input and performs the same number of operations per second, counting each
        comparison, swap, read and write as one. Lanes are panned left to right, each with its own timbre, so
        with headphones you can hear which algorithm is still working.
      </p>
    </div>
  );
}
