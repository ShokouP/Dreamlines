/* CardForge SDD — Admin UI Logic */

// ── Auth —────────────────────────────────────
function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

// ── State —───────────────────────────────────
const state = {
  table: 'cards',
  data: {},
  dirty: {},
  editingIdx: -1,
  user: null,
  matchList: [],
};

// ── Schema definitions —──────────────────────
const SCHEMAS = {
  cards: {
    label: 'Cards',
    fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'nameKey', label: 'Name Key', type: 'string', required: true },
      { key: 'descriptionKey', label: 'Description Key', type: 'string' },
      { key: 'type', label: 'Type', type: 'select', options: ['Attack','Skill','Power','Status','Curse'] },
      { key: 'rarity', label: 'Rarity', type: 'select', options: ['Basic','Common','Uncommon','Rare','Epic','Legendary'] },
      { key: 'element', label: 'Element', type: 'select', options: ['None','Fire','Ice','Lightning','Dark','Light'] },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'targetType', label: 'Target Type', type: 'select', options: ['None','Self','SingleEnemy','SingleAlly','AllEnemies','AllAllies','All','RandomEnemy','RandomAlly','LastAttacker','LowestHpAlly','HighestHpEnemy','CardOwner'] },
      { key: 'exhaust', label: 'Exhaust', type: 'bool' },
      { key: 'ethereal', label: 'Ethereal', type: 'bool' },
      { key: 'innate', label: 'Innate', type: 'bool' },
      { key: 'keywordIds', label: 'Keywords', type: 'string-array' },
      { key: 'effects', label: 'Effects', type: 'effects' },
      { key: 'customData', label: 'Custom Data', type: 'kv-pairs' },
    ],
    columns: ['id','nameKey','type','rarity','cost','targetType','effects'],
  },
  effects: {
    label: 'Effects', fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'executorType', label: 'Executor Type', type: 'select', options: ['DealDamageExecutor','HealExecutor','ApplyBuffExecutor','RemoveBuffExecutor','GainBlockExecutor','DrawCardsExecutor','GainManaExecutor'] },
      { key: 'displayNameKey', label: 'Display Name Key', type: 'string' },
      { key: 'defaultParams', label: 'Default Params', type: 'kv-pairs' },
    ], columns: ['id','executorType','displayNameKey'],
  },
  buffs: {
    label: 'Buffs', fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'handlerType', label: 'Handler Type', type: 'select', options: ['VulnerableBuffHandler','StrengthBuffHandler','PoisonBuffHandler','BurningBuffHandler','ThornsBuffHandler','RitualBuffHandler','RegenerationBuffHandler','MetallicizeBuffHandler'] },
      { key: 'nameKey', label: 'Name Key', type: 'string' },
      { key: 'descriptionKey', label: 'Description Key', type: 'string' },
      { key: 'stackPolicy', label: 'Stack Policy', type: 'select', options: ['Replace','Additive','Independent','Refresh','Max'] },
      { key: 'maxStacks', label: 'Max Stacks', type: 'number' },
      { key: 'isDebuff', label: 'Is Debuff', type: 'bool' },
      { key: 'params', label: 'Params', type: 'kv-pairs' },
    ], columns: ['id','handlerType','nameKey','stackPolicy','isDebuff'],
  },
  characters: {
    label: 'Characters', fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'nameKey', label: 'Name Key', type: 'string', required: true },
      { key: 'maxHp', label: 'Max HP', type: 'number' },
      { key: 'maxMana', label: 'Max Mana', type: 'number' },
      { key: 'startingMana', label: 'Starting Mana', type: 'number' },
      { key: 'manaGrowthPerTurn', label: 'Mana Growth/Turn', type: 'number' },
      { key: 'handSize', label: 'Hand Size', type: 'number' },
      { key: 'maxHandSize', label: 'Max Hand Size', type: 'number' },
      { key: 'startingDeck', label: 'Starting Deck', type: 'string-array' },
      { key: 'innateBuffIds', label: 'Innate Buffs', type: 'string-array' },
    ], columns: ['id','nameKey','maxHp','maxMana','startingDeck'],
  },
  'game-modes': {
    label: 'Game Modes', fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'nameKey', label: 'Name Key', type: 'string', required: true },
      { key: 'maxPlayers', label: 'Max Players', type: 'number' },
      { key: 'phaseOrder', label: 'Phase Order', type: 'string-array' },
      { key: 'rules', label: 'Rules', type: 'kv-pairs' },
    ], columns: ['id','nameKey','maxPlayers','phaseOrder'],
  },
  keywords: {
    label: 'Keywords', fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'nameKey', label: 'Name Key', type: 'string', required: true },
      { key: 'descriptionKey', label: 'Description Key', type: 'string' },
    ], columns: ['id','nameKey','descriptionKey'],
  },
  players: {
    label: 'Players',
    apiUrl: '/api/players',
    fields: [
      { key: 'id', label: 'ID', type: 'string', required: true },
      { key: 'username', label: 'Username', type: 'string', required: true },
      { key: 'displayName', label: 'Display Name', type: 'string' },
      { key: 'role', label: 'Role', type: 'select', options: ['player','admin'] },
      { key: 'password', label: 'Password (set on create/change)', type: 'string', hint: '留空则不修改' },
      { key: 'stats', label: 'Statistics', type: 'player-stats' },
      { key: 'collection', label: 'Collection', type: 'player-collection' },
    ],
    columns: ['id','username','displayName','role','stats'],
  },
  matches: {
    label: 'Matches',
    apiUrl: '/api/matches',
    fields: [], // matches use a custom viewer, not the generic editor
    columns: ['id','gameModeId','players','totalTurns','winnerId','startedAt'],
  },
};

// ── Init ———————————————————————————————————
document.addEventListener('DOMContentLoaded', async () => {
  state.user = await checkAuth();
  if (!state.user) return;
  if (state.user.role !== 'admin') { window.location.href = '/play.html'; return; }
  renderUserBar();
  setupTabs();
  document.getElementById('search').addEventListener('input', renderTable);
  document.getElementById('btn-add').addEventListener('click', onAdd);
  document.getElementById('btn-save-all').addEventListener('click', onSaveAll);
  document.getElementById('btn-export').addEventListener('click', onExport);
  document.getElementById('btn-validate').addEventListener('click', onValidate);
  document.getElementById('btn-close-editor').addEventListener('click', closeEditor);
  document.getElementById('btn-save-item').addEventListener('click', onSaveItem);
  document.getElementById('btn-cancel-item').addEventListener('click', closeEditor);
  document.getElementById('btn-logout').addEventListener('click', onLogout);
  document.getElementById('btn-close-replay').addEventListener('click', closeReplay);

  // Overlay click
  const overlay = document.getElementById('overlay');
  overlay.addEventListener('click', () => { closeEditor(); closeReplay(); });
  overlay.classList.add('hidden');

  // Show/hide admin tabs
  if (state.user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(b => b.style.display = 'inline-block');
  }

  loadTable('cards');
});

function renderUserBar() {
  if (!state.user) return;
  document.getElementById('user-display').textContent =
    `${state.user.displayName || state.user.username} (${state.user.role})`;
}

async function onLogout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
  localStorage.clear();
  window.location.href = '/login.html';
}

// ── Data loading ——————————————————————————
async function loadTable(table) {
  state.table = table;
  const schema = SCHEMAS[table];
  // Show/hide toolbar buttons per table type
  const isDataTable = TABLES[table] !== undefined;
  const isPlayers = table === 'players';
  const isMatches = table === 'matches';
  document.getElementById('btn-add').style.display = (isDataTable || isPlayers) ? '' : 'none';
  document.getElementById('btn-save-all').style.display = isDataTable ? '' : 'none';
  document.getElementById('btn-export').style.display = isDataTable ? '' : 'none';
  document.getElementById('btn-validate').style.display = isDataTable ? '' : 'none';

  if (!state.data[table]) {
    setTableLoading(true);
    try {
      const url = schema.apiUrl || `/api/${table}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      state.data[table] = await res.json();
      state.dirty[table] = false;
    } catch (err) {
      showStatus(`加载失败: ${err.message}`, 'error');
      state.data[table] = [];
    } finally {
      setTableLoading(false);
    }
  }
  if (isMatches) renderMatchList();
  else renderTable();
}

function getRows() { return state.data[state.table] || []; }

// ── Cell formatting ———————————————————————
function formatCell(val, col) {
  if (val === undefined || val === null) return '';
  if (col === 'players' && Array.isArray(val)) {
    return val.map(p => `${p.playerId}(${p.characterId || '?'}) ${p.result || ''}`).join(' vs ');
  }
  if (col === 'stats' && typeof val === 'object') {
    return `W:${val.wins||0} L:${val.losses||0} WR:${((val.winRate||0)*100).toFixed(0)}%`;
  }
  if (col === 'type') return renderBadge(val, 'type');
  if (col === 'rarity') return renderBadge(val, 'rarity');
  if (col === 'element') return renderBadge(val, 'element');
  if (col === 'role') return renderBadge(val, 'role');
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    if (typeof val[0] === 'object') return val.map(o => o.effectId || o.id || JSON.stringify(o)).join(', ');
    return val.join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// ── Generic table rendering ———————————————
function renderTable() {
  const rows = getRows();
  const schema = SCHEMAS[state.table];
  const cols = schema.columns;
  const search = document.getElementById('search').value.toLowerCase();
  const filtered = rows.filter(r =>
    !search || cols.some(c => String(stripHtml(formatCell(r[c], c)) ?? '').toLowerCase().includes(search)));

  const thead = document.querySelector('#data-table thead');
  thead.innerHTML = '<tr>' + cols.map(c => `<th class="sortable">${c}</th>`).join('') + '<th>操作</th></tr>';
  const tbody = document.querySelector('#data-table tbody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    const tpl = document.getElementById('empty-state-template');
    if (tpl) tbody.appendChild(tpl.content.cloneNode(true));
    return;
  }

  for (const [_, row] of filtered.entries()) {
    const realIdx = rows.indexOf(row);
    const tr = document.createElement('tr');
    if (realIdx === state.editingIdx) tr.classList.add('selected');
    for (const c of cols) {
      const td = document.createElement('td');
      td.innerHTML = formatCell(row[c], c);
      tr.appendChild(td);
    }
    const tdA = document.createElement('td');
    tdA.className = 'actions';
    const btnEdit = document.createElement('button');
    btnEdit.className = 'small'; btnEdit.textContent = '编辑';
    btnEdit.addEventListener('click', () => openEditor(realIdx));
    const btnDup = document.createElement('button');
    btnDup.className = 'small'; btnDup.textContent = '复制';
    btnDup.addEventListener('click', () => { const c = JSON.parse(JSON.stringify(row)); c.id += '_copy'; rows.push(c); state.dirty[state.table] = true; openEditor(rows.length-1); renderTable(); });
    const btnDel = document.createElement('button');
    btnDel.className = 'small danger'; btnDel.textContent = '删';
    btnDel.addEventListener('click', async () => {
      if (!confirm(`删除 "${row.id}"?`)) return;
      // For players/matches, call DELETE API
      if (state.table === 'matches') {
        await fetch(`/api/matches/${row.id}`, { method: 'DELETE', headers: authHeaders() });
      }
      if (state.table === 'players') {
        await fetch(`/api/players/${row.id}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {});
        // Just remove from local state — server currently has no DELETE endpoint for players, so remove locally
      }
      rows.splice(realIdx, 1);
      state.dirty[state.table] = true;
      if (state.editingIdx === realIdx) closeEditor();
      else if (state.editingIdx > realIdx) state.editingIdx--;
      renderTable();
    });
    tdA.appendChild(btnEdit); tdA.appendChild(btnDup); tdA.appendChild(btnDel);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  }
}
async function renderMatchList() {
  const matches = state.data['matches'] || [];
  const search = document.getElementById('search').value.toLowerCase();
  const filtered = matches.filter(m => !search || m.id.toLowerCase().includes(search) || (m.players||[]).some(p => p.playerId.toLowerCase().includes(search)));

  const thead = document.querySelector('#data-table thead');
  thead.innerHTML = '<tr><th>ID</th><th>Mode</th><th>Players</th><th>Turns</th><th>Winner</th><th>Started</th><th>操作</th></tr>';
  const tbody = document.querySelector('#data-table tbody');
  tbody.innerHTML = '';

  for (const m of filtered) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.id}</td><td>${m.gameModeId||''}</td><td>${(m.players||[]).map(p => `${p.playerId}(${p.characterId}) ${p.result}`).join(' vs ')}</td><td>${m.totalTurns||0}</td><td>${m.winnerId||'?'}</td><td>${(m.startedAt||'').slice(0,16)}</td>`;
    const tdA = document.createElement('td');
    tdA.className = 'actions';
    const btnView = document.createElement('button');
    btnView.className = 'small'; btnView.textContent = '回放';
    btnView.addEventListener('click', () => openReplay(m.id));
    const btnDel = document.createElement('button');
    btnDel.className = 'small danger'; btnDel.textContent = '删';
    btnDel.addEventListener('click', async () => {
      if (!confirm(`删除对局 "${m.id}"?`)) return;
      await fetch(`/api/matches/${m.id}`, { method: 'DELETE', headers: authHeaders() });
      state.data['matches'] = state.data['matches'].filter(x => x.id !== m.id);
      renderMatchList();
    });
    tdA.appendChild(btnView); tdA.appendChild(btnDel);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  }
}

// ── Match replay viewer —────────────────——
async function openReplay(matchId) {
  try {
    const res = await fetch(`/api/matches/${matchId}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('Not found');
    const match = await res.json();
    document.getElementById('replay-title').textContent = `对局回放 — ${match.id}`;
    const content = document.getElementById('replay-content');
    content.innerHTML = buildReplayHTML(match);
    document.getElementById('replay-viewer').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
  } catch (err) { showStatus(`加载对局失败: ${err.message}`, 'error'); }
}

function closeReplay() {
  document.getElementById('replay-viewer').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
}

function buildReplayHTML(match) {
  const turns = match.turns || [];
  if (turns.length === 0) return '<p>无回合数据</p>';

  let html = `<div class="replay-summary">
    <span>模式: ${match.gameModeId}</span>
    <span>总回合: ${match.totalTurns}</span>
    <span>胜者: ${match.winnerId || '?'}</span>
    <span>时间: ${(match.startedAt||'').slice(0,16)} — ${(match.endedAt||'').slice(0,16)}</span>
  </div>`;

  html += '<div class="replay-timeline">';
  for (const turn of turns) {
    html += `<div class="turn-block">
      <div class="turn-header">Turn ${turn.turnNumber} — ${turn.playerId} (${turn.phase || ''})</div>`;

    // Actions
    for (const act of (turn.actions || [])) {
      const icon = act.type === 'playCard' ? svgIcon('card') : svgIcon('spark');
      html += `<div class="turn-action">
        <span class="action-icon">${icon}</span>
        <span class="action-desc"><b>${act.type}</b>: ${act.cardId || ''} → ${act.targetPlayerId || ''}</span>`;
      const r = act.results || {};
      if (Object.keys(r.hpDeltas || {}).length > 0) {
        for (const [pid, delta] of Object.entries(r.hpDeltas)) {
          const cls = delta < 0 ? 'hp-loss' : 'hp-gain';
          const iconHtml = delta < 0 ? svgIcon('skull') : svgIcon('heart');
          html += `<span class="${cls}">${iconHtml} ${pid}: ${delta > 0 ? '+' : ''}${delta} HP</span>`;
        }
      }
      if (r.blockGained) html += `<span class="block-gain">${svgIcon('shield')} +${r.blockGained} Block</span>`;
      if ((r.appliedBuffIds || []).length > 0) html += `<span>${svgIcon('buff')} Buff: ${r.appliedBuffIds.join(', ')}</span>`;
      html += '</div>';
    }

    // Buff triggers
    for (const bt of (turn.buffTriggers || [])) {
      html += `<div class="turn-buff-trigger">
        ${svgIcon('rotate')} ${bt.buffId}: ${bt.sourcePlayerId} → ${bt.targetPlayerId} (${bt.hpDelta || 0} HP)
      </div>`;
    }

    // End state
    if (turn.endState) {
      html += '<div class="turn-endstate">';
      for (const [pid, st] of Object.entries(turn.endState)) {
        const buffs = (st.buffs || []).join(', ');
        html += `<div class="endstate-player">
          <b>${pid}</b>: HP ${st.hp}/${st.maxHp || '?'} | Block ${st.block||0} | Mana ${st.mana||0}${buffs ? ' | Buffs: ' + buffs : ''}
        </div>`;
      }
      html += '</div>';
    }

    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── Editor ————————————————————————————————
function openEditor(idx) {
  state.editingIdx = idx;
  const row = getRows()[idx];
  const schema = SCHEMAS[state.table];
  document.getElementById('editor-title').textContent = `编辑 ${schema.label} — ${row.id || '新增'}`;
  const fieldsDiv = document.getElementById('editor-fields');
  fieldsDiv.innerHTML = '';

  for (const field of schema.fields) {
    const div = document.createElement('div');
    div.className = 'field';
    div.dataset.field = field.key;
    const label = document.createElement('label');
    label.textContent = field.label + (field.required ? ' *' : '');
    div.appendChild(label);
    const value = row[field.key];

    let inputEl = null;
    if (field.type === 'bool') {
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!value; cb.dataset.key = field.key;
      cb.addEventListener('change', () => { row[field.key] = cb.checked; markDirty(); });
      const sp = document.createElement('span'); sp.className = 'checkbox-label'; sp.textContent = value ? '是' : '否';
      cb.addEventListener('change', () => { sp.textContent = cb.checked ? '是' : '否'; });
      div.appendChild(cb); div.appendChild(sp);
      inputEl = cb;
    } else if (field.type === 'number') {
      const inp = document.createElement('input'); inp.type = 'number'; inp.value = value ?? 0; inp.dataset.key = field.key;
      inp.addEventListener('input', () => { row[field.key] = Number(inp.value); markDirty(); removeFieldError(div); });
      div.appendChild(inp);
      inputEl = inp;
    } else if (field.type === 'select') {
      const sel = document.createElement('select'); sel.dataset.key = field.key;
      for (const opt of field.options) { const o = document.createElement('option'); o.value = opt; o.textContent = opt; if (opt === value) o.selected = true; sel.appendChild(o); }
      sel.addEventListener('change', () => { row[field.key] = sel.value; markDirty(); removeFieldError(div); });
      div.appendChild(sel);
      inputEl = sel;
    } else if (field.type === 'string-array') {
      div.appendChild(buildStringArrayEditor(row, field.key));
    } else if (field.type === 'effects') {
      div.appendChild(buildEffectsEditor(row));
    } else if (field.type === 'kv-pairs') {
      div.appendChild(buildKvEditor(row, field.key));
    } else if (field.type === 'player-stats') {
      div.appendChild(buildKvEditor(row, field.key));
    } else if (field.type === 'player-collection') {
      div.appendChild(buildCollectionEditor(row));
    } else {
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = value ?? ''; inp.dataset.key = field.key;
      inp.addEventListener('input', () => { row[field.key] = inp.value; markDirty(); removeFieldError(div); });
      div.appendChild(inp);
      if (field.hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = field.hint; div.appendChild(h); }
      inputEl = inp;
    }
    fieldsDiv.appendChild(div);
  }

  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('editor-panel').classList.remove('hidden');
}

function removeFieldError(fieldDiv) {
  fieldDiv.classList.remove('field--error');
  const err = fieldDiv.querySelector('.field__error');
  if (err) err.remove();
}

function validateEditor() {
  const schema = SCHEMAS[state.table];
  const row = getRows()[state.editingIdx];
  let valid = true;
  for (const field of schema.fields) {
    if (!field.required) continue;
    const val = row[field.key];
    if (val === undefined || val === null || val === '') {
      const fieldDiv = document.querySelector(`#editor-fields .field[data-field="${field.key}"]`);
      if (fieldDiv) {
        fieldDiv.classList.add('field--error');
        if (!fieldDiv.querySelector('.field__error')) {
          const err = document.createElement('div');
          err.className = 'field__error';
          err.textContent = `${field.label} 为必填项`;
          fieldDiv.appendChild(err);
        }
      }
      valid = false;
    }
  }
  return valid;
}

function closeEditor() {
  state.editingIdx = -1;
  document.getElementById('editor-panel').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  renderTable();
}

function buildCollectionEditor(row) {
  const col = row.collection || (row.collection = { unlockedCharacters: [], unlockedCards: [] });
  const container = document.createElement('div');

  function render() {
    container.innerHTML = '';
    for (const [key, arr] of [['Characters', 'unlockedCharacters'], ['Cards', 'unlockedCards']]) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '8px';
      const lbl = document.createElement('label');
      lbl.textContent = `Unlocked ${key}`; lbl.style.fontSize = '0.7rem'; lbl.style.color = 'var(--fg-dim)'; lbl.style.display = 'block';
      sec.appendChild(lbl);
      const lst = document.createElement('div'); lst.className = 'sub-list';
      for (const [i, v] of (col[arr] || []).entries()) {
        const di = document.createElement('div'); di.className = 'sub-item';
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = v;
        inp.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:4px 8px;border-radius:var(--radius);font-size:0.8rem;';
        inp.addEventListener('input', () => { col[arr][i] = inp.value; markDirty(); });
        di.appendChild(inp);
        const btn = document.createElement('button'); btn.className = 'small danger'; btn.textContent = '✕';
        btn.addEventListener('click', () => { col[arr].splice(i, 1); markDirty(); render(); });
        di.appendChild(btn); lst.appendChild(di);
      }
      sec.appendChild(lst);
      const addB = document.createElement('button'); addB.className = 'small'; addB.textContent = `+ 添加${key}`; addB.style.marginTop = '4px';
      addB.addEventListener('click', () => { (col[arr] || (col[arr] = [])).push(''); markDirty(); render(); });
      sec.appendChild(addB);
      container.appendChild(sec);
    }
  }
  render();
  return container;
}

// ── Sub-editors (reused) —————————————————
function buildStringArrayEditor(row, key) {
  const arr = row[key] || (row[key] = []);
  const container = document.createElement('div');
  function render() {
    container.innerHTML = '';
    const list = document.createElement('div'); list.className = 'sub-list';
    for (const [i, item] of arr.entries()) {
      const div = document.createElement('div'); div.className = 'sub-item';
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = item;
      inp.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:4px 8px;border-radius:var(--radius);font-size:0.8rem;';
      inp.addEventListener('input', () => { arr[i] = inp.value; markDirty(); });
      div.appendChild(inp);
      const btn = document.createElement('button'); btn.className = 'small danger'; btn.textContent = '✕';
      btn.addEventListener('click', () => { arr.splice(i, 1); markDirty(); render(); });
      div.appendChild(btn); list.appendChild(div);
    }
    container.appendChild(list);
    const addRow = document.createElement('div'); addRow.className = 'sub-add';
    const addBtn = document.createElement('button'); addBtn.className = 'small'; addBtn.textContent = '+ 添加';
    addBtn.addEventListener('click', () => { arr.push(''); markDirty(); render(); });
    addRow.appendChild(addBtn); container.appendChild(addRow);
  }
  render(); return container;
}

function buildEffectsEditor(row) {
  const arr = row.effects || (row.effects = []);
  const container = document.createElement('div');
  const effectList = state.data['effects'] || [];
  function render() {
    container.innerHTML = '';
    const list = document.createElement('div'); list.className = 'sub-list';
    for (const [i, inv] of arr.entries()) {
      const div = document.createElement('div'); div.className = 'sub-item';
      div.style.cssText = 'flex-direction:column;align-items:stretch;gap:4px;padding:8px 10px;';
      const row1 = document.createElement('div'); row1.style.cssText = 'display:flex;gap:8px;align-items:center;';
      const sel = document.createElement('select'); sel.style.cssText = 'flex:1;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:4px 8px;border-radius:var(--radius);font-size:0.8rem;';
      for (const ef of effectList) { const o = document.createElement('option'); o.value = ef.id; o.textContent = `${ef.id} (${ef.executorType})`; if (ef.id === inv.effectId) o.selected = true; sel.appendChild(o); }
      sel.addEventListener('change', () => { inv.effectId = sel.value; markDirty(); });
      row1.appendChild(sel);
      const btnDel = document.createElement('button'); btnDel.className = 'small danger'; btnDel.textContent = '✕';
      btnDel.addEventListener('click', () => { arr.splice(i, 1); markDirty(); render(); });
      row1.appendChild(btnDel); div.appendChild(row1);
      const row2 = document.createElement('div'); row2.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;';
      for (const [lbl, k, t] of [['Value','value','number'],['Sec.Value','secondaryValue','number'],['Repeat','repeat','number'],['OverrideTarget','overrideTarget','text']]) {
        const wrap = document.createElement('div');
        const lblEl = document.createElement('label'); lblEl.textContent = lbl; lblEl.style.cssText = 'font-size:0.65rem;color:var(--fg-dim);display:block;';
        const inp = document.createElement('input'); inp.type = t; inp.value = inv[k] ?? (t === 'number' ? 0 : '');
        inp.style.cssText = 'width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:3px 6px;border-radius:var(--radius);font-size:0.75rem;';
        inp.addEventListener('input', () => { inv[k] = t === 'number' ? Number(inp.value) : inp.value; markDirty(); });
        wrap.appendChild(lblEl); wrap.appendChild(inp); row2.appendChild(wrap);
      }
      div.appendChild(row2);
      const row3 = document.createElement('div');
      const lblC = document.createElement('label'); lblC.textContent = 'Condition'; lblC.style.cssText = 'font-size:0.65rem;color:var(--fg-dim);display:block;';
      const inpC = document.createElement('input'); inpC.type = 'text'; inpC.value = inv.conditionExpression ?? ''; inpC.placeholder = 'e.g. owner.block > 0';
      inpC.style.cssText = 'width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:3px 6px;border-radius:var(--radius);font-size:0.75rem;';
      inpC.addEventListener('input', () => { inv.conditionExpression = inpC.value || null; markDirty(); });
      row3.appendChild(lblC); row3.appendChild(inpC); div.appendChild(row3);
      const params = inv.parameters || (inv.parameters = {});
      div.appendChild(buildInlineKvEditor(params));
      list.appendChild(div);
    }
    container.appendChild(list);
    const addRow = document.createElement('div'); addRow.className = 'sub-add';
    const addBtn = document.createElement('button'); addBtn.className = 'small'; addBtn.textContent = '+ 添加效果';
    addBtn.addEventListener('click', () => { arr.push({ effectId:'',value:0,secondaryValue:0,overrideTarget:'',repeat:1,conditionExpression:null,parameters:{} }); markDirty(); render(); });
    addRow.appendChild(addBtn); container.appendChild(addRow);
  }
  render(); return container;
}

function buildKvEditor(row, key) {
  const obj = row[key] || (row[key] = {});
  return buildInlineKvEditor(obj);
}

function buildInlineKvEditor(obj) {
  const wrap = document.createElement('div'); wrap.style.marginTop = '4px';
  function render() {
    wrap.innerHTML = '';
    const keys = Object.keys(obj);
    const list = document.createElement('div'); list.className = 'sub-list'; list.style.fontSize = '0.75rem';
    for (const key of keys) {
      const div = document.createElement('div'); div.className = 'sub-item'; div.style.padding = '3px 8px';
      const ki = document.createElement('input'); ki.type = 'text'; ki.value = key;
      ki.style.cssText = 'width:40%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:2px 6px;border-radius:var(--radius);font-size:0.72rem;';
      ki.addEventListener('change', () => { const nk = ki.value; if (nk && nk !== key) { obj[nk] = obj[key]; delete obj[key]; } markDirty(); render(); });
      div.appendChild(ki);
      const vi = document.createElement('input'); vi.type = 'text'; vi.value = obj[key];
      vi.style.cssText = 'width:50%;margin-left:4px;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:2px 6px;border-radius:var(--radius);font-size:0.72rem;';
      vi.addEventListener('input', () => { obj[key] = vi.value; markDirty(); });
      div.appendChild(vi);
      const bd = document.createElement('button'); bd.className = 'small danger'; bd.textContent = '✕'; bd.style.cssText = 'padding:1px 6px;font-size:0.7rem;';
      bd.addEventListener('click', () => { delete obj[key]; markDirty(); render(); });
      div.appendChild(bd); list.appendChild(div);
    }
    wrap.appendChild(list);
    const ar = document.createElement('div'); ar.className = 'sub-add';
    const ab = document.createElement('button'); ab.className = 'small'; ab.textContent = '+ 添加参数'; ab.style.fontSize = '0.7rem';
    ab.addEventListener('click', () => { obj['newKey'] = ''; markDirty(); render(); });
    ar.appendChild(ab); wrap.appendChild(ar);
  }
  render(); return wrap;
}

function markDirty() { state.dirty[state.table] = true; }

// ── Actions ———————————————————————————————
function onAdd() {
  const rows = getRows();
  const schema = SCHEMAS[state.table];
  const row = {};
  for (const f of schema.fields) {
    if (f.type === 'bool') row[f.key] = false;
    else if (f.type === 'number') row[f.key] = 0;
    else if (f.type === 'string-array' || f.type === 'effects') row[f.key] = [];
    else if (f.type === 'kv-pairs' || f.type === 'player-stats' || f.type === 'player-collection') row[f.key] = {};
    else row[f.key] = '';
  }
  rows.push(row);
  state.dirty[state.table] = true;
  openEditor(rows.length - 1);
  renderTable();
}

async function onSaveItem() {
  if (!validateEditor()) {
    showStatus('请检查必填项', 'warn');
    return;
  }
  const row = getRows()[state.editingIdx];
  const table = state.table;

  // For players: use PUT /api/players/{id}
  if (table === 'players') {
    try {
      const res = await fetch(`/api/players/${row.id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(row),
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); showStatus(`保存失败: ${d.detail||res.statusText}`, 'error'); return; }
      state.dirty[table] = false;
      showStatus('已保存', 'success');
      const refresh = await fetch('/api/players', { headers: { 'Authorization': `Bearer ${getToken()}` } });
      state.data[table] = await refresh.json();
    } catch (err) { showStatus(`保存失败: ${err.message}`, 'error'); }
  }

  markDirty();
  closeEditor();
}

async function onSaveAll() {
  const table = state.table;
  const rows = state.data[table];
  if (!rows || table === 'matches' || table === 'players') return; // matches use POST to create, players use per-item save

  try {
    const res = await fetch(`/api/${table}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(rows),
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); showStatus(`保存失败: ${res.status} ${d.detail||res.statusText}`, 'error'); return; }
    state.dirty[table] = false;
    showStatus(`已保存 ${rows.length} 条记录`, 'success');
    const refresh = await fetch(`/api/${table}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    state.data[table] = await refresh.json();
    renderTable();
  } catch (err) { showStatus(`保存失败: ${err.message}`, 'error'); }
}

function onExport() { window.open('/api/export', '_blank'); }

async function onValidate() {
  try {
    const res = await fetch('/api/validate/refs', { headers: { 'Authorization': `Bearer ${getToken()}` } });
    const r = await res.json();
    showStatus(r.valid ? '引用完整性校验通过' : `引用错误 (${r.errors.length}): ${r.errors.join('; ')}`, r.valid ? 'success' : 'error');
  } catch (err) { showStatus(`校验失败: ${err.message}`, 'error'); }
}

// ── Helpers ———————————————————————————————
function setupTabs() {
  document.querySelectorAll('#tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      closeEditor(); closeReplay();
      loadTable(btn.dataset.table);
    });
  });
}

function showStatus(msg, cls) {
  const container = document.getElementById('toast-container');
  if (!container) {
    const el = document.getElementById('status');
    el.textContent = msg; el.className = cls || '';
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 5000);
    return;
  }

  const icons = { success: '✓', error: '✕', warn: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${cls || 'info'}`;
  toast.innerHTML = `
    <span class="toast__icon">${icons[cls] || '•'}</span>
    <span class="toast__message">${escapeHtml(msg)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

function setTableLoading(loading) {
  const wrap = document.getElementById('table-wrap');
  if (loading) wrap.classList.add('skeleton');
  else wrap.classList.remove('skeleton');
}

// Data tables that support PUT (the original 6)
const TABLES = { cards:1, effects:1, buffs:1, characters:1, 'game-modes':1, keywords:1 };

// SVG icon helper for replay viewer
function svgIcon(name) {
  const icons = {
    card: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 9h4M7 13h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    spark: '<svg class="icon" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/></svg>',
    sword: '<svg class="icon" viewBox="0 0 24 24"><path d="M14.5 17.5L3 6V3h3l11.5 11.5L14.5 17.5zM21 3l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    shield: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    heart: '<svg class="icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"/></svg>',
    skull: '<svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0 0v-4m-3 0h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    buff: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    rotate: '<svg class="icon" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  return icons[name] || '';
}

function badgeClass(value, kind) {
  if (!value) return '';
  const v = String(value).toLowerCase();
  if (kind === 'type') return `badge badge--${v}`;
  if (kind === 'rarity') return `badge badge--${v}`;
  if (kind === 'element') return value === 'None' ? '' : `badge badge--${v}`;
  if (kind === 'role') return `badge badge--${v}`;
  return '';
}

function renderBadge(value, kind) {
  const cls = badgeClass(value, kind);
  return cls ? `<span class="${cls}">${escapeHtml(String(value))}</span>` : escapeHtml(String(value));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
