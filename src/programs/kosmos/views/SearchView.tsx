import { useMemo, useState, type PointerEvent } from 'react';
import { ARRAY_SEARCHES } from '../searches';
import { makeArray, mulberry32, newSeed } from '../random';
import { record, Op, type ArrayPlayer } from '../trace';
import { drawArray } from '../drawArray';
import { sound } from '../sound';
import { AlgorithmCard, Button, COLORS, Field, Legend, Range, Select, Stat, Transport, decay, useCanvas, usePlayback } from '../ui';
import { arrayNotes, describeOp } from './SortView';
import { useParam } from '../params';

type Spread = 'even' | 'skewed' | 'clustered';
const SPREADS: { id: Spread; name: string }[] = [
  { id: 'even', name: 'Evenly spread' },
  { id: 'skewed', name: 'Skewed (squares)' },
  { id: 'clustered', name: 'Clustered' },
];

/** Sorted (or shuffled, for linear search) distinct values with the chosen spread. */
function makeData(n: number, spread: Spread, sorted: boolean, seed: number) {
  const rand = mulberry32(seed);
  let values: number[];
  if (spread === 'even') values = Array.from({ length: n }, (_, i) => (i + 1) * 3 - Math.floor(rand() * 3));
  else if (spread === 'skewed') values = Array.from({ length: n }, (_, i) => Math.round(((i + 1) / n) ** 3 * n * 3) + i);
  else {
    values = [];
    let v = 0;
    for (let i = 0; i < n; i++) { v += rand() < 0.1 ? 1 + Math.floor(rand() * n * 0.5) : 1; values.push(v); }
  }
  values.sort((a, b) => a - b);
  return sorted ? values : makeArray(n, 'random', seed).map((k) => values[k - 1]);
}

const probes = (p: ArrayPlayer) => {
  let count = 0;
  const d = p.log.data;
  for (let k = 0; k < p.log.length; k++) if (d[k * 5] === Op.CompareValue) count++;
  return count;
};

export default function SearchView() {
  const [algoId, setAlgoId] = useParam('search', 'binary');
  const [n, setN] = useParam('sn', 128, Number);
  const [spread, setSpread] = useParam<Spread>('spread', 'even');
  const [seed, setSeed] = useState(newSeed);
  const algo = ARRAY_SEARCHES.find((a) => a.id === algoId) ?? ARRAY_SEARCHES[1];
  const data = useMemo(() => makeData(n, spread, algo.needsSorted, seed), [n, spread, algo.needsSorted, seed]);
  const max = useMemo(() => Math.max(...data), [data]);
  const [targetPick, setTargetPick] = useState<{ seed: number; value: number | null }>({ seed: 0, value: null });
  const target = targetPick.value ?? data[Math.floor(mulberry32(seed + targetPick.seed)() * data.length)];

  const { player } = useMemo(() => record(data, algo.run, { target }), [data, algo, target]);
  const players = useMemo(() => [player], [player]);
  const { wrap, canvas, size: cs, context } = useCanvas(0.42, 460);

  const pb = usePlayback({
    players,
    duration: Math.max(3, Math.min(12, player.length / 4)),
    keys: true,
    onFinish: () => {
      if (player.found >= 0) sound.chord([0.5, 0.63, 0.75, 1], 0.06);
      else sound.chord([0.4, 0.3, 0.2], 0.09, 'triangle');
    },
    frame: (dt) => {
      sound.play(arrayNotes(player, max), 3);
      decay(player.heat, dt, 0.25);
      const ctx = context();
      if (ctx) drawArray(ctx, player, cs.w, cs.h, { style: 'bars', sweep: -1, target, max, showRange: true });
    },
  });

  // How many probes every algorithm needs for this exact array and target.
  const table = useMemo(() => ARRAY_SEARCHES.map((a) => {
    const sortedData = a.needsSorted && !algo.needsSorted ? data.slice().sort((x, y) => x - y) : data;
    const { player: p } = record(sortedData, a.run, { target });
    return { a, probes: probes(p) };
  }), [data, target, algo.needsSorted]);
  const best = Math.min(...table.map((t) => t.probes));

  const pickTarget = (e: PointerEvent<HTMLCanvasElement>) => {
    sound.unlock();
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * data.length);
    if (i >= 0 && i < data.length) { pb.pause(); setTargetPick({ seed: 0, value: data[i] }); }
  };

  const found = pb.length && pb.pos >= pb.length ? (player.found >= 0 ? `found at [${player.found}]` : 'not present') : 'searching';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Algorithm">
          <Select value={algo.id} onChange={setAlgoId} options={ARRAY_SEARCHES} />
        </Field>
        <Field label="Values"><Range value={n} min={8} max={1024} step={8} onChange={setN} /></Field>
        <Field label="Spread"><Select value={spread} onChange={setSpread} options={SPREADS} /></Field>
        <Button onClick={() => setTargetPick((t) => ({ seed: t.seed + 1, value: null }))}>Random target</Button>
        <Button onClick={() => setTargetPick({ seed: 0, value: max + 1 })} title="Search for a value that isn't there">Missing target</Button>
        <Button onClick={() => { setSeed(newSeed()); setTargetPick({ seed: 0, value: null }); }}>New data</Button>
      </div>

      <div ref={wrap} className="overflow-hidden rounded-lg border border-line-soft">
        <canvas ref={canvas} className="block cursor-crosshair" onPointerDown={pickTarget} title="Click a bar to search for its value" />
      </div>

      <Transport pb={pb} label="ops" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted">{describeOp(player, true)}</p>
        <Legend items={[
          { color: COLORS.compare, label: 'Probe' },
          { color: COLORS.read, label: 'Read' },
          { color: COLORS.pivot, label: 'Next probe' },
          { color: COLORS.found, label: 'Found' },
          { color: '#9ca3af', label: 'Target (dashed line)' },
        ]} />
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border border-line-soft bg-deep px-4 py-3">
        <Stat label="Target" value={target} />
        <Stat label="Probes" value={player.stats.compares} color={COLORS.compare} />
        <Stat label="Range left" value={player.finished ? '—' : Math.max(0, player.hi - player.lo + 1)} />
        <Stat label="Result" value={found} color={player.found >= 0 && player.finished ? COLORS.found : undefined} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <AlgorithmCard
          name={algo.name}
          tag={algo.needsSorted ? 'Needs sorted input' : 'Any order'}
          about={algo.about}
          facts={[['average', `O(${algo.average})`], ['worst', `O(${algo.worst})`]]}
        />
        <section className="rounded-lg border border-line-soft bg-deep p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-subtle">Probes for this target</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {table.map(({ a, probes }) => (
              <li key={a.id} className="flex justify-between gap-2">
                <button type="button" className={'text-left hover:text-white ' + (a.id === algo.id ? 'text-white' : 'text-muted')} onClick={() => setAlgoId(a.id)}>{a.name}</button>
                <span className={'tabular-nums ' + (probes === best ? 'text-emerald-400' : 'text-soft')}>{probes}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
