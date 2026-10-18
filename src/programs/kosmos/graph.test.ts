import { describe, expect, it } from 'vitest';
import { Cell, CellState, MAZES, PATHFINDERS, findPath, generateMaze, makeGrid } from './grid';
import { EState, NET_ALGORITHMS, NState, makeNetwork, runNetwork } from './network';

describe('mazes', () => {
  for (const gen of MAZES.filter((g) => g.id !== 'scatter' && g.id !== 'weights')) {
    it(`${gen.name} carves a perfect maze connecting every room`, () => {
      for (const seed of [1, 2, 3]) {
        const { player, final } = generateMaze(makeGrid(31, 21), gen, seed);
        player.seek(player.length);
        expect(Array.from(player.cells)).toEqual(Array.from(final.cells));
        // A perfect maze on R rooms is a spanning tree: R − 1 links, all reachable.
        const { w, h, cells } = final;
        let open = 0, edges = 0;
        for (let i = 0; i < cells.length; i++) {
          if (cells[i] === Cell.Wall) continue;
          open++;
          if (i % w + 1 < w && cells[i + 1] !== Cell.Wall) edges++;
          if (i + w < w * h && cells[i + w] !== Cell.Wall) edges++;
        }
        expect(edges, gen.name).toBe(open - 1);
        const bfs = findPath(final, PATHFINDERS.find((p) => p.id === 'bfs')!);
        expect(bfs.result!.found).toBe(true);
        player.seek(0);
        expect(player.stats.carved).toBe(0);
      }
    });
  }
});

describe('pathfinders', () => {
  it('shortest-path algorithms agree, and every search reaches the goal', () => {
    for (const seed of [4, 5, 6, 7]) {
      const base = makeGrid(41, 25);
      const terrain = generateMaze(generateMaze(base, MAZES.find((m) => m.id === 'scatter')!, seed).final, MAZES.find((m) => m.id === 'weights')!, seed).final;
      const results = Object.fromEntries(PATHFINDERS.map((p) => [p.id, findPath(terrain, p).result!]));
      if (!results.bfs.found) continue;
      for (const p of PATHFINDERS) {
        if (p.id !== 'wall-follower') expect(results[p.id].found, p.name).toBe(true);
      }
      expect(results.bidirectional.length).toBe(results.bfs.length);
      expect(results.astar.cost).toBe(results.dijkstra.cost);
      expect(results.dfs.length).toBeGreaterThanOrEqual(results.bfs.length);
    }
  });

  it('replays forwards and backwards', () => {
    const grid = generateMaze(makeGrid(31, 21), MAZES[0], 9).final;
    const p = findPath(grid, PATHFINDERS[0]);
    p.seek(p.length);
    expect(p.stats.path).toBe(p.result!.length + 1);
    p.seek(0);
    expect(p.state.every((s) => s === CellState.None)).toBe(true);
    expect(p.stats).toEqual({ visited: 0, frontier: 0, path: 0, carved: 0 });
  });
});

describe('network algorithms', () => {
  const net = makeNetwork(60, 3);

  it('builds a connected planar graph', () => {
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) for (const { to } of net.adj[stack.pop()!]) if (!seen.has(to)) { seen.add(to); stack.push(to); }
    expect(seen.size).toBe(60);
    expect(net.edges.length).toBeLessThanOrEqual(3 * 60 - 6);
  });

  it('agrees on the MST weight', () => {
    const weight = (id: string) => {
      const p = runNetwork(net, NET_ALGORITHMS.find((a) => a.id === id)!);
      p.seek(p.length);
      let tree = 0, total = 0;
      p.es.forEach((s, e) => { if (s === EState.Tree) { tree++; total += net.edges[e].w; } });
      expect(tree, id).toBe(59);
      return total;
    };
    const prim = weight('prim');
    expect(weight('kruskal')).toBe(prim);
    expect(weight('boruvka')).toBe(prim);
  });

  it('agrees on the shortest distance', () => {
    const dist = (id: string) => {
      const p = runNetwork(net, NET_ALGORITHMS.find((a) => a.id === id)!);
      p.seek(p.length);
      return p.nv[net.end];
    };
    const d = dist('dijkstra');
    expect(dist('astar')).toBe(d);
    expect(dist('bellman-ford')).toBe(d);
  });

  it('colours properly and orders topologically', () => {
    const c = runNetwork(net, NET_ALGORITHMS.find((a) => a.id === 'colouring')!);
    c.seek(c.length);
    for (const e of net.edges) expect(c.nv[e.a]).not.toBe(c.nv[e.b]);
    const t = runNetwork(net, NET_ALGORITHMS.find((a) => a.id === 'topological')!);
    t.seek(t.length);
    for (const e of net.edges) {
      const [from, to] = net.nodes[e.a].x < net.nodes[e.b].x ? [e.a, e.b] : [e.b, e.a];
      expect(t.nv[from]).toBeLessThan(t.nv[to]);
    }
  });

  it('rewinds every algorithm to a blank graph', () => {
    for (const alg of NET_ALGORITHMS) {
      const p = runNetwork(net, alg);
      p.seek(p.length);
      p.seek(0);
      expect(p.ns.every((s) => s === NState.None), alg.name).toBe(true);
      expect(p.es.every((s) => s === EState.None), alg.name).toBe(true);
    }
  });
});
