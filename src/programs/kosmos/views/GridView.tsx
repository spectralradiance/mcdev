import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Cell, CellState, GOp, MAZES, PATHFINDERS, WEIGHT_COST, findPath, generateMaze, makeGrid, type Grid, type GridPlayer } from '../grid';
import { newSeed } from '../random';
import { sound, type Note } from '../sound';
import { AlgorithmCard, Button, COLORS, Field, Legend, Select, Stat, Transport, decay, useCanvas, usePlayback } from '../ui';
import { useParam } from '../params';

const SIZES = [
  { id: 's', name: 'Small (21 × 13)', w: 21, h: 13 },
  { id: 'm', name: 'Medium (41 × 25)', w: 41, h: 25 },
  { id: 'l', name: 'Large (61 × 37)', w: 61, h: 37 },
  { id: 'xl', name: 'Huge (101 × 61)', w: 101, h: 61 },
];

type Tool = 'wall' | 'weight' | 'erase';
type Drag = { kind: 'start' | 'end' } | { kind: 'paint'; value: Cell; last: number } | null;

const visitedColour = (t: number, b: boolean) => (b ? `hsl(${14 + 26 * t}, 80%, ${34 + 10 * t}%)` : `hsl(${225 + 90 * t}, 70%, ${36 + 10 * t}%)`);
const FRONTIER = '#2dd4bf', FRONTIER_B = '#fb923c', PATH = '#fde047';

export default function GridView() {
  const [sizeId, setSizeId] = useParam('grid', 'm');
  const [pfId, setPfId] = useParam('path', 'astar');
  const [mazeId, setMazeId] = useParam('maze', 'backtracker');
  const [tool, setTool] = useState<Tool>('wall');
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[1];
  const pf = PATHFINDERS.find((p) => p.id === pfId) ?? PATHFINDERS[0];
  const maze = MAZES.find((m) => m.id === mazeId) ?? MAZES[0];

  const [grid, setGrid] = useState<Grid>(() => makeGrid(size.w, size.h));
  const [run, setRun] = useState<{ player: GridPlayer; kind: 'maze' | 'path'; auto: boolean } | null>(null);
  const players = useMemo(() => (run ? [run.player] : []), [run]);
  const drag = useRef<Drag>(null);
  // Pointer events can outrun re-renders mid-stroke, so handlers read and write the grid through a ref.
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => { setGrid(makeGrid(size.w, size.h)); setRun(null); }, [size.w, size.h]);

  const { wrap, canvas, size: cs, context } = useCanvas(size.h / size.w, 640);
  const geom = () => {
    const c = Math.min(cs.w / grid.w, cs.h / grid.h);
    return { c, ox: (cs.w - c * grid.w) / 2, oy: (cs.h - c * grid.h) / 2 };
  };

  const pb = usePlayback({
    players,
    duration: run?.kind === 'maze' ? 6 : 8,
    keys: true,
    onFinish: () => {
      if (run?.kind === 'path') {
        if (run.player.result?.found) sound.chord([0.5, 0.63, 0.75, 1], 0.07);
        else sound.chord([0.3, 0.22, 0.15], 0.12, 'triangle');
      }
    },
    frame: (dt) => {
      const p = run?.player;
      if (p) {
        const notes: Note[] = [];
        const len = Math.max(1, p.result?.length ?? 1);
        for (const t of p.touched) {
          const x = t.i % grid.w, y = (t.i / grid.w) | 0;
          const pan = (x / grid.w) * 1.6 - 0.8;
          if (t.op === GOp.Cell) notes.push({ t: 0.85 - 0.6 * (y / grid.h), pan, gain: 0.5, length: 0.05 });
          else if (t.op === GOp.State) {
            if (t.state === CellState.Visited || t.state === CellState.VisitedB) notes.push({ t: p.dist[t.i] / p.maxDist, pan });
            else if (t.state === CellState.Path) notes.push({ t: 0.3 + 0.7 * (p.dist[t.i] / len), pan, wave: 'sine', length: 0.18 });
          }
        }
        p.touched.length = 0;
        sound.play(notes, 3);
        decay(p.heat, dt, 0.2);
      }
      const ctx = context();
      if (ctx) draw(ctx, cs.w, cs.h, grid, run, geom());
    },
  });

  // Start playing a freshly made run once the playback hook has it.
  useEffect(() => { if (run?.auto) pb.play(); }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const solve = (g = grid, instant = false) => {
    const player = findPath(g, pf);
    if (instant) player.seek(player.length);
    setRun({ player, kind: 'path', auto: !instant });
  };

  /** After an edit: re-solve instantly if a finished search is on screen, else drop the run. */
  const edited = (g: Grid) => {
    gridRef.current = g;
    setGrid(g);
    if (run?.kind === 'path' && run.player.finished) solve(g, true);
    else if (run) setRun(null);
  };

  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { c, ox, oy } = geom();
    const x = Math.floor((e.clientX - r.left - ox) / c), y = Math.floor((e.clientY - r.top - oy) / c);
    return x >= 0 && y >= 0 && x < grid.w && y < grid.h ? y * grid.w + x : -1;
  };

  const paint = (from: number, to: number, value: Cell, g: Grid) => {
    // Bresenham between pointer samples so fast strokes leave no gaps.
    const cells = g.cells.slice();
    let x0 = from % g.w, y0 = (from / g.w) | 0;
    const x1 = to % g.w, y1 = (to / g.w) | 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const i = y0 * g.w + x0;
      if (i !== g.start && i !== g.end) cells[i] = value;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return { ...g, cells };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    sound.unlock();
    const grid = gridRef.current;
    const i = cellAt(e);
    if (i < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (run?.kind === 'maze' && !run.player.finished) { pb.pause(); run.player.seek(run.player.length); }
    if (i === grid.start) { drag.current = { kind: 'start' }; return; }
    if (i === grid.end) { drag.current = { kind: 'end' }; return; }
    const want = tool === 'wall' ? Cell.Wall : tool === 'weight' ? Cell.Weight : Cell.Empty;
    // Pressing on a cell that already has the tool's value erases instead; right button always erases.
    const value = e.button === 2 || grid.cells[i] === want ? Cell.Empty : want;
    drag.current = { kind: 'paint', value, last: i };
    edited(paint(i, i, value, grid));
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const grid = gridRef.current;
    const i = cellAt(e);
    if (i < 0) return;
    if (d.kind === 'paint') {
      if (i === d.last) return;
      edited(paint(d.last, i, d.value, grid));
      d.last = i;
    } else {
      if (grid.cells[i] === Cell.Wall || i === (d.kind === 'start' ? grid.end : grid.start)) return;
      if (i === (d.kind === 'start' ? grid.start : grid.end)) return;
      edited({ ...grid, [d.kind]: i });
    }
  };

  const generate = () => {
    pb.pause();
    const { player, final } = generateMaze(grid, maze, newSeed());
    setGrid(final);
    setRun({ player, kind: 'maze', auto: true });
  };

  const clear = (what: 'path' | 'walls' | 'weights') => {
    pb.pause();
    if (what === 'path') { setRun(null); return; }
    const cells = grid.cells.map((c) => (what === 'walls' || c === Cell.Weight ? Cell.Empty : c));
    edited({ ...grid, cells });
  };

  const p = run?.player;
  const result = run?.kind === 'path' && p?.finished ? p.result : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Pathfinder"><Select value={pf.id} onChange={setPfId} options={PATHFINDERS} /></Field>
        <Button primary onClick={() => { pb.pause(); solve(); }}>Find path</Button>
        <Field label="Maze"><Select value={maze.id} onChange={setMazeId} options={MAZES} /></Field>
        <Button onClick={generate}>Generate</Button>
        <Field label="Grid"><Select value={size.id} onChange={setSizeId} options={SIZES} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500">Draw</span>
        <Button active={tool === 'wall'} onClick={() => setTool('wall')}>Walls</Button>
        <Button active={tool === 'weight'} onClick={() => setTool('weight')}>Weights ×{WEIGHT_COST}</Button>
        <Button active={tool === 'erase'} onClick={() => setTool('erase')}>Erase</Button>
        <span className="mx-2 h-5 w-px bg-gray-800" />
        <Button onClick={() => clear('path')}>Clear search</Button>
        <Button onClick={() => clear('weights')}>Clear weights</Button>
        <Button onClick={() => clear('walls')}>Clear all</Button>
      </div>

      <div ref={wrap} className="overflow-hidden rounded-lg border border-gray-800 bg-[#030712]">
        <canvas
          ref={canvas}
          className="block touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <Transport pb={pb} label="steps" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Drag the green start or red goal. Click or drag to draw; right-drag erases. After a search finishes, edits re-solve instantly.</p>
        <Legend items={[
          { color: FRONTIER, label: 'Frontier' },
          { color: visitedColour(0.2, false), label: 'Visited (near)' },
          { color: visitedColour(1, false), label: 'Visited (far)' },
          { color: visitedColour(0.6, true), label: 'Visited from goal' },
          { color: PATH, label: 'Path' },
          { color: '#92400e', label: 'Weight' },
        ]} />
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
        <Stat label="Visited" value={run?.kind === 'path' ? p!.stats.visited : '—'} color={visitedColour(0.7, false)} />
        <Stat label="Frontier" value={run?.kind === 'path' ? p!.stats.frontier : '—'} color={FRONTIER} />
        <Stat label="Path length" value={result ? (result.found ? result.length : 'none') : '—'} color={PATH} />
        <Stat label="Path cost" value={result?.found ? result.cost : '—'} />
        <Stat label="Shortest?" value={pf.shortest ? (pf.weighted ? 'cheapest' : 'fewest steps') : 'no guarantee'} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AlgorithmCard name={pf.name} tag="Pathfinder" about={pf.about} facts={[['weights', pf.weighted ? 'yes' : 'ignored'], ['optimal', pf.shortest ? 'yes' : 'no']]} />
        <AlgorithmCard name={maze.name} tag="Maze generator" about={maze.about} facts={[]} />
      </div>
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D, w: number, h: number, grid: Grid,
  run: { player: GridPlayer; kind: 'maze' | 'path' } | null, g: { c: number; ox: number; oy: number },
) {
  const { c, ox, oy } = g;
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  const p = run?.player;
  const cells = run?.kind === 'maze' && p ? p.cells : grid.cells;
  const showState = !!p;
  const gap = c >= 8 ? 1 : 0;

  for (let i = 0; i < cells.length; i++) {
    const x = ox + (i % grid.w) * c, y = oy + ((i / grid.w) | 0) * c;
    const cell = cells[i];
    let fill = '#0b1120';
    if (cell === Cell.Wall) fill = '#d1d5db';
    else {
      if (cell === Cell.Weight) fill = '#5b2a0a';
      if (showState) {
        const s = p!.state[i];
        const t = Math.min(1, p!.dist[i] / p!.maxDist);
        if (s === CellState.Path) fill = PATH;
        else if (s === CellState.Visited) fill = visitedColour(t, false);
        else if (s === CellState.VisitedB) fill = visitedColour(t, true);
        else if (s === CellState.Frontier || s === CellState.FrontierB) fill = s === CellState.Frontier ? FRONTIER : FRONTIER_B;
      }
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, c - (cell === Cell.Wall ? 0 : gap), c - (cell === Cell.Wall ? 0 : gap));
    if (cell === Cell.Weight && c >= 8) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(x + c / 2, y + c / 2, c * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    const heat = p ? p.heat[i] : 0;
    if (heat > 0.02) {
      ctx.globalAlpha = heat * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, c, c);
      ctx.globalAlpha = 1;
    }
  }

  if (p && p.cursor >= 0) {
    const x = ox + (p.cursor % grid.w) * c, y = oy + ((p.cursor / grid.w) | 0) * c;
    ctx.strokeStyle = COLORS.pivot;
    ctx.lineWidth = Math.max(1.5, c * 0.15);
    ctx.strokeRect(x + 1, y + 1, c - 2, c - 2);
  }

  const marker = (i: number, colour: string, ring: boolean) => {
    const x = ox + (i % grid.w) * c + c / 2, y = oy + ((i / grid.w) | 0) * c + c / 2;
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, c * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, c * 0.38, 0, Math.PI * 2);
    if (ring) {
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, c * 0.14, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  marker(grid.start, '#22c55e', false);
  marker(grid.end, '#ef4444', true);
}
