/* CardForge SDD — Roguelike Overworld UI */

const STORAGE_KEY = 'cf_roguelike_run';
let currentUser = null;
let runState = null;
let gameMode = null;
let cards = [];
let characters = [];
let effects = [];
let buffs = [];

const NODE_ICONS = {
  start: 'M3 6V3h3l11.5 11.5L14.5 17.5 3 6zM21 3l-5 5M4 21l5-5',
  combat: 'M14.5 17.5L3 6V3h3l11.5 11.5L14.5 17.5zM21 3l-5 5M4 21l5-5',
  elite: 'M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0 0v-4m-3 0h6',
  rest: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  event: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  shop: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  treasure: 'M4 4h16v16H4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  boss: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
};

const TYPE_COLORS = {
  start: '#2ecc71', combat: '#e94560', elite: '#9b59b6', rest: '#2ecc71',
  event: '#f1c40f', shop: '#3498db', treasure: '#e67e22', boss: '#e74c3c',
};

const REGION_NAMES = ['门口', '玄关', '客厅', '厨房', '卧室', '地下室', '自己的房间'];

// Five repressed childhood memories — one per room. Collect all five + clear「家」→ true ending.
const MEMORY_FRAGMENTS = {
  1: '被锁门外的下午',
  2: '电视里的沉默',
  3: '烫手的金属',
  4: '衣柜里的呼吸',
  5: '被藏起来的东西',
};

const NODE_FLAVOR = {
  rest: '你蜷回那张沙发，毯子搭在脸上。屋里很静，只有冰箱在响。',
  shop: '阁楼的纸箱里，有你不记得拥有过的东西。',
  treasure: '抽屉最里头，摸到一样你找了好久的东西。',
};

function saveRun() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runState));
}

function loadRun() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function pushKeepsake(name, fragment) {
  try {
    const memory = JSON.parse(localStorage.getItem('cf_dream_keepsakes') || '[]');
    memory.push({ name, fragment: fragment || null, at: new Date().toISOString().slice(0, 10) });
    localStorage.setItem('cf_dream_keepsakes', JSON.stringify(memory));
  } catch {}
}

function countFragments() {
  try {
    const memory = JSON.parse(localStorage.getItem('cf_dream_keepsakes') || '[]');
    const seen = new Set();
    for (const k of memory) if (k.fragment) seen.add(k.fragment);
    return seen.size;
  } catch { return 0; }
}

function clearRun() {
  localStorage.removeItem(STORAGE_KEY);
  runState = null;
}

async function fetchGameMode() {
  const res = await fetch('/api/game-modes');
  const modes = await res.json();
  gameMode = modes.find(m => m.id === 'roguelike_run');
}

async function fetchData() {
  const [cRes, chRes, eRes, bRes] = await Promise.all([
    fetch('/api/cards').then(r => r.json()),
    fetch('/api/characters').then(r => r.json()),
    fetch('/api/effects').then(r => r.json()),
    fetch('/api/buffs').then(r => r.json()),
  ]);
  cards = Array.isArray(cRes) ? cRes : [];
  characters = Array.isArray(chRes) ? chRes : [];
  effects = Array.isArray(eRes) ? eRes : [];
  buffs = Array.isArray(bRes) ? bRes : [];
}

function findCard(id) { return cards.find(c => c.id === id); }
function findChar(id) { return characters.find(c => c.id === id); }

function initNewRun(charId, seed) {
  const ch = findChar(charId);
  const rules = gameMode?.rules || {};
  const generator = new RoguelikeMapGenerator({
    mapWidth: rules.mapWidth || 800,
    mapHeight: rules.mapHeight || 600,
    nodeCount: rules.nodeCount || 24,
    startPosition: rules.startPosition || { x: 0.1, y: 0.5 },
    bossPosition: rules.bossPosition || { x: 0.9, y: 0.5 },
    regionCount: rules.regionCount || 5,
    seed: seed || Math.random().toString(36).slice(2, 10),
    nodeTypes: rules.nodeTypes || {},
    encounters: rules.encounters || [],
  });
  const map = generator.generate();
  runState = {
    seed: map.seed,
    charId,
    hp: ch.maxHp,
    maxHp: ch.maxHp,
    deck: [...ch.startingDeck],
    map,
    currentNodeId: 0,
    completedNodeIds: [],
    nightmare: 0,
    startedAt: new Date().toISOString(),
  };
  saveRun();
}

function canVisitNode(node) {
  if (node.id === runState.currentNodeId) return true;
  if (runState.completedNodeIds.includes(node.id)) return false;
  // Must have a cleared node that has an edge to this node
  return runState.map.edges.some(e =>
    runState.completedNodeIds.includes(e.from) && e.to === node.id
  );
}

function isNodeReachable(node) {
  if (node.id === 0) return true;
  return runState.map.edges.some(e => e.to === node.id &&
    (runState.completedNodeIds.includes(e.from) || e.from === runState.currentNodeId)
  );
}

function renderMap() {
  const svg = document.getElementById('map-svg');
  const edgeLayer = document.getElementById('edges-layer');
  const nodeLayer = document.getElementById('nodes-layer');
  const { map, currentNodeId, completedNodeIds } = runState;

  edgeLayer.innerHTML = '';
  nodeLayer.innerHTML = '';

  // Edges
  for (const e of map.edges) {
    const a = map.nodes.find(n => n.id === e.from);
    const b = map.nodes.find(n => n.id === e.to);
    if (!a || !b) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', 'map-edge'
      + (completedNodeIds.includes(e.from) && (completedNodeIds.includes(e.to) || e.to === currentNodeId) ? ' cleared' : '')
      + (e.from === currentNodeId || e.to === currentNodeId ? ' active' : '')
    );
    edgeLayer.appendChild(line);
  }

  // Nodes
  for (const n of map.nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node-group'
      + (n.id === currentNodeId ? ' current' : '')
      + (completedNodeIds.includes(n.id) ? ' cleared' : '')
      + (isNodeReachable(n) || n.id === currentNodeId ? '' : ' locked')
    );
    g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
    g.dataset.id = n.id;

    const color = TYPE_COLORS[n.type] || '#888';
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', n.type === 'boss' ? 22 : (n.type === 'start' ? 18 : 14));
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', 'rgba(0,0,0,0.4)');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('class', 'node-circle');
    g.appendChild(circle);

    // Icon
    const pathD = NODE_ICONS[n.type] || NODE_ICONS.combat;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    icon.setAttribute('d', pathD);
    icon.setAttribute('class', 'node-icon');
    icon.setAttribute('transform', 'translate(-8,-8) scale(0.65)');
    g.appendChild(icon);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('y', n.type === 'boss' ? 34 : 28);
    text.setAttribute('class', 'node-label');
    text.textContent = n.label || n.type;
    g.appendChild(text);

    g.addEventListener('click', () => onNodeClick(n));
    g.addEventListener('mouseenter', ev => showTooltip(ev, n));
    g.addEventListener('mouseleave', hideTooltip);
    nodeLayer.appendChild(g);
  }
}

function showTooltip(ev, node) {
  const tip = document.getElementById('node-tooltip');
  const typeLabels = { combat: '梦魇', elite: '反复的梦', rest: '打盹', event: '似曾相识', shop: '阁楼旧物', treasure: '抽屉深处', boss: '家', start: '门口' };
  let html = `<strong>${node.label}</strong><br><span style="color:var(--fg-dim)">${typeLabels[node.type] || node.type}</span>`;
  if (node.encounter) {
    const mod = window.modifierFor ? window.modifierFor(node.region, node.type) : null;
    html += `<br>梦魇: ${node.encounter.name} · 清醒 ${node.encounter.hp}`;
    if (mod && (node.type === 'combat' || node.type === 'elite' || node.type === 'boss')) {
      html += `<br><span style="color:var(--accent)">修正: ${mod.name}</span>`;
    }
    html += `<br>可想起 ${node.encounter.rewardChoices || 1} 张牌`;
  }
  if (!isNodeReachable(node) && node.id !== runState.currentNodeId) {
    html += `<br><em style="color:var(--accent)">还没走到</em>`;
  }
  tip.innerHTML = html;
  tip.classList.add('visible');
  const rect = document.getElementById('map-wrap').getBoundingClientRect();
  const x = ev.clientX - rect.left + 12;
  const y = ev.clientY - rect.top + 12;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

function hideTooltip() {
  document.getElementById('node-tooltip').classList.remove('visible');
}

function updateStatus() {
  const ch = findChar(runState.charId);
  document.getElementById('run-char').textContent = ch?.nameKey || runState.charId;
  document.getElementById('run-hp').textContent = `${runState.hp}/${runState.maxHp}`;
  document.getElementById('run-deck').textContent = runState.deck.length;
  const current = runState.map.nodes.find(n => n.id === runState.currentNodeId);
  const regionName = current
    ? (current.type === 'boss' ? '自己的房间' : (REGION_NAMES[current.region] || `区域 ${current.region}`))
    : '门口';
  const nightmare = runState.nightmare || 0;
  document.getElementById('run-region').textContent = `${regionName} · 噩梦${nightmare}`;
  document.getElementById('run-seed').textContent = runState.seed;
}

function onNodeClick(node) {
  if (!isNodeReachable(node) && node.id !== runState.currentNodeId) return;
  if (runState.completedNodeIds.includes(node.id)) return;

  switch (node.type) {
    case 'combat':
    case 'elite':
    case 'boss':
      launchCombat(node);
      break;
    case 'rest':
      showRestModal(node);
      break;
    case 'shop':
      showShopModal(node);
      break;
    case 'event':
      showEventModal(node);
      break;
    case 'treasure':
      showTreasureModal(node);
      break;
    case 'start':
      // nothing
      break;
  }
}

function launchCombat(node) {
  const params = new URLSearchParams();
  params.set('mode', 'roguelike');
  params.set('nodeId', node.id);
  params.set('seed', runState.seed);
  params.set('charId', runState.charId);
  params.set('return', 'roguelike.html');
  window.location.href = `battle.html?${params.toString()}`;
}

function completeNode(nodeId) {
  if (!runState.completedNodeIds.includes(nodeId)) {
    runState.completedNodeIds.push(nodeId);
    runState.nightmare = (runState.nightmare || 0) + 1;
  }
  runState.currentNodeId = nodeId;
  // Record furthest room reached for the home page.
  const node = runState.map.nodes.find(n => n.id === nodeId);
  if (node) {
    const regionVal = node.type === 'boss' ? 6 : (node.region || 0);
    const prev = parseInt(localStorage.getItem('cf_dream_furthest') || '0');
    if (regionVal > prev) localStorage.setItem('cf_dream_furthest', String(regionVal));
  }
  saveRun();
  renderMap();
  updateStatus();
}

function showModal(title, desc, contentHtml, onConfirm, confirmText = '确认') {
  document.getElementById('event-title').textContent = title;
  document.getElementById('event-desc').textContent = desc;
  document.getElementById('event-content').innerHTML = contentHtml || '';
  document.getElementById('btn-event-confirm').textContent = confirmText;
  const modal = document.getElementById('event-modal');
  modal.classList.remove('hidden');

  const confirmBtn = document.getElementById('btn-event-confirm');
  const cancelBtn = document.getElementById('btn-event-cancel');

  const cleanup = () => {
    modal.classList.add('hidden');
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
  };

  confirmBtn.onclick = () => { cleanup(); if (onConfirm) onConfirm(); };
  cancelBtn.onclick = cleanup;
}

function showRestModal(node) {
  const heal = Math.floor(runState.maxHp * 0.3);
  const newHp = Math.min(runState.maxHp, runState.hp + heal);
  showModal('打盹', `${NODE_FLAVOR.rest}醒来时，清醒了一些（+${heal}）。`, '', () => {
    runState.hp = newHp;
    completeNode(node.id);
  }, '继续走');
}

function showShopModal(node) {
  // Simple shop: remove a card or gain a random reward card for 5 maxHp cost
  const rewardPool = getRewardPool();
  const offers = rewardPool.slice(0, 3);
  let html = '<div class="reward-grid">';
  for (const cardId of offers) {
    const c = findCard(cardId);
    html += `
      <div class="reward-card" data-id="${cardId}">
        <div class="name">${c?.nameKey || cardId}</div>
        <div class="type">${c?.type || ''}</div>
        <div class="desc">${c ? describeCardEffects(c) : ''}</div>
      </div>`;
  }
  html += '</div>';
  showModal('阁楼旧物', `${NODE_FLAVOR.shop}用 5 点清醒上限，换一样带走。`, html, null, '离开');
  const confirmBtn = document.getElementById('btn-event-confirm');
  confirmBtn.onclick = () => document.getElementById('event-modal').classList.add('hidden');

  document.querySelectorAll('.reward-card').forEach(el => {
    el.addEventListener('click', () => {
      const cardId = el.dataset.id;
      runState.maxHp = Math.max(10, runState.maxHp - 5);
      runState.hp = Math.min(runState.maxHp, runState.hp);
      runState.deck.push(cardId);
      completeNode(node.id);
      document.getElementById('event-modal').classList.add('hidden');
    });
  });
}

function showEventModal(node) {
  const events = [
    { title: '一滩水', desc: '走廊尽头有滩水，擦不掉。踩过去，脚凉了一下。失去 8 点清醒。', effect: () => { runState.hp = Math.max(1, runState.hp - 8); } },
    { title: '旧衣服', desc: '洗衣机里翻出一件你忘了的衣。它跟你回去。想起一张牌。', effect: () => { const pool = getRewardPool(); runState.deck.push(pool[Math.floor(Math.random() * pool.length)]); } },
    { title: '镜子', desc: '镜子里的人慢半拍才转头。你对它点头，它没回。恢复 10 点清醒。', effect: () => { runState.hp = Math.min(runState.maxHp, runState.hp + 10); } },
    { title: '重复的梦', desc: '这条走廊你又走了一次。熟悉得发冷。失去 5 点清醒，想起一张牌。', effect: () => { runState.hp = Math.max(1, runState.hp - 5); const pool = getRewardPool(); runState.deck.push(pool[Math.floor(Math.random() * pool.length)]); } },
  ];
  const ev = events[Math.floor(Math.random() * events.length)];
  showModal(ev.title, ev.desc, '', () => {
    ev.effect();
    completeNode(node.id);
  }, '接受');
}

function showTreasureModal(node) {
  const pool = getRewardPool();
  const cardId = pool[Math.floor(Math.random() * pool.length)];
  const c = findCard(cardId);
  showModal('抽屉深处', `${NODE_FLAVOR.treasure}`, `
    <div class="reward-grid"><div class="reward-card" data-id="${cardId}">
      <div class="name">${c?.nameKey || cardId}</div>
      <div class="type">${c?.type || ''}</div>
      <div class="desc">${c ? describeCardEffects(c) : ''}</div>
    </div></div>
  `, () => {
    runState.deck.push(cardId);
    completeNode(node.id);
  }, '带走');
}

function getRewardPool() {
  const char = findChar(runState.charId);
  const isWarrior = runState.charId === 'ironclad';
  const rewardCards = cards.filter(c => {
    if (c.rarity === 'Basic') return false;
    if (isWarrior) return c.type === 'Attack' || c.type === 'Skill';
    return true;
  }).map(c => c.id);
  return rewardCards.length ? rewardCards : cards.filter(c => c.rarity !== 'Basic').map(c => c.id);
}

function describeCardEffects(card) {
  if (!card.effects) return '';
  return card.effects.map(inv => {
    const eff = effects.find(e => e.id === inv.effectId);
    const name = eff?.displayNameKey || inv.effectId;
    let s = `${name}${inv.value ? ' ' + inv.value : ''}`;
    if (inv.parameters?.buffId_ref) {
      const bdef = buffs.find(b => b.id === inv.parameters.buffId_ref);
      s += ` [${bdef?.nameKey || inv.parameters.buffId_ref}]`;
    }
    return s;
  }).join('，');
}

function showRewardModal(node) {
  const count = node.encounter?.rewardChoices || 1;
  const pool = getRewardPool();
  const picks = [];
  while (picks.length < Math.min(count * 3, pool.length)) {
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (!picks.includes(id)) picks.push(id);
  }
  let html = '<div class="reward-grid">';
  for (const cardId of picks) {
    const c = findCard(cardId);
    html += `
      <div class="reward-card" data-id="${cardId}">
        <div class="name">${c?.nameKey || cardId}</div>
        <div class="type">${c?.type || ''}</div>
        <div class="desc">${c ? describeCardEffects(c) : ''}</div>
      </div>`;
  }
  html += '</div>';
  showModal('想起来了', `${node.encounter?.name || '它'} 散成了记忆。选 ${count} 张带回去。`, html, null, '跳过');
  const confirmBtn = document.getElementById('btn-event-confirm');
  confirmBtn.onclick = () => {
    document.getElementById('event-modal').classList.add('hidden');
    completeNode(node.id);
  };

  let selected = 0;
  document.querySelectorAll('.reward-card').forEach(el => {
    el.addEventListener('click', () => {
      if (selected >= count) return;
      runState.deck.push(el.dataset.id);
      selected++;
      el.style.opacity = '0.4';
      el.style.pointerEvents = 'none';
      if (selected >= count) {
        setTimeout(() => {
          document.getElementById('event-modal').classList.add('hidden');
          completeNode(node.id);
        }, 200);
      }
    });
  });
}

function showEndingModal() {
  // 梦醒，但留下了什么 — return of the repressed as a keepsake object.
  // Collecting all 5 memory fragments unlocks the true ending.
  const fragments = countFragments();
  const trueEnding = fragments >= 5;
  const keepsakePool = cards.filter(c => ['泡泡糖', '被子', '创可贴', '铅笔', '弹珠', '镜子', '日记本', '纽扣'].includes(c.nameKey));
  const keepsake = keepsakePool.length
    ? keepsakePool[Math.floor(Math.random() * keepsakePool.length)]
    : cards[Math.floor(Math.random() * cards.length)];
  if (!trueEnding) pushKeepsake(keepsake?.nameKey || '一样东西', null);
  try {
    localStorage.setItem('cf_dream_furthest', '6');
  } catch {}
  const title = trueEnding ? '梦醒·真相' : '梦醒';
  const desc = trueEnding
    ? `你推开了自己房间的门。屋子松开了手。你醒了过来——你想起来的不是家，是你为什么要离开。枕头边叠着五段记忆，堆成一件你说不出形状的东西。`
    : `你推开了自己房间的门。屋子松开了手。你醒了过来。枕头边多了一样东西——你说不清它是从梦里带出来的，还是一直就在那儿。`;
  const html = keepsake
    ? `<div class="reward-grid"><div class="reward-card"><div class="name">${trueEnding ? '五段记忆' : keepsake.nameKey}</div><div class="type">纪念</div><div class="desc">${trueEnding ? '被锁门外的下午 · 电视里的沉默 · 烫手的金属 · 衣柜里的呼吸 · 被藏起来的东西' : (keepsake ? describeCardEffects(keepsake) : '')}</div></div></div>`
    : '';
  showModal(title, desc, html, () => {
    clearRun();
    startNewRun();
  }, '醒来');
}

async function startNewRun() {
  if (!characters.length) await fetchData();
  const charId = runState?.charId || 'ironclad';
  initNewRun(charId);
  renderMap();
  updateStatus();
}

async function setup() {
  currentUser = await checkAuth();
  if (!currentUser) { window.location.href = '/login.html'; return; }
  document.getElementById('user-display').textContent =
    `${currentUser.displayName || currentUser.username} (${currentUser.role})`;

  await Promise.all([fetchGameMode(), fetchData()]);

  // Check return from battle with outcome
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get('outcome');
  const nodeId = params.get('nodeId') ? parseInt(params.get('nodeId')) : null;

  runState = loadRun();

  if (outcome && nodeId != null && runState) {
    const node = runState.map.nodes.find(n => n.id === nodeId);
    if (outcome === 'win' && node) {
      if (node.type === 'boss') {
        // Final boss defeated: the dream ends, but something remains.
        showEndingModal();
      } else {
        // Heal between encounters
        const rules = gameMode?.rules || {};
        const heal = rules.healBetweenEncounters || 20;
        runState.hp = Math.min(runState.maxHp, runState.hp + heal);
        saveRun();
        renderMap();
        updateStatus();
        // Elite nodes drop a repressed memory fragment.
        if (node.type === 'elite' && MEMORY_FRAGMENTS[node.region]) {
          pushKeepsake(MEMORY_FRAGMENTS[node.region], node.region);
        }
        showRewardModal(node);
      }
    } else {
      // Defeat: the dream keeps you.
      showModal('没醒过来', '你忘了为什么回来。屋子把你留在了它最深的地方。', '', () => {
        clearRun();
        startNewRun();
      }, '再睡一会');
    }
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (!runState) {
    // First visit: default to ironclad
    startNewRun();
  } else {
    renderMap();
    updateStatus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setup();
  document.getElementById('btn-new-run').addEventListener('click', () => {
    const charId = prompt('选择角色: ironclad(执灯人) / mage(拾梦人) / nightwatch(守夜人) / sleepwalker(梦游者)', runState?.charId || 'ironclad');
    if (!charId) return;
    initNewRun(charId.trim());
    renderMap();
    updateStatus();
  });
  document.getElementById('btn-regen').addEventListener('click', () => {
    if (!runState) return;
    initNewRun(runState.charId);
    renderMap();
    updateStatus();
  });
  document.getElementById('btn-abandon').addEventListener('click', () => {
    if (!confirm('确定要放弃当前 run 吗？')) return;
    clearRun();
    startNewRun();
  });
});
