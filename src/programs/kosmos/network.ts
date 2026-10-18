// Algorithms on a random planar graph: points scattered by best-candidate sampling and joined by
// their Gabriel graph (an edge wherever the circle on it as diameter holds no other point).

import { OpLog } from './trace';
import { mulberry32 } from './random';

export type Node = { x: number; y: number };
export type Edge = { a: number; b: number; w: number };
export type Network = { nodes: Node[]; edges: Edge[]; adj: { to: number; e: number }[][]; start: number; end: number; width: number; height: number };

export const NET_W = 100, NET_H = 60;

export function makeNetwork(count: number, seed: number): Network {
  const rand = mulberry32(seed);
  const nodes: Node[] = [];
  const pad = 4;
  while (nodes.length < count) {
    // Best of k candidates: the one farthest from existing points, which spreads them evenly.
    let best: Node | null = null, bestD = -1;
    for (let k = 0; k < 12; k++) {
      const c = { x: pad + rand() * (NET_W - 2 * pad), y: pad + rand() * (NET_H - 2 * pad) };
      let d = Infinity;
      for (const p of nodes) d = Math.min(d, (p.x - c.x) ** 2 + (p.y - c.y) ** 2);
      if (d > bestD) { bestD = d; best = c; }
    }
    nodes.push(best!);
  }
  const edges: Edge[] = [];
  // Weights are lengths rounded up, so straight-line distance never overestimates (A* stays exact).
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const mx = (nodes[i].x + nodes[j].x) / 2, my = (nodes[i].y + nodes[j].y) / 2;
      const r2 = ((nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2) / 4;
      let ok = true;
      for (let k = 0; k < count && ok; k++) {
        if (k !== i && k !== j && (nodes[k].x - mx) ** 2 + (nodes[k].y - my) ** 2 < r2) ok = false;
      }
      if (ok) edges.push({ a: i, b: j, w: Math.max(1, Math.ceil(Math.sqrt(r2) * 2)) });
    }
  }
  const adj: { to: number; e: number }[][] = nodes.map(() => []);
  edges.forEach((e, k) => { adj[e.a].push({ to: e.b, e: k }); adj[e.b].push({ to: e.a, e: k }); });
  // Start at the leftmost point, end at the rightmost.
  let start = 0, end = 0;
  nodes.forEach((p, i) => { if (p.x < nodes[start].x) start = i; if (p.x > nodes[end].x) end = i; });
  return { nodes, edges, adj, start, end, width: NET_W, height: NET_H };
}

export enum NState { None = 0, Frontier = 1, Visited = 2, Final = 3 }
export enum EState { None = 0, Active = 1, Tree = 2, Rejected = 3, Path = 4 }
export enum NOp {
  Node = 0, // a: node, b: new | old << 8, c: new value, d: old value
  Edge = 1, // a: edge, b: new | old << 8
  Focus = 2, // a: new focus node, b: old
}

/** Node values mean different things per algorithm: a distance, a colour, a component, an order. */
export type ValueKind = 'distance' | 'colour' | 'component' | 'order' | 'none';

class NetRecorder {
  log = new OpLog();
  ns: Uint8Array; nv: Int32Array; es: Uint8Array; focus = -1;
  constructor(readonly net: Network) {
    this.ns = new Uint8Array(net.nodes.length);
    this.nv = new Int32Array(net.nodes.length).fill(-1);
    this.es = new Uint8Array(net.edges.length);
  }
  node(i: number, s: NState, v = this.nv[i]) {
    if (this.ns[i] === s && this.nv[i] === v) return;
    this.log.push(NOp.Node, i, s | (this.ns[i] << 8), v, this.nv[i]);
    this.ns[i] = s; this.nv[i] = v;
  }
  edge(e: number, s: EState) {
    if (this.es[e] === s) return;
    this.log.push(NOp.Edge, e, s | (this.es[e] << 8));
    this.es[e] = s;
  }
  /** Flash an edge as being examined, then leave it in `after`. */
  look(e: number, after: EState = this.es[e]) {
    this.edge(e, EState.Active);
    this.edge(e, after);
  }
  at(i: number) {
    if (i === this.focus) return;
    this.log.push(NOp.Focus, i, this.focus);
    this.focus = i;
  }
}

export type NetResult = { summary: string };

export class NetPlayer {
  ns: Uint8Array; nv: Int32Array; es: Uint8Array; focus = -1; pos = 0;
  nodeHeat: Float32Array; edgeHeat: Float32Array;
  touched: { kind: 'node' | 'edge'; i: number; state: number; value: number }[] = [];
  constructor(readonly net: Network, readonly log: OpLog, readonly result: NetResult, readonly valueKind: ValueKind) {
    this.ns = new Uint8Array(net.nodes.length);
    this.nv = new Int32Array(net.nodes.length).fill(-1);
    this.es = new Uint8Array(net.edges.length);
    this.nodeHeat = new Float32Array(net.nodes.length);
    this.edgeHeat = new Float32Array(net.edges.length);
  }
  get length() { return this.log.length; }
  get finished() { return this.pos >= this.log.length; }

  forward(quiet = false) {
    if (this.pos >= this.log.length) return;
    const d = this.log.data, o = this.pos * 5, i = d[o + 1];
    switch (d[o]) {
      case NOp.Node: this.ns[i] = d[o + 2] & 255; this.nv[i] = d[o + 3]; if (!quiet) { this.nodeHeat[i] = 1; this.touched.push({ kind: 'node', i, state: this.ns[i], value: this.nv[i] }); } break;
      case NOp.Edge: this.es[i] = d[o + 2] & 255; if (!quiet) { this.edgeHeat[i] = 1; this.touched.push({ kind: 'edge', i, state: this.es[i], value: 0 }); } break;
      case NOp.Focus: this.focus = i; break;
    }
    this.pos++;
  }
  backward() {
    if (this.pos <= 0) return;
    this.pos--;
    const d = this.log.data, o = this.pos * 5, i = d[o + 1];
    switch (d[o]) {
      case NOp.Node: this.ns[i] = d[o + 2] >> 8; this.nv[i] = d[o + 4]; this.nodeHeat[i] = 1; this.touched.push({ kind: 'node', i, state: this.ns[i], value: this.nv[i] }); break;
      case NOp.Edge: this.es[i] = d[o + 2] >> 8; this.edgeHeat[i] = 1; this.touched.push({ kind: 'edge', i, state: this.es[i], value: 0 }); break;
      case NOp.Focus: this.focus = d[o + 2]; break;
    }
  }
  seek(target: number) {
    target = Math.max(0, Math.min(this.log.length, target));
    while (this.pos < target - 8) this.forward(true);
    while (this.pos < target) this.forward();
    while (this.pos > target) this.backward();
    this.touched.length = 0;
  }
}

// ─── algorithms ──────────────────────────────────────────────────────────────

function markPath(r: NetRecorder, parentEdge: Int32Array, parent: Int32Array, end: number) {
  for (let c = end; parent[c] !== -1; c = parent[c]) {
    r.at(c);
    r.edge(parentEdge[c], EState.Path);
    r.node(c, NState.Final);
  }
  r.node(r.net.start, NState.Final);
  r.at(-1);
}

function traverse(r: NetRecorder, depthFirst: boolean): NetResult {
  const { adj, start } = r.net;
  const seen = new Uint8Array(adj.length);
  let order = 0;
  if (depthFirst) {
    const visit = (u: number) => {
      seen[u] = 1;
      r.at(u);
      r.node(u, NState.Visited, order++);
      for (const { to, e } of adj[u]) {
        if (seen[to]) { if (r.es[e] !== EState.Tree) r.look(e, EState.Rejected); continue; }
        r.edge(e, EState.Tree);
        visit(to);
        r.at(u);
      }
      r.node(u, NState.Final);
    };
    visit(start);
  } else {
    const queue = [start];
    seen[start] = 1;
    r.node(start, NState.Frontier, 0);
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      r.at(u);
      r.node(u, NState.Visited, r.nv[u]);
      for (const { to, e } of adj[u]) {
        if (seen[to]) { if (r.es[e] === EState.None) r.look(e, EState.Rejected); continue; }
        seen[to] = 1;
        r.edge(e, EState.Tree);
        r.node(to, NState.Frontier, r.nv[u] + 1);
        queue.push(to);
      }
      r.node(u, NState.Final);
    }
  }
  r.at(-1);
  return { summary: `Reached ${adj.length} nodes along ${adj.length - 1} tree edges.` };
}

function shortestPath(r: NetRecorder, heuristic: boolean): NetResult {
  const { adj, nodes, start, end, edges } = r.net;
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const h = (i: number) => (heuristic ? Math.hypot(nodes[i].x - nodes[end].x, nodes[i].y - nodes[end].y) : 0);
  dist[start] = 0;
  r.node(start, NState.Frontier, 0);
  let expanded = 0;
  for (;;) {
    // A linear scan is plenty for a hundred nodes, and keeps the code close to the textbook.
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] + h(i) < dist[u] + h(u))) u = i;
    if (u < 0) break;
    done[u] = 1;
    expanded++;
    r.at(u);
    r.node(u, NState.Visited, dist[u]);
    if (u === end) break;
    for (const { to, e } of adj[u]) {
      if (done[to]) continue;
      const d = dist[u] + edges[e].w;
      if (d < dist[to]) {
        if (pe[to] >= 0) r.edge(pe[to], EState.None);
        dist[to] = d; parent[to] = u; pe[to] = e;
        r.edge(e, EState.Active);
        r.edge(e, EState.Tree);
        r.node(to, NState.Frontier, d);
      } else r.look(e);
    }
  }
  if (dist[end] === Infinity) { r.at(-1); return { summary: 'No route to the goal.' }; }
  markPath(r, pe, parent, end);
  return { summary: `Shortest path costs ${dist[end]} after settling ${expanded} of ${n} nodes.` };
}

function bellmanFord(r: NetRecorder): NetResult {
  const { adj, start, end, edges } = r.net;
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1);
  dist[start] = 0;
  r.node(start, NState.Visited, 0);
  let rounds = 0;
  for (let round = 0; round < n - 1; round++) {
    rounds++;
    let changed = false;
    edges.forEach((ed, e) => {
      for (const [u, v] of [[ed.a, ed.b], [ed.b, ed.a]]) {
        if (dist[u] === Infinity) continue;
        if (dist[u] + ed.w < dist[v]) {
          if (pe[v] >= 0) r.edge(pe[v], EState.None);
          dist[v] = dist[u] + ed.w; parent[v] = u; pe[v] = e;
          r.at(v);
          r.edge(e, EState.Active);
          r.edge(e, EState.Tree);
          r.node(v, NState.Visited, dist[v]);
          changed = true;
        }
      }
    });
    if (!changed) break;
  }
  markPath(r, pe, parent, end);
  return { summary: `Distances settled after ${rounds} rounds over all ${edges.length} edges.` };
}

function prim(r: NetRecorder): NetResult {
  const { adj, start, edges } = r.net;
  const n = adj.length;
  const inTree = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), be = new Int32Array(n).fill(-1);
  best[start] = 0;
  let total = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    if (best[u] === Infinity) break;
    inTree[u] = 1;
    r.at(u);
    if (be[u] >= 0) { r.edge(be[u], EState.Tree); total += edges[be[u]].w; }
    r.node(u, NState.Final, 0);
    for (const { to, e } of adj[u]) {
      if (inTree[to]) continue;
      if (edges[e].w < best[to]) {
        if (be[to] >= 0) r.edge(be[to], EState.Rejected);
        best[to] = edges[e].w; be[to] = e;
        r.edge(e, EState.Active);
        r.node(to, NState.Frontier);
      } else r.look(e, EState.Rejected);
    }
  }
  r.at(-1);
  return { summary: `Minimum spanning tree weight ${total}.` };
}

function kruskal(r: NetRecorder): NetResult {
  const { adj, edges } = r.net;
  const n = adj.length;
  const comp = Array.from({ length: n }, (_, i) => i);
  const members = Array.from({ length: n }, (_, i) => [i]);
  for (let i = 0; i < n; i++) r.node(i, NState.Visited, i);
  const order = edges.map((_, k) => k).sort((a, b) => edges[a].w - edges[b].w);
  let total = 0, taken = 0;
  for (const e of order) {
    const { a, b, w } = edges[e];
    r.edge(e, EState.Active);
    if (comp[a] === comp[b]) { r.edge(e, EState.Rejected); continue; }
    r.edge(e, EState.Tree);
    total += w; taken++;
    // Relabel the smaller component, which is what makes union–find by size cheap.
    let [big, small] = [comp[a], comp[b]];
    if (members[big].length < members[small].length) [big, small] = [small, big];
    for (const m of members[small]) { comp[m] = big; r.at(m); r.node(m, NState.Visited, big); }
    members[big].push(...members[small]);
    members[small] = [];
    if (taken === n - 1) break;
  }
  for (let i = 0; i < n; i++) r.node(i, NState.Final);
  r.at(-1);
  return { summary: `Minimum spanning tree weight ${total}.` };
}

function boruvka(r: NetRecorder): NetResult {
  const { adj, edges } = r.net;
  const n = adj.length;
  const comp = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < n; i++) r.node(i, NState.Visited, i);
  let count = n, total = 0, rounds = 0;
  const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  while (count > 1) {
    rounds++;
    const cheapest = new Int32Array(n).fill(-1);
    edges.forEach((ed, e) => {
      const ca = find(ed.a), cb = find(ed.b);
      if (ca === cb) return;
      r.look(e);
      // Ties broken by index so every component agrees on the same edge.
      const better = (c: number) => cheapest[c] < 0 || ed.w < edges[cheapest[c]].w || (ed.w === edges[cheapest[c]].w && e < cheapest[c]);
      if (better(ca)) cheapest[ca] = e;
      if (better(cb)) cheapest[cb] = e;
    });
    for (let c = 0; c < n; c++) {
      const e = cheapest[c];
      if (e < 0) continue;
      const ca = find(edges[e].a), cb = find(edges[e].b);
      if (ca === cb) continue;
      comp[ca] = cb;
      count--;
      total += edges[e].w;
      r.edge(e, EState.Tree);
    }
    for (let i = 0; i < n; i++) { const c = find(i); if (r.nv[i] !== c) { r.at(i); r.node(i, NState.Visited, c); } }
  }
  for (let i = 0; i < n; i++) r.node(i, NState.Final);
  r.at(-1);
  return { summary: `Minimum spanning tree weight ${total} in ${rounds} rounds.` };
}

function colouring(r: NetRecorder): NetResult {
  // Welsh–Powell: visit nodes by decreasing degree, give each the smallest colour its neighbours lack.
  const { adj } = r.net;
  const order = adj.map((_, i) => i).sort((a, b) => adj[b].length - adj[a].length);
  const colour = new Int32Array(adj.length).fill(-1);
  let used = 0;
  for (const u of order) {
    r.at(u);
    r.node(u, NState.Frontier);
    const taken = new Set<number>();
    for (const { to, e } of adj[u]) { r.look(e); if (colour[to] >= 0) taken.add(colour[to]); }
    let c = 0;
    while (taken.has(c)) c++;
    colour[u] = c;
    used = Math.max(used, c + 1);
    r.node(u, NState.Final, c);
  }
  r.at(-1);
  return { summary: `Coloured with ${used} colours (a planar graph never needs more than 4, but greedy can’t always find them).` };
}

function topological(r: NetRecorder): NetResult {
  // Edges point left to right, which makes the graph a DAG. Kahn: repeatedly take a node with no incoming edges.
  const { adj, nodes, edges } = r.net;
  const n = adj.length;
  const indeg = new Int32Array(n);
  for (const e of edges) indeg[nodes[e.a].x < nodes[e.b].x ? e.b : e.a]++;
  const ready: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) { ready.push(i); r.node(i, NState.Frontier); }
  let order = 0;
  while (ready.length) {
    // Take the leftmost ready node, so the order sweeps across the screen.
    ready.sort((a, b) => nodes[a].x - nodes[b].x);
    const u = ready.shift()!;
    r.at(u);
    r.node(u, NState.Final, order++);
    for (const { to, e } of adj[u]) {
      if (nodes[to].x <= nodes[u].x) continue;
      r.edge(e, EState.Tree);
      if (--indeg[to] === 0) { ready.push(to); r.node(to, NState.Frontier); }
    }
  }
  r.at(-1);
  return { summary: `Ordered all ${order} nodes so every edge points forward.` };
}

export type NetAlgorithm = {
  id: string; name: string; group: 'Traversal' | 'Shortest path' | 'Spanning tree' | 'Other';
  value: ValueKind; directed?: boolean; usesEnd?: boolean; about: string; run: (r: NetRecorder) => NetResult;
};

export const NET_ALGORITHMS: NetAlgorithm[] = [
  { id: 'dijkstra', name: 'Dijkstra', group: 'Shortest path', value: 'distance', usesEnd: true, run: (r) => shortestPath(r, false),
    about: 'Settles nodes in order of distance from the start, relaxing each one’s edges. The numbers are the best known distance; tree edges show the current best route to every node.' },
  { id: 'astar', name: 'A*', group: 'Shortest path', value: 'distance', usesEnd: true, run: (r) => shortestPath(r, true),
    about: 'Dijkstra that prefers nodes whose straight-line distance to the goal is small. It settles far fewer nodes and still finds the shortest path, since a straight line is never longer than a road.' },
  { id: 'bellman-ford', name: 'Bellman–Ford', group: 'Shortest path', value: 'distance', usesEnd: true, run: bellmanFord,
    about: 'Relaxes every edge, over and over, until nothing improves (at most n − 1 rounds). Slower than Dijkstra, but it copes with negative edge weights and detects negative cycles.' },
  { id: 'bfs', name: 'Breadth-first traversal', group: 'Traversal', value: 'order', run: (r) => traverse(r, false),
    about: 'Visits nodes in waves of hop count from the start. Numbers are hops; the bright edges form the BFS tree, and grey ones were seen but led nowhere new.' },
  { id: 'dfs', name: 'Depth-first traversal', group: 'Traversal', value: 'order', run: (r) => traverse(r, true),
    about: 'Plunges along one edge after another and backtracks at dead ends. Numbers are discovery order. The tree it leaves is long and stringy.' },
  { id: 'prim', name: 'Prim', group: 'Spanning tree', value: 'none', run: prim,
    about: 'Grows a minimum spanning tree from one node, always adding the cheapest edge that reaches a new node. Highlighted edges are each outside node’s cheapest link to the tree.' },
  { id: 'kruskal', name: 'Kruskal', group: 'Spanning tree', value: 'component', run: kruskal,
    about: 'Considers every edge from cheapest to dearest and keeps it unless it would close a loop. Colours show the forest of components merging into one tree.' },
  { id: 'boruvka', name: 'Borůvka', group: 'Spanning tree', value: 'component', run: boruvka,
    about: 'Every component grabs its cheapest outgoing edge at once, roughly halving the count each round. The oldest MST algorithm (1926), and easy to parallelise.' },
  { id: 'colouring', name: 'Greedy colouring', group: 'Other', value: 'colour', run: colouring,
    about: 'Welsh–Powell: take nodes from most to least connected and give each the first colour none of its neighbours has. Graph colouring schedules exams, registers and radio frequencies.' },
  { id: 'topological', name: 'Topological sort', group: 'Other', value: 'order', directed: true, run: topological,
    about: 'With every edge pointing rightwards the graph has no cycles. Kahn’s algorithm repeatedly removes a node with no incoming edges, giving an order where every edge points forward, as a build system orders tasks.' },
];

export function runNetwork(net: Network, alg: NetAlgorithm) {
  const r = new NetRecorder(net);
  const result = alg.run(r);
  return new NetPlayer(net, r.log, result, alg.value);
}
