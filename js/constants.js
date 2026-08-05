/** Shared constants for Catan */

export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export const RES_LABEL = {
  wood: '木頭',
  brick: '磚塊',
  sheep: '羊毛',
  wheat: '小麥',
  ore: '礦石',
};

export const RES_EMOJI = {
  wood: '🪵',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
};

export const RES_COLOR = {
  wood: '#5a8f3c',
  brick: '#c45c3e',
  sheep: '#8bc34a',
  wheat: '#e8c547',
  ore: '#7a8a9a',
  desert: '#d4b896',
};

export const TILE_EMOJI = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
  desert: '🏜️',
};

/** Terrain name shown on each hex */
export const TILE_LABEL = {
  wood: '森林',
  brick: '丘陵',
  sheep: '牧場',
  wheat: '農田',
  ore: '山地',
  desert: '沙漠',
};

/** Resource produced (empty for desert) */
export const TILE_RESOURCE_LABEL = {
  wood: '木頭',
  brick: '磚塊',
  sheep: '羊毛',
  wheat: '小麥',
  ore: '礦石',
  desert: '無資源',
};

export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};

export const PLAYER_COLORS = [
  { id: 'red', name: '紅', hex: '#ff3b30', dark: '#a93226' },
  { id: 'blue', name: '藍', hex: '#1e90ff', dark: '#1a5276' },
  { id: 'orange', name: '橙', hex: '#ff9500', dark: '#a04000' },
  { id: 'white', name: '白', hex: '#f5f5f7', dark: '#6b7280' },
];

export const DEV_TYPES = {
  knight: { label: '騎士', emoji: '⚔️', desc: '移動強盜並搶奪' },
  victory: { label: '勝利點', emoji: '⭐', desc: '隱藏 +1 分' },
  roadBuilding: { label: '道路建設', emoji: '🛤️', desc: '免費建 2 條路' },
  yearOfPlenty: { label: '豐收之年', emoji: '🎁', desc: '獲得任意 2 資源' },
  monopoly: { label: '壟斷', emoji: '👑', desc: '拿走所有人的某種資源' },
};

/** Standard Catan resource tile counts (with desert) */
export const TILE_TYPES = [
  ...Array(4).fill('wood'),
  ...Array(3).fill('brick'),
  ...Array(4).fill('sheep'),
  ...Array(4).fill('wheat'),
  ...Array(3).fill('ore'),
  'desert',
];

/** Number tokens (no 7); desert gets none — 18 tokens */
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

/**
 * Official Catan number chits A–R (letter printed on each token).
 * Place in alphabetical order along the board spiral; skip desert.
 */
export const NUMBER_LETTERS = [
  { letter: 'A', number: 5 },
  { letter: 'B', number: 2 },
  { letter: 'C', number: 6 },
  { letter: 'D', number: 3 },
  { letter: 'E', number: 8 },
  { letter: 'F', number: 10 },
  { letter: 'G', number: 9 },
  { letter: 'H', number: 12 },
  { letter: 'I', number: 11 },
  { letter: 'J', number: 4 },
  { letter: 'K', number: 8 },
  { letter: 'L', number: 10 },
  { letter: 'M', number: 9 },
  { letter: 'N', number: 4 },
  { letter: 'O', number: 5 },
  { letter: 'P', number: 6 },
  { letter: 'Q', number: 3 },
  { letter: 'R', number: 11 },
];

/**
 * Official Catan number-token spiral (indices into HEX_COORDS):
 * Start at a corner of the island, go **counter-clockwise** around the outer
 * ring, then the middle ring, then the center. Place tokens A→R in this order;
 * skip desert. (Whole-board 60° rotation = start at a different corner.)
 *
 *   Visual (pointy-top, north up) starting at top corner (0,-2):
 *   outer CCW: top → NW → W → SW → S → SE → E → NE …
 */
export const HEX_SPIRAL_ORDER = [
  // outer 12 — CCW from top corner (0,-2)
  0, 3, 7, 12, 16, 17, 18, 15, 11, 6, 2, 1,
  // middle 6 — continue CCW inward
  5, 4, 8, 13, 14, 10,
  // center
  9,
];

/** Dice ways out of 36 for each number token */
export const NUMBER_PIPS = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

/** Map presets shown on start screen */
export const MAP_MODES = {
  balanced: {
    id: 'balanced',
    label: '經典平衡',
    desc: '資源分散；數字由角落 A→R 逆時針螺旋（沙漠跳過）',
    noDesert: false,
  },
  noDesert: {
    id: 'noDesert',
    label: '無沙漠',
    desc: '沙漠換成資源格；數字由角落 A→R 逆時針螺旋',
    noDesert: true,
  },
  beginner: {
    id: 'beginner',
    label: '新手友善',
    desc: '沙漠置中、資源極分散；數字 A→R 逆時針螺旋',
    noDesert: false,
  },
  clustered: {
    id: 'clustered',
    label: '資源聚集',
    desc: '同類資源連成一片；數字 A→R 逆時針螺旋',
    noDesert: false,
  },
  random: {
    id: 'random',
    label: '資源隨機',
    desc: '地形隨機；數字由角落 A→R 逆時針螺旋（沙漠跳過）',
    noDesert: false,
  },
  wild: {
    id: 'wild',
    label: '狂野無沙漠',
    desc: '無沙漠 + 地形隨機；數字 A→R 逆時針 + 多一格',
    noDesert: true,
  },
};

/**
 * Build tile type list for a game.
 * noDesert: replace desert with one extra resource (random among 5 types).
 */
export function getTileTypes(noDesert = false) {
  if (!noDesert) return [...TILE_TYPES];
  const extra = ['wood', 'brick', 'sheep', 'wheat', 'ore'][
    Math.floor(Math.random() * 5)
  ];
  return [
    ...Array(4).fill('wood'),
    ...Array(3).fill('brick'),
    ...Array(4).fill('sheep'),
    ...Array(4).fill('wheat'),
    ...Array(3).fill('ore'),
    extra,
  ];
}

/**
 * Number tokens for land tiles.
 * noDesert: 19 land tiles → add one mid-probability token (not 6/8).
 */
export function getNumberTokens(noDesert = false) {
  if (!noDesert) return [...NUMBER_TOKENS];
  const extras = [3, 4, 5, 9, 10, 11];
  const extra = extras[Math.floor(Math.random() * extras.length)];
  return [...NUMBER_TOKENS, extra];
}

/** Probability label helpers */
export function formatProbability(number) {
  const pips = NUMBER_PIPS[number];
  if (pips == null) return { pips: 0, fraction: '—', percent: '—', dots: '' };
  const percent = ((pips / 36) * 100).toFixed(1) + '%';
  return {
    pips,
    fraction: `${pips}/36`,
    percent,
    dots: '●'.repeat(pips),
  };
}

/**
 * Axial coordinates for standard 19-hex board (pointy-top).
 * Center at (0,0).
 */
export const HEX_COORDS = [
  // row r = -2
  { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
  // r = -1
  { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
  // r = 0
  { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
  // r = 1
  { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  // r = 2
  { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 },
];

/**
 * Ports: edge midpoints of board perimeter.
 * ratio: 3 = 3:1 any, or 2 with resource type
 */
export const PORTS = [
  { vertices: null, ratio: 3, resource: null, label: '3:1' }, // assigned at generation by edge index
];

/** Development card deck composition */
export const DEV_DECK_TEMPLATE = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('victory'),
  ...Array(2).fill('roadBuilding'),
  ...Array(2).fill('yearOfPlenty'),
  ...Array(2).fill('monopoly'),
];

export const VP_TO_WIN = 10;
export const MAX_ROADS = 15;
export const MAX_SETTLEMENTS = 5;
export const MAX_CITIES = 4;
