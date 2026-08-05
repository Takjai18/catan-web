/**
 * Hex board geometry, vertices, edges, ports for Catan.
 * Pointy-top axial coordinates.
 */

import {
  HEX_COORDS,
  getTileTypes,
  getNumberTokens,
  RES_COLOR,
  MAP_MODES,
  NUMBER_PIPS as CONST_PIPS,
  NUMBER_LETTERS,
  HEX_SPIRAL_ORDER,
} from './constants.js';

const HEX_SIZE = 54;
const ORIGIN_X = 450;
const ORIGIN_Y = 390;

/** Cube/axial neighbors (pointy-top): E, NE, NW, W, SW, SE */
export const NEIGHBOR_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Vertex offsets from hex center (pointy-top), corner index 0..5 */
export function hexCorner(cx, cy, size, i) {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: cx + size * Math.cos(angle),
    y: cy + size * Math.sin(angle),
  };
}

export function axialToPixel(q, r, size = HEX_SIZE) {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x: x + ORIGIN_X, y: y + ORIGIN_Y };
}

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Dice-roll probability weight (ways out of 36). Higher = more frequent. */
export const NUMBER_PIPS = CONST_PIPS;

/** Axial distance between two hexes */
function hexDistance(a, b) {
  const aq = a.q;
  const ar = a.r;
  const as_ = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as_ - bs)) / 2;
}

function neighborIndices() {
  // Precompute adjacency list for the 19 fixed coords
  const adj = HEX_COORDS.map(() => []);
  for (let i = 0; i < HEX_COORDS.length; i++) {
    for (let j = i + 1; j < HEX_COORDS.length; j++) {
      if (hexDistance(HEX_COORDS[i], HEX_COORDS[j]) === 1) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}

const HEX_ADJ = neighborIndices();

/**
 * Place terrain according to map mode.
 * modes: balanced | noDesert | beginner | clustered | random | wild
 */
function placeTerrainTypes(modeId = 'balanced') {
  const mode = MAP_MODES[modeId] || MAP_MODES.balanced;
  const noDesert = mode.noDesert;
  const baseTypes = getTileTypes(noDesert);

  // Pure random / wild: single shuffle
  if (modeId === 'random' || modeId === 'wild') {
    return shuffle(baseTypes);
  }

  let best = null;
  let bestScore = -Infinity;
  const attempts = modeId === 'beginner' ? 120 : 80;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const types = shuffle(baseTypes);
    let score = 0;

    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'desert') continue;
      let sameN = 0;
      for (const j of HEX_ADJ[i]) {
        if (types[j] === types[i]) sameN++;
      }

      if (modeId === 'clustered') {
        // Prefer same-type neighbours (resource regions)
        if (sameN === 0) score -= 2;
        else if (sameN === 1) score += 3;
        else if (sameN === 2) score += 6;
        else score += 4;
      } else {
        // balanced / beginner / noDesert: anti-cluster
        const weight = modeId === 'beginner' ? 1.5 : 1;
        if (sameN === 0) score += 2 * weight;
        else if (sameN === 1) score += 1 * weight;
        else if (sameN === 2) score -= 3 * weight;
        else score -= 8 * weight;
      }
    }

    const desertIdx = types.indexOf('desert');
    if (desertIdx === 9) {
      // Centre desert: classic / beginner preferred
      score += modeId === 'beginner' ? 8 : 0.5;
    } else if (modeId === 'beginner' && desertIdx >= 0) {
      score -= 4; // prefer centre desert for beginners
    }

    if (score > bestScore) {
      bestScore = score;
      best = types;
    }
  }
  return best;
}

/** Rotate axial hex 60° clockwise around origin (pointy-top cube rotate). */
function rot60(q, r) {
  return { q: -r, r: q + r };
}

function rot60n(q, r, times) {
  let cq = q;
  let cr = r;
  const t = ((times % 6) + 6) % 6;
  for (let i = 0; i < t; i++) {
    const n = rot60(cq, cr);
    cq = n.q;
    cr = n.r;
  }
  return { q: cq, r: cr };
}

/**
 * Official Catan number placement:
 * 1. Start at one corner of the island
 * 2. Place tokens A → R in alphabetical order
 * 3. Spiral **counter-clockwise** toward the center
 * 4. Skip the desert (no token; continue with the next letter on the next land)
 *
 * Random start = whole-board 60° rotations (pick any corner as A; keeps A–R spacing).
 * @returns {{ numbers: (number|null)[], letters: (string|null)[] }}
 */
function placeNumbersAlphabet(types, { randomStart = true } = {}) {
  const n = types.length;
  const numbers = new Array(n).fill(null);
  const letters = new Array(n).fill(null);

  // Map (q,r) → tile index
  const indexByKey = {};
  HEX_COORDS.forEach((c, i) => {
    indexByKey[`${c.q},${c.r}`] = i;
  });

  // Rotate entire spiral 0–5 × 60° so "A" starts at a random outer corner
  // (official: "start at any corner"). Direction stays counter-clockwise.
  const turns = randomStart ? Math.floor(Math.random() * 6) : 0;

  const spiralCoords = HEX_SPIRAL_ORDER.map((idx) => {
    const base = HEX_COORDS[idx];
    return rot60n(base.q, base.r, turns);
  });

  let li = 0;
  for (const { q, r } of spiralCoords) {
    const hexIdx = indexByKey[`${q},${r}`];
    if (hexIdx == null) continue;
    if (types[hexIdx] === 'desert') continue; // 沙漠跳過
    if (li >= NUMBER_LETTERS.length) {
      // noDesert board: 19th land hex — extra mid-pip token (not official letter)
      const extras = [3, 4, 5, 9, 10, 11];
      numbers[hexIdx] = extras[Math.floor(Math.random() * extras.length)];
      letters[hexIdx] = null;
      continue;
    }
    const tok = NUMBER_LETTERS[li++];
    numbers[hexIdx] = tok.number;
    letters[hexIdx] = tok.letter;
  }

  // Safety: any remaining land without a number
  for (let i = 0; i < n; i++) {
    if (types[i] !== 'desert' && numbers[i] == null) {
      numbers[i] = 4;
      letters[i] = null;
    }
  }

  return { numbers, letters };
}

/**
 * Assign number tokens — always official A–R counter-clockwise spiral.
 */
function placeNumbers(types, modeId = 'balanced') {
  // beginner: fixed corner start; other modes: random corner (still CCW A–R)
  return placeNumbersAlphabet(types, { randomStart: modeId !== 'beginner' });
}

function scoreNumberLayout(types, assign, opts = {}) {
  const beginner = !!opts.beginner;
  let score = 0;
  const pipByRes = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const highByRes = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };

  for (let i = 0; i < types.length; i++) {
    const n = assign[i];
    if (n == null) continue;
    const pips = NUMBER_PIPS[n];
    pipByRes[types[i]] += pips;
    if (n === 6 || n === 8) highByRes[types[i]]++;

    for (const j of HEX_ADJ[i]) {
      if (j < i) continue;
      const m = assign[j];
      if (m == null) continue;
      const pj = NUMBER_PIPS[m];

      // Hard classic rule: 6/8 never adjacent
      if ((n === 6 || n === 8) && (m === 6 || m === 8)) {
        score -= 100;
      }
      // Soft: high pips next to each other
      const adjPen = beginner ? 1.5 : 1;
      if (pips + pj >= 9) score -= 6 * adjPen;
      else if (pips + pj >= 8) score -= 2 * adjPen;

      if (types[i] === types[j] && pips >= 4 && pj >= 4) score -= 8 * adjPen;
    }
  }

  const values = Object.values(pipByRes);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const balW = beginner ? 1.4 : 0.8;
  for (const v of values) {
    const d = Math.abs(v - avg);
    score -= d * d * balW;
  }

  if (pipByRes.brick < 8) score -= (8 - pipByRes.brick) * 3;
  if (pipByRes.ore < 8) score -= (8 - pipByRes.ore) * 3;
  if (pipByRes.brick > 16) score -= (pipByRes.brick - 16) * 2;
  if (pipByRes.ore > 16) score -= (pipByRes.ore - 16) * 2;

  for (const r of Object.keys(highByRes)) {
    if (highByRes[r] >= 2) score -= 15 * (highByRes[r] - 1);
    if (highByRes[r] === 1) score += 2;
  }

  for (let i = 0; i < types.length; i++) {
    const n = assign[i];
    if (n !== 2 && n !== 12) continue;
    if (types[i] === 'brick' || types[i] === 'ore') score -= 3;
  }

  return score;
}

/** Greedy swaps to eliminate adjacent 6/8 and improve balance */
function repairNumberLayout(types, assign, opts = {}) {
  const a = [...assign];
  const light = !!opts.light;
  const isRed = (n) => n === 6 || n === 8;

  for (let pass = 0; pass < 40; pass++) {
    let fixed = false;
    for (let i = 0; i < a.length; i++) {
      if (!isRed(a[i])) continue;
      for (const j of HEX_ADJ[i]) {
        if (!isRed(a[j])) continue;
        let swapped = false;
        for (let k = 0; k < a.length; k++) {
          if (a[k] == null || isRed(a[k])) continue;
          if (HEX_ADJ[k].some((nb) => isRed(a[nb]))) continue;
          [a[j], a[k]] = [a[k], a[j]];
          swapped = true;
          fixed = true;
          break;
        }
        if (!swapped) {
          for (let k = 0; k < a.length; k++) {
            if (a[k] == null || isRed(a[k])) continue;
            if (HEX_ADJ[k].some((nb) => isRed(a[nb]))) continue;
            [a[i], a[k]] = [a[k], a[i]];
            fixed = true;
            break;
          }
        }
      }
    }
    if (!fixed) break;
  }

  if (light) return a;

  // Hill-climb random swaps for better score
  let best = [...a];
  let bestScore = scoreNumberLayout(types, best, opts);
  const climbs = opts.beginner ? 180 : 120;
  for (let t = 0; t < climbs; t++) {
    const land = [];
    for (let i = 0; i < a.length; i++) if (a[i] != null) land.push(i);
    const i = land[Math.floor(Math.random() * land.length)];
    const j = land[Math.floor(Math.random() * land.length)];
    if (i === j) continue;
    [a[i], a[j]] = [a[j], a[i]];
    const s = scoreNumberLayout(types, a, opts);
    if (s >= bestScore) {
      bestScore = s;
      best = [...a];
    } else {
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return best;
}

/**
 * Canonical vertex id: round pixel coords so shared corners merge.
 */
function vertexIdFromPixel(x, y) {
  return `${Math.round(x)},${Math.round(y)}`;
}

/**
 * Build full board: tiles, vertices, edges, adjacency.
 * @param {{ mapMode?: string, noDesert?: boolean }} [opts]
 *   mapMode: balanced | noDesert | beginner | clustered | random | wild
 *   noDesert: legacy flag (maps to noDesert mode if mapMode omitted)
 */
export function generateBoard(opts = {}) {
  let modeId = opts.mapMode || (opts.noDesert ? 'noDesert' : 'balanced');
  if (!MAP_MODES[modeId]) modeId = 'balanced';
  const mode = MAP_MODES[modeId];
  const noDesert = mode.noDesert;

  const types = placeTerrainTypes(modeId);
  const { numbers, letters } = placeNumbers(types, modeId);

  const tiles = [];
  const tileByKey = {};
  let desertId = null;

  HEX_COORDS.forEach((coord, i) => {
    const type = types[i];
    const pixel = axialToPixel(coord.q, coord.r);
    const number = type === 'desert' ? null : numbers[i];
    const letter = type === 'desert' ? null : letters[i];
    if (type === 'desert') desertId = i;
    const pips = number != null ? NUMBER_PIPS[number] : 0;
    const tile = {
      id: i,
      q: coord.q,
      r: coord.r,
      type,
      number,
      letter, // official chit letter A–R (null if desert / extra)
      pips, // dice ways / 36
      probability: number != null ? pips / 36 : 0,
      robber: false,
      cx: pixel.x,
      cy: pixel.y,
      vertexIds: [],
    };
    tiles.push(tile);
    tileByKey[hexKey(coord.q, coord.r)] = tile;
  });

  // Robber starts on desert, or (no-desert) on a low-pip tile
  let robberTileId = desertId;
  if (robberTileId == null) {
    let best = 0;
    let bestPips = Infinity;
    for (const t of tiles) {
      const p = t.number != null ? NUMBER_PIPS[t.number] : 99;
      if (p < bestPips || (p === bestPips && Math.random() < 0.5)) {
        bestPips = p;
        best = t.id;
      }
    }
    robberTileId = best;
  }
  tiles[robberTileId].robber = true;

  // Build vertices from all hex corners
  const vertices = {};
  for (const tile of tiles) {
    for (let c = 0; c < 6; c++) {
      const p = hexCorner(tile.cx, tile.cy, HEX_SIZE, c);
      const vid = vertexIdFromPixel(p.x, p.y);
      if (!vertices[vid]) {
        vertices[vid] = {
          id: vid,
          x: p.x,
          y: p.y,
          tiles: [],
          edges: [],
          neighbors: [], // adjacent vertex ids
          building: null, // { playerId, type: 'settlement'|'city' }
          port: null, // { ratio, resource }
        };
      }
      if (!vertices[vid].tiles.includes(tile.id)) {
        vertices[vid].tiles.push(tile.id);
      }
      tile.vertexIds[c] = vid;
    }
  }

  // Build edges from consecutive corners of each hex
  const edges = {};
  for (const tile of tiles) {
    for (let c = 0; c < 6; c++) {
      const a = tile.vertexIds[c];
      const b = tile.vertexIds[(c + 1) % 6];
      const eid = edgeId(a, b);
      if (!edges[eid]) {
        edges[eid] = {
          id: eid,
          a,
          b,
          road: null, // playerId
          tiles: [],
        };
      }
      if (!edges[eid].tiles.includes(tile.id)) {
        edges[eid].tiles.push(tile.id);
      }
    }
  }

  // Vertex neighbor graph via edges
  for (const e of Object.values(edges)) {
    vertices[e.a].edges.push(e.id);
    vertices[e.b].edges.push(e.id);
    if (!vertices[e.a].neighbors.includes(e.b)) vertices[e.a].neighbors.push(e.b);
    if (!vertices[e.b].neighbors.includes(e.a)) vertices[e.b].neighbors.push(e.a);
  }

  // Assign ports on coastal vertices (vertices with fewer than 3 land tiles)
  assignPorts(vertices, edges, tiles);

  return {
    tiles,
    tileByKey,
    vertices,
    edges,
    desertId,
    noDesert,
    mapMode: modeId,
    mapLabel: mode.label,
    hexSize: HEX_SIZE,
    robberTileId,
  };
}

function edgeId(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export { edgeId };

/**
 * Place 9 ports around the coast on pairs of adjacent coastal vertices.
 */
function assignPorts(vertices, edges, tiles) {
  // Coastal edges: exactly one land tile
  const coastalEdges = Object.values(edges).filter((e) => e.tiles.length === 1);

  // Group into a rough perimeter order by angle from center
  const edgeMid = (e) => {
    const va = vertices[e.a];
    const vb = vertices[e.b];
    return { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, e };
  };

  const mids = coastalEdges.map(edgeMid);
  mids.sort((p, q) => {
    const aa = Math.atan2(p.y - ORIGIN_Y, p.x - ORIGIN_X);
    const ab = Math.atan2(q.y - ORIGIN_Y, q.x - ORIGIN_X);
    return aa - ab;
  });

  // Pick every ~2nd coastal edge for ports (9 ports)
  const portDefs = [
    { ratio: 3, resource: null },
    { ratio: 2, resource: 'wood' },
    { ratio: 3, resource: null },
    { ratio: 2, resource: 'brick' },
    { ratio: 3, resource: null },
    { ratio: 2, resource: 'sheep' },
    { ratio: 3, resource: null },
    { ratio: 2, resource: 'wheat' },
    { ratio: 2, resource: 'ore' },
  ];

  const step = Math.max(1, Math.floor(mids.length / portDefs.length));
  const usedVerts = new Set();
  let pi = 0;

  for (let i = 0; i < mids.length && pi < portDefs.length; i += step) {
    const { e } = mids[i];
    if (usedVerts.has(e.a) || usedVerts.has(e.b)) continue;
    const def = portDefs[pi++];
    vertices[e.a].port = { ...def };
    vertices[e.b].port = { ...def };
    usedVerts.add(e.a);
    usedVerts.add(e.b);
    e.port = def;
  }
}

export function getHexPolygonPoints(cx, cy, size = HEX_SIZE) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const p = hexCorner(cx, cy, size, i);
    pts.push(`${p.x},${p.y}`);
  }
  return pts.join(' ');
}

export function tileFill(type) {
  return RES_COLOR[type] || '#888';
}

/** Distance rule: no adjacent buildings */
export function canPlaceSettlement(board, vertexId, playerId, isSetup, playerRoads) {
  const v = board.vertices[vertexId];
  if (!v || v.building) return false;

  // Distance: neighbors must not have buildings
  for (const nid of v.neighbors) {
    if (board.vertices[nid].building) return false;
  }

  if (isSetup) return true;

  // Must connect to own road
  return v.edges.some((eid) => {
    const e = board.edges[eid];
    return e.road === playerId;
  });
}

export function canPlaceRoad(board, edgeIdStr, playerId, isSetup, setupVertexId = null) {
  const e = board.edges[edgeIdStr];
  // Note: player id 0 is valid — must use != null, not truthiness
  if (!e || e.road != null) return false;

  const va = board.vertices[e.a];
  const vb = board.vertices[e.b];

  if (isSetup && setupVertexId) {
    // Road must touch the settlement just placed
    return e.a === setupVertexId || e.b === setupVertexId;
  }

  // Connected to own road or own building
  const touchesOwn = (vid) => {
    const v = board.vertices[vid];
    if (v.building && v.building.playerId === playerId) return true;
    return v.edges.some((eid) => {
      if (eid === edgeIdStr) return false;
      return board.edges[eid].road === playerId;
    });
  };

  // Block if middle of opponent's building? Roads can touch opponent buildings but
  // path is interrupted for longest road — placement still allowed if connected to own network.
  return touchesOwn(e.a) || touchesOwn(e.b);
}

/** Best trade rate for player for a given resource (give type) */
export function getTradeRate(board, playerId, giveResource) {
  let best = 4;
  for (const v of Object.values(board.vertices)) {
    if (!v.building || v.building.playerId !== playerId || !v.port) continue;
    const p = v.port;
    if (p.ratio === 3 && p.resource === null) best = Math.min(best, 3);
    if (p.ratio === 2 && p.resource === giveResource) best = Math.min(best, 2);
  }
  return best;
}

/** Longest continuous road for a player */
export function computeLongestRoad(board, playerId) {
  const playerEdges = Object.values(board.edges).filter((e) => e.road === playerId);
  if (playerEdges.length === 0) return 0;

  // Build adjacency of vertices via player's roads, broken by opponent buildings
  const adj = {};
  const add = (a, b) => {
    if (!adj[a]) adj[a] = [];
    adj[a].push(b);
  };

  for (const e of playerEdges) {
    // Opponent settlement/city blocks path *through* that vertex (edge still counts)
    add(e.a, e.b);
    add(e.b, e.a);
  }

  // DFS longest path in road graph (small graph, OK)
  let maxLen = 0;
  const nodes = Object.keys(adj);

  function isOppBlock(vid) {
    const b = board.vertices[vid].building;
    return b && b.playerId !== playerId;
  }

  function dfs(node, visitedEdges, length) {
    maxLen = Math.max(maxLen, length);
    // Cannot continue through an opponent's building (can only end there)
    if (length > 0 && isOppBlock(node)) return;

    const neighbors = adj[node] || [];
    for (const next of neighbors) {
      const eid = edgeId(node, next);
      if (visitedEdges.has(eid)) continue;
      visitedEdges.add(eid);
      dfs(next, visitedEdges, length + 1);
      visitedEdges.delete(eid);
    }
  }

  for (const n of nodes) {
    // May start at a vertex even if opponent sits there (path ends at them from other side)
    dfs(n, new Set(), 0);
  }

  return maxLen;
}

export function verticesAdjacentToTile(board, tileId) {
  return Object.values(board.vertices).filter((v) => v.tiles.includes(tileId));
}
