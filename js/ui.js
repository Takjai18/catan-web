/**
 * DOM / SVG rendering and user interaction.
 */

import {
  RESOURCES,
  RES_LABEL,
  RES_EMOJI,
  RES_COLOR,
  TILE_EMOJI,
  TILE_LABEL,
  TILE_RESOURCE_LABEL,
  DEV_TYPES,
  COSTS,
  formatProbability,
} from './constants.js';
import { getHexPolygonPoints, tileFill, getTradeRate } from './board.js';
import {
  publicVP,
  totalVP,
  totalResources,
  canAfford,
  getSetupPlayer,
  getPlaceableSettlements,
  getPlaceableRoads,
  getUpgradeableSettlements,
  uiControllerId,
  isHumanActing,
  actingPlayerId,
  scoreBreakdown,
} from './game.js';

export function el(id) {
  return document.getElementById(id);
}

export function renderAll(game, handlers) {
  renderPlayers(game);
  renderBoard(game, handlers);
  renderResources(game);
  renderDevCards(game, handlers);
  renderActions(game, handlers);
  renderPhase(game);
  renderDice(game);
  renderLog(game);
  renderSpecials(game);
}

function renderSpecials(game) {
  const lr = el('longest-road');
  const la = el('largest-army');
  if (game.longestRoadPlayer != null) {
    const p = game.players[game.longestRoadPlayer];
    lr.textContent = `🛣️ 最長道路 — ${p.name} (${p.longestRoadLen})`;
    lr.classList.add('held');
  } else {
    lr.textContent = '🛣️ 最長道路 —';
    lr.classList.remove('held');
  }
  if (game.largestArmyPlayer != null) {
    const p = game.players[game.largestArmyPlayer];
    la.textContent = `⚔️ 最大軍隊 — ${p.name} (${p.knightsPlayed})`;
    la.classList.add('held');
  } else {
    la.textContent = '⚔️ 最大軍隊 —';
    la.classList.remove('held');
  }
}

function renderPlayers(game) {
  const root = el('players-list');
  root.innerHTML = '';
  const controller = uiControllerId(game);
  for (const p of game.players) {
    const active =
      (game.phase === 'setup' && getSetupPlayer(game) === p.id) ||
      (game.phase !== 'setup' &&
        game.phase !== 'discard' &&
        game.currentPlayer === p.id &&
        game.phase !== 'gameover') ||
      (game.phase === 'discard' && game.discardQueue[0] === p.id);

    const card = document.createElement('div');
    card.className = 'player-card' + (active ? ' active' : '');
    card.style.borderLeftColor = p.color;

    // Public score always; own hidden VP only for current human controller
    const isSelf = p.id === controller && !p.isAI;
    const pub = publicVP(game, p.id);
    const tot = totalVP(game, p.id);
    // Label public score; warn that hidden VP cards / bonuses can jump score
    let vpLabel;
    if (isSelf) {
      vpLabel =
        p.victoryPointsHidden > 0
          ? `${tot}分 <span class="vp-sub">公開${pub}+隱${p.victoryPointsHidden}</span>`
          : `${pub}分`;
    } else {
      // Opponents/AI: only public; hint if they hold unrevealed dev cards
      const maybe =
        p.devCards.length > 0
          ? ` <span class="vp-sub">公開 · 🃏×${p.devCards.length}</span>`
          : ` <span class="vp-sub">公開</span>`;
      vpLabel = `${pub}分${maybe}`;
    }

    card.innerHTML = `
      <div class="name-row">
        <span>${p.isAI ? '🤖' : '👤'} ${p.name}</span>
        <span class="vp">${vpLabel}</span>
      </div>
      <div class="stats">
        <span>🏠${p.settlements}</span>
        <span>🏰${p.cities}</span>
        <span>🛤️${p.roads}</span>
        <span>🃏${p.devCards.length}</span>
        <span>⚔️${p.knightsPlayed}</span>
        <span>📦${totalResources(p.resources)}</span>
      </div>
    `;
    root.appendChild(card);
  }
}

function renderPhase(game) {
  const banner = el('phase-banner');
  const p =
    game.phase === 'setup'
      ? game.players[getSetupPlayer(game)]
      : game.players[game.currentPlayer];

  const map = {
    setup:
      game.setupStep === 'settlement'
        ? `${p.name}：放置村莊`
        : `${p.name}：放置道路`,
    roll: `${p.name}：擲骰`,
    main: `${p.name}：建造 / 交易`,
    discard: '丟棄資源（超過 7 張）',
    robber: `${p.name}：移動強盜`,
    steal: '選擇搶奪對象',
    roadBuilding: `${p.name}：免費建造道路（剩 ${game.freeRoads}）`,
    gameover: game.winner != null ? `${game.players[game.winner].name} 獲勝！` : '遊戲結束',
  };
  banner.textContent = map[game.phase] || game.phase;
}

function renderDice(game) {
  const [d1, d2] = game.dice;
  el('die1').textContent = d1 || '?';
  el('die2').textContent = d2 || '?';
  el('dice-sum').textContent = d1 && d2 ? `= ${d1 + d2}` : '';
}

function renderLog(game) {
  const root = el('game-log');
  root.innerHTML = game.log
    .slice(0, 40)
    .map((e) => {
      const cls = ['log-entry'];
      if (e.important) cls.push('important');
      if (e.gain) cls.push('gain');
      return `<div class="${cls.join(' ')}">${e.msg}</div>`;
    })
    .join('');
}

function renderResources(game) {
  const id = uiControllerId(game);
  const p = game.players[id];
  const title = el('hand-title');
  const root = el('resources');

  if (!p || p.isAI) {
    if (title) title.textContent = '資源（AI 回合中）';
    root.innerHTML = '<span class="muted" style="font-size:.85rem">AI 操作中…</span>';
    return;
  }

  if (title) title.textContent = `${p.name} 的資源`;
  root.innerHTML = RESOURCES.map(
    (r) => `
    <div class="res-chip">
      <span class="res-dot" style="background:${RES_COLOR[r]}"></span>
      <span>${RES_EMOJI[r]} ${RES_LABEL[r]}</span>
      <span class="count">${p.resources[r]}</span>
    </div>
  `
  ).join('');
}

function renderDevCards(game, handlers) {
  const id = uiControllerId(game);
  const p = game.players[id];
  const root = el('dev-cards');
  if (!p || p.isAI) {
    el('dev-count').textContent = '(—)';
    root.innerHTML = '<span class="muted" style="font-size:.8rem">—</span>';
    return;
  }

  el('dev-count').textContent = `(${p.devCards.length})`;
  root.innerHTML = '';

  const canAct =
    isHumanActing(game) &&
    actingPlayerId(game) === p.id &&
    !game.pendingTrade;

  p.devCards.forEach((card, i) => {
    const info = DEV_TYPES[card.type];
    const btn = document.createElement('button');
    btn.className = 'dev-card-btn';
    btn.textContent = `${info.emoji} ${info.label}${card.justBought ? ' (新)' : ''}`;
    btn.title = info.desc;
    const canPlay =
      canAct &&
      !card.justBought &&
      card.type !== 'victory' &&
      !game.turnDevPlayed &&
      (game.phase === 'main' || (game.phase === 'roll' && card.type === 'knight'));
    btn.disabled = !canPlay;
    if (canPlay) {
      btn.addEventListener('click', () => handlers.onPlayDev(i));
    }
    root.appendChild(btn);
  });

  if (!p.devCards.length) {
    root.innerHTML = '<span class="muted" style="font-size:.8rem">無</span>';
  }
}

function renderActions(game, handlers) {
  const isHuman = isHumanActing(game) && !game.pendingTrade;
  const pid = actingPlayerId(game);
  const p = game.players[pid];

  const roll = el('btn-roll');
  const road = el('btn-build-road');
  const sett = el('btn-build-settlement');
  const city = el('btn-build-city');
  const dev = el('btn-buy-dev');
  const trade = el('btn-trade');
  const end = el('btn-end');
  const hint = el('build-hint');

  const mainOk = isHuman && game.phase === 'main' && p && !p.isAI && !game.pendingTrade;
  const freeRoad = isHuman && game.phase === 'roadBuilding' && game.freeRoads > 0;
  // Must have rolled before ending turn (enforced in game.endTurn too)
  const canEnd = mainOk && game.hasRolled;

  roll.disabled = !(isHuman && game.phase === 'roll');
  road.disabled = !(
    (mainOk && canAfford(p.resources, COSTS.road) && p.roads < 15) ||
    freeRoad ||
    (isHuman && game.phase === 'setup' && game.setupStep === 'road')
  );
  sett.disabled = !(
    (mainOk && canAfford(p.resources, COSTS.settlement) && p.settlements < 5) ||
    (isHuman && game.phase === 'setup' && game.setupStep === 'settlement')
  );
  city.disabled = !(mainOk && canAfford(p.resources, COSTS.city) && p.cities < 4);
  dev.disabled = !(mainOk && canAfford(p.resources, COSTS.dev) && game.devDeck.length > 0);
  trade.disabled = !mainOk;
  end.disabled = !canEnd;

  // Active build mode styling
  [road, sett, city].forEach((b) => b.classList.remove('active-build'));
  if (game.buildMode === 'road') road.classList.add('active-build');
  if (game.buildMode === 'settlement') sett.classList.add('active-build');
  if (game.buildMode === 'city') city.classList.add('active-build');

  if (game.buildMode) {
    hint.classList.remove('hidden');
    const labels = {
      road: '在地圖上點擊邊線放置道路（再按一次按鈕取消）',
      settlement: '在地圖上點擊路口放置村莊（再按一次取消）',
      city: '點擊你的村莊升級為城市（再按一次取消）',
    };
    hint.textContent = labels[game.buildMode] || '';
  } else if (game.phase === 'setup' && isHuman) {
    hint.classList.remove('hidden');
    hint.textContent =
      game.setupStep === 'settlement'
        ? '點擊地圖上的路口放置村莊'
        : '點擊與村莊相連的邊線放置道路';
  } else if (game.phase === 'robber' && isHuman) {
    hint.classList.remove('hidden');
    hint.textContent = '點擊一個地塊移動強盜';
  } else if (freeRoad) {
    hint.classList.remove('hidden');
    hint.textContent = `免費道路：再點擊邊線放置（剩 ${game.freeRoads} 條）`;
  } else {
    hint.classList.add('hidden');
  }

  // Wire buttons once via handlers flag
  if (!handlers._bound) {
    roll.addEventListener('click', () => handlers.onRoll());
    road.addEventListener('click', () => handlers.onBuildMode('road'));
    sett.addEventListener('click', () => handlers.onBuildMode('settlement'));
    city.addEventListener('click', () => handlers.onBuildMode('city'));
    dev.addEventListener('click', () => handlers.onBuyDev());
    trade.addEventListener('click', () => handlers.onTradeOpen());
    end.addEventListener('click', () => handlers.onEndTurn());
    handlers._bound = true;
  }
}

function renderBoard(game, handlers) {
  const svg = el('board');
  const board = game.board;

  // Determine highlights
  let placeVerts = new Set();
  let placeEdges = new Set();
  let cityVerts = new Set();
  let robberMode = false;

  const actId = actingPlayerId(game);
  const humanSetup =
    game.phase === 'setup' && !game.players[getSetupPlayer(game)]?.isAI;
  const humanTurn = isHumanActing(game) && !game.pendingTrade;
  const pid = humanTurn ? actId : -1;

  if (humanSetup && game.setupStep === 'settlement') {
    placeVerts = new Set(getPlaceableSettlements(game, actId, true));
  } else if (humanSetup && game.setupStep === 'road') {
    placeEdges = new Set(getPlaceableRoads(game, actId, true, game.setupLastVertex));
  } else if (humanTurn && game.phase === 'roadBuilding') {
    placeEdges = new Set(getPlaceableRoads(game, pid, false));
  } else if (humanTurn && game.phase === 'main' && game.buildMode === 'road') {
    placeEdges = new Set(getPlaceableRoads(game, pid, false));
  } else if (humanTurn && game.phase === 'main' && game.buildMode === 'settlement') {
    placeVerts = new Set(getPlaceableSettlements(game, pid, false));
  } else if (humanTurn && game.phase === 'main' && game.buildMode === 'city') {
    cityVerts = new Set(getUpgradeableSettlements(game, pid));
  } else if (humanTurn && game.phase === 'robber') {
    robberMode = true;
  }

  const parts = [];

  // Sea background circle-ish via large rect already in CSS; draw ports
  for (const e of Object.values(board.edges)) {
    if (!e.port) continue;
    const va = board.vertices[e.a];
    const vb = board.vertices[e.b];
    const mx = (va.x + vb.x) / 2;
    const my = (va.y + vb.y) / 2;
    // push outward from center
    const cx = 450;
    const cy = 390;
    const dx = mx - cx;
    const dy = my - cy;
    const len = Math.hypot(dx, dy) || 1;
    const px = mx + (dx / len) * 22;
    const py = my + (dy / len) * 22;
    const label =
      e.port.resource != null
        ? `2:1 ${RES_EMOJI[e.port.resource]}`
        : '3:1';
    parts.push(
      `<text class="port-label" x="${px}" y="${py}">⚓${label}</text>`
    );
  }

  // Tiles — resource name + number + dice probability
  for (const t of board.tiles) {
    const pts = getHexPolygonPoints(t.cx, t.cy, board.hexSize);
    const stroke = t.robber ? '#c0392b' : 'rgba(0,0,0,.25)';
    const sw = t.robber ? 3.5 : 1.5;
    const clickable = robberMode && t.id !== board.robberTileId;
    const cls = 'hex-tile' + (clickable ? ' clickable robber-target' : '');
    const name = TILE_LABEL[t.type] || t.type;
    const resName = TILE_RESOURCE_LABEL[t.type] || '';
    const hasNum = t.number != null;
    const prob = hasNum ? formatProbability(t.number) : null;

    parts.push(
      `<polygon class="${cls}" data-tile="${t.id}" points="${pts}" fill="${tileFill(t.type)}" stroke="${stroke}" stroke-width="${sw}" />`
    );

    // Top: emoji + terrain name
    parts.push(
      `<text class="tile-emoji" x="${t.cx}" y="${t.cy - 22}" text-anchor="middle" dominant-baseline="central" font-size="14" pointer-events="none">${TILE_EMOJI[t.type]}</text>`
    );
    parts.push(
      `<text class="tile-name" x="${t.cx}" y="${t.cy - 8}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="#fff" pointer-events="none">${name}</text>`
    );
    parts.push(
      `<text class="tile-res" x="${t.cx}" y="${t.cy + 4}" text-anchor="middle" dominant-baseline="central" font-size="9" fill="rgba(255,255,255,.92)" pointer-events="none">${resName}</text>`
    );

    if (hasNum && prob) {
      const hot = t.number === 6 || t.number === 8;
      const numColor = hot ? '#c0392b' : '#1a1208';
      // Number token plate (official letter A–R + number)
      parts.push(
        `<rect x="${t.cx - 22}" y="${t.cy + 10}" width="44" height="28" rx="8" fill="#f5f0e6" stroke="#222" stroke-width="1.2" pointer-events="none" />`
      );
      if (t.letter) {
        parts.push(
          `<text class="tile-letter" x="${t.cx - 14}" y="${t.cy + 16}" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" fill="#555" pointer-events="none">${t.letter}</text>`
        );
      }
      parts.push(
        `<text class="number-token${hot ? ' hot' : ''}" x="${t.cx + (t.letter ? 3 : 0)}" y="${t.cy + 20}" font-size="${hot ? 13 : 12}" fill="${numColor}">${t.number}</text>`
      );
      // Classic pip dots
      parts.push(
        `<text class="tile-dots${hot ? ' hot' : ''}" x="${t.cx}" y="${t.cy + 30}" text-anchor="middle" dominant-baseline="central" font-size="7" fill="${numColor}" pointer-events="none">${prob.dots}</text>`
      );
      // Explicit probability fraction + percent
      parts.push(
        `<text class="tile-prob" x="${t.cx}" y="${t.cy + 42}" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" fill="#fff" pointer-events="none">${prob.fraction} · ${prob.percent}</text>`
      );
    } else {
      parts.push(
        `<text class="tile-prob" x="${t.cx}" y="${t.cy + 22}" text-anchor="middle" dominant-baseline="central" font-size="9" fill="rgba(255,255,255,.85)" pointer-events="none">概率 0</text>`
      );
    }
    if (t.robber) {
      parts.push(
        `<text x="${t.cx + 24}" y="${t.cy - 24}" text-anchor="middle" font-size="18" pointer-events="none">🥷</text>`
      );
    }
  }

  // Edges (roads) — draw outline under player colour for contrast
  for (const e of Object.values(board.edges)) {
    const va = board.vertices[e.a];
    const vb = board.vertices[e.b];
    const isPlace = placeEdges.has(e.id);
    const hasRoad = e.road != null;
    const lineAttrs = `x1="${va.x}" y1="${va.y}" x2="${vb.x}" y2="${vb.y}" stroke-linecap="round"`;

    if (hasRoad) {
      const col = game.players[e.road].color;
      // Dark outline so colour pops on any terrain
      parts.push(
        `<line class="edge road-outline" ${lineAttrs} stroke="#0a0e14" stroke-width="14" opacity="1" />`
      );
      parts.push(
        `<line class="edge road" data-edge="${e.id}" ${lineAttrs} stroke="${col}" stroke-width="9" opacity="1" />`
      );
      // Light highlight stripe for extra clarity
      parts.push(
        `<line class="edge road-highlight" ${lineAttrs} stroke="rgba(255,255,255,.35)" stroke-width="3" opacity="1" />`
      );
    } else if (isPlace) {
      // Wide hit target + high-contrast preview
      parts.push(
        `<line class="edge visible placeable" data-edge="${e.id}" ${lineAttrs} stroke="rgba(0,0,0,.55)" stroke-width="14" opacity="1" />`
      );
      parts.push(
        `<line class="edge placeable-inner" ${lineAttrs} stroke="#f0a030" stroke-width="7" opacity="1" stroke-dasharray="8 5" pointer-events="none" />`
      );
    }
  }

  // Vertices (buildings / placeable)
  for (const v of Object.values(board.vertices)) {
    const isPlace = placeVerts.has(v.id);
    const isCityTarget = cityVerts.has(v.id);
    if (v.building) {
      const col = game.players[v.building.playerId].color;
      if (v.building.type === 'city') {
        parts.push(
          `<rect x="${v.x - 9}" y="${v.y - 9}" width="18" height="18" rx="3" fill="${col}" stroke="#111" stroke-width="1.5" />`
        );
        parts.push(
          `<rect x="${v.x - 5}" y="${v.y - 14}" width="10" height="8" rx="1" fill="${col}" stroke="#111" stroke-width="1" />`
        );
      } else {
        parts.push(
          `<polygon points="${v.x},${v.y - 11} ${v.x + 10},${v.y + 2} ${v.x + 6},${v.y + 2} ${v.x + 6},${v.y + 10} ${v.x - 6},${v.y + 10} ${v.x - 6},${v.y + 2} ${v.x - 10},${v.y + 2}" fill="${col}" stroke="#111" stroke-width="1.2" />`
        );
      }
      if (isCityTarget) {
        parts.push(
          `<circle class="vertex visible placeable" data-vertex="${v.id}" cx="${v.x}" cy="${v.y}" r="16" fill="none" stroke="#f0a030" stroke-width="2" stroke-dasharray="4 2" />`
        );
      }
    } else if (isPlace) {
      parts.push(
        `<circle class="vertex visible placeable" data-vertex="${v.id}" cx="${v.x}" cy="${v.y}" r="8" fill="rgba(255,255,255,.85)" stroke="#f0a030" stroke-width="2" />`
      );
    }
  }

  svg.innerHTML = parts.join('');

  // Events
  svg.querySelectorAll('[data-tile]').forEach((node) => {
    if (!node.classList.contains('clickable')) return;
    node.addEventListener('click', () => handlers.onTileClick(+node.dataset.tile));
  });
  svg.querySelectorAll('[data-edge].placeable, [data-edge].visible').forEach((node) => {
    if (!placeEdges.has(node.dataset.edge)) return;
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => handlers.onEdgeClick(node.dataset.edge));
  });
  svg.querySelectorAll('[data-vertex]').forEach((node) => {
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => handlers.onVertexClick(node.dataset.vertex));
  });
}

/* ——— Modals ——— */

/**
 * @param {object} game
 * @param {(result: { type: 'bank', give, n, get } | { type: 'player', toId, give, get }) => void} onConfirm
 * @param {() => void} [onCancel]
 */
export function showTradeModal(game, onConfirm, onCancel) {
  const modal = el('trade-modal');
  const pid = game.currentPlayer;
  const p = game.players[pid];
  let tab = 'bank';

  const giveSel = el('trade-give');
  const getSel = el('trade-get');
  const nSel = el('trade-give-n');
  const partnerSel = el('trade-partner');
  const bankPanel = el('trade-bank-panel');
  const playerPanel = el('trade-player-panel');

  const giveMap = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const getMap = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };

  giveSel.innerHTML = RESOURCES.map(
    (r) => `<option value="${r}">${RES_EMOJI[r]} ${RES_LABEL[r]} (${p.resources[r]})</option>`
  ).join('');
  getSel.innerHTML = RESOURCES.map(
    (r) => `<option value="${r}">${RES_EMOJI[r]} ${RES_LABEL[r]}</option>`
  ).join('');

  partnerSel.innerHTML = game.players
    .filter((op) => op.id !== pid)
    .map(
      (op) =>
        `<option value="${op.id}">${op.isAI ? '🤖' : '👤'} ${op.name}（${totalResources(op.resources)} 張）</option>`
    )
    .join('');

  const updateRate = () => {
    const rate = getTradeRate(game.board, pid, giveSel.value);
    nSel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = rate;
    opt.textContent = String(rate);
    opt.selected = true;
    nSel.appendChild(opt);
  };
  giveSel.onchange = updateRate;
  updateRate();

  function renderPick(containerId, map, maxFrom) {
    const root = el(containerId);
    root.innerHTML = '';
    for (const r of RESOURCES) {
      const row = document.createElement('div');
      row.className = 'trade-pick-row';
      const max = maxFrom ? maxFrom.resources[r] : 99;
      row.innerHTML = `
        <span>${RES_EMOJI[r]} ${RES_LABEL[r]}</span>
        <div class="trade-stepper">
          <button type="button" class="btn ghost trade-minus" data-r="${r}">−</button>
          <span class="trade-n">${map[r]}</span>
          <button type="button" class="btn ghost trade-plus" data-r="${r}">+</button>
        </div>
      `;
      row.querySelector('.trade-minus').onclick = () => {
        if (map[r] > 0) map[r]--;
        renderPick(containerId, map, maxFrom);
      };
      row.querySelector('.trade-plus').onclick = () => {
        if (map[r] < max) map[r]++;
        renderPick(containerId, map, maxFrom);
      };
      root.appendChild(row);
    }
  }

  function setTab(next) {
    tab = next;
    modal.querySelectorAll('.trade-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    bankPanel.classList.toggle('hidden', tab !== 'bank');
    playerPanel.classList.toggle('hidden', tab !== 'player');
    if (tab === 'player') {
      el('trade-give-title').textContent = `${p.name} 交出`;
      const partner = game.players[+partnerSel.value];
      el('trade-get-title').textContent = partner
        ? `從 ${partner.name} 獲得`
        : '你獲得';
      renderPick('trade-give-pick', giveMap, p);
      if (partner) renderPick('trade-get-pick', getMap, partner);
    }
  }

  modal.querySelectorAll('.trade-tab').forEach((b) => {
    b.onclick = () => setTab(b.dataset.tab);
  });
  partnerSel.onchange = () => {
    RESOURCES.forEach((r) => {
      getMap[r] = 0;
    });
    setTab('player');
  };
  setTab('bank');

  modal.classList.remove('hidden');

  const conf = el('btn-trade-confirm');
  const canc = el('btn-trade-cancel');
  const cleanup = () => {
    modal.classList.add('hidden');
    conf.onclick = null;
    canc.onclick = null;
  };
  conf.onclick = () => {
    if (tab === 'bank') {
      const g = giveSel.value;
      const n = +nSel.value;
      const t = getSel.value;
      cleanup();
      onConfirm({ type: 'bank', give: g, n, get: t });
    } else {
      const toId = +partnerSel.value;
      cleanup();
      onConfirm({
        type: 'player',
        toId,
        give: { ...giveMap },
        get: { ...getMap },
      });
    }
  };
  canc.onclick = () => {
    cleanup();
    onCancel?.();
  };
}

export function showTradeAcceptModal(game, onAccept, onReject) {
  const offer = game.pendingTrade;
  if (!offer) return;
  const modal = el('trade-accept-modal');
  const from = game.players[offer.fromId];
  const to = game.players[offer.toId];
  el('trade-accept-msg').textContent = `${to.name}，請查看 ${from.name} 提出的交易：`;

  const giveStr = RESOURCES.filter((r) => offer.give[r] > 0)
    .map((r) => `${RES_EMOJI[r]} ${RES_LABEL[r]}×${offer.give[r]}`)
    .join(' ');
  const getStr = RESOURCES.filter((r) => offer.get[r] > 0)
    .map((r) => `${RES_EMOJI[r]} ${RES_LABEL[r]}×${offer.get[r]}`)
    .join(' ');

  el('trade-accept-detail').innerHTML = `
    <div class="trade-accept-box">
      <div><strong>你會得到：</strong> ${giveStr || '（無）'}</div>
      <div><strong>你要交出：</strong> ${getStr || '（無）'}</div>
    </div>
  `;

  modal.classList.remove('hidden');
  el('btn-trade-accept').onclick = () => {
    modal.classList.add('hidden');
    onAccept();
  };
  el('btn-trade-reject').onclick = () => {
    modal.classList.add('hidden');
    onReject();
  };
}

/**
 * Hot-seat: hide board info until next human is ready.
 */
export function showHandoff(player, reason, onReady) {
  const modal = el('handoff-modal');
  el('handoff-title').textContent = `輪到 ${player.name}`;
  el('handoff-msg').textContent =
    reason ||
    `請把裝置交給 ${player.name}。準備好後再按按鈕（避免偷看手牌）。`;
  modal.classList.remove('hidden');
  el('btn-handoff-ready').onclick = () => {
    modal.classList.add('hidden');
    onReady?.();
  };
}

export function hideHandoff() {
  el('handoff-modal')?.classList.add('hidden');
}

export function showDiscardModal(game, playerId, onDone) {
  const modal = el('discard-modal');
  const p = game.players[playerId];
  const need = Math.floor(totalResources(p.resources) / 2);
  el('discard-msg').textContent = `${p.name} 有 ${totalResources(p.resources)} 張資源，需丟棄 ${need} 張。`;

  const selected = createSel();
  const picker = el('discard-picker');
  picker.innerHTML = '';

  function createSel() {
    return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  }

  function totalSel() {
    return RESOURCES.reduce((s, r) => s + selected[r], 0);
  }

  function redraw() {
    picker.innerHTML = '';
    for (const r of RESOURCES) {
      if (p.resources[r] === 0) continue;
      const btn = document.createElement('button');
      btn.className = 'discard-item' + (selected[r] > 0 ? ' selected' : '');
      btn.innerHTML = `${RES_EMOJI[r]} ${RES_LABEL[r]} ${selected[r]}/${p.resources[r]}`;
      btn.onclick = () => {
        if (selected[r] < p.resources[r] && totalSel() < need) {
          selected[r]++;
        } else if (selected[r] > 0) {
          selected[r]--;
        }
        redraw();
      };
      picker.appendChild(btn);
    }
    el('btn-discard-confirm').disabled = totalSel() !== need;
    el('btn-discard-confirm').textContent = `確認丟棄 (${totalSel()}/${need})`;
  }

  redraw();
  modal.classList.remove('hidden');

  el('btn-discard-confirm').onclick = () => {
    if (totalSel() !== need) return;
    modal.classList.add('hidden');
    onDone({ ...selected });
  };
}

export function showStealModal(game, candidates, onPick) {
  const modal = el('steal-modal');
  const root = el('steal-targets');
  root.innerHTML = '';
  for (const id of candidates) {
    const p = game.players[id];
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = `${p.name}（${totalResources(p.resources)} 張資源）`;
    btn.style.borderLeft = `4px solid ${p.color}`;
    btn.onclick = () => {
      modal.classList.add('hidden');
      onPick(id);
    };
    root.appendChild(btn);
  }
  modal.classList.remove('hidden');
}

export function showResourcePick(mode, onPick) {
  // mode: 'monopoly' | 'yearOfPlenty'
  const modal = el('resource-pick-modal');
  const title = el('resource-pick-title');
  const root = el('resource-pick-options');
  root.innerHTML = '';

  if (mode === 'monopoly') {
    title.textContent = '壟斷：選擇一種資源';
    for (const r of RESOURCES) {
      const btn = document.createElement('button');
      btn.className = 'pick-res-btn';
      btn.textContent = `${RES_EMOJI[r]} ${RES_LABEL[r]}`;
      btn.onclick = () => {
        modal.classList.add('hidden');
        onPick({ resource: r });
      };
      root.appendChild(btn);
    }
  } else {
    title.textContent = '豐收之年：選擇 2 個資源（可重複）';
    const picked = [];
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = '已選：無';
    root.appendChild(status);

    for (const r of RESOURCES) {
      const btn = document.createElement('button');
      btn.className = 'pick-res-btn';
      btn.textContent = `${RES_EMOJI[r]} ${RES_LABEL[r]}`;
      btn.onclick = () => {
        if (picked.length >= 2) return;
        picked.push(r);
        status.textContent = `已選：${picked.map((x) => RES_LABEL[x]).join('、')}`;
        if (picked.length === 2) {
          modal.classList.add('hidden');
          onPick({ resources: [...picked] });
        }
      };
      root.appendChild(btn);
    }
  }
  modal.classList.remove('hidden');
}

export function showWinner(game) {
  const modal = el('winner-modal');
  const w = game.players[game.winner];
  const b = scoreBreakdown(game, w.id);
  const lines = [
    `建築 ${b.building}（村${b.settlements}＋城${b.cities}）`,
    b.longestRoad ? `最長道路 +${b.longestRoad}` : null,
    b.largestArmy ? `最大軍隊 +${b.largestArmy}` : null,
    b.hidden ? `勝利點卡（隱藏） +${b.hidden}` : null,
  ].filter(Boolean);

  el('winner-text').innerHTML = `
    <div>${w.name} 以 <strong>${b.total}</strong> 分獲勝！</div>
    <div class="winner-breakdown">${lines.join('<br/>')}</div>
    <div class="winner-note">提示：勝利點卡一直保密，所以分數有時會「突然」跳上 10 分——呢個係原版規則。</div>
  `;
  modal.classList.remove('hidden');
}

export function hideWinner() {
  el('winner-modal').classList.add('hidden');
}

export function flashDice() {
  el('die1').classList.remove('rolling');
  el('die2').classList.remove('rolling');
  void el('die1').offsetWidth;
  el('die1').classList.add('rolling');
  el('die2').classList.add('rolling');
}
