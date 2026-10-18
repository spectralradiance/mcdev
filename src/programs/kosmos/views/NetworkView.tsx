import { useMemo, useState, type PointerEvent } from 'react';
import { EState, NET_ALGORITHMS, NOp, NState, makeNetwork, runNetwork, type NetPlayer, type Network } from '../network';
import { newSeed } from '../random';
import { sound, type Note } from '../sound';
import { AlgorithmCard, Button, COLORS, Field, Legend, Range, Select, Stat, Transport, decay, useCanvas, usePlayback } from '../ui';
import { useParam } from '../params';

const PALETTE = ['#f87171', '#60a5fa', '#4ade80', '#facc15', '#c084fc', '#fb923c', '#2dd4bf', '#f472b6'];
const EDGE_COLOUR: Record<number, string> = {
  [EState.None]: '#374151',
  [EState.Active]: COLORS.compare,
  [EState.Tree]: '#38bdf8',
  [EState.Rejected]: '#1f2937',
  [EState.Path]: '#fde047',
};

export default function NetworkView() {
  const [algoId, setAlgoId] = useParam('graph', 'dijkstra');
  const [count, setCount] = useParam('nodes', 40, Number);
  const [seed, setSeed] = useState(newSeed);
  const alg = NET_ALGORITHMS.find((a) => a.id === algoId) ?? NET_ALGORITHMS[0];
  const base = useMemo(() => makeNetwork(count, seed), [count, seed]);
  const [ends, setEnds] = useState<{ key: Network; start: number; end: number } | null>(null);
  const net = useMemo(() => (ends?.key === base ? { ...base, start: ends.start, end: ends.end } : base), [base, ends]);

  const player = useMemo(() => runNetwork(net, alg), [net, alg]);
  const players = useMemo(() => [player], [player]);
  // Largest value any node takes, for colour gradients.
  const maxValue = useMemo(() => {
    let m = 1;
    const d = player.log.data;
    for (let k = 0; k < player.log.length; k++) if (d[k * 5] === NOp.Node) m = Math.max(m, d[k * 5 + 3]);
    return m;
  }, [player]);

  const { wrap, canvas, size: cs, context } = useCanvas(0.6, 600);
  const view = () => {
    const s = Math.min(cs.w / net.width, cs.h / net.height);
    return { s, ox: (cs.w - s * net.width) / 2, oy: (cs.h - s * net.height) / 2 };
  };

  const pb = usePlayback({
    players,
    duration: 12,
    keys: true,
    onFinish: () => sound.chord([0.5, 0.63, 0.75, 1], 0.07),
    frame: (dt) => {
      const notes: Note[] = [];
      for (const t of player.touched) {
        if (t.kind === 'node') {
          const p = net.nodes[t.i];
          if (t.state === NState.Visited || t.state === NState.Final) notes.push({ t: 1 - p.y / net.height, pan: (p.x / net.width) * 1.6 - 0.8 });
        } else {
          const e = net.edges[t.i], a = net.nodes[e.a], b = net.nodes[e.b];
          const y = (a.y + b.y) / 2, x = (a.x + b.x) / 2;
          if (t.state === EState.Tree) notes.push({ t: 1 - y / net.height, pan: (x / net.width) * 1.6 - 0.8, gain: 0.6, wave: 'sine' });
          else if (t.state === EState.Path) notes.push({ t: 0.4 + 0.6 * (x / net.width), wave: 'sine', length: 0.2 });
          else if (t.state === EState.Rejected) notes.push({ t: 0.05, gain: 0.35, length: 0.04, wave: 'square' });
        }
      }
      player.touched.length = 0;
      sound.play(notes, 3);
      decay(player.nodeHeat, dt, 0.25);
      decay(player.edgeHeat, dt, 0.25);
      const ctx = context();
      if (ctx) draw(ctx, cs.w, cs.h, net, player, view(), maxValue, alg.directed ?? false, alg.usesEnd ?? false);
    },
  });

  const pick = (e: PointerEvent<HTMLCanvasElement>) => {
    sound.unlock();
    const r = e.currentTarget.getBoundingClientRect();
    const { s, ox, oy } = view();
    const x = (e.clientX - r.left - ox) / s, y = (e.clientY - r.top - oy) / s;
    let best = -1, bd = 16;
    net.nodes.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    pb.pause();
    const toEnd = e.button === 2 || e.shiftKey;
    if (toEnd && best !== net.start) setEnds({ key: base, start: net.start, end: best });
    else if (!toEnd && best !== net.end) setEnds({ key: base, start: best, end: net.end });
  };

  const settled = player.ns.reduce((n, s) => n + (s === NState.Visited || s === NState.Final ? 1 : 0), 0);
  const tree = player.es.reduce((n, s) => n + (s === EState.Tree || s === EState.Path ? 1 : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Algorithm">
          <Select value={alg.id} onChange={setAlgoId} groups options={NET_ALGORITHMS.map((a) => ({ id: a.id, name: a.name, group: a.group }))} />
        </Field>
        <Field label="Nodes"><Range value={count} min={8} max={150} step={1} onChange={setCount} /></Field>
        <Button onClick={() => { setSeed(newSeed()); setEnds(null); }}>New graph</Button>
      </div>

      <div ref={wrap} className="overflow-hidden rounded-lg border border-line-soft bg-[#030712]">
        <canvas ref={canvas} className="block cursor-pointer" onPointerDown={pick} onContextMenu={(e) => e.preventDefault()} />
      </div>

      <Transport pb={pb} label="steps" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-subtle">
          Click a node to start there{alg.usesEnd ? '; right-click or shift-click to move the goal' : ''}. Pitch follows height, and the sound pans with position.
        </p>
        <Legend items={[
          { color: COLORS.compare, label: 'Examining' },
          { color: '#38bdf8', label: 'Tree / best edge' },
          { color: '#fde047', label: 'Shortest path' },
          { color: '#22c55e', label: 'Start', ring: true },
          ...(alg.usesEnd ? [{ color: '#ef4444', label: 'Goal', ring: true }] : []),
          { color: COLORS.pivot, label: 'Current', ring: true },
        ]} />
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border border-line-soft bg-deep px-4 py-3">
        <Stat label="Nodes" value={net.nodes.length} />
        <Stat label="Edges" value={net.edges.length} />
        <Stat label="Reached" value={settled} color="#38bdf8" />
        <Stat label="Tree edges" value={tree} color="#38bdf8" />
        {player.finished && <p className="self-center text-sm text-soft">{player.result.summary}</p>}
      </div>

      <AlgorithmCard name={alg.name} tag={alg.group} about={alg.about} facts={[]} />
    </div>
  );
}

function nodeColour(p: NetPlayer, i: number, max: number) {
  const v = p.nv[i];
  switch (p.valueKind) {
    case 'colour': return PALETTE[v % PALETTE.length];
    case 'component': return `hsl(${(v * 137.508) % 360}, 75%, 58%)`;
    case 'distance': case 'order': return `hsl(${195 + 120 * Math.min(1, v / max)}, 75%, 58%)`;
    default: return '#38bdf8';
  }
}

function draw(
  ctx: CanvasRenderingContext2D, w: number, h: number, net: Network, p: NetPlayer,
  v: { s: number; ox: number; oy: number }, max: number, directed: boolean, usesEnd: boolean,
) {
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  const X = (x: number) => v.ox + x * v.s, Y = (y: number) => v.oy + y * v.s;
  const r = Math.max(4, Math.min(13, (v.s * 34) / Math.sqrt(net.nodes.length)));
  const labels = r >= 9;

  // Edges: dim first, then the interesting ones on top.
  for (const pass of [0, 1]) {
    net.edges.forEach((e, k) => {
      const s = p.es[k];
      const hot = p.edgeHeat[k];
      if ((s === EState.None || s === EState.Rejected) !== (pass === 0) && hot < 0.05) return;
      ctx.strokeStyle = hot > 0.4 ? COLORS.compare : EDGE_COLOUR[s];
      ctx.lineWidth = s === EState.Path ? 4 : s === EState.Tree ? 2.5 : 1 + hot * 2;
      ctx.setLineDash(s === EState.Rejected ? [3, 4] : []);
      const a = net.nodes[e.a], b = net.nodes[e.b];
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
      if (directed) {
        const [from, to] = a.x < b.x ? [a, b] : [b, a];
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const tx = X(to.x) - Math.cos(ang) * (r + 2), ty = Y(to.y) - Math.sin(ang) * (r + 2);
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - Math.cos(ang - 0.4) * 8, ty - Math.sin(ang - 0.4) * 8);
        ctx.lineTo(tx - Math.cos(ang + 0.4) * 8, ty - Math.sin(ang + 0.4) * 8);
        ctx.closePath();
        ctx.fill();
      }
    });
  }
  ctx.setLineDash([]);

  // Edge weights when there's room.
  if (net.nodes.length <= 32 && p.valueKind !== 'colour' && p.valueKind !== 'order') {
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of net.edges) {
      const a = net.nodes[e.a], b = net.nodes[e.b];
      const mx = X((a.x + b.x) / 2), my = Y((a.y + b.y) / 2);
      ctx.fillStyle = '#030712';
      ctx.fillRect(mx - 8, my - 6, 16, 12);
      ctx.fillStyle = '#6b7280';
      ctx.fillText(String(e.w), mx, my);
    }
  }

  net.nodes.forEach((n, i) => {
    const s = p.ns[i], x = X(n.x), y = Y(n.y);
    const hot = p.nodeHeat[i];
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + hot * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = s === NState.None ? '#111827' : s === NState.Frontier ? '#422006' : nodeColour(p, i, max);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = s === NState.Frontier ? COLORS.compare : s === NState.Final ? '#f9fafb' : s === NState.None ? '#4b5563' : 'transparent';
    ctx.stroke();
    if (labels && s !== NState.None && p.nv[i] >= 0 && p.valueKind !== 'component' && p.valueKind !== 'none') {
      ctx.fillStyle = s === NState.Frontier ? COLORS.compare : '#030712';
      ctx.font = `600 ${Math.round(r * 0.85)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.valueKind === 'colour' ? p.nv[i] + 1 : p.nv[i]), x, y + 0.5);
    }
  });

  const ring = (i: number, colour: string, extra: number, width = 2.5) => {
    if (i < 0) return;
    const n = net.nodes[i];
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(X(n.x), Y(n.y), r + extra, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(net.start, '#22c55e', 4);
  if (usesEnd) ring(net.end, '#ef4444', 4);
  ring(p.focus, COLORS.pivot, 7, 2);
}
