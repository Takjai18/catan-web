/**
 * Simple but competent Catan AI.
 */

import { RESOURCES, COSTS } from './constants.js';
import { getTradeRate } from './board.js';
import {
  canAfford,
  totalResources,
  placeSettlement,
  placeRoad,
  upgradeCity,
  rollDice,
  moveRobber,
  doSteal,
  buyDevCard,
  playDevCard,
  bankTrade,
  endTurn,
  discardResources,
  getPlaceableSettlements,
  getPlaceableRoads,
  getUpgradeableSettlements,
  createEmptyResources,
  publicVP,
  getSetupPlayer,
  ensurePlayableState,
  resolveRoadBuildingPhase,
  phaseAfterRobber,
} from './game.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const PIP = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function scoreVertex(game, vid) {
  const v = game.board.vertices[vid];
  let score = 0;
  const seen = new Set();
  for (const tid of v.tiles) {
    const t = game.board.tiles[tid];
    if (t.type === 'desert') continue;
    score += (PIP[t.number] || 0) * 2;
    if (t.type === 'ore' || t.type === 'wheat') score += 1.5;
    if (t.type === 'wood' || t.type === 'brick') score += 1.2;
    seen.add(t.type);
  }
  score += seen.size * 1.5;
  if (v.port) score += v.port.ratio === 2 ? 3 : 1.5;
  return score;
}

function scoreEdge(game, eid, playerId) {
  const e = game.board.edges[eid];
  let score = 1;
  for (const vid of [e.a, e.b]) {
    const v = game.board.vertices[vid];
    if (!v.building) score += scoreVertex(game, vid) * 0.3;
    if (v.building?.playerId === playerId) score += 0.5;
  }
  return score;
}

function pickBest(items, scoreFn) {
  if (!items.length) return null;
  let best = items[0];
  let bestS = -Infinity;
  for (const it of items) {
    const s = scoreFn(it) + Math.random() * 0.3;
    if (s > bestS) {
      bestS = s;
      best = it;
    }
  }
  return best;
}

async function aiSetup(game, onUpdate) {
  while (game.phase === 'setup') {
    const pid = getSetupPlayer(game);
    const p = game.players[pid];
    if (!p.isAI) return;

    if (game.setupStep === 'settlement') {
      const spots = getPlaceableSettlements(game, pid, true);
      const best = pickBest(spots, (vid) => scoreVertex(game, vid));
      if (best) placeSettlement(game, best);
    } else {
      const roads = getPlaceableRoads(game, pid, true, game.setupLastVertex);
      const best = pickBest(roads, (eid) => scoreEdge(game, eid, pid));
      if (best) placeRoad(game, best);
    }
    onUpdate();
    await sleep(450);
  }
}

async function aiDiscard(game, pid) {
  const p = game.players[pid];
  const need = Math.floor(totalResources(p.resources) / 2);
  const discard = createEmptyResources();
  const priority = ['sheep', 'wood', 'brick', 'wheat', 'ore'];
  const pool = [];
  for (const r of priority) {
    for (let i = 0; i < p.resources[r]; i++) pool.push(r);
  }
  pool.sort(
    (a, b) => p.resources[b] - p.resources[a] || priority.indexOf(a) - priority.indexOf(b)
  );
  for (let i = 0; i < need && i < pool.length; i++) {
    discard[pool[i]]++;
  }
  discardResources(game, pid, discard);
}

function scoreRobberTile(game, pid, tile) {
  let score = tile.type === 'desert' ? -5 : 0;
  let hitsEnemy = false;
  let hitsSelf = false;
  for (const v of Object.values(game.board.vertices)) {
    if (!v.tiles.includes(tile.id) || !v.building) continue;
    const owner = v.building.playerId;
    const mult = v.building.type === 'city' ? 2 : 1;
    const pip = PIP[tile.number] || 0;
    if (owner === pid) {
      hitsSelf = true;
      score -= pip * mult * 3;
    } else {
      hitsEnemy = true;
      score += pip * mult * (1 + publicVP(game, owner) * 0.3);
      if (totalResources(game.players[owner].resources) > 0) score += 2;
    }
  }
  if (hitsSelf && !hitsEnemy) score -= 20;
  score += Math.random();
  return score;
}

/**
 * Move robber for AI. Always advances phase even if move fails (prevents soft-lock).
 */
async function aiRobber(game) {
  if (game.phase !== 'robber') return { ok: false, error: 'not robber phase' };
  const pid = game.currentPlayer;

  const ranked = game.board.tiles
    .filter((t) => t.id !== game.board.robberTileId)
    .map((t) => ({ id: t.id, score: scoreRobberTile(game, pid, t) }))
    .sort((a, b) => b.score - a.score);

  for (const { id } of ranked) {
    const r = moveRobber(game, id);
    if (r.ok) return r;
  }

  // Should never happen with 19 hexes — force leave robber so game cannot freeze
  console.warn('AI robber: all moves failed, forcing phase advance');
  game.mustMoveRobber = false;
  game.pendingSteal = null;
  phaseAfterRobber(game);
  return { ok: false, forced: true };
}

async function aiMaybePlayKnight(game, onUpdate) {
  const p = game.players[game.currentPlayer];
  if (!p || game.turnDevPlayed) return;
  if (game.phase !== 'roll' && game.phase !== 'main') return;
  const idx = p.devCards.findIndex((c) => c.type === 'knight' && !c.justBought);
  if (idx < 0) return;

  const robberTile = game.board.tiles[game.board.robberTileId];
  let onUs = false;
  if (robberTile) {
    for (const v of Object.values(game.board.vertices)) {
      if (v.tiles.includes(robberTile.id) && v.building?.playerId === p.id) onUs = true;
    }
  }
  // Prefer knight when blocked, one away from Largest Army, or random
  if (onUs || p.knightsPlayed === 2 || Math.random() < 0.25) {
    const res = playDevCard(game, idx);
    onUpdate();
    await sleep(300);
    return res;
  }
}

function aiNeededResources(p) {
  const goals = [COSTS.city, COSTS.settlement, COSTS.road, COSTS.dev];
  for (const cost of goals) {
    const missing = [];
    for (const [r, n] of Object.entries(cost)) {
      for (let i = p.resources[r]; i < n; i++) missing.push(r);
    }
    if (missing.length && missing.length <= 3) {
      return missing.length >= 2 ? missing : [missing[0], 'wheat'];
    }
  }
  return ['wheat', 'ore'];
}

function aiMonopolyTarget(game, pid) {
  let best = null;
  let bestN = 2;
  for (const r of RESOURCES) {
    let n = 0;
    for (const p of game.players) {
      if (p.id !== pid) n += p.resources[r];
    }
    if (n > bestN) {
      bestN = n;
      best = r;
    }
  }
  return best;
}

function aiTryTrade(game, pid) {
  const p = game.players[pid];
  const goals = [COSTS.city, COSTS.settlement, COSTS.dev, COSTS.road];

  for (const cost of goals) {
    if (canAfford(p.resources, cost)) continue;
    const missing = [];
    for (const [r, n] of Object.entries(cost)) {
      if (p.resources[r] < n) missing.push(r);
    }
    if (missing.length !== 1) continue;
    const need = missing[0];
    for (const r of RESOURCES) {
      if (r === need) continue;
      const rate = getTradeRate(game.board, pid, r);
      const reserved = cost[r] || 0;
      if (p.resources[r] - reserved >= rate) {
        if (bankTrade(game, r, rate, need).ok) return true;
      }
    }
  }

  for (const r of RESOURCES) {
    const rate = getTradeRate(game.board, pid, r);
    if (p.resources[r] >= rate + 1) {
      const want =
        ['ore', 'wheat', 'brick', 'wood', 'sheep'].find((x) => x !== r && p.resources[x] === 0) ||
        (r === 'wheat' ? 'ore' : 'wheat');
      if (want !== r && bankTrade(game, r, rate, want).ok) return true;
    }
  }
  return false;
}

async function aiBuildFreeRoads(game, onUpdate) {
  const pid = game.currentPlayer;
  while (game.freeRoads > 0) {
    const roads = getPlaceableRoads(game, pid, false);
    const best = pickBest(roads, (eid) => scoreEdge(game, eid, pid));
    if (!best) {
      game.freeRoads = 0;
      break;
    }
    placeRoad(game, best);
    await sleep(250);
    onUpdate();
  }
  if (game.phase === 'roadBuilding') game.phase = 'main';
}

async function aiMainPhase(game, onUpdate) {
  const pid = game.currentPlayer;
  const p = game.players[pid];
  let actions = 0;

  while (actions < 12 && game.phase === 'main' && game.currentPlayer === pid) {
    actions++;
    let acted = false;

    if (canAfford(p.resources, COSTS.city)) {
      const cities = getUpgradeableSettlements(game, pid);
      if (cities.length) {
        const best = pickBest(cities, (vid) => scoreVertex(game, vid));
        if (upgradeCity(game, best).ok) {
          acted = true;
          onUpdate();
          await sleep(350);
          if (game.phase === 'gameover') return;
          continue;
        }
      }
    }

    if (canAfford(p.resources, COSTS.settlement) && p.settlements < 5) {
      const spots = getPlaceableSettlements(game, pid, false);
      if (spots.length) {
        const best = pickBest(spots, (vid) => scoreVertex(game, vid));
        if (placeSettlement(game, best).ok) {
          acted = true;
          onUpdate();
          await sleep(350);
          if (game.phase === 'gameover') return;
          continue;
        }
      }
    }

    if (canAfford(p.resources, COSTS.road) && p.roads < 15) {
      const roads = getPlaceableRoads(game, pid, false);
      const spots = getPlaceableSettlements(game, pid, false);
      if (roads.length && (spots.length === 0 || p.roads < 4 || Math.random() < 0.55)) {
        const best = pickBest(roads, (eid) => scoreEdge(game, eid, pid));
        if (placeRoad(game, best).ok) {
          acted = true;
          onUpdate();
          await sleep(300);
          continue;
        }
      }
    }

    if (canAfford(p.resources, COSTS.dev) && game.devDeck.length > 0) {
      const total = totalResources(p.resources);
      if (
        total >= 6 ||
        (!canAfford(p.resources, COSTS.settlement) && !canAfford(p.resources, COSTS.city))
      ) {
        if (buyDevCard(game).ok) {
          acted = true;
          onUpdate();
          await sleep(300);
          if (game.phase === 'gameover') return;
          continue;
        }
      }
    }

    if (!game.turnDevPlayed) {
      const yop = p.devCards.findIndex((c) => c.type === 'yearOfPlenty' && !c.justBought);
      if (yop >= 0 && totalResources(p.resources) < 4) {
        const need = aiNeededResources(p);
        playDevCard(game, yop, { resources: [need[0], need[1] || need[0]] });
        acted = true;
        onUpdate();
        await sleep(300);
        continue;
      }
      const mon = p.devCards.findIndex((c) => c.type === 'monopoly' && !c.justBought);
      if (mon >= 0) {
        const target = aiMonopolyTarget(game, pid);
        if (target) {
          playDevCard(game, mon, { resource: target });
          acted = true;
          onUpdate();
          await sleep(300);
          continue;
        }
      }
      const rb = p.devCards.findIndex((c) => c.type === 'roadBuilding' && !c.justBought);
      if (rb >= 0 && getPlaceableRoads(game, pid, false).length > 0) {
        playDevCard(game, rb);
        onUpdate();
        await aiBuildFreeRoads(game, onUpdate);
        acted = true;
        continue;
      }
    }

    if (aiTryTrade(game, pid)) {
      acted = true;
      onUpdate();
      await sleep(250);
      continue;
    }

    if (!acted) break;
  }
}

/**
 * Advance the game automatically until a human decision is required.
 * Robust state machine — must not leave AI mid-turn after human discard/steal.
 */
export async function pumpAI(game, onUpdate) {
  let guard = 0;

  while (guard++ < 60 && game.phase !== 'gameover') {
    ensurePlayableState(game);

    // ——— Setup ———
    if (game.phase === 'setup') {
      const pid = getSetupPlayer(game);
      if (!game.players[pid]?.isAI) return; // human places
      if (game.setupStep === 'settlement') {
        const spots = getPlaceableSettlements(game, pid, true);
        const best = pickBest(spots, (vid) => scoreVertex(game, vid));
        if (!best) {
          // Extremely rare (board full); skip this AI's remaining setup placements
          console.warn('AI setup: no settlement spots, skipping setup slots');
          while (
            game.phase === 'setup' &&
            getSetupPlayer(game) === pid
          ) {
            // Force-advance setup index by faking completion if stuck mid road/settlement
            if (game.setupStep === 'road' && game.setupLastVertex) {
              game.setupIndex++;
              game.setupStep = 'settlement';
              game.setupLastVertex = null;
            } else {
              game.setupIndex++;
              game.setupStep = 'settlement';
              game.setupLastVertex = null;
            }
            if (game.setupIndex >= game.players.length * 2) {
              game.phase = 'roll';
              game.currentPlayer = 0;
              break;
            }
          }
          onUpdate();
          continue;
        }
        placeSettlement(game, best);
      } else {
        const roads = getPlaceableRoads(game, pid, true, game.setupLastVertex);
        const best = pickBest(roads, (eid) => scoreEdge(game, eid, pid));
        if (!best) {
          console.warn('AI setup: no road spots, skipping road');
          game.setupIndex++;
          game.setupStep = 'settlement';
          game.setupLastVertex = null;
          if (game.setupIndex >= game.players.length * 2) {
            game.phase = 'roll';
            game.currentPlayer = 0;
          }
          onUpdate();
          continue;
        }
        placeRoad(game, best);
      }
      onUpdate();
      await sleep(400);
      continue;
    }

    // ——— Discard (any player in queue) ———
    if (game.phase === 'discard') {
      if (!game.discardQueue.length) {
        game.phase = 'robber';
        continue;
      }
      const id = game.discardQueue[0];
      if (!game.players[id].isAI) return; // human modal
      await aiDiscard(game, id);
      onUpdate();
      await sleep(250);
      continue;
    }

    // ——— Steal ———
    if (game.phase === 'steal') {
      const pid = game.currentPlayer;
      if (!game.players[pid]?.isAI) return; // human modal
      const targets = game.pendingSteal || [];
      if (targets.length) {
        const r = doSteal(game, targets[Math.floor(Math.random() * targets.length)]);
        if (!r.ok) {
          // Don't freeze: clear steal and advance
          game.pendingSteal = null;
          phaseAfterRobber(game);
        }
      } else {
        game.pendingSteal = null;
        phaseAfterRobber(game);
      }
      onUpdate();
      await sleep(200);
      continue;
    }

    // ——— Robber ———
    if (game.phase === 'robber') {
      if (!game.players[game.currentPlayer]?.isAI) return; // human clicks tile
      try {
        await aiRobber(game);
      } catch (err) {
        console.error('aiRobber error', err);
        game.pendingSteal = null;
        game.mustMoveRobber = false;
        phaseAfterRobber(game);
      }
      // Still stuck in robber? force advance
      if (game.phase === 'robber') {
        console.warn('AI still in robber after aiRobber — forcing advance');
        game.pendingSteal = null;
        game.mustMoveRobber = false;
        phaseAfterRobber(game);
      }
      onUpdate();
      await sleep(250);
      continue;
    }

    // ——— Free roads (dev card) ———
    if (game.phase === 'roadBuilding') {
      if (!game.players[game.currentPlayer]?.isAI) {
        resolveRoadBuildingPhase(game);
        if (game.phase === 'roadBuilding') return; // human must place
        continue;
      }
      await aiBuildFreeRoads(game, onUpdate);
      resolveRoadBuildingPhase(game);
      onUpdate();
      continue;
    }

    // ——— Current player is human: wait for roll / main ———
    const cur = game.players[game.currentPlayer];
    if (!cur?.isAI) {
      if (game.phase === 'roll' || game.phase === 'main') return;
      // Unknown human-facing phase — stop and let UI handle
      return;
    }

    // ——— AI roll phase ———
    if (game.phase === 'roll') {
      await sleep(250);
      try {
        await aiMaybePlayKnight(game, onUpdate);
      } catch (err) {
        console.error('aiMaybePlayKnight error', err);
      }
      if (game.phase === 'gameover') return;
      // Knight → robber / steal / (rare) gameover — loop handles those
      if (game.phase !== 'roll') continue;

      rollDice(game);
      onUpdate();
      await sleep(400);
      continue; // discard / main / robber handled next iteration
    }

    // ——— AI main phase ———
    if (game.phase === 'main') {
      // Safety: never act in main without having rolled (e.g. botched knight flow)
      if (!game.hasRolled) {
        game.phase = 'roll';
        game.returnToRollAfterRobber = false;
        continue;
      }

      await sleep(200);
      try {
        await aiMainPhase(game, onUpdate);
      } catch (err) {
        console.error('aiMainPhase error', err);
      }
      if (game.phase === 'gameover') return;
      // Dev cards may enter robber / roadBuilding / etc.
      if (game.phase !== 'main') continue;

      await sleep(250);
      const ended = endTurn(game);
      if (!ended.ok) {
        // Last resort: clear blockers and force-pass so the table cannot soft-lock
        console.warn('AI endTurn failed:', ended.error, '— forcing next player');
        game.pendingTrade = null;
        game.freeRoads = 0;
        game.buildMode = null;
        game.pendingSteal = null;
        game.mustMoveRobber = false;
        game.returnToRollAfterRobber = false;
        if (!game.hasRolled) {
          game.phase = 'roll';
          continue;
        }
        // Manual turn advance
        const p = game.players[game.currentPlayer];
        if (p) {
          for (const c of p.devCards) {
            c.justBought = false;
            c.playable = true;
          }
        }
        game.turnDevPlayed = false;
        game.hasRolled = false;
        game.dice = [0, 0];
        game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
        game.phase = 'roll';
      }
      onUpdate();
      await sleep(150);
      continue;
    }

    // Fallback: unknown phase with AI — force recovery
    console.warn('pumpAI: unexpected phase', game.phase);
    if (game.phase === 'gameover') return;
    game.freeRoads = 0;
    game.pendingSteal = null;
    game.mustMoveRobber = false;
    game.pendingTrade = null;
    if (!game.hasRolled) {
      game.phase = 'roll';
    } else {
      game.phase = 'main';
    }
    continue;
  }
}

/** @deprecated use pumpAI — kept for any external callers */
export async function runAITurn(game, onUpdate) {
  await pumpAI(game, onUpdate);
}
