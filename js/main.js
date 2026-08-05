/**
 * Catan — entry point (solo vs AI + multi-human hot-seat)
 */

import {
  createGame,
  placeSettlement,
  placeRoad,
  upgradeCity,
  rollDice,
  moveRobber,
  doSteal,
  buyDevCard,
  playDevCard,
  bankTrade,
  proposePlayerTrade,
  acceptPlayerTrade,
  rejectPlayerTrade,
  endTurn,
  discardResources,
  getSetupPlayer,
  log,
  ensurePlayableState,
  resolveRoadBuildingPhase,
  uiControllerId,
  isHumanActing,
  actingPlayerId,
  isHumanController,
} from './game.js';
import { pumpAI } from './ai.js';
import {
  renderAll,
  showTradeModal,
  showTradeAcceptModal,
  showDiscardModal,
  showStealModal,
  showResourcePick,
  showWinner,
  hideWinner,
  showHandoff,
  hideHandoff,
  flashDice,
  el,
} from './ui.js';

let game = null;
let busy = false;
let pumpQueued = false;
let discardModalOpen = false;
let stealModalOpen = false;
let tradeAcceptOpen = false;
let handoffOpen = false;
/** Last human controller id — for hot-seat handoff detection */
let lastHumanUiId = null;

const handlers = {
  onRoll: () => humanRoll(),
  onBuildMode: (mode) => toggleBuildMode(mode),
  onBuyDev: () => humanBuyDev(),
  onTradeOpen: () => humanTrade(),
  onEndTurn: () => humanEndTurn(),
  onPlayDev: (i) => humanPlayDev(i),
  onTileClick: (id) => humanTile(id),
  onEdgeClick: (id) => humanEdge(id),
  onVertexClick: (id) => humanVertex(id),
};

function refresh() {
  if (!game) return;
  ensurePlayableState(game);
  renderAll(game, handlers);

  if (game.phase === 'gameover' && game.winner != null) {
    showWinner(game);
  }

  // Hot-seat handoff when UI controller changes between humans
  maybeHandoff();

  // Pending domestic trade accept
  if (game.pendingTrade && !game.players[game.pendingTrade.toId].isAI && !tradeAcceptOpen) {
    // Ensure handoff to acceptor first if needed
    if (handoffOpen) return;
    tradeAcceptOpen = true;
    showTradeAcceptModal(
      game,
      () => {
        tradeAcceptOpen = false;
        const r = acceptPlayerTrade(game);
        if (!r.ok) log(game, r.error);
        afterHumanAction();
      },
      () => {
        tradeAcceptOpen = false;
        rejectPlayerTrade(game);
        afterHumanAction();
      }
    );
  }

  // Human discard
  if (
    game.phase === 'discard' &&
    game.discardQueue.length &&
    !game.players[game.discardQueue[0]]?.isAI &&
    !discardModalOpen &&
    !handoffOpen
  ) {
    const pid = game.discardQueue[0];
    discardModalOpen = true;
    showDiscardModal(game, pid, (sel) => {
      discardModalOpen = false;
      const r = discardResources(game, pid, sel);
      if (!r.ok) {
        log(game, r.error);
        refresh();
        return;
      }
      afterHumanAction();
    });
  }

  // Steal picker
  if (
    game.phase === 'steal' &&
    isHumanActing(game) &&
    game.pendingSteal?.length &&
    !stealModalOpen &&
    !handoffOpen
  ) {
    stealModalOpen = true;
    showStealModal(game, game.pendingSteal, (tid) => {
      stealModalOpen = false;
      doSteal(game, tid);
      afterHumanAction();
    });
  }
}

function maybeHandoff() {
  if (!game || handoffOpen || game.phase === 'gameover') return;
  // During AI control: keep lastHumanUiId so we can hand off A→…→B after AI
  if (!isHumanController(game)) {
    return;
  }
  const id = uiControllerId(game);
  const humanCount = game.players.filter((p) => !p.isAI).length;
  if (humanCount < 2) {
    lastHumanUiId = id;
    return;
  }
  if (lastHumanUiId != null && lastHumanUiId !== id) {
    handoffOpen = true;
    const p = game.players[id];
    let reason = `請把裝置交給 ${p.name}`;
    if (game.phase === 'discard') reason += '（需丟棄資源）';
    else if (game.pendingTrade) reason += '（確認交易）';
    else if (game.phase === 'setup') reason += '（放置村莊/道路）';
    else reason += '（你的回合）';

    showHandoff(p, reason, () => {
      handoffOpen = false;
      lastHumanUiId = id;
      refresh();
    });
    return;
  }
  lastHumanUiId = id;
}

async function afterHumanAction() {
  if (!game) return;
  ensurePlayableState(game);
  refresh();

  if (busy) {
    pumpQueued = true;
    return;
  }
  busy = true;
  pumpQueued = false;
  try {
    do {
      pumpQueued = false;
      await pumpAI(game, () => {
        ensurePlayableState(game);
        refresh();
      });
    } while (pumpQueued && game && game.phase !== 'gameover');
  } catch (err) {
    console.error('pumpAI error', err);
    log(game, '系統：自動回合出現錯誤，已嘗試恢復', { important: true });
    ensurePlayableState(game);
    // Soft recovery only — do not wipe discard queues or skip mandatory roll
    if (game?.players[game.currentPlayer]?.isAI) {
      game.pendingSteal = null;
      game.freeRoads = 0;
      if (game.phase === 'roadBuilding') game.phase = 'main';
      if (game.phase === 'steal' || game.phase === 'robber') {
        game.mustMoveRobber = false;
        game.phase = game.hasRolled ? 'main' : 'roll';
        game.returnToRollAfterRobber = false;
      }
      if (game.phase === 'main' && game.hasRolled) {
        try {
          endTurn(game);
        } catch (_) {
          /* ignore */
        }
      }
    }
  } finally {
    busy = false;
    ensurePlayableState(game);
    refresh();
  }
}

function startGame() {
  const humanCount = +el('human-count').value || 1;
  let aiCount = +el('ai-count').value;
  // Clamp total 2–4
  if (humanCount + aiCount < 2) aiCount = 2 - humanCount;
  if (humanCount + aiCount > 4) aiCount = Math.max(0, 4 - humanCount);

  const nameInputs = document.querySelectorAll('.human-name-input');
  const names = [];
  nameInputs.forEach((input) => {
    names[+input.dataset.idx] = input.value.trim() || `玩家${+input.dataset.idx + 1}`;
  });
  for (let i = 0; i < humanCount; i++) {
    if (!names[i]) names[i] = `玩家${i + 1}`;
  }

  const mapMode = el('map-mode')?.value || 'balanced';
  game = createGame({ humanCount, aiCount, names, mapMode });
  const mapLabel = game.board.mapLabel || mapMode;
  const humanN = game.players.filter((p) => !p.isAI).length;
  const aiN = game.players.filter((p) => p.isAI).length;
  log(
    game,
    `遊戲開始！${humanN} 名人類${aiN ? ` + ${aiN} AI` : ''} · 地圖：${mapLabel}`,
    { important: true }
  );

  el('start-screen').classList.add('hidden');
  el('game-screen').classList.remove('hidden');
  hideWinner();
  hideHandoff();
  busy = false;
  pumpQueued = false;
  discardModalOpen = false;
  stealModalOpen = false;
  tradeAcceptOpen = false;
  handoffOpen = false;
  lastHumanUiId = null;
  refresh();
  afterHumanAction();
}

function requireHumanAct() {
  return game && !busy && !handoffOpen && isHumanActing(game) && !game.pendingTrade;
}

function toggleBuildMode(mode) {
  if (!requireHumanAct()) return;
  if (game.phase === 'setup') return;
  if (game.phase === 'roadBuilding') return;
  if (game.phase !== 'main') return;

  game.buildMode = game.buildMode === mode ? null : mode;
  refresh();
}

function humanVertex(vid) {
  if (!requireHumanAct()) return;

  if (game.phase === 'setup' && game.setupStep === 'settlement') {
    const r = placeSettlement(game, vid);
    if (!r.ok) return;
    game.buildMode = null;
    afterHumanAction();
    return;
  }

  if (game.phase === 'main' && game.buildMode === 'settlement') {
    const r = placeSettlement(game, vid);
    if (!r.ok) {
      log(game, r.error);
      refresh();
      return;
    }
    game.buildMode = null;
    afterHumanAction();
    return;
  }

  if (game.phase === 'main' && game.buildMode === 'city') {
    const r = upgradeCity(game, vid);
    if (!r.ok) {
      log(game, r.error);
      refresh();
      return;
    }
    game.buildMode = null;
    afterHumanAction();
  }
}

function humanEdge(eid) {
  if (!requireHumanAct()) return;

  if (game.phase === 'setup' && game.setupStep === 'road') {
    const r = placeRoad(game, eid);
    if (!r.ok) return;
    afterHumanAction();
    return;
  }

  if (game.phase === 'roadBuilding') {
    const r = placeRoad(game, eid);
    if (!r.ok) {
      log(game, r.error);
      resolveRoadBuildingPhase(game);
      refresh();
      return;
    }
    resolveRoadBuildingPhase(game);
    afterHumanAction();
    return;
  }

  if (game.phase === 'main' && game.buildMode === 'road') {
    const r = placeRoad(game, eid);
    if (!r.ok) {
      log(game, r.error);
      refresh();
      return;
    }
    game.buildMode = null;
    afterHumanAction();
  }
}

function humanTile(tid) {
  if (!requireHumanAct()) return;
  if (game.phase !== 'robber') return;
  const r = moveRobber(game, tid);
  if (!r.ok) {
    log(game, r.error);
    refresh();
    return;
  }
  afterHumanAction();
}

function humanRoll() {
  if (!requireHumanAct()) return;
  if (game.phase !== 'roll') return;
  flashDice();
  const r = rollDice(game);
  if (!r.ok) return;
  afterHumanAction();
}

function humanBuyDev() {
  if (!requireHumanAct()) return;
  const r = buyDevCard(game);
  if (!r.ok) {
    log(game, r.error);
    refresh();
    return;
  }
  refresh();
}

function humanTrade() {
  if (!requireHumanAct()) return;
  if (game.phase !== 'main') return;
  showTradeModal(
    game,
    (result) => {
      if (result.type === 'bank') {
        const r = bankTrade(game, result.give, result.n, result.get);
        if (!r.ok) log(game, r.error);
        refresh();
        return;
      }
      // player trade
      const r = proposePlayerTrade(game, result.toId, result.give, result.get);
      if (!r.ok) {
        log(game, r.error);
        refresh();
        return;
      }
      if (r.needAccept) {
        // Handoff + accept modal via refresh
        afterHumanAction();
        return;
      }
      // Auto accepted/rejected with AI
      refresh();
    },
    () => refresh()
  );
}

function humanEndTurn() {
  if (!requireHumanAct()) return;
  const r = endTurn(game);
  if (!r.ok) {
    log(game, r.error);
    refresh();
    return;
  }
  afterHumanAction();
}

function humanPlayDev(index) {
  if (!requireHumanAct()) return;
  const pid = actingPlayerId(game);
  const card = game.players[pid].devCards[index];
  if (!card) return;

  if (card.type === 'yearOfPlenty') {
    showResourcePick('yearOfPlenty', (extra) => {
      const r = playDevCard(game, index, extra);
      if (!r.ok) log(game, r.error);
      afterHumanAction();
    });
    return;
  }
  if (card.type === 'monopoly') {
    showResourcePick('monopoly', (extra) => {
      const r = playDevCard(game, index, extra);
      if (!r.ok) log(game, r.error);
      afterHumanAction();
    });
    return;
  }

  const r = playDevCard(game, index);
  if (!r.ok) {
    log(game, r.error);
    refresh();
    return;
  }
  // Knight / etc. may have already ended the game (e.g. Largest Army → 10 VP)
  if (game.phase === 'gameover' || r.won) {
    refresh();
    return;
  }
  afterHumanAction();
}

// ——— Start screen helpers ———
const MAP_DESCS = {
  balanced: '有沙漠，資源分散，6/8 唔相鄰，產出較公平',
  noDesert: '沙漠換成資源格，全部地塊都有號碼',
  beginner: '沙漠置中、資源極分散、號碼最平衡',
  clustered: '同類資源傾向連成一片，策略性更強',
  random: '資源同號碼盡量隨機（仍避免 6/8 相鄰）',
  wild: '無沙漠 + 完全隨機號碼（僅修 6/8）',
};

function updateMapDesc() {
  const id = el('map-mode')?.value || 'balanced';
  const node = el('map-mode-desc');
  if (node) node.textContent = MAP_DESCS[id] || '';
}

function updatePlayerSetup() {
  const humanCount = +el('human-count').value || 1;
  const aiSel = el('ai-count');
  // Disable invalid AI options so total stays 2–4
  [...aiSel.options].forEach((opt) => {
    const ai = +opt.value;
    const total = humanCount + ai;
    opt.disabled = total < 2 || total > 4;
  });
  // Fix selection if invalid
  let aiCount = +aiSel.value;
  if (humanCount + aiCount < 2 || humanCount + aiCount > 4) {
    const valid = [...aiSel.options].find((o) => !o.disabled);
    if (valid) {
      aiSel.value = valid.value;
      aiCount = +valid.value;
    }
  }

  const total = humanCount + aiCount;
  el('player-total-hint').textContent = `共 ${total} 名玩家（${humanCount} 人類 + ${aiCount} AI）`;

  const box = el('human-names');
  box.innerHTML = '';
  for (let i = 0; i < humanCount; i++) {
    const label = document.createElement('label');
    label.innerHTML = `玩家 ${i + 1} 名字
      <input class="human-name-input" data-idx="${i}" type="text" value="玩家${i + 1}" maxlength="12" />`;
    box.appendChild(label);
  }
}

el('map-mode')?.addEventListener('change', updateMapDesc);
el('human-count')?.addEventListener('change', updatePlayerSetup);
el('ai-count')?.addEventListener('change', updatePlayerSetup);
updateMapDesc();
updatePlayerSetup();

el('btn-start').addEventListener('click', startGame);
el('btn-new').addEventListener('click', () => {
  if (confirm('開始新遊戲？目前進度會消失。')) {
    el('game-screen').classList.add('hidden');
    el('start-screen').classList.remove('hidden');
    hideWinner();
    hideHandoff();
    game = null;
  }
});
el('btn-play-again').addEventListener('click', () => {
  hideWinner();
  startGame();
});
el('btn-help').addEventListener('click', () => el('help-modal').classList.remove('hidden'));
el('btn-help-close').addEventListener('click', () => el('help-modal').classList.add('hidden'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game) {
    game.buildMode = null;
    refresh();
  }
});
