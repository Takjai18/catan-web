/**
 * Core Catan game state and rules.
 */

import {
  RESOURCES,
  RES_LABEL,
  COSTS,
  PLAYER_COLORS,
  DEV_DECK_TEMPLATE,
  DEV_TYPES,
  VP_TO_WIN,
  MAX_ROADS,
  MAX_SETTLEMENTS,
  MAX_CITIES,
} from './constants.js';
import {
  generateBoard,
  canPlaceSettlement,
  canPlaceRoad,
  getTradeRate,
  computeLongestRoad,
  shuffle,
  verticesAdjacentToTile,
} from './board.js';

export function createEmptyResources() {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function totalResources(res) {
  return RESOURCES.reduce((s, r) => s + res[r], 0);
}

export function canAfford(res, cost) {
  return Object.entries(cost).every(([k, v]) => res[k] >= v);
}

export function pay(res, cost) {
  const next = { ...res };
  for (const [k, v] of Object.entries(cost)) next[k] -= v;
  return next;
}

export function addRes(res, gain) {
  const next = { ...res };
  for (const [k, v] of Object.entries(gain)) next[k] = (next[k] || 0) + v;
  return next;
}

/**
 * @param {{
 *   name?: string,
 *   names?: string[],
 *   humanCount?: number,
 *   aiCount?: number,
 *   mapMode?: string,
 *   noDesert?: boolean
 * }} opts
 */
export function createGame(opts) {
  const board = generateBoard({
    mapMode: opts.mapMode,
    noDesert: !!opts.noDesert,
  });

  let humanCount = opts.humanCount != null ? +opts.humanCount : 1;
  let aiCount = opts.aiCount != null ? +opts.aiCount : 0;
  humanCount = Math.max(1, Math.min(4, humanCount));
  aiCount = Math.max(0, Math.min(3, aiCount));
  let totalPlayers = humanCount + aiCount;
  if (totalPlayers < 2) {
    aiCount = 1;
    totalPlayers = humanCount + aiCount;
  }
  if (totalPlayers > 4) {
    aiCount = Math.max(0, 4 - humanCount);
    totalPlayers = humanCount + aiCount;
  }

  const names = opts.names || [];
  const players = [];

  for (let i = 0; i < totalPlayers; i++) {
    const color = PLAYER_COLORS[i];
    const isAI = i >= humanCount;
    let name;
    if (isAI) {
      name = `AI ${color.name}`;
    } else if (names[i]?.trim()) {
      name = names[i].trim();
    } else if (i === 0 && opts.name) {
      name = opts.name;
    } else {
      name = `玩家${i + 1}`;
    }
    players.push({
      id: i,
      name,
      isAI,
      color: color.hex,
      colorId: color.id,
      resources: createEmptyResources(),
      devCards: [], // { type, playable: bool } — bought this turn not playable
      knightsPlayed: 0,
      settlements: 0,
      cities: 0,
      roads: 0,
      victoryPointsHidden: 0,
      longestRoadLen: 0,
    });
  }

  const devDeck = shuffle([...DEV_DECK_TEMPLATE]);

  return {
    board,
    players,
    humanCount,
    currentPlayer: 0,
    phase: 'setup', // setup | roll | main | robber | discard | roadBuilding | gameover
    setupIndex: 0, // 0..2*n-1 snake order
    setupStep: 'settlement', // settlement | road
    setupLastVertex: null,
    hasRolled: false,
    dice: [0, 0],
    longestRoadPlayer: null,
    largestArmyPlayer: null,
    freeRoads: 0, // from road building card
    mustMoveRobber: false,
    /** If true, after robber/steal return to roll (knight played before dice) */
    returnToRollAfterRobber: false,
    discardQueue: [], // player ids who need to discard
    log: [],
    winner: null,
    devDeck,
    // Pending domestic trade offer (hot-seat accept)
    pendingTrade: null, // { fromId, toId, give: resMap, get: resMap }
    turnDevPlayed: false,
    pendingSteal: null, // { from candidates after robber }
    buildMode: null, // 'road' | 'settlement' | 'city' | null
  };
}

export function log(game, msg, opts = {}) {
  game.log.unshift({ msg, t: Date.now(), ...opts });
  if (game.log.length > 80) game.log.pop();
}

/** Setup placement order: 0,1,2,3,3,2,1,0 */
export function setupPlayerOrder(n) {
  const forward = Array.from({ length: n }, (_, i) => i);
  const back = [...forward].reverse();
  return [...forward, ...back];
}

export function getSetupPlayer(game) {
  const order = setupPlayerOrder(game.players.length);
  return order[game.setupIndex];
}

export function publicVP(game, playerId) {
  const p = game.players[playerId];
  let vp = p.settlements + p.cities * 2;
  if (game.longestRoadPlayer === playerId) vp += 2;
  if (game.largestArmyPlayer === playerId) vp += 2;
  return vp;
}

export function totalVP(game, playerId) {
  return publicVP(game, playerId) + game.players[playerId].victoryPointsHidden;
}

export function updateLongestRoad(game) {
  let best = 0;
  let bestId = null;
  for (const p of game.players) {
    p.longestRoadLen = computeLongestRoad(game.board, p.id);
    if (p.longestRoadLen >= 5 && p.longestRoadLen > best) {
      best = p.longestRoadLen;
      bestId = p.id;
    }
  }
  // Need strictly longer than current holder to steal, or first to 5
  if (game.longestRoadPlayer != null) {
    const holder = game.players[game.longestRoadPlayer];
    const holderLen = holder.longestRoadLen;
    if (holderLen < 5) {
      game.longestRoadPlayer = bestId;
      if (bestId != null) log(game, `${game.players[bestId].name} 取得最長道路！`, { important: true });
    } else {
      // someone longer?
      let stealer = null;
      for (const p of game.players) {
        if (p.id !== game.longestRoadPlayer && p.longestRoadLen > holderLen) {
          stealer = p.id;
          best = p.longestRoadLen;
        }
      }
      if (stealer != null) {
        game.longestRoadPlayer = stealer;
        log(game, `${game.players[stealer].name} 搶走最長道路！`, { important: true });
      }
    }
  } else if (bestId != null) {
    game.longestRoadPlayer = bestId;
    log(game, `${game.players[bestId].name} 取得最長道路！`, { important: true });
  }
}

export function updateLargestArmy(game) {
  let best = 0;
  let bestId = null;
  for (const p of game.players) {
    if (p.knightsPlayed >= 3 && p.knightsPlayed > best) {
      best = p.knightsPlayed;
      bestId = p.id;
    }
  }

  if (game.largestArmyPlayer != null) {
    const holderId = game.largestArmyPlayer;
    const holderKnights = game.players[holderId]?.knightsPlayed ?? 0;
    // Holder lost eligibility (shouldn't happen) — reassign to current best
    if (holderKnights < 3) {
      if (bestId != null && bestId !== holderId) {
        game.largestArmyPlayer = bestId;
        log(game, `${game.players[bestId].name} 取得最大軍隊！`, { important: true });
      } else if (bestId == null) {
        game.largestArmyPlayer = null;
      }
      return;
    }
    // Must be strictly more knights than current holder
    if (bestId != null && bestId !== holderId && best > holderKnights) {
      game.largestArmyPlayer = bestId;
      log(game, `${game.players[bestId].name} 搶走最大軍隊！`, { important: true });
    }
  } else if (bestId != null) {
    game.largestArmyPlayer = bestId;
    log(game, `${game.players[bestId].name} 取得最大軍隊！`, { important: true });
  }
}

export function checkWin(game) {
  for (const p of game.players) {
    if (totalVP(game, p.id) >= VP_TO_WIN) {
      game.phase = 'gameover';
      game.winner = p.id;
      log(game, `🏆 ${p.name} 以 ${totalVP(game, p.id)} 分獲勝！`, { important: true });
      return true;
    }
  }
  return false;
}

export function placeSettlement(game, vertexId) {
  const pid = game.phase === 'setup' ? getSetupPlayer(game) : game.currentPlayer;
  const p = game.players[pid];
  const isSetup = game.phase === 'setup';

  if (!canPlaceSettlement(game.board, vertexId, pid, isSetup)) {
    return { ok: false, error: '無法在此放置村莊' };
  }
  if (!isSetup) {
    if (p.settlements >= MAX_SETTLEMENTS) return { ok: false, error: '村莊已達上限' };
    if (!canAfford(p.resources, COSTS.settlement)) return { ok: false, error: '資源不足' };
    p.resources = pay(p.resources, COSTS.settlement);
  }

  game.board.vertices[vertexId].building = { playerId: pid, type: 'settlement' };
  p.settlements++;

  if (isSetup) {
    // Second settlement (setup index >= n) gets starting resources
    const n = game.players.length;
    if (game.setupIndex >= n) {
      const v = game.board.vertices[vertexId];
      const gain = createEmptyResources();
      for (const tid of v.tiles) {
        const t = game.board.tiles[tid];
        if (t.type !== 'desert') gain[t.type]++;
      }
      p.resources = addRes(p.resources, gain);
      const parts = RESOURCES.filter((r) => gain[r] > 0).map((r) => `${RES_LABEL[r]}×${gain[r]}`);
      if (parts.length) log(game, `${p.name} 起始資源：${parts.join('、')}`, { gain: true });
    }
    game.setupLastVertex = vertexId;
    game.setupStep = 'road';
    log(game, `${p.name} 放置了村莊`);
  } else {
    log(game, `${p.name} 建造了村莊`);
    updateLongestRoad(game);
    checkWin(game);
  }
  return { ok: true };
}

export function placeRoad(game, edgeIdStr) {
  const pid =
    game.phase === 'setup'
      ? getSetupPlayer(game)
      : game.currentPlayer;
  const p = game.players[pid];
  const isSetup = game.phase === 'setup';
  // Free roads only while resolving the Road Building dev card
  const free = game.freeRoads > 0 && game.phase === 'roadBuilding';

  if (!canPlaceRoad(game.board, edgeIdStr, pid, isSetup, game.setupLastVertex)) {
    return { ok: false, error: '無法在此放置道路' };
  }
  if (p.roads >= MAX_ROADS) return { ok: false, error: '道路已達上限' };

  if (!isSetup && !free) {
    if (!canAfford(p.resources, COSTS.road)) return { ok: false, error: '資源不足' };
    p.resources = pay(p.resources, COSTS.road);
  }

  game.board.edges[edgeIdStr].road = pid;
  p.roads++;

  if (isSetup) {
    log(game, `${p.name} 放置了道路`);
    game.setupIndex++;
    game.setupStep = 'settlement';
    game.setupLastVertex = null;
    if (game.setupIndex >= game.players.length * 2) {
      game.phase = 'roll';
      game.currentPlayer = 0;
      log(
        game,
        `設置完成！遊戲開始 — 由 ${game.players[0].name} 先手。`,
        { important: true }
      );
    }
  } else {
    log(game, `${p.name} 建造了道路`);
    if (free) {
      game.freeRoads--;
    }
    updateLongestRoad(game);
    checkWin(game);
    // End free-road phase if done or nowhere left to build
    resolveRoadBuildingPhase(game);
  }
  return { ok: true };
}

/** Exit roadBuilding when free roads used up or no legal edges remain */
export function resolveRoadBuildingPhase(game) {
  if (game.phase !== 'roadBuilding') return;
  const pid = game.currentPlayer;
  const canBuild =
    game.freeRoads > 0 &&
    game.players[pid].roads < MAX_ROADS &&
    getPlaceableRoads(game, pid, false).length > 0;
  if (!canBuild) {
    if (game.freeRoads > 0) {
      log(game, `${game.players[pid].name} 無法再放置免費道路`);
    }
    game.freeRoads = 0;
    game.phase = 'main';
  }
}

/**
 * Recover from stuck intermediate states (empty queues, impossible free roads, etc.)
 * @returns {boolean} true if state was changed
 */
/** After robber / steal, go to main — or back to roll if knight was pre-roll */
export function phaseAfterRobber(game) {
  if (game.returnToRollAfterRobber && !game.hasRolled) {
    game.returnToRollAfterRobber = false;
    game.phase = 'roll';
    game.mustMoveRobber = false;
    return 'roll';
  }
  game.returnToRollAfterRobber = false;
  game.phase = 'main';
  game.mustMoveRobber = false;
  return 'main';
}

export function ensurePlayableState(game) {
  if (!game || game.phase === 'gameover') return false;
  let changed = false;

  // Stale trade from a previous turn — cancel
  if (
    game.pendingTrade &&
    (game.pendingTrade.fromId !== game.currentPlayer || game.phase !== 'main')
  ) {
    const to = game.players[game.pendingTrade.toId];
    log(game, `交易已失效${to ? `（原對象：${to.name}）` : ''}，已取消`);
    game.pendingTrade = null;
    changed = true;
  }

  if (game.phase === 'discard' && !game.discardQueue?.length) {
    game.phase = 'robber';
    game.mustMoveRobber = true;
    changed = true;
  }

  if (game.phase === 'steal' && !game.pendingSteal?.length) {
    game.pendingSteal = null;
    phaseAfterRobber(game);
    changed = true;
  }

  if (game.phase === 'roadBuilding') {
    const before = game.phase;
    resolveRoadBuildingPhase(game);
    if (game.phase !== before) changed = true;
  }

  if (game.phase === 'robber') {
    const others = game.board.tiles.filter((t) => t.id !== game.board.robberTileId);
    if (others.length === 0) {
      phaseAfterRobber(game);
      changed = true;
    }
  }

  // freeRoads residual outside roadBuilding
  if (game.phase !== 'roadBuilding' && game.freeRoads > 0) {
    game.freeRoads = 0;
    changed = true;
  }

  return changed;
}

export function upgradeCity(game, vertexId) {
  const pid = game.currentPlayer;
  const p = game.players[pid];
  const v = game.board.vertices[vertexId];

  if (!v?.building || v.building.playerId !== pid || v.building.type !== 'settlement') {
    return { ok: false, error: '只能升級自己的村莊' };
  }
  if (p.cities >= MAX_CITIES) return { ok: false, error: '城市已達上限' };
  if (!canAfford(p.resources, COSTS.city)) return { ok: false, error: '資源不足' };

  p.resources = pay(p.resources, COSTS.city);
  v.building.type = 'city';
  p.settlements--;
  p.cities++;
  log(game, `${p.name} 升級為城市`);
  checkWin(game);
  return { ok: true };
}

export function rollDice(game) {
  if (game.phase !== 'roll') return { ok: false, error: '現在不能擲骰' };

  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  game.dice = [d1, d2];
  game.hasRolled = true;
  game.returnToRollAfterRobber = false; // rolled; robber from 7 goes to main after
  const sum = d1 + d2;
  const p = game.players[game.currentPlayer];
  log(game, `${p.name} 擲出 ${d1}+${d2}=${sum}`);

  if (sum === 7) {
    // Discard phase
    game.discardQueue = [];
    for (const pl of game.players) {
      if (totalResources(pl.resources) > 7) {
        game.discardQueue.push(pl.id);
      }
    }
    game.mustMoveRobber = true;
    if (game.discardQueue.length > 0) {
      game.phase = 'discard';
      log(game, '有人資源超過 7 張，需丟棄一半', { important: true });
    } else {
      game.phase = 'robber';
      log(game, '移動強盜！', { important: true });
    }
  } else {
    distributeResources(game, sum);
    game.phase = 'main';
  }
  return { ok: true, sum, d1, d2 };
}

function distributeResources(game, number) {
  const gains = game.players.map(() => createEmptyResources());
  for (const tile of game.board.tiles) {
    if (tile.number !== number || tile.robber) continue;
    const verts = verticesAdjacentToTile(game.board, tile.id);
    for (const v of verts) {
      if (!v.building) continue;
      const amt = v.building.type === 'city' ? 2 : 1;
      gains[v.building.playerId][tile.type] += amt;
    }
  }
  for (let i = 0; i < game.players.length; i++) {
    const g = gains[i];
    const parts = RESOURCES.filter((r) => g[r] > 0).map((r) => `${RES_LABEL[r]}×${g[r]}`);
    if (parts.length) {
      game.players[i].resources = addRes(game.players[i].resources, g);
      log(game, `${game.players[i].name} 獲得 ${parts.join('、')}`, { gain: true });
    }
  }
}

export function discardResources(game, playerId, toDiscard) {
  // toDiscard: { wood: n, ... }
  const p = game.players[playerId];
  const need = Math.floor(totalResources(p.resources) / 2);
  const giving = totalResources(toDiscard);
  if (giving !== need) return { ok: false, error: `需丟棄 ${need} 張` };
  for (const r of RESOURCES) {
    if ((toDiscard[r] || 0) > p.resources[r]) return { ok: false, error: '資源不足' };
  }
  p.resources = pay(p.resources, toDiscard);
  game.discardQueue = game.discardQueue.filter((id) => id !== playerId);
  log(game, `${p.name} 丟棄了 ${need} 張資源`);

  if (game.discardQueue.length === 0) {
    game.phase = 'robber';
  }
  return { ok: true };
}

export function moveRobber(game, tileId, stealFromPlayerId = null) {
  if (game.phase !== 'robber') {
    return { ok: false, error: '現在不能移動強盜' };
  }
  if (tileId == null || tileId < 0 || tileId >= game.board.tiles.length) {
    return { ok: false, error: '無效地塊' };
  }
  if (tileId === game.board.robberTileId) {
    return { ok: false, error: '強盜必須移到其他地塊' };
  }

  // Clear old
  for (const t of game.board.tiles) t.robber = false;
  game.board.tiles[tileId].robber = true;
  game.board.robberTileId = tileId;

  const p = game.players[game.currentPlayer];
  log(game, `${p.name} 將強盜移到 ${tileLabel(game.board.tiles[tileId])}`);

  // Steal candidates
  const candidates = new Set();
  for (const v of verticesAdjacentToTile(game.board, tileId)) {
    if (v.building && v.building.playerId !== game.currentPlayer) {
      const op = game.players[v.building.playerId];
      if (totalResources(op.resources) > 0) candidates.add(v.building.playerId);
    }
  }

  game.mustMoveRobber = false;

  if (candidates.size === 0) {
    phaseAfterRobber(game);
    return { ok: true, stole: null };
  }

  const list = [...candidates];
  if (stealFromPlayerId != null && candidates.has(stealFromPlayerId)) {
    return doSteal(game, stealFromPlayerId);
  }

  // For human: need UI pick; for AI auto
  if (p.isAI) {
    const target = list[Math.floor(Math.random() * list.length)];
    return doSteal(game, target);
  }

  game.pendingSteal = list;
  game.phase = 'steal';
  return { ok: true, pendingSteal: list };
}

function tileLabel(t) {
  const names = { wood: '森林', brick: '丘陵', sheep: '牧場', wheat: '農田', ore: '山地', desert: '沙漠' };
  return t.number ? `${names[t.type]}(${t.number})` : names[t.type];
}

export function doSteal(game, targetId) {
  const thief = game.players[game.currentPlayer];
  if (!thief) return { ok: false, error: '無效玩家' };

  // Validate target
  if (targetId === game.currentPlayer) {
    return { ok: false, error: '不能搶自己' };
  }
  const victim = game.players[targetId];
  if (!victim) return { ok: false, error: '無效的搶奪目標' };

  // If UI set a candidate list, enforce it (AI direct steal from moveRobber has pendingSteal null)
  if (game.pendingSteal?.length && !game.pendingSteal.includes(targetId)) {
    return { ok: false, error: '無效的搶奪目標' };
  }
  // Must be in steal phase, or still in robber while AI resolves immediately
  if (game.phase !== 'steal' && game.phase !== 'robber') {
    return { ok: false, error: '現在不能搶奪' };
  }

  const pool = [];
  for (const r of RESOURCES) {
    for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
  }
  if (pool.length === 0) {
    game.pendingSteal = null;
    phaseAfterRobber(game);
    return { ok: true, stole: null };
  }
  const stole = pool[Math.floor(Math.random() * pool.length)];
  victim.resources[stole]--;
  thief.resources[stole]++;
  game.pendingSteal = null;
  phaseAfterRobber(game);
  log(game, `${thief.name} 從 ${victim.name} 搶走了 ${RES_LABEL[stole]}`, { important: true });
  return { ok: true, stole };
}

export function buyDevCard(game) {
  const p = game.players[game.currentPlayer];
  if (game.phase !== 'main') return { ok: false, error: '現在不能買卡' };
  if (!canAfford(p.resources, COSTS.dev)) return { ok: false, error: '資源不足' };
  if (game.devDeck.length === 0) return { ok: false, error: '發展卡已用完' };

  p.resources = pay(p.resources, COSTS.dev);
  const type = game.devDeck.pop();
  p.devCards.push({ type, playable: false, justBought: true });
  log(game, `${p.name} 購買了發展卡`);
  if (type === 'victory') {
    p.victoryPointsHidden++;
    checkWin(game);
  }
  return { ok: true, type };
}

export function playDevCard(game, cardIndex, extra = {}) {
  const p = game.players[game.currentPlayer];
  const card = p.devCards[cardIndex];
  if (!card) return { ok: false, error: '無效卡牌' };
  if (card.type === 'victory') return { ok: false, error: '勝利點卡不能打出' };
  if (card.justBought) return { ok: false, error: '本回合購買的卡不能使用' };
  if (game.turnDevPlayed) return { ok: false, error: '每回合只能打一張發展卡' };

  // Knight may be played before rolling; other cards only in main phase
  if (card.type === 'knight') {
    if (game.phase !== 'main' && game.phase !== 'roll') {
      return { ok: false, error: '現在不能打牌' };
    }
  } else if (game.phase !== 'main') {
    return { ok: false, error: '現在不能打牌' };
  }

  if (card.type === 'knight') {
    p.devCards.splice(cardIndex, 1);
    p.knightsPlayed++;
    game.turnDevPlayed = true;
    updateLargestArmy(game);
    checkWin(game);
    // Pre-roll knight: after robber must still roll dice
    if (game.phase === 'roll' && !game.hasRolled) {
      game.returnToRollAfterRobber = true;
    }
    game.phase = 'robber';
    game.mustMoveRobber = true;
    log(game, `${p.name} 打出騎士`);
    return { ok: true, type: 'knight' };
  }

  if (card.type === 'roadBuilding') {
    p.devCards.splice(cardIndex, 1);
    game.turnDevPlayed = true;
    game.freeRoads = Math.min(2, MAX_ROADS - p.roads);
    if (game.freeRoads === 0) {
      log(game, `${p.name} 打出道路建設，但已無道路可建`);
      return { ok: true, type: 'roadBuilding' };
    }
    game.phase = 'roadBuilding';
    log(game, `${p.name} 打出道路建設，可免費建 ${game.freeRoads} 條路`);
    // Immediately bail if nowhere to place
    resolveRoadBuildingPhase(game);
    return { ok: true, type: 'roadBuilding' };
  }

  if (card.type === 'yearOfPlenty') {
    const picks = extra.resources; // [r1, r2]
    if (!picks || picks.length !== 2 || !picks.every((r) => RESOURCES.includes(r))) {
      return { ok: false, error: '請選擇 2 個資源', needPick: 'yearOfPlenty' };
    }
    p.devCards.splice(cardIndex, 1);
    game.turnDevPlayed = true;
    p.resources[picks[0]]++;
    p.resources[picks[1]]++;
    log(game, `${p.name} 打出豐收之年，獲得 ${RES_LABEL[picks[0]]}、${RES_LABEL[picks[1]]}`, { gain: true });
    return { ok: true, type: 'yearOfPlenty' };
  }

  if (card.type === 'monopoly') {
    const res = extra.resource;
    if (!RESOURCES.includes(res)) {
      return { ok: false, error: '請選擇資源', needPick: 'monopoly' };
    }
    p.devCards.splice(cardIndex, 1);
    game.turnDevPlayed = true;
    let total = 0;
    for (const op of game.players) {
      if (op.id === p.id) continue;
      total += op.resources[res];
      op.resources[res] = 0;
    }
    p.resources[res] += total;
    log(game, `${p.name} 壟斷了 ${RES_LABEL[res]}（共 ${total} 張）`, { important: true });
    return { ok: true, type: 'monopoly' };
  }

  return { ok: false, error: '未知卡牌' };
}

export function bankTrade(game, giveRes, giveCount, getRes) {
  const p = game.players[game.currentPlayer];
  if (game.phase !== 'main') return { ok: false, error: '現在不能交易' };
  if (giveRes === getRes) return { ok: false, error: '不能換同種資源' };
  const rate = getTradeRate(game.board, p.id, giveRes);
  if (giveCount !== rate) {
    // allow if giveCount matches rate
    return { ok: false, error: `此資源需 ${rate}:1 交易` };
  }
  if (p.resources[giveRes] < giveCount) return { ok: false, error: '資源不足' };
  p.resources[giveRes] -= giveCount;
  p.resources[getRes]++;
  log(game, `${p.name} 以 ${giveCount} ${RES_LABEL[giveRes]} 換 1 ${RES_LABEL[getRes]}（銀行）`);
  return { ok: true };
}

function resMapTotal(map) {
  return RESOURCES.reduce((s, r) => s + (map[r] || 0), 0);
}

function formatResMap(map) {
  return RESOURCES.filter((r) => (map[r] || 0) > 0)
    .map((r) => `${RES_LABEL[r]}×${map[r]}`)
    .join('、');
}

/**
 * Domestic trade between current player and another player (Catan rules: any ratio if both agree).
 * give = resources current player gives; get = resources they receive from partner.
 * @returns {{ ok: boolean, error?: string, needAccept?: boolean, pending?: object, auto?: boolean }}
 */
export function proposePlayerTrade(game, toPlayerId, give, get) {
  if (game.phase !== 'main') return { ok: false, error: '現在不能交易' };
  const fromId = game.currentPlayer;
  const from = game.players[fromId];
  const to = game.players[toPlayerId];
  if (!to || to.id === fromId) return { ok: false, error: '請選擇其他玩家' };
  if (resMapTotal(give) === 0 && resMapTotal(get) === 0) {
    return { ok: false, error: '請至少選擇要交換的資源' };
  }
  if (resMapTotal(give) === 0 || resMapTotal(get) === 0) {
    return { ok: false, error: '雙方都要交出至少 1 張資源（不可單向贈送）' };
  }
  for (const r of RESOURCES) {
    if ((give[r] || 0) > from.resources[r]) return { ok: false, error: `${from.name} 的 ${RES_LABEL[r]} 不足` };
    if ((get[r] || 0) > to.resources[r]) return { ok: false, error: `${to.name} 的 ${RES_LABEL[r]} 不足` };
  }

  const offer = {
    fromId,
    toId: toPlayerId,
    give: { ...createEmptyResources(), ...give },
    get: { ...createEmptyResources(), ...get },
  };

  // AI partner: decide immediately
  if (to.isAI) {
    if (aiAcceptsTrade(game, offer)) {
      executePlayerTrade(game, offer);
      return { ok: true, auto: true };
    }
    log(game, `${to.name} 拒絕了交易`, { important: true });
    return { ok: false, error: `${to.name} 拒絕了這筆交易` };
  }

  // Human partner: need accept screen
  game.pendingTrade = offer;
  log(game, `${from.name} 向 ${to.name} 提出交易：給 ${formatResMap(offer.give)}，換 ${formatResMap(offer.get)}`);
  return { ok: true, needAccept: true, pending: offer };
}

export function executePlayerTrade(game, offer) {
  const from = game.players[offer.fromId];
  const to = game.players[offer.toId];
  for (const r of RESOURCES) {
    const g = offer.give[r] || 0;
    const t = offer.get[r] || 0;
    from.resources[r] -= g;
    to.resources[r] += g;
    to.resources[r] -= t;
    from.resources[r] += t;
  }
  game.pendingTrade = null;
  log(
    game,
    `${from.name} 與 ${to.name} 成交：${formatResMap(offer.give)} ⇄ ${formatResMap(offer.get)}`,
    { important: true, gain: true }
  );
  return { ok: true };
}

export function acceptPlayerTrade(game) {
  const offer = game.pendingTrade;
  if (!offer) return { ok: false, error: '沒有待確認的交易' };
  // Trade only valid during proposer's main phase
  if (game.phase !== 'main' || game.currentPlayer !== offer.fromId) {
    game.pendingTrade = null;
    return { ok: false, error: '交易已過期（須在發起方回合內完成）' };
  }
  // Re-validate
  const from = game.players[offer.fromId];
  const to = game.players[offer.toId];
  for (const r of RESOURCES) {
    if ((offer.give[r] || 0) > from.resources[r]) {
      game.pendingTrade = null;
      return { ok: false, error: '發起方資源已變更，交易取消' };
    }
    if ((offer.get[r] || 0) > to.resources[r]) {
      game.pendingTrade = null;
      return { ok: false, error: '你的資源不足，無法成交' };
    }
  }
  return executePlayerTrade(game, offer);
}

export function rejectPlayerTrade(game) {
  const offer = game.pendingTrade;
  if (!offer) return { ok: false, error: '沒有待確認的交易' };
  const to = game.players[offer.toId];
  log(game, `${to.name} 拒絕了交易`);
  game.pendingTrade = null;
  return { ok: true };
}

/** Simple AI trade evaluation: accept if net pip-ish value ok */
function aiAcceptsTrade(game, offer) {
  // Prefer receiving wood/brick early, ore/wheat late; rough value
  const val = { wood: 1.1, brick: 1.15, sheep: 0.9, wheat: 1.2, ore: 1.25 };
  let giveV = 0;
  let getV = 0; // from AI perspective: give = what AI loses (offer.get), get = what AI gains (offer.give)
  for (const r of RESOURCES) {
    giveV += (offer.get[r] || 0) * val[r];
    getV += (offer.give[r] || 0) * val[r];
  }
  // Need at least break-even-ish, slight greed
  if (getV + 0.15 < giveV) return false;
  // Don't empty hand of last useful cards randomly
  const to = game.players[offer.toId];
  if (totalResources(to.resources) - resMapTotal(offer.get) < 1 && resMapTotal(offer.give) < 2) {
    return Math.random() < 0.3;
  }
  return getV >= giveV * 0.85 || Math.random() < 0.25;
}

/** Whose hand / controls the UI should reflect right now */
export function uiControllerId(game) {
  if (game.phase === 'discard' && game.discardQueue?.length) {
    return game.discardQueue[0];
  }
  if (game.pendingTrade) {
    return game.pendingTrade.toId;
  }
  if (game.phase === 'setup') return getSetupPlayer(game);
  return game.currentPlayer;
}

export function isHumanController(game) {
  const id = uiControllerId(game);
  return id != null && game.players[id] && !game.players[id].isAI;
}

/** Active builder / roller (not discard or trade-accept) */
export function actingPlayerId(game) {
  if (game.phase === 'setup') return getSetupPlayer(game);
  return game.currentPlayer;
}

export function isHumanActing(game) {
  const id = actingPlayerId(game);
  return id != null && game.players[id] && !game.players[id].isAI;
}

export function endTurn(game) {
  if (game.phase !== 'main') return { ok: false, error: '請先完成當前回合行動' };
  if (!game.hasRolled) {
    return { ok: false, error: '請先擲骰' };
  }

  // Cancel any open domestic trade (cannot span turns)
  if (game.pendingTrade) {
    const to = game.players[game.pendingTrade.toId];
    log(game, `結束回合，已取消與 ${to?.name || '對方'} 的未完成交易`);
    game.pendingTrade = null;
  }

  // Win check at end of own turn (includes hidden VP)
  if (checkWin(game)) {
    return { ok: true, won: true };
  }

  const p = game.players[game.currentPlayer];
  // Make bought cards playable next turn
  for (const c of p.devCards) {
    c.justBought = false;
    c.playable = true;
  }
  game.turnDevPlayed = false;
  game.hasRolled = false;
  game.buildMode = null;
  game.freeRoads = 0;
  game.returnToRollAfterRobber = false;
  game.mustMoveRobber = false;
  game.pendingSteal = null;
  game.dice = [0, 0];

  game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
  game.phase = 'roll';
  log(game, `輪到 ${game.players[game.currentPlayer].name}`);
  return { ok: true };
}

export function getPlaceableSettlements(game, playerId, isSetup) {
  return Object.keys(game.board.vertices).filter((vid) =>
    canPlaceSettlement(game.board, vid, playerId, isSetup)
  );
}

export function getPlaceableRoads(game, playerId, isSetup, setupVertexId) {
  return Object.keys(game.board.edges).filter((eid) =>
    canPlaceRoad(game.board, eid, playerId, isSetup, setupVertexId)
  );
}

export function getUpgradeableSettlements(game, playerId) {
  return Object.entries(game.board.vertices)
    .filter(([, v]) => v.building?.playerId === playerId && v.building.type === 'settlement')
    .map(([id]) => id);
}

export { DEV_TYPES, COSTS, RESOURCES, RES_LABEL };
