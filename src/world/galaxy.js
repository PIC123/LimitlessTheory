// Galaxy: a graph of star systems on a 2D plane. Each system has a stable seed and
// a list of neighbor system ids. Jump gates inside a system are placed pointing
// toward each neighbor, so traversal feels coherent as you cross the galaxy.

import { RNG } from '../core/rng.js';
import { genSystemName } from '../core/names.js';

export class Galaxy {
  constructor(seed, opts = {}) {
    this.seed = seed >>> 0;
    this.systemCount = opts.systemCount ?? 12;
    this.systems = [];
    this._build();
  }

  _build() {
    const rng = new RNG(this.seed);
    // 1) Place systems via simple Poisson-ish rejection sampling on a unit disc.
    const min = 0.18, area = 0.98;
    for (let i = 0; i < this.systemCount; i++) {
      let pos;
      let tries = 0;
      while (tries++ < 100) {
        const r = Math.sqrt(rng.getUniform()) * area;
        const a = rng.getUniform() * Math.PI * 2;
        pos = { x: Math.cos(a) * r, y: Math.sin(a) * r };
        let ok = true;
        for (const s of this.systems) {
          const dx = s.pos.x - pos.x, dy = s.pos.y - pos.y;
          if (dx*dx + dy*dy < min * min) { ok = false; break; }
        }
        if (ok) break;
      }
      const sysSeed = (rng.getUniform() * 0xffffffff) >>> 0;
      const nameRng = new RNG(sysSeed);
      this.systems.push({
        id: i,
        name: genSystemName(nameRng),
        seed: sysSeed,
        pos,
        neighbors: []
      });
    }

    // 2) Connect: each system connects to its 2-3 closest, plus ensure connectivity.
    for (const s of this.systems) {
      const others = this.systems
        .filter(t => t.id !== s.id)
        .map(t => ({ t, d: dist(s.pos, t.pos) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { t } of others) {
        if (!s.neighbors.includes(t.id)) s.neighbors.push(t.id);
        if (!t.neighbors.includes(s.id)) t.neighbors.push(s.id);
      }
    }

    // 3) Ensure full connectivity by walking from system 0 and bridging unreached
    //    systems to the closest reached one.
    const reached = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop();
      for (const n of this.systems[cur].neighbors) {
        if (!reached.has(n)) { reached.add(n); stack.push(n); }
      }
    }
    if (reached.size < this.systems.length) {
      for (const s of this.systems) {
        if (reached.has(s.id)) continue;
        // Find closest reached system and bridge.
        let best = null, bestD = Infinity;
        for (const id of reached) {
          const d = dist(s.pos, this.systems[id].pos);
          if (d < bestD) { bestD = d; best = id; }
        }
        if (best != null) {
          s.neighbors.push(best);
          this.systems[best].neighbors.push(s.id);
          reached.add(s.id);
        }
      }
    }
  }

  systemById(id) { return this.systems[id]; }
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}
