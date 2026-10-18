// Grid mazes and pathfinding, traced like the arrays: generators carve or build walls and
// pathfinders mark cells frontier / visited / path, each op storing what it replaced.

import { OpLog } from './trace';
import { mulberry32, shuffle } from './random';

export enum Cell { Empty = 0, Wall = 1, Weight = 2 }
export const WEIGHT_COST = 5;

export enum CellState { None = 0, Frontier = 1, Visited = 2, Path = 3, VisitedB = 4, FrontierB = 5 }

export enum GOp {
  Cell = 0, // a: index, b: new cell, c: old cell
  State = 1, // a: index, b: new | old << 8, c: new dist, d: old dist
  Cursor = 2, // a: new cursor, b: old cursor
}

export type Grid = { w: number; h: number; cells: Uint8Array; start: number; end: number };

export const makeGrid = (w: number, h: number): Grid => ({
  w, h, cells: new Uint8Array(w * h),
  start: (h >> 1) * w + Math.min(w - 1, Math.floor(w / 5)) ,
  end: (h >> 1) * w + Math.max(0, w - 1 - Math.floor(w / 5)),
});

export const cloneGrid = (g: Grid): Grid => ({ ...g, cells: g.cells.slice() });

/** Snap start and end to odd coordinates (maze rooms) and clear them. */
export function placeEndpointsForMaze(g: Grid) {
  g.start = 1 * g.w + 1;
  g.end = (g.h - 2 - ((g.h - 2) % 2 === 0 ? 1 : 0)) * g.w + (g.w - 2 - ((g.w - 2) % 2 === 0 ? 1 : 0));
}

class GridRecorder {
  log = new OpLog();
  cells: Uint8Array;
  state: Uint8Array;
  dist: Int32Array;
  cursor = -1;
  constructor(readonly g: Grid, readonly limit = 3_000_000) {
    this.cells = g.cells.slice();
    this.state = new Uint8Array(g.cells.length);
    this.dist = new Int32Array(g.cells.length);
  }
  private push(op: number, a: number, b = 0, c = 0, d = 0) {
    if (this.log.length < this.limit) this.log.push(op, a, b, c, d);
  }
  setCell(i: number, v: Cell) {
    if (this.cells[i] === v) return;
    this.push(GOp.Cell, i, v, this.cells[i]);
    this.cells[i] = v;
  }
  mark(i: number, s: CellState, dist = this.dist[i]) {
    if (this.state[i] === s && this.dist[i] === dist) return;
    this.push(GOp.State, i, s | (this.state[i] << 8), dist, this.dist[i]);
    this.state[i] = s;
    this.dist[i] = dist;
  }
  move(i: number) {
    if (i === this.cursor) return;
    this.push(GOp.Cursor, i, this.cursor);
    this.cursor = i;
  }
}

export class GridPlayer {
  readonly cells: Uint8Array;
  readonly state: Uint8Array;
  readonly dist: Int32Array;
  readonly heat: Float32Array;
  cursor = -1;
  pos = 0;
  maxDist = 1;
  stats = { visited: 0, frontier: 0, path: 0, carved: 0 };
  touched: { i: number; op: GOp; state: number }[] = [];

  constructor(readonly grid: Grid, readonly log: OpLog, readonly result: SearchResult | null) {
    this.cells = grid.cells.slice();
    this.state = new Uint8Array(grid.cells.length);
    this.dist = new Int32Array(grid.cells.length);
    this.heat = new Float32Array(grid.cells.length);
    const d = log.data;
    for (let k = 0; k < log.length; k++) if (d[k * 5] === GOp.State) this.maxDist = Math.max(this.maxDist, d[k * 5 + 3]);
  }

  get length() { return this.log.length; }
  get finished() { return this.pos >= this.log.length; }

  private count(s: number, delta: number) {
    if (s === CellState.Visited || s === CellState.VisitedB) this.stats.visited += delta;
    else if (s === CellState.Frontier || s === CellState.FrontierB) this.stats.frontier += delta;
    else if (s === CellState.Path) this.stats.path += delta;
  }

  forward(quiet = false) {
    if (this.pos >= this.log.length) return;
    const d = this.log.data, o = this.pos * 5, i = d[o + 1];
    switch (d[o]) {
      case GOp.Cell:
        this.cells[i] = d[o + 2];
        this.stats.carved += d[o + 2] === Cell.Empty ? 1 : -1;
        break;
      case GOp.State: {
        const s = d[o + 2] & 255;
        this.count(this.state[i], -1); this.count(s, 1);
        this.state[i] = s; this.dist[i] = d[o + 3];
        break;
      }
      case GOp.Cursor: this.cursor = i; break;
    }
    if (!quiet) { this.heat[i] = 1; this.touched.push({ i, op: d[o], state: d[o] === GOp.State ? d[o + 2] & 255 : d[o + 2] }); }
    this.pos++;
  }

  backward() {
    if (this.pos <= 0) return;
    this.pos--;
    const d = this.log.data, o = this.pos * 5, i = d[o + 1];
    switch (d[o]) {
      case GOp.Cell:
        this.cells[i] = d[o + 3];
        this.stats.carved -= d[o + 2] === Cell.Empty ? 1 : -1;
        break;
      case GOp.State: {
        const old = d[o + 2] >> 8;
        this.count(this.state[i], -1); this.count(old, 1);
        this.state[i] = old; this.dist[i] = d[o + 4];
        break;
      }
      case GOp.Cursor: this.cursor = d[o + 2]; break;
    }
    this.heat[i] = 1;
    this.touched.push({ i, op: d[o], state: d[o] === GOp.State ? d[o + 2] >> 8 : d[o + 3] });
  }

  seek(target: number) {
    target = Math.max(0, Math.min(this.log.length, target));
    while (this.pos < target - 8) this.forward(true);
    while (this.pos < target) this.forward();
    while (this.pos > target) this.backward();
    this.touched.length = 0;
  }
}

// ─── neighbours ──────────────────────────────────────────────────────────────

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function neighbours(g: Grid, i: number, step = 1): number[] {
  const x = i % g.w, y = (i / g.w) | 0, out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx * step, ny = y + dy * step;
    if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h) out.push(ny * g.w + nx);
  }
  return out;
}

const between = (g: Grid, a: number, b: number) => (a + b) >> 1; // rooms two apart share a wall halfway
const manhattan = (g: Grid, a: number, b: number) => Math.abs((a % g.w) - (b % g.w)) + Math.abs(((a / g.w) | 0) - ((b / g.w) | 0));

// ─── maze generators ─────────────────────────────────────────────────────────

export type MazeGenerator = { id: string; name: string; about: string; run: (r: GridRecorder, rand: () => number) => void };

const isRoom = (g: Grid, i: number) => (i % g.w) % 2 === 1 && ((i / g.w) | 0) % 2 === 1;

function fillWalls(r: GridRecorder) {
  for (let i = 0; i < r.cells.length; i++) r.setCell(i, Cell.Wall);
}

function rooms(g: Grid) {
  const out: number[] = [];
  for (let y = 1; y < g.h - 1; y += 2) for (let x = 1; x < g.w - 1; x += 2) out.push(y * g.w + x);
  return out;
}

function backtracker(r: GridRecorder, rand: () => number) {
  const g = r.g;
  fillWalls(r);
  const seen = new Uint8Array(g.cells.length);
  const stack = [g.w + 1];
  seen[g.w + 1] = 1;
  r.setCell(g.w + 1, Cell.Empty);
  while (stack.length) {
    const cur = stack[stack.length - 1];
    r.move(cur);
    const next = shuffle(neighbours(g, cur, 2).filter((n) => isRoom(g, n) && !seen[n]), rand);
    if (!next.length) { stack.pop(); continue; }
    const n = next[0];
    seen[n] = 1;
    r.setCell(between(g, cur, n), Cell.Empty);
    r.setCell(n, Cell.Empty);
    stack.push(n);
  }
  r.move(-1);
}

function prim(r: GridRecorder, rand: () => number) {
  const g = r.g;
  fillWalls(r);
  const inMaze = new Uint8Array(g.cells.length);
  const frontier: number[] = [];
  const add = (c: number) => {
    inMaze[c] = 1;
    r.setCell(c, Cell.Empty);
    for (const n of neighbours(g, c, 2)) if (isRoom(g, n) && !inMaze[n] && r.state[n] !== CellState.Frontier) {
      r.mark(n, CellState.Frontier);
      frontier.push(n);
    }
  };
  add(g.w + 1);
  while (frontier.length) {
    const k = Math.floor(rand() * frontier.length);
    const c = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    r.move(c);
    const links = neighbours(g, c, 2).filter((n) => inMaze[n]);
    const n = links[Math.floor(rand() * links.length)];
    r.setCell(between(g, c, n), Cell.Empty);
    r.mark(c, CellState.None);
    add(c);
  }
  r.move(-1);
}

function kruskal(r: GridRecorder, rand: () => number) {
  const g = r.g;
  fillWalls(r);
  const parent = new Int32Array(g.cells.length).map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const edges: [number, number][] = [];
  for (const c of rooms(g)) {
    r.setCell(c, Cell.Empty);
    const x = c % g.w, y = (c / g.w) | 0;
    if (x + 2 < g.w - 1) edges.push([c, c + 2]);
    if (y + 2 < g.h - 1) edges.push([c, c + 2 * g.w]);
  }
  for (const [a, b] of shuffle(edges, rand)) {
    const ra = find(a), rb = find(b);
    if (ra === rb) continue;
    parent[ra] = rb;
    r.move(b);
    r.setCell(between(g, a, b), Cell.Empty);
  }
  r.move(-1);
}

function wilson(r: GridRecorder, rand: () => number) {
  const g = r.g;
  fillWalls(r);
  const all = rooms(g);
  const inMaze = new Uint8Array(g.cells.length);
  const first = all[Math.floor(rand() * all.length)];
  inMaze[first] = 1;
  r.setCell(first, Cell.Empty);
  let remaining = all.filter((c) => c !== first);
  while (remaining.length) {
    // Random walk from an unvisited room until it hits the maze, erasing loops as they form.
    let cur = remaining[Math.floor(rand() * remaining.length)];
    const path = [cur];
    const where = new Map([[cur, 0]]);
    r.mark(cur, CellState.Frontier);
    while (!inMaze[cur]) {
      const opts = neighbours(g, cur, 2).filter((n) => isRoom(g, n));
      cur = opts[Math.floor(rand() * opts.length)];
      r.move(cur);
      const seen = where.get(cur);
      if (seen !== undefined) {
        for (const c of path.splice(seen + 1)) { where.delete(c); r.mark(c, CellState.None); }
      } else {
        where.set(cur, path.length);
        path.push(cur);
        if (!inMaze[cur]) r.mark(cur, CellState.Frontier);
      }
    }
    for (let k = 0; k < path.length; k++) {
      const c = path[k];
      r.mark(c, CellState.None);
      r.setCell(c, Cell.Empty);
      if (k + 1 < path.length) r.setCell(between(g, c, path[k + 1]), Cell.Empty);
      inMaze[c] = 1;
    }
    remaining = remaining.filter((c) => !inMaze[c]);
  }
  r.move(-1);
}

function division(r: GridRecorder, rand: () => number) {
  const g = r.g;
  for (let i = 0; i < r.cells.length; i++) r.setCell(i, Cell.Empty);
  for (let x = 0; x < g.w; x++) { r.setCell(x, Cell.Wall); r.setCell((g.h - 1) * g.w + x, Cell.Wall); }
  for (let y = 0; y < g.h; y++) { r.setCell(y * g.w, Cell.Wall); r.setCell(y * g.w + g.w - 1, Cell.Wall); }
  // Chamber in cell coordinates, inclusive, with walls placed on even lines and gaps on odd.
  const split = (x0: number, y0: number, x1: number, y1: number) => {
    const w = x1 - x0, h = y1 - y0;
    if (w < 2 || h < 2) return;
    const horizontal = h > w || (h === w && rand() < 0.5);
    if (horizontal) {
      const wy = y0 + 1 + 2 * Math.floor(rand() * (h / 2));
      const gap = x0 + 2 * Math.floor(rand() * ((w + 2) / 2));
      for (let x = x0; x <= x1; x++) if (x !== gap) { r.move(wy * g.w + x); r.setCell(wy * g.w + x, Cell.Wall); }
      split(x0, y0, x1, wy - 1);
      split(x0, wy + 1, x1, y1);
    } else {
      const wx = x0 + 1 + 2 * Math.floor(rand() * (w / 2));
      const gap = y0 + 2 * Math.floor(rand() * ((h + 2) / 2));
      for (let y = y0; y <= y1; y++) if (y !== gap) { r.move(y * g.w + wx); r.setCell(y * g.w + wx, Cell.Wall); }
      split(x0, y0, wx - 1, y1);
      split(wx + 1, y0, x1, y1);
    }
  };
  split(1, 1, g.w - 2 - ((g.w - 2) % 2 === 0 ? 1 : 0), g.h - 2 - ((g.h - 2) % 2 === 0 ? 1 : 0));
  r.move(-1);
}

function binaryTree(r: GridRecorder, rand: () => number) {
  const g = r.g;
  fillWalls(r);
  for (const c of rooms(g)) {
    r.move(c);
    r.setCell(c, Cell.Empty);
    const x = c % g.w, y = (c / g.w) | 0;
    const opts: number[] = [];
    if (y > 1) opts.push(c - g.w);
    if (x > 1) opts.push(c - 1);
    if (opts.length) r.setCell(opts[Math.floor(rand() * opts.length)], Cell.Empty);
  }
  r.move(-1);
}

function sidewinder(r: GridRecorder, rand: () => number) {
  const g = r.g;
  fillWalls(r);
  const lastX = g.w - 2 - ((g.w - 2) % 2 === 0 ? 1 : 0);
  for (let y = 1; y < g.h - 1; y += 2) {
    let run: number[] = [];
    for (let x = 1; x <= lastX; x += 2) {
      const c = y * g.w + x;
      r.move(c);
      r.setCell(c, Cell.Empty);
      run.push(c);
      const closeRun = x === lastX || (y > 1 && rand() < 0.5);
      if (y === 1 && x < lastX) { r.setCell(c + 1, Cell.Empty); continue; }
      if (closeRun) {
        if (y > 1) r.setCell(run[Math.floor(rand() * run.length)] - g.w, Cell.Empty);
        run = [];
      } else r.setCell(c + 1, Cell.Empty);
    }
  }
  r.move(-1);
}

function scatter(r: GridRecorder, rand: () => number) {
  for (let i = 0; i < r.cells.length; i++) r.setCell(i, rand() < 0.28 ? Cell.Wall : Cell.Empty);
}

function weights(r: GridRecorder, rand: () => number) {
  // Smooth blobs of heavy terrain from a few random centres.
  const g = r.g;
  for (let i = 0; i < r.cells.length; i++) if (r.cells[i] === Cell.Weight) r.setCell(i, Cell.Empty);
  const centres = Array.from({ length: 6 }, () => [rand() * g.w, rand() * g.h, 2 + rand() * Math.min(g.w, g.h) / 4]);
  for (let i = 0; i < r.cells.length; i++) {
    if (r.cells[i] === Cell.Wall) continue;
    const x = i % g.w, y = (i / g.w) | 0;
    if (centres.some(([cx, cy, rad]) => (x - cx) ** 2 + (y - cy) ** 2 < rad * rad)) r.setCell(i, Cell.Weight);
  }
}

export const MAZES: MazeGenerator[] = [
  { id: 'backtracker', name: 'Recursive backtracker', run: backtracker,
    about: 'A depth-first walk that carves into a random unvisited neighbour and backs up when stuck. Long winding corridors and few dead ends.' },
  { id: 'prim', name: 'Randomized Prim', run: prim,
    about: 'Grows the maze from a seed by repeatedly connecting a random frontier cell. Short, branchy passages radiating from the start.' },
  { id: 'kruskal', name: 'Randomized Kruskal', run: kruskal,
    about: 'Knocks down walls in random order whenever the two rooms aren’t already connected (tracked with union–find). Builds a uniform-looking maze everywhere at once.' },
  { id: 'wilson', name: 'Wilson’s algorithm', run: wilson,
    about: 'Loop-erased random walks from unvisited rooms until they hit the maze. Slow to start, but gives a perfectly uniform spanning tree.' },
  { id: 'division', name: 'Recursive division', run: division,
    about: 'Starts empty and splits each chamber with a wall that has one gap, recursing into both halves. Long straight walls and a boxy feel.' },
  { id: 'binary-tree', name: 'Binary tree', run: binaryTree,
    about: 'Every room opens north or west at random. Trivial and fast, with two unbroken corridors along the top and left edges.' },
  { id: 'sidewinder', name: 'Sidewinder', run: sidewinder,
    about: 'Works row by row, carving east in runs and closing each run with one passage north. Only the top row is a long corridor.' },
  { id: 'scatter', name: 'Random walls', run: scatter,
    about: 'Each cell becomes a wall with 28% probability. Open terrain with obstacles, possibly with no route at all.' },
  { id: 'weights', name: 'Heavy terrain', run: weights,
    about: 'Adds blobs of weighted cells that cost five times as much to cross. Weighted algorithms walk around them; BFS walks straight through.' },
];

export function generateMaze(grid: Grid, gen: MazeGenerator, seed: number) {
  const g = cloneGrid(grid);
  if (gen.id !== 'scatter' && gen.id !== 'weights') placeEndpointsForMaze(g);
  const r = new GridRecorder(g);
  gen.run(r, mulberry32(seed));
  r.setCell(g.start, Cell.Empty);
  r.setCell(g.end, Cell.Empty);
  const player = new GridPlayer(g, r.log, null);
  const final: Grid = { ...g, cells: r.cells.slice() };
  return { player, final };
}

// ─── pathfinding ─────────────────────────────────────────────────────────────

export type SearchResult = { found: boolean; length: number; cost: number; visited: number };
export type Pathfinder = { id: string; name: string; weighted: boolean; shortest: boolean; about: string; run: (r: GridRecorder) => SearchResult };

const cost = (g: Grid, cells: Uint8Array, i: number) => (cells[i] === Cell.Weight ? WEIGHT_COST : 1);
const passable = (cells: Uint8Array, i: number) => cells[i] !== Cell.Wall;

class Heap {
  private items: { k: number; t: number; v: number }[] = [];
  private tick = 0;
  get size() { return this.items.length; }
  push(v: number, k: number) {
    const a = this.items;
    a.push({ k, t: this.tick++, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[p], a[i])) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop(): number {
    const a = this.items, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, rr = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (rr < a.length && this.less(a[rr], a[m])) m = rr;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top.v;
  }
  // Ties break towards the most recently pushed, which makes A* and greedy head straight for the goal.
  private less(a: { k: number; t: number }, b: { k: number; t: number }) { return a.k < b.k || (a.k === b.k && a.t > b.t); }
}

function tracePath(r: GridRecorder, parent: Int32Array, end: number, visited: number): SearchResult {
  const g = r.g;
  const path: number[] = [];
  for (let c = end; c !== -1; c = parent[c]) path.push(c);
  path.reverse();
  let total = 0;
  for (let k = 0; k < path.length; k++) {
    if (k > 0) total += cost(g, r.cells, path[k]);
    r.move(path[k]);
    r.mark(path[k], CellState.Path, k);
  }
  r.move(-1);
  return { found: true, length: path.length - 1, cost: total, visited };
}

function bestFirst(r: GridRecorder, key: (g: number, i: number) => number, weighted: boolean): SearchResult {
  const g = r.g, n = g.cells.length;
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new Heap();
  dist[g.start] = 0;
  open.push(g.start, key(0, g.start));
  r.mark(g.start, CellState.Frontier, 0);
  let visited = 0;
  while (open.size) {
    const c = open.pop();
    if (closed[c]) continue;
    closed[c] = 1;
    visited++;
    r.move(c);
    r.mark(c, CellState.Visited, dist[c]);
    if (c === g.end) return tracePath(r, parent, c, visited);
    for (const nb of neighbours(g, c)) {
      if (!passable(r.cells, nb) || closed[nb]) continue;
      const d = dist[c] + (weighted ? cost(g, r.cells, nb) : 1);
      if (d < dist[nb]) {
        dist[nb] = d;
        parent[nb] = c;
        open.push(nb, key(d, nb));
        r.mark(nb, CellState.Frontier, d);
      }
    }
  }
  r.move(-1);
  return { found: false, length: 0, cost: 0, visited };
}

function bfs(r: GridRecorder): SearchResult {
  const g = r.g, n = g.cells.length;
  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const queue = [g.start];
  seen[g.start] = 1;
  r.mark(g.start, CellState.Frontier, 0);
  let head = 0, visited = 0;
  while (head < queue.length) {
    const c = queue[head++];
    visited++;
    r.move(c);
    r.mark(c, CellState.Visited);
    if (c === g.end) return tracePath(r, parent, c, visited);
    for (const nb of neighbours(g, c)) {
      if (seen[nb] || !passable(r.cells, nb)) continue;
      seen[nb] = 1;
      parent[nb] = c;
      queue.push(nb);
      r.mark(nb, CellState.Frontier, r.dist[c] + 1);
    }
  }
  r.move(-1);
  return { found: false, length: 0, cost: 0, visited };
}

function dfs(r: GridRecorder): SearchResult {
  const g = r.g, n = g.cells.length;
  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const stack = [g.start];
  r.mark(g.start, CellState.Frontier, 0);
  let visited = 0;
  while (stack.length) {
    const c = stack.pop()!;
    if (seen[c]) continue;
    seen[c] = 1;
    visited++;
    r.move(c);
    r.mark(c, CellState.Visited);
    if (c === g.end) return tracePath(r, parent, c, visited);
    // Push in reverse so the first direction (north, then east…) is explored first.
    for (const nb of neighbours(g, c).reverse()) {
      if (seen[nb] || !passable(r.cells, nb)) continue;
      parent[nb] = c;
      stack.push(nb);
      r.mark(nb, CellState.Frontier, r.dist[c] + 1);
    }
  }
  r.move(-1);
  return { found: false, length: 0, cost: 0, visited };
}

function bidirectional(r: GridRecorder): SearchResult {
  const g = r.g, n = g.cells.length;
  const side = new Uint8Array(n); // 1: reached from start, 2: from end
  const parent = new Int32Array(n).fill(-1);
  const qa = [g.start], qb = [g.end];
  side[g.start] = 1; side[g.end] = 2;
  r.mark(g.start, CellState.Frontier, 0);
  r.mark(g.end, CellState.FrontierB, 0);
  let ha = 0, hb = 0, visited = 0;
  const expand = (q: number[], head: number, mine: number): [number, number, number] | null => {
    const c = q[head];
    visited++;
    r.move(c);
    r.mark(c, mine === 1 ? CellState.Visited : CellState.VisitedB);
    for (const nb of neighbours(g, c)) {
      if (!passable(r.cells, nb)) continue;
      if (side[nb] && side[nb] !== mine) return mine === 1 ? [c, nb, 0] : [nb, c, 0];
      if (side[nb]) continue;
      side[nb] = mine;
      parent[nb] = c;
      q.push(nb);
      r.mark(nb, mine === 1 ? CellState.Frontier : CellState.FrontierB, r.dist[c] + 1);
    }
    return null;
  };
  while (ha < qa.length && hb < qb.length) {
    // Expand whichever frontier is smaller.
    const meet = qa.length - ha <= qb.length - hb ? expand(qa, ha++, 1) : expand(qb, hb++, 2);
    if (meet) {
      const [a, b] = meet;
      const left: number[] = [], right: number[] = [];
      for (let c = a; c !== -1; c = parent[c]) left.push(c);
      for (let c = b; c !== -1; c = parent[c]) right.push(c);
      const path = [...left.reverse(), ...right];
      let total = 0;
      path.forEach((c, k) => {
        if (k > 0) total += cost(g, r.cells, c);
        r.move(c);
        r.mark(c, CellState.Path, k);
      });
      r.move(-1);
      return { found: true, length: path.length - 1, cost: total, visited };
    }
  }
  r.move(-1);
  return { found: false, length: 0, cost: 0, visited };
}

function wallFollower(r: GridRecorder): SearchResult {
  // Right-hand rule: keep a hand on the wall to your right. Solves any maze without loops around the goal.
  const g = r.g;
  const dx = [0, 1, 0, -1], dy = [-1, 0, 1, 0];
  let c = g.start, dir = 1, steps = 0;
  const route = [c];
  const limit = g.cells.length * 4;
  const open = (i: number, d: number) => {
    const x = (i % g.w) + dx[d], y = ((i / g.w) | 0) + dy[d];
    return x >= 0 && y >= 0 && x < g.w && y < g.h && passable(r.cells, y * g.w + x) ? y * g.w + x : -1;
  };
  r.mark(c, CellState.Visited, 0);
  while (c !== g.end && steps < limit) {
    let moved = false;
    for (const turn of [1, 0, 3, 2]) {
      const d = (dir + turn) % 4, nx = open(c, d);
      if (nx >= 0) { dir = d; c = nx; moved = true; break; }
    }
    if (!moved) break;
    steps++;
    r.move(c);
    // Retracing a step pops it off the route, so the final route has no dead-end detours.
    if (route.length > 1 && route[route.length - 2] === c) route.pop(); else route.push(c);
    r.mark(c, CellState.Visited, steps);
  }
  if (c !== g.end) { r.move(-1); return { found: false, length: 0, cost: 0, visited: steps }; }
  let total = 0;
  route.forEach((cell, k) => { if (k > 0) total += cost(g, r.cells, cell); r.move(cell); r.mark(cell, CellState.Path, k); });
  r.move(-1);
  return { found: true, length: route.length - 1, cost: total, visited: steps };
}

export const PATHFINDERS: Pathfinder[] = [
  { id: 'astar', name: 'A*', weighted: true, shortest: true, run: (r) => bestFirst(r, (d, i) => d + manhattan(r.g, i, r.g.end), true),
    about: 'Dijkstra steered by a heuristic: it expands the cell with the lowest cost-so-far plus Manhattan distance to the goal. With a heuristic that never overestimates, it still finds the cheapest path.' },
  { id: 'dijkstra', name: 'Dijkstra', weighted: true, shortest: true, run: (r) => bestFirst(r, (d) => d, true),
    about: 'Expands cells in order of their cost from the start, using a priority queue. Spreads evenly in every direction and finds the cheapest path through weighted terrain.' },
  { id: 'bfs', name: 'Breadth-first search', weighted: false, shortest: true, run: bfs,
    about: 'Explores in rings: every cell one step away, then two, and so on. Finds the path with the fewest steps but ignores weights.' },
  { id: 'bidirectional', name: 'Bidirectional BFS', weighted: false, shortest: true, run: bidirectional,
    about: 'Two breadth-first searches, from the start and from the goal, always growing the smaller frontier, until they meet. Explores roughly half as much as one BFS.' },
  { id: 'greedy', name: 'Greedy best-first', weighted: false, shortest: false, run: (r) => bestFirst(r, (_d, i) => manhattan(r.g, i, r.g.end), false),
    about: 'Always expands the cell that looks closest to the goal, ignoring how far it has come. Fast in open space, easily fooled by walls, and not guaranteed shortest.' },
  { id: 'dfs', name: 'Depth-first search', weighted: false, shortest: false, run: dfs,
    about: 'Follows one direction as far as it can before backtracking. Finds a path, often a terribly long one.' },
  { id: 'wall-follower', name: 'Wall follower', weighted: false, shortest: false, run: wallFollower,
    about: 'Keeps its right hand on the wall, like a person in a hedge maze. Needs no memory of the map, and always escapes a perfect maze.' },
];

export function findPath(grid: Grid, pf: Pathfinder) {
  const r = new GridRecorder(grid);
  const result = pf.run(r);
  return new GridPlayer(grid, r.log, result);
}

/** Exposed for tests. */
export const _internal = { GridRecorder, isRoom, rooms };
