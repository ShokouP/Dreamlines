/* CardForge SDD — Player Portal (梦核) */

let currentUser = null;

const REGION_NAMES = ['门口', '玄关', '客厅', '厨房', '卧室', '地下室', '自己的房间'];
const MODE_LABELS = { 'roguelike_run': '走回家', 'standard_1v1': '对镜', 'pvp': '对镜' };

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await checkAuth();
  if (!currentUser) { window.location.href = '/login.html'; return; }
  if (currentUser.role === 'admin') { window.location.href = '/admin.html'; return; }

  renderProfile();
  renderEntry();
  renderKeepsakes();
  renderFurthest();
  loadHistory();

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('dream-close').addEventListener('click', () => {
    document.getElementById('dream-modal').classList.add('hidden');
  });
  document.getElementById('dream-modal').addEventListener('click', e => {
    if (e.target.id === 'dream-modal') e.target.classList.add('hidden');
  });
});

function renderProfile() {
  document.getElementById('user-display').textContent =
    `${currentUser.displayName || currentUser.username}`;
  document.getElementById('profile-name').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('profile-id').textContent = '@' + currentUser.username;
}

function renderEntry() {
  const block = document.getElementById('entry-block');
  const run = loadRun();
  let mainHref = 'roguelike.html';
  let mainText = '入梦';
  let subText = '走进童年的旧房子';
  if (run && run.map) {
    const completed = (run.completedNodeIds || []).length;
    if (completed > 0) {
      mainText = '继续走';
      const cur = run.map.nodes.find(n => n.id === run.currentNodeId);
      const room = cur ? (cur.type === 'boss' ? '自己的房间' : (REGION_NAMES[cur.region] || '屋里')) : '屋里';
      subText = `从「${room}」继续`;
    }
  }
  block.innerHTML = `
    <a class="entry-main" href="${mainHref}"><span class="arrow">→</span>${mainText}<span class="sub">${subText}</span></a>
    <div class="entry-secondary">
      <a href="battle.html">对镜 · 标准对战</a>
      <a href="roguelike.html" id="link-restart">重新入梦</a>
    </div>
  `;
  document.getElementById('link-restart')?.addEventListener('click', e => {
    e.preventDefault();
    localStorage.removeItem('cf_roguelike_run');
    window.location.href = 'roguelike.html';
  });
}

function loadRun() {
  try { return JSON.parse(localStorage.getItem('cf_roguelike_run') || 'null'); } catch { return null; }
}

function renderKeepsakes() {
  const el = document.getElementById('keepsakes');
  let memory = [];
  try { memory = JSON.parse(localStorage.getItem('cf_dream_keepsakes') || '[]'); } catch {}
  if (!memory.length) {
    el.innerHTML = '<div class="keepsake-empty">还没有什么留下来。</div>';
    return;
  }
  el.innerHTML = memory.map(k => `<span class="keepsake">${k.name}</span>`).join('');
}

function renderFurthest() {
  const el = document.getElementById('furthest');
  const furthest = parseInt(localStorage.getItem('cf_dream_furthest') || '0');
  if (furthest <= 0) { el.textContent = ''; return; }
  const label = furthest >= 6 ? '家（梦醒）' : (REGION_NAMES[furthest] || `第 ${furthest} 段`);
  el.innerHTML = `最远走到 <b>${label}</b>`;
}

async function loadHistory() {
  try {
    const res = await fetch('/api/matches', { headers: { 'Authorization': `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('加载失败');
    const matches = await res.json();
    renderStats(matches);
    renderHistory(matches);
  } catch (err) {
    document.getElementById('match-history').innerHTML = `<div class="empty-state">梦的记录暂时想不起来了。</div>`;
  }
}

function renderStats(matches) {
  const total = matches.length;
  const wins = matches.filter(m => m.winnerId === currentUser.id).length;
  const losses = total - wins;
  const winRate = total ? ((wins / total) * 100).toFixed(0) : 0;
  document.getElementById('stat-matches').textContent = total;
  document.getElementById('stat-wins').textContent = wins;
  document.getElementById('stat-losses').textContent = losses;
  document.getElementById('stat-winrate').textContent = winRate + '%';
}

function renderHistory(matches) {
  const container = document.getElementById('match-history');
  if (!matches.length) return;
  const sorted = [...matches].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  let html = '<div class="history-list">';
  for (const m of sorted) {
    const isWin = m.winnerId === currentUser.id;
    const resultText = isWin ? '想起来了' : '没醒过来';
    const mode = MODE_LABELS[m.gameModeId] || '梦';
    const opponent = (m.players || []).find(p => p.playerId !== currentUser.id);
    const opponentText = opponent && opponent.playerId !== 'ai' ? opponent.playerId : '屋子';
    const date = m.startedAt ? m.startedAt.slice(5, 16).replace('T', ' ') : '-';
    html += `
      <div class="match-item ${isWin ? 'win' : 'loss'}" data-id="${m.id}" data-mode="${mode}">
        <span class="match-result">${resultText}</span>
        <span class="match-mode">${mode}</span>
        <span class="match-detail">${escapeHtml(opponentText)} · ${m.totalTurns || 0} 步 · ${date}</span>
      </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
  container.querySelectorAll('.match-item').forEach(el => {
    el.addEventListener('click', () => openDream(el.dataset.id));
  });
}

async function openDream(matchId) {
  if (!matchId) return;
  const modal = document.getElementById('dream-modal');
  document.getElementById('dream-title').textContent = '梦中';
  document.getElementById('dream-meta').textContent = '翻开中…';
  document.getElementById('dream-text').textContent = '';
  modal.classList.remove('hidden');
  try {
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
    const m = await res.json();
    const isWin = m.winnerId === currentUser.id;
    const mode = MODE_LABELS[m.gameModeId] || '梦';
    const date = m.startedAt ? m.startedAt.slice(0, 16).replace('T', ' ') : '-';
    document.getElementById('dream-title').textContent = isWin ? '想起来了' : '没醒过来';
    document.getElementById('dream-meta').textContent = `${mode} · ${m.totalTurns || 0} 步 · ${date}`;
    const narrative = (m.narrative || '').trim();
    const paras = narrative ? narrative.split(/(?<=[。！？])/).filter(s => s.trim()) : [];
    document.getElementById('dream-text').innerHTML = paras.length
      ? paras.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('')
      : '<p style="color:var(--fg-muted);font-style:italic">这一段梦没有留下文字。</p>';
  } catch (e) {
    document.getElementById('dream-text').innerHTML = '<p style="color:var(--fg-muted);font-style:italic">想不起来了。</p>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
