/* CardForge SDD — Roguelike Overworld Map Generator */

class RoguelikeMapGenerator {
  constructor(config) {
    this.config = {
      width: config.mapWidth || 800,
      height: config.mapHeight || 600,
      nodeCount: config.nodeCount || 24,
      startPos: config.startPosition || { x: 0.1, y: 0.5 },
      bossPos: config.bossPosition || { x: 0.9, y: 0.5 },
      minEdges: config.minEdges || 1,
      maxEdges: config.maxEdges || 3,
      regionCount: config.regionCount || 5,
      seed: config.seed || this._makeSeed(),
      nodeTypes: config.nodeTypes || this._defaultNodeTypes(),
      encounters: config.encounters || [],
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  _makeSeed() {
    return Math.random().toString(36).slice(2, 10);
  }

  _defaultNodeTypes() {
    return {
      combat: { weight: 45, color: '#e94560', icon: 'sword' },
      elite: { weight: 12, color: '#9b59b6', icon: 'skull' },
      rest: { weight: 12, color: '#2ecc71', icon: 'heart' },
      event: { weight: 18, color: '#f1c40f', icon: 'bolt' },
      shop: { weight: 8, color: '#3498db', icon: 'orb' },
      treasure: { weight: 5, color: '#e67e22', icon: 'card-art' },
    };
  }

  generate() {
    const nodes = this._generateNodes();
    const edges = this._generateEdges(nodes);
    this._assignRegions(nodes);
    this._assignTypes(nodes);
    this._assignEncounters(nodes);
    return {
      seed: this.config.seed,
      width: this.config.width,
      height: this.config.height,
      nodes: nodes.map(n => ({ ...n })),
      edges: edges.map(e => ({ ...e })),
    };
  }

  _generateNodes() {
    const nodes = [];
    const { width, height, startPos, bossPos, nodeCount } = this.config;

    // Start node
    nodes.push({
      id: 0,
      x: startPos.x * width,
      y: startPos.y * height,
      type: 'start',
      region: 0,
      visited: false,
      cleared: false,
      label: '门口',
    });

    // Boss node
    nodes.push({
      id: 1,
      x: bossPos.x * width,
      y: bossPos.y * height,
      type: 'boss',
      region: this.config.regionCount + 1,
      visited: false,
      cleared: false,
      label: '家',
    });

    // Intermediate nodes via jittered grid + Poisson-like rejection
    const cols = Math.ceil(Math.sqrt(nodeCount * 1.5));
    const rows = Math.ceil(nodeCount / cols);
    const cellW = (bossPos.x - startPos.x) * width / (cols + 1);
    const cellH = height / (rows + 1);

    let attempts = 0;
    while (nodes.length < nodeCount + 2 && attempts < nodeCount * 80) {
      attempts++;
      const col = this.rng.int(1, cols);
      const row = this.rng.int(1, rows);
      const x = startPos.x * width + col * cellW + this.rng.range(-cellW * 0.3, cellW * 0.3);
      const y = row * cellH + this.rng.range(-cellH * 0.3, cellH * 0.3);
      const clampedX = Math.max(startPos.x * width + 30, Math.min(bossPos.x * width - 30, x));
      const clampedY = Math.max(30, Math.min(height - 30, y));

      if (this._tooClose(clampedX, clampedY, nodes, 52)) continue;
      nodes.push({
        id: nodes.length,
        x: clampedX,
        y: clampedY,
        type: 'unknown',
        region: 0,
        visited: false,
        cleared: false,
      });
    }

    return nodes;
  }

  _tooClose(x, y, nodes, minDist) {
    return nodes.some(n => {
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < minDist;
    });
  }

  _generateEdges(nodes) {
    const { maxEdges } = this.config;

    // Sort by x (progression direction)
    const sorted = [...nodes].sort((a, b) => a.x - b.x);

    const edges = [];
    const edgeSet = new Set();

    // Connect every node to its k nearest forward neighbors. This creates a
    // directed acyclic graph that is usually already fully reachable from start.
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const targets = sorted.slice(i + 1)
        .filter(b => b.x > a.x)
        .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
      const count = Math.min(maxEdges, targets.length);
      for (let k = 0; k < count; k++) {
        this._addEdge(edges, edgeSet, a.id, targets[k].id);
      }
    }

    // Iteratively repair disconnected subgraphs until whole graph reachable
    for (let repair = 0; repair < 40; repair++) {
      const reachable = this._forwardReachable(sorted, edges);
      const missing = sorted.filter(n => !reachable.has(n.id) && n.type !== 'start');
      if (missing.length === 0) break;
      const node = missing.sort((a, b) => a.x - b.x)[0]; // pick leftmost missing first
      const sources = sorted.filter(a => reachable.has(a.id) && a.x < node.x);
      if (sources.length) {
        // Pick nearest reachable source to keep edges short
        const pick = sources.sort((a, b) =>
          Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y)
        )[0];
        this._addEdge(edges, edgeSet, pick.id, node.id);
      }
    }

    // Remove crossing edges (preserve long edges first to keep reachability)
    return this._removeCrossingEdges(nodes, edges);
  }

  _buildLayers(sorted) {
    const n = sorted.length;
    // Include start (first) and boss (last) as their own layers, fill middle layers evenly
    const layers = [[sorted[0]]];
    const mid = sorted.slice(1, n - 1);
    const regionCount = this.config.regionCount;
    const perLayer = Math.max(1, Math.ceil(mid.length / regionCount));
    for (let i = 0; i < mid.length; i += perLayer) {
      layers.push(mid.slice(i, i + perLayer));
    }
    layers.push([sorted[n - 1]]);
    return layers;
  }

  _canConnect(a, b) {
    return b.x > a.x && Math.hypot(b.x - a.x, b.y - a.y) < 320;
  }

  _addEdge(edges, edgeSet, fromId, toId) {
    const key = `${Math.min(fromId, toId)}-${Math.max(fromId, toId)}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from: fromId, to: toId });
  }

  _forwardReachable(nodes, edges) {
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e.to);
    }
    const visited = new Set();
    const queue = [0]; // start id
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of adj.get(id) || []) queue.push(next);
    }
    return visited;
  }

  _removeCrossingEdges(nodes, edges) {
    const pos = new Map(nodes.map(n => [n.id, n]));
    const kept = [];
    // Score edges by forward progress (delta x), then length; prefer primary progression edges
    const scored = edges
      .map(e => ({
        e,
        dx: pos.get(e.to).x - pos.get(e.from).x,
        len: Math.hypot(pos.get(e.to).x - pos.get(e.from).x, pos.get(e.to).y - pos.get(e.from).y),
      }))
      .sort((a, b) => b.dx - a.dx || b.len - a.len);

    for (const { e } of scored) {
      let crosses = false;
      const a1 = pos.get(e.from), b1 = pos.get(e.to);
      if (a1.id === b1.id) continue;
      for (const k of kept) {
        const a2 = pos.get(k.from), b2 = pos.get(k.to);
        if (this._segmentsCross(a1, b1, a2, b2)) {
          crosses = true;
          break;
        }
      }
      if (!crosses) kept.push(e);
    }

    // Repair reachability after crossing removal. If every non-crossing edge
    // into a missing node is blocked, relax the crossing constraint.
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    for (let repair = 0; repair < 80; repair++) {
      const reachable = this._forwardReachable(sorted, kept);
      const missing = sorted.filter(n => !reachable.has(n.id) && n.type !== 'start');
      if (missing.length === 0) break;
      const node = missing.sort((a, b) => a.x - b.x)[0];
      const sources = sorted.filter(a => reachable.has(a.id) && a.x < node.x);
      if (sources.length === 0) break;
      // Try non-crossing edges first, then allow crossing as last resort
      const candidates = sources
        .map(s => ({
          s,
          crosses: kept.some(k => {
            const a2 = pos.get(k.from), b2 = pos.get(k.to);
            return this._segmentsCross(s, node, a2, b2);
          }),
          dist: Math.hypot(s.x - node.x, s.y - node.y),
        }))
        .sort((a, b) => (a.crosses ? 1 : -1) - (b.crosses ? 1 : -1) || a.dist - b.dist);
      const best = candidates[0];
      kept.push({ from: best.s.id, to: node.id });
    }

    return kept;
  }

  _segmentsCross(a, b, c, d) {
    if (a.id === c.id || a.id === d.id || b.id === c.id || b.id === d.id) return false;
    const ccw = (p1, p2, p3) =>
      (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  _assignRegions(nodes) {
    const { width, regionCount } = this.config;
    const startX = nodes.find(n => n.type === 'start').x;
    const bossX = nodes.find(n => n.type === 'boss').x;
    const step = (bossX - startX) / (regionCount + 1);

    for (const n of nodes) {
      if (n.type === 'start') { n.region = 0; continue; }
      if (n.type === 'boss') { n.region = regionCount + 1; continue; }
      const rel = n.x - startX;
      n.region = Math.min(regionCount, Math.max(1, Math.floor(rel / step) + 1));
    }
  }

  _assignTypes(nodes) {
    const weights = [];
    const types = Object.keys(this.config.nodeTypes);
    for (const t of types) {
      const w = this.config.nodeTypes[t].weight;
      for (let i = 0; i < w; i++) weights.push(t);
    }

    // Boss and start fixed; treasure only in mid-late; elite not early
    for (const n of nodes) {
      if (n.type === 'start' || n.type === 'boss') continue;
      let pool = weights;
      if (n.region <= 1) pool = pool.filter(t => t !== 'elite' && t !== 'treasure');
      if (n.region >= this.config.regionCount) pool = pool.filter(t => t !== 'shop' && t !== 'treasure');
      n.type = pool[this.rng.int(0, pool.length - 1)] || 'combat';
      n.label = this._typeLabel(n.type);
    }
  }

  _typeLabel(type) {
    const labels = {
      start: '门口', combat: '梦魇', elite: '反复的梦', rest: '打盹', event: '似曾相识',
      shop: '阁楼旧物', treasure: '抽屉深处', boss: '家',
    };
    return labels[type] || type;
  }

  _assignEncounters(nodes) {
    const encounters = [...this.config.encounters];
    for (const n of nodes) {
      if (n.type !== 'combat' && n.type !== 'elite' && n.type !== 'boss') {
        n.encounter = null;
        continue;
      }
      const pool = encounters.filter(e =>
        !e.regions || e.regions.includes(n.region) || (n.type === 'boss' && e.regions.includes(5))
      );
      const pick = pool[this.rng.int(0, pool.length - 1)] || encounters[encounters.length - 1];
      n.encounter = { ...pick };
      if (n.type === 'elite') {
        n.encounter.hp = Math.floor(n.encounter.hp * 1.25);
        n.encounter.dmg = Math.floor(n.encounter.dmg * 1.2);
        n.encounter.rewardChoices = Math.min(3, (n.encounter.rewardChoices || 1) + 1);
      }
    }
  }
}

class SeededRandom {
  constructor(seed) {
    this.seed = this._hash(seed);
  }

  _hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
  }

  // 0..1
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
}

// Export for module/non-module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RoguelikeMapGenerator, SeededRandom };
}
if (typeof window !== 'undefined') {
  window.RoguelikeMapGenerator = RoguelikeMapGenerator;
  window.SeededRandom = SeededRandom;
  // Progressive dreamcore difficulty — per-region nightmare modifier.
  // region: 1..5 normal rooms, 6 = boss (家). Elite nodes get +1 str on top.
  window.DREAM_MODIFIERS = {
    1: { name: '入门',     hp: 1.00, str: 0, draw: 0, mana: 0, playerDebuff: null },
    2: { name: '影渐浓',   hp: 1.15, str: 1, draw: 0, mana: 0, playerDebuff: null },
    3: { name: '光脚而行', hp: 1.25, str: 1, draw: 0, mana: 0, playerDebuff: 'vulnerable' },
    4: { name: '深眠',     hp: 1.35, str: 2, draw: 1, mana: 0, playerDebuff: null },
    5: { name: '梦将醒',   hp: 1.50, str: 2, draw: 0, mana: 1, playerDebuff: null },
    6: { name: '家',       hp: 1.60, str: 3, draw: 0, mana: 0, playerDebuff: 'vulnerable' },
  };
  window.modifierFor = function (region, type) {
    const r = (type === 'boss') ? 6 : Math.max(1, Math.min(5, region || 1));
    const m = { ...window.DREAM_MODIFIERS[r] };
    if (type === 'elite') { m.hp += 0.10; m.str += 1; m.name = '反复的梦·' + m.name; }
    return m;
  };
}
