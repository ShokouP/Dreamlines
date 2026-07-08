/* CardForge Battle — MVP Game Engine */

const API = '/api';

// ── Data loading ──────────────────────────
async function loadData() {
  const res = await Promise.all([
    fetch(`${API}/cards`).then(r => r.json()),
    fetch(`${API}/characters`).then(r => r.json()),
    fetch(`${API}/effects`).then(r => r.json()),
    fetch(`${API}/buffs`).then(r => r.json()),
  ]);
  // Ensure arrays (API may return error objects)
  const cards = Array.isArray(res[0]) ? res[0] : [];
  const characters = Array.isArray(res[1]) ? res[1] : [];
  const effects = Array.isArray(res[2]) ? res[2] : [];
  const buffs = Array.isArray(res[3]) ? res[3] : [];
  return { cards, characters, effects, buffs };
}

const ICONS = {
  sword: '<svg class="icon" aria-hidden="true"><use href="#icon-sword"></use></svg>',
  orb: '<svg class="icon" aria-hidden="true"><use href="#icon-orb"></use></svg>',
  shield: '<svg class="icon" aria-hidden="true"><use href="#icon-shield"></use></svg>',
  bolt: '<svg class="icon" aria-hidden="true"><use href="#icon-bolt"></use></svg>',
  heart: '<svg class="icon" aria-hidden="true"><use href="#icon-heart"></use></svg>',
  skull: '<svg class="icon" aria-hidden="true"><use href="#icon-skull"></use></svg>',
  buff: '<svg class="icon" aria-hidden="true"><use href="#icon-buff"></use></svg>',
  debuff: '<svg class="icon" aria-hidden="true"><use href="#icon-debuff"></use></svg>',
  cardArt: '<svg class="icon" aria-hidden="true"><use href="#icon-card-art"></use></svg>',
};

function cardArtFor(type) {
  const t = String(type || '').toLowerCase();
  const stroke = 'stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"';
  switch (t) {
    case 'attack':
      return '<svg class="geo-art" viewBox="0 0 40 40" aria-hidden="true"><polygon points="6,6 34,20 6,34" fill="currentColor"/></svg>';
    case 'skill':
      return '<svg class="geo-art" viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="8" width="24" height="24" fill="currentColor"/></svg>';
    case 'power':
      return '<svg class="geo-art" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13" fill="currentColor"/><circle cx="20" cy="20" r="5" fill="var(--bg2)"/></svg>';
    case 'status':
      return '<svg class="geo-art" viewBox="0 0 40 40" aria-hidden="true"><line x1="20" y1="6" x2="20" y2="34" stroke="currentColor" stroke-width="4"/><line x1="6" y1="20" x2="34" y2="20" stroke="currentColor" stroke-width="4"/></svg>';
    case 'curse':
      return '<svg class="geo-art" viewBox="0 0 40 40" aria-hidden="true"><polygon points="20,6 34,20 20,34 6,20" fill="currentColor"/></svg>';
    default:
      return '<svg class="geo-art" viewBox="0 0 40 40" aria-hidden="true"><rect x="10" y="10" width="20" height="20" fill="currentColor"/></svg>';
  }
}

function lookup(list, id) { return (list || []).find(item => item.id === id); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cardTypeClass(type) {
  const t = String(type || '').toLowerCase();
  return `card--${t}`;
}

function spawnFloatingText(targetEl, value, type) {
  const rect = targetEl.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = `float-text float-text--${type}`;
  el.textContent = (value > 0 ? '+' : '') + value;
  el.style.left = `${rect.left + rect.width / 2 - 20 + (Math.random() * 20 - 10)}px`;
  el.style.top = `${rect.top}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

let lastPlayerHp = 0, lastEnemyHp = 0;
let lastPlayerBlock = 0, lastEnemyBlock = 0;

// ── Shuffle ───────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Game State ────────────────────────────
class GameState {
  constructor() {
    this.db = null;
    this.turn = 1;
    this.phase = 'player'; // 'player' | 'ai' | 'turnEnd'
    this.over = false;
    this.log = [];
    this.player = null;
    this.enemy = null;
    this.onChange = null; // callback for UI re-render
  }

  async init(playerCharId, aiCharId) {
    this.db = await loadData();
    this.player = this._createHero('player', playerCharId);
    this.enemy = this._createHero('enemy', aiCharId);
    this._startTurn();
  }

  _createHero(side, charId) {
    const ch = lookup(this.db.characters, charId);
    if (!ch) throw new Error(`Unknown character: ${charId}`);
    const deck = shuffle(
      ch.startingDeck.map(cid => lookup(this.db.cards, cid)).filter(Boolean)
    );
    return {
      side,
      characterId: ch.id,
      name: ch.nameKey || ch.id,
      maxHp: ch.maxHp || 80,
      hp: ch.maxHp || 80,
      block: 0,
      maxMana: ch.maxMana || 3,
      mana: ch.startingMana ?? (ch.maxMana || 3),
      manaGrowth: ch.manaGrowthPerTurn || 0,
      handSize: ch.handSize || 5,
      maxHandSize: ch.maxHandSize || 10,
      deck,
      hand: [],
      discard: [],
      buffs: [], // { id, stacks, duration, source }
    };
  }

  _startTurn() {
    const hero = this.phase === 'player' ? this.player : this.enemy;
    hero.block = 0; // block resets at turn start
    hero.mana = hero.maxMana + hero.manaGrowth;
    // Tick buffs: onTurnStart
    this._triggerBuffs('onTurnStart', hero);
    // Metallicize: gain block at turn start
    const metallicize = hero.buffs.find(b => b.id === 'metallicize');
    if (metallicize) {
      const def = lookup(this.db.buffs, 'metallicize');
      const amt = parseInt(def?.params?.blockAmount) || 2;
      this._gainBlock(hero, amt * metallicize.stacks);
    }
    // Draw to hand
    this._drawCards(hero, hero.handSize);
    this._log(`${hero.name} 的回合 — 抽牌`, 'turn');
  }

  _drawCards(hero, n) {
    for (let i = 0; i < n; i++) {
      if (hero.deck.length === 0) {
        if (hero.discard.length === 0) break;
        hero.deck = shuffle(hero.discard);
        hero.discard = [];
        this._log(`${hero.name} 重新洗牌`);
      }
      if (hero.hand.length >= hero.maxHandSize) break;
      const card = hero.deck.pop();
      hero.hand.push(card);
    }
  }

  // ── Play card ───────────────────────────
  playCard(handIndex) {
    if (this.over) return;
    const hero = this.phase === 'player' ? this.player : this.enemy;
    if (handIndex < 0 || handIndex >= hero.hand.length) return;
    const card = hero.hand[handIndex];
    const cost = card.cost || 0;
    if (hero.mana < cost) return;
    hero.mana -= cost;
    hero.hand.splice(handIndex, 1);
    const target = this.phase === 'player' ? this.enemy : this.player;
    const self = hero;
    this._log(`${hero.name} 打出 [${card.id}] (费用 ${cost})`);
    for (const inv of (card.effects || [])) {
      this._executeEffect(inv, hero, self, target);
    }
    hero.discard.push(card);
    this._checkWin();
  }

  _executeEffect(inv, source, self, target) {
    const eff = lookup(this.db.effects, inv.effectId);
    if (!eff) { this._log(`  未知效果: ${inv.effectId}`); return; }
    const v = inv.value || 1;
    switch (eff.executorType) {
      case 'DealDamageExecutor': this._dealDamage(inv, source, target); break;
      case 'HealExecutor': this._heal(self, v); break;
      case 'GainBlockExecutor': this._gainBlock(self, v); break;
      case 'DrawCardsExecutor': this._drawCards(self, v); break;
      case 'GainManaExecutor': self.mana += v; break;
      case 'ApplyBuffExecutor': this._applyBuff(inv, source, target); break;
      default: this._log(`  未实现: ${eff.executorType}`);
    }
  }

  _resolveValue(inv, source) {
    if (inv.parameters?.dynamicValue === 'owner.block') return source.block;
    return inv.value || 0;
  }

  // ── Damage ──────────────────────────────
  _dealDamage(inv, source, target) {
    let damage = this._resolveValue(inv, source);
    // Strength buff on source
    const strength = source.buffs.filter(b => b.id === 'strength');
    const strBonus = strength.reduce((s, b) => s + b.stacks, 0);
    damage += strBonus;
    // Vulnerable on target
    const vuln = target.buffs.filter(b => b.id === 'vulnerable');
    if (vuln.length > 0) {
      damage = Math.floor(damage * 1.5);
      this._log(`  易伤加成 → ${damage} 伤害`);
    }
    // Block first
    const blocked = Math.min(target.block, damage);
    const remaining = damage - blocked;
    target.block -= blocked;
    target.hp -= remaining;
    if (blocked > 0) this._log(`  护甲抵挡 ${blocked} 点`);
    if (remaining > 0) {
      this._log(`  ${target.name} 受到 ${remaining} 点伤害 (HP: ${target.hp})`);
      const el = target.side === 'player'
        ? document.querySelector('.player-hero .hero-portrait')
        : document.querySelector('.enemy .hero-portrait');
      if (el) spawnFloatingText(el, -remaining, 'damage');
    }
    // Trigger on-damage buffs on target
    this._triggerBuffs('onDamageReceived', target, { damage: remaining, source });
    // Thorns reflect damage when hit
    const thorns = target.buffs.find(b => b.id === 'thorns');
    if (thorns && remaining > 0) {
      const def = lookup(this.db.buffs, 'thorns');
      const reflect = (parseInt(def?.params?.damageAmount) || 2) * thorns.stacks;
      source.hp -= reflect;
      this._log(`  🌵 ${target.name} 的荆棘反弹 ${reflect} 点伤害`);
      const el = source.side === 'player'
        ? document.querySelector('.player-hero .hero-portrait')
        : document.querySelector('.enemy .hero-portrait');
      if (el) spawnFloatingText(el, -reflect, 'damage');
    }
    // Trigger on-damage-dealt buffs on source
    this._triggerBuffs('onDamageDealt', source, { damage, target });
    // Tick vulnerable (reduces by 1)
    if (vuln.length > 0) this._tickBuff(vuln[0]);
  }

  // ── Heal ────────────────────────────────
  _heal(target, amount) {
    const healed = Math.min(amount, target.maxHp - target.hp);
    target.hp += healed;
    this._log(`  ${target.name} 回复 ${healed} 点生命 (HP: ${target.hp})`);
    const el = target.side === 'player'
      ? document.querySelector('.player-hero .hero-portrait')
      : document.querySelector('.enemy .hero-portrait');
    if (el && healed > 0) spawnFloatingText(el, healed, 'heal');
  }

  // ── Block ───────────────────────────────
  _gainBlock(target, amount) {
    target.block += amount;
    this._log(`  ${target.name} 获得 ${amount} 点护甲`);
    const el = target.side === 'player'
      ? document.querySelector('.player-hero .hero-portrait')
      : document.querySelector('.enemy .hero-portrait');
    if (el) spawnFloatingText(el, amount, 'block');
  }

  // ── Buff system ─────────────────────────
  _applyBuff(inv, source, target) {
    const buffDef = lookup(this.db.buffs, inv.parameters?.buffId_ref || '');
    if (!buffDef) { this._log(`  未知 Buff: ${inv.parameters?.buffId_ref}`); return; }
    const stacks = inv.value || 1;
    const duration = parseInt(inv.parameters?.duration) || 1;
    const existing = target.buffs.find(b => b.id === buffDef.id);
    if (existing) {
      if (buffDef.stackPolicy === 'Additive') {
        existing.stacks += stacks;
        existing.duration = Math.max(existing.duration, duration);
      } else if (buffDef.stackPolicy === 'Refresh') {
        existing.duration = duration;
      }
    } else {
      target.buffs.push({ id: buffDef.id, stacks, duration, source: source.side });
    }
    this._log(`  ✦ ${target.name} 获得 ${buffDef.nameKey || buffDef.id} x${stacks} (${duration}回合)`);
  }

  _triggerBuffs(hook, hero, ctx) {
    for (const b of hero.buffs) {
      const def = lookup(this.db.buffs, b.id);
      if (!def) continue;
      const handler = def.handlerType;
      if (hook === 'onTurnStart') {
        if (handler === 'PoisonBuffHandler') {
          const dmg = b.stacks;
          hero.hp -= dmg;
          this._log(`  🔥 ${def.nameKey || b.id} 触发 — ${hero.name} 受到 ${dmg} 点伤害`);
          b.stacks = Math.max(0, b.stacks - 1);
          if (b.stacks <= 0) this._removeBuff(hero, b);
        } else if (handler === 'BurningBuffHandler') {
          const dmg = b.stacks;
          hero.hp -= dmg;
          this._log(`  🔥 ${def.nameKey || b.id} 触发 — ${hero.name} 受到 ${dmg} 点伤害`);
          b.stacks = Math.floor(b.stacks / 2);
          if (b.stacks <= 0) this._removeBuff(hero, b);
        }
        b.duration--;
        if (b.duration <= 0) {
          this._log(`  ⌛ ${hero.name} 的 ${def.nameKey || b.id} 已过期`);
          this._removeBuff(hero, b);
        }
      }
    }
    // Clean up expired
    hero.buffs = hero.buffs.filter(b => b.duration > 0 && b.stacks > 0);
  }

  _tickBuff(buff) {
    buff.duration = Math.max(0, buff.duration - 1);
  }

  _removeBuff(hero, buff) {
    const idx = hero.buffs.indexOf(buff);
    if (idx >= 0) hero.buffs.splice(idx, 1);
  }

  // ── AI ──────────────────────────────────
  autoPlay() {
    if (this.phase !== 'ai' || this.over) return;
    const ai = this.enemy;
    // Sort hand: attack cards first by cost desc, then others
    const sorted = ai.hand.map((c, i) => ({ card: c, idx: i }))
      .sort((a, b) => {
        const aAtk = this._isAttack(a.card) ? 1 : 0;
        const bAtk = this._isAttack(b.card) ? 1 : 0;
        if (aAtk !== bAtk) return bAtk - aAtk;
        return (b.card.cost || 0) - (a.card.cost || 0);
      });
    for (const { card, idx } of sorted) {
      if (ai.mana < (card.cost || 0)) continue;
      if (ai.hand.length === 0) break;
      const realIdx = ai.hand.indexOf(card);
      if (realIdx < 0) continue;
      this.playCard(realIdx);
      if (this.over) return;
    }
    this._endTurn();
  }

  _isAttack(card) { return (card.effects || []).some(e => e.effectId === 'deal_damage'); }

  // ── End turn ─────────────────────────────
  endTurn() {
    if (this.phase !== 'player' || this.over) return;
    this._endTurn();
  }

  _endTurn() {
    // Discard remaining hand
    const hero = this.phase === 'player' ? this.player : this.enemy;
    while (hero.hand.length > 0) {
      hero.discard.push(hero.hand.pop());
    }
    hero.block = 0;
    this._log(`${hero.name} 结束回合`);
    if (this._checkWin()) return;
    // Switch turns
    if (this.phase === 'player') {
      this.phase = 'ai';
      this._startTurn();
      // Delay AI play so user can see the state
      setTimeout(() => this.autoPlay(), 800);
    } else {
      this.phase = 'player';
      this.turn++;
      this._startTurn();
    }
  }

  _checkWin() {
    if (this.player.hp <= 0) { this._gameOver('defeat'); return true; }
    if (this.enemy.hp <= 0) { this._gameOver('victory'); return true; }
    return false;
  }

  _gameOver(result) {
    this.over = true;
    saveRoguelikeRunFromBattle();
    const el = document.getElementById('result-overlay');
    const txt = document.getElementById('result-text');
    const det = document.getElementById('result-detail');
    if (result === 'victory') {
      txt.textContent = '想起来了';
      det.textContent = `${this.enemy.name} 散成了记忆。`;
    } else {
      txt.textContent = '没醒过来';
      det.textContent = `${this.enemy.name} 把你留在了梦里。`;
    }
    el.classList.remove('hidden');
    if (window.saveMatchResult) window.saveMatchResult(result);
    if (window.finishBattle) window.finishBattle(result);
  }

  _log(msg, type = '') {
    this.log.push({ msg, type });
    if (this.log.length > 40) this.log.shift();
    narrator.feed(msg);
    if (this.onChange) this.onChange();
  }
}

// ── UI ────────────────────────────────────
let game = null;
let currentUser = null;
let roguelikeCtx = null; // { seed, nodeId, charId, returnTo }

// Dreamcore novel narrator — rewrites the 1v1 battle log in real time via DeepSeek.
const narrator = {
  queue: [],
  log: [],
  last: '',
  inflight: false,
  timer: null,
  pending: false,
  feed(msg) {
    if (roguelikeCtx) return;          // 1v1 mode only
    if (!msg) return;
    this.queue.push(msg);
    this.pending = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1300);
  },
  async flush() {
    if (this.inflight || !this.queue.length) { this.pending = this.queue.length > 0; return; }
    const events = this.queue.splice(0, 8);
    this.inflight = true;
    try {
      const res = await fetch('/api/dream-narrate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, context: this.last }),
      });
      const data = await res.json();
      const text = (data.text || '').trim();
      if (text) {
        this.log.push(text);
        if (this.log.length > 40) this.log.shift();
        this.last = text;
      }
    } catch (e) { /* swallow — keep mechanical log as fallback */ }
    this.inflight = false;
    this.pending = this.queue.length > 0;
    render();
    if (this.queue.length) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 500); }
  },
  reset(seedLine) {
    this.queue = []; this.log = []; this.last = ''; this.pending = false; this.inflight = false;
    clearTimeout(this.timer);
    if (seedLine) this.log.push(seedLine);
  },
};

function loadRoguelikeRun(seed, nodeId) {
  const key = 'cf_roguelike_run';
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const run = JSON.parse(raw);
    if (run.seed !== seed) return null;
    const node = run.map.nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'start') return null;
    return { run, node };
  } catch { return null; }
}

async function saveMatchResult(result) {
  if (!currentUser) return;
  try {
    const isWin = result === 'victory';
    const playerChar = game.player.characterId;
    const enemyChar = game.enemy.characterId;
    const mode = roguelikeCtx ? 'roguelike_run' : 'pvp';
    const narrative = roguelikeCtx ? '' : narrator.log.join(' ').trim();
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        gameModeId: mode,
        narrative,
        players: [
          { playerId: currentUser.id, characterId: playerChar, result: isWin ? 'win' : 'loss' },
          { playerId: 'ai', characterId: enemyChar, result: isWin ? 'loss' : 'win' },
        ],
        totalTurns: game.turn,
        winnerId: isWin ? currentUser.id : 'ai',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        turns: [],
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || '保存失败');
  } catch (err) {
    console.error('保存战绩失败', err);
  }
}

function finishBattle(result) {
  if (!roguelikeCtx) return;
  const { run, node } = roguelikeCtx;
  // Update run state from battle outcome
  run.hp = Math.max(0, game.player.hp);
  if (result === 'victory') {
    if (!run.completedNodeIds.includes(node.id)) run.completedNodeIds.push(node.id);
    run.currentNodeId = node.id;
  }
  localStorage.setItem('cf_roguelike_run', JSON.stringify(run));
  const returnTo = roguelikeCtx.returnTo || 'roguelike.html';
  window.location.href = `${returnTo}?outcome=${result === 'victory' ? 'win' : 'loss'}&nodeId=${node.id}&seed=${run.seed}`;
}

window.saveMatchResult = saveMatchResult;

async function saveRoguelikeRunFromBattle() {
  if (!roguelikeCtx) return;
  roguelikeCtx.run.hp = Math.max(0, game.player.hp);
  localStorage.setItem('cf_roguelike_run', JSON.stringify(roguelikeCtx.run));
}

function overrideGameForRoguelike(game) {
  const { run, node } = roguelikeCtx;
  // Override player HP and deck from run state
  game.player.hp = Math.min(run.maxHp, Math.max(1, run.hp));
  game.player.maxHp = run.maxHp;
  game.player.name = run.charId;
  const deckCards = run.deck.map(cid => lookup(game.db.cards, cid)).filter(Boolean);
  if (deckCards.length) {
    game.player.deck = shuffle(deckCards);
    game.player.discard = [];
    game.player.hand = [];
    game._drawCards(game.player, game.player.handSize);
  }

  // Configure enemy from encounter
  const enc = node.encounter;
  if (enc) {
    game.enemy.name = enc.name;
    game.enemy.maxHp = enc.hp;
    game.enemy.hp = enc.hp;
    game.enemy.characterId = enc.name;
  }

  // Progressive dreamcore difficulty: per-region modifier + run nightmare scaling.
  if (window.modifierFor) {
    const mod = window.modifierFor(node.region, node.type);
    const nightmare = run.nightmare || 0;
    const hpScale = mod.hp * (1 + nightmare * 0.02);
    game.enemy.maxHp = Math.round(game.enemy.maxHp * hpScale);
    game.enemy.hp = game.enemy.maxHp;
    if (mod.str > 0) game.enemy.buffs.push({ id: 'strength', stacks: mod.str, duration: 99, source: 'enemy' });
    if (mod.draw > 0) game.enemy.handSize = (game.enemy.handSize || 5) + mod.draw;
    if (mod.mana > 0) game.enemy.maxMana = (game.enemy.maxMana || 3) + mod.mana;
    if (mod.playerDebuff) game.player.buffs.push({ id: mod.playerDebuff, stacks: 1, duration: 2, source: 'enemy' });
    roguelikeCtx.modifierName = mod.name;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await checkAuth();
  if (!currentUser) { window.location.href = '/login.html'; return; }

  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  const seedParam = params.get('seed');
  const nodeIdParam = params.get('nodeId') ? parseInt(params.get('nodeId')) : null;
  const charIdParam = params.get('charId');
  const returnParam = params.get('return') || 'roguelike.html';

  const isRoguelike = modeParam === 'roguelike';
  let runInfo = null;
  if (isRoguelike && seedParam && nodeIdParam != null) {
    runInfo = loadRoguelikeRun(seedParam, nodeIdParam);
    if (runInfo) {
      roguelikeCtx = {
        seed: seedParam,
        nodeId: nodeIdParam,
        charId: charIdParam || runInfo.run.charId,
        returnTo: returnParam,
        run: runInfo.run,
        node: runInfo.node,
      };
    }
  }

  const backLink = document.getElementById('back-link');
  if (roguelikeCtx) {
    backLink.href = roguelikeCtx.returnTo;
    backLink.textContent = '返回地图';
  } else if (currentUser.role === 'admin') {
    backLink.href = '/admin.html';
    backLink.textContent = '返回管理';
  } else {
    backLink.href = '/play.html';
    backLink.textContent = '返回个人中心';
  }

  if (roguelikeCtx) {
    // Skip character selection, start directly into battle
    document.getElementById('select-screen').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    document.getElementById('battle-screen').classList.toggle('mode-novel', false);
    game = new GameState();
    game.onChange = render;
    narrator.reset(roguelikeCtx ? '' : '你又站在那条走廊里。');
    await game.init(roguelikeCtx.charId, 'ironclad');
    overrideGameForRoguelike(game);
    render();
    bindBattleControls();
    return;
  }

  // Character selection
  document.querySelectorAll('.char-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('btn-start').disabled = false;
      document.getElementById('btn-start').textContent =
        `选择 ${card.querySelector('.char-name').textContent} 开始对战`;
    });
  });

  document.getElementById('btn-start').addEventListener('click', async () => {
    const selected = document.querySelector('.char-card.selected');
    if (!selected) return;
    const charId = selected.dataset.id;
    const rivals = { ironclad: 'mage', mage: 'ironclad', nightwatch: 'sleepwalker', sleepwalker: 'nightwatch' };
    const aiId = rivals[charId] || 'ironclad';
    document.getElementById('select-screen').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    document.getElementById('battle-screen').classList.add('mode-novel');
    game = new GameState();
    game.onChange = render;
    narrator.reset('你又站在那条走廊里。');
    await game.init(charId, aiId);
    render();
    bindBattleControls();
  });
});

function bindBattleControls() {
  document.getElementById('btn-end-turn').addEventListener('click', () => {
    if (game.phase !== 'player' || game.over) return;
    game.endTurn();
    render();
  });
  document.getElementById('btn-forfeit').addEventListener('click', () => {
    game._gameOver('defeat');
    render();
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (roguelikeCtx) {
      window.location.href = roguelikeCtx.returnTo;
    } else {
      window.location.reload();
    }
  });
}

// ── Enemy intent: project next-turn action from predicted draw ──
function predictEnemyHand() {
  const ai = game.enemy;
  let deck = [...ai.deck];
  let discard = [...ai.discard];
  const hand = [];
  for (let i = 0; i < ai.handSize; i++) {
    if (deck.length === 0) {
      if (discard.length === 0) break;
      deck = shuffle(discard);
      discard = [];
    }
    if (hand.length >= ai.maxHandSize) break;
    hand.push(deck.pop());
  }
  return hand;
}

function computeEnemyIntent() {
  const ai = game.enemy;
  const target = game.player;
  const hand = predictEnemyHand();
  const sorted = [...hand].sort((a, b) => {
    const aAtk = game._isAttack(a) ? 1 : 0;
    const bAtk = game._isAttack(b) ? 1 : 0;
    if (aAtk !== bAtk) return bAtk - aAtk;
    return (b.cost || 0) - (a.cost || 0);
  });
  let manaPool = ai.maxMana + ai.manaGrowth;
  let attackDmg = 0, block = 0;
  const buffIds = [];
  const strBonus = ai.buffs.filter(b => b.id === 'strength').reduce((s, b) => s + b.stacks, 0);
  const vulnOnTarget = target.buffs.some(b => b.id === 'vulnerable');
  for (const card of sorted) {
    const cost = card.cost || 0;
    if (manaPool < cost) continue;
    manaPool -= cost;
    for (const inv of (card.effects || [])) {
      const eff = lookup(game.db.effects, inv.effectId);
      if (!eff) continue;
      if (eff.executorType === 'DealDamageExecutor') {
        let dmg = (inv.value || 0) + strBonus;
        if (vulnOnTarget) dmg = Math.floor(dmg * 1.5);
        attackDmg += dmg;
      } else if (eff.executorType === 'GainBlockExecutor') {
        block += inv.value || 0;
      } else if (eff.executorType === 'ApplyBuffExecutor') {
        const bdef = lookup(game.db.buffs, inv.parameters?.buffId_ref);
        if (bdef && !buffIds.find(x => x.id === bdef.id)) buffIds.push({ id: bdef.id, name: bdef.nameKey || bdef.id });
      }
    }
  }
  return { attackDmg, block, buffIds };
}

function renderIntent() {
  const el = document.getElementById('enemy-intent');
  if (!el) return;
  if (game.over) { el.innerHTML = ''; return; }
  if (game.phase !== 'player') {
    el.innerHTML = '<span class="intent-empty">征兆中</span>';
    return;
  }
  const { attackDmg, block, buffIds } = computeEnemyIntent();
  if (!attackDmg && !block && !buffIds.length) {
    el.innerHTML = '<span class="intent-empty">无征兆</span>';
    return;
  }
  const tiles = [];
  if (attackDmg > 0) tiles.push(`<span class="intent-tile intent-tile--attack" title="将碰到你">${ICONS.sword}<b>${attackDmg}</b></span>`);
  if (block > 0) tiles.push(`<span class="intent-tile intent-tile--block" title="将挡住">${ICONS.shield}<b>${block}</b></span>`);
  for (const b of buffIds) tiles.push(`<span class="intent-tile intent-tile--buff" title="将沾上">${ICONS.buff}${b.name}</span>`);
  el.innerHTML = tiles.join('');
}

// ── Card effect preview (hover) ──
function previewCardEffects(card) {
  const out = [];
  const strBonus = game.player.buffs.filter(b => b.id === 'strength').reduce((s, b) => s + b.stacks, 0);
  const vulnOnEnemy = game.enemy.buffs.some(b => b.id === 'vulnerable');
  for (const inv of (card.effects || [])) {
    const eff = lookup(game.db.effects, inv.effectId);
    if (!eff) continue;
    if (eff.executorType === 'DealDamageExecutor') {
      let dmg = (inv.value || 0) + strBonus;
      if (vulnOnEnemy) dmg = Math.floor(dmg * 1.5);
      out.push({ kind: 'damage', value: dmg });
    } else if (eff.executorType === 'GainBlockExecutor') {
      out.push({ kind: 'block', value: inv.value || 0 });
    } else if (eff.executorType === 'HealExecutor') {
      out.push({ kind: 'heal', value: inv.value || 0 });
    }
  }
  return out;
}

function showPreview(side, effects) {
  const el = document.getElementById(side === 'enemy' ? 'enemy-preview' : 'player-preview');
  if (!el) return;
  if (!effects.length) { el.classList.remove('show'); return; }
  // Prefer damage (enemy target), else block/heal (player target)
  const dmg = effects.filter(e => e.kind === 'damage').reduce((s, e) => s + e.value, 0);
  const blk = effects.filter(e => e.kind === 'block').reduce((s, e) => s + e.value, 0);
  const hl = effects.filter(e => e.kind === 'heal').reduce((s, e) => s + e.value, 0);
  if (side === 'enemy' && dmg > 0) {
    el.className = 'preview-badge show';
    el.textContent = `−${dmg}`;
  } else if (side === 'player' && (blk > 0 || hl > 0)) {
    el.className = 'preview-badge show' + (blk > 0 ? ' preview-badge--block' : ' preview-badge--heal');
    el.textContent = (blk > 0 ? `+${blk} 护甲` : `+${hl} HP`);
  } else {
    el.classList.remove('show');
  }
}

function clearPreviews() {
  document.getElementById('enemy-preview')?.classList.remove('show');
  document.getElementById('player-preview')?.classList.remove('show');
}

// ── Drag-to-play ──
let draggedCardIndex = null;
let dragSuppressClick = false;

function setupDropZones() {
  document.querySelectorAll('.battle-hero[data-drop]').forEach(zone => {
    zone.addEventListener('dragover', e => {
      if (draggedCardIndex === null) return;
      e.preventDefault();
      zone.classList.add('drop-active');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-active'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drop-active');
      if (draggedCardIndex === null) return;
      const idx = draggedCardIndex;
      draggedCardIndex = null;
      if (game.phase === 'player' && !game.over) {
        game.playCard(idx);
        render();
      }
    });
  });
}

function render() {
  if (!game) return;
  const p = game.player, e = game.enemy;

  // Player
  document.getElementById('player-name').textContent = p.name;
  document.getElementById('player-hp').textContent = `清醒 ${p.hp}/${p.maxHp}`;
  document.getElementById('player-hp-bar').style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
  document.getElementById('player-block').innerHTML = `${ICONS.shield} ${p.block}`;
  document.getElementById('player-mana').innerHTML = `${ICONS.bolt} ${p.mana}/${p.maxMana}`;
  document.getElementById('player-buffs').innerHTML = p.buffs.map(b => {
    const def = lookup(game.db.buffs, b.id);
    const icon = def?.isDebuff ? ICONS.debuff : ICONS.buff;
    return `<span class="buff-tag${def?.isDebuff ? ' debuff' : ''}" title="${def?.nameKey || b.id}: ${b.stacks} 层, ${b.duration} 回合">${icon} ${def?.nameKey || b.id}(${b.stacks})</span>`;
  }).join(' ');
  document.getElementById('player-draw-count').textContent = p.deck.length;
  document.getElementById('player-discard-count').textContent = p.discard.length;

  // Enemy
  document.getElementById('enemy-name').textContent = e.name;
  document.getElementById('enemy-hp').textContent = `清醒 ${e.hp}/${e.maxHp}`;
  document.getElementById('enemy-hp-bar').style.width = `${Math.max(0, e.hp / e.maxHp * 100)}%`;
  document.getElementById('enemy-block').innerHTML = `${ICONS.shield} ${e.block}`;
  document.getElementById('enemy-mana').innerHTML = `${ICONS.bolt} ${e.mana}/${e.maxMana}`;
  document.getElementById('enemy-buffs').innerHTML = e.buffs.map(b => {
    const def = lookup(game.db.buffs, b.id);
    const icon = def?.isDebuff ? ICONS.debuff : ICONS.buff;
    return `<span class="buff-tag${def?.isDebuff ? ' debuff' : ''}" title="${def?.nameKey || b.id}: ${b.stacks} 层, ${b.duration} 回合">${icon} ${def?.nameKey || b.id}(${b.stacks})</span>`;
  }).join(' ');
  document.getElementById('enemy-draw-count').textContent = e.deck.length;
  document.getElementById('enemy-discard-count').textContent = e.discard.length;
  document.getElementById('enemy-hand-count').textContent = e.hand.length;

  // Floating text triggers
  const playerPortrait = document.querySelector('.player-hero .hero-portrait');
  const enemyPortrait = document.querySelector('.enemy .hero-portrait');
  if (p.hp < lastPlayerHp) spawnFloatingText(playerPortrait, p.hp - lastPlayerHp, 'damage');
  if (e.hp < lastEnemyHp) spawnFloatingText(enemyPortrait, e.hp - lastEnemyHp, 'damage');
  if (p.block > lastPlayerBlock) spawnFloatingText(playerPortrait, p.block - lastPlayerBlock, 'block');
  if (e.block > lastEnemyBlock) spawnFloatingText(enemyPortrait, e.block - lastEnemyBlock, 'block');
  lastPlayerHp = p.hp;
  lastEnemyHp = e.hp;
  lastPlayerBlock = p.block;
  lastEnemyBlock = e.block;

  // Hand — skip rebuild while a card is being dragged (would destroy the dragged node).
  const handEl = document.getElementById('player-hand');
  if (draggedCardIndex === null) {
    handEl.innerHTML = '';
    for (let i = 0; i < p.hand.length; i++) {
    const card = p.hand[i];
    const canPlay = game.phase === 'player' && p.mana >= (card.cost || 0) && !game.over;
    const div = document.createElement('div');
    div.className = 'card ' + cardTypeClass(card.type) + (canPlay ? ' playable' : ' unplayable');
    div.style.animationDelay = `${i * 0.05}s`;
    div.innerHTML = `
      <div class="card-cost"><svg class="icon" aria-hidden="true"><use href="#icon-bolt"></use></svg><span>${card.cost ?? 0}</span></div>
      <div class="card-name">${card.nameKey || card.id}</div>
      <div class="card-type">${card.type || ''}</div>
      <div class="card-art">${cardArtFor(card.type)}</div>
      <div class="card-desc">${describeCard(card)}</div>
    `;
    if (canPlay) {
      div.draggable = true;
      div.addEventListener('dragstart', e => {
        draggedCardIndex = i;
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(i)); } catch {}
      });
      div.addEventListener('dragend', () => {
        draggedCardIndex = null;
        dragSuppressClick = true;
        setTimeout(() => { dragSuppressClick = false; }, 60);
        div.classList.remove('dragging');
        document.querySelectorAll('.drop-active').forEach(z => z.classList.remove('drop-active'));
      });
      div.addEventListener('mouseenter', () => {
        const fx = previewCardEffects(card);
        showPreview('enemy', fx);
        showPreview('player', fx);
      });
      div.addEventListener('mouseleave', clearPreviews);
      div.addEventListener('click', () => {
        if (draggedCardIndex !== null || dragSuppressClick) return;
        game.playCard(i);
        render();
      });
    }
    handEl.appendChild(div);
  }
  }

  // Disable end turn if not player's turn
  const btnEnd = document.getElementById('btn-end-turn');
  btnEnd.disabled = game.phase !== 'player' || game.over;

  // Log
  const logEl = document.getElementById('log-entries');
  const useNovel = !roguelikeCtx;
  if (useNovel) {
    const lines = narrator.log.slice(-14).map(t => `<div class="log-line log-line--novel">${escapeHtml(t)}</div>`);
    if (narrator.pending || narrator.inflight) lines.push('<div class="log-line log-line--novel log-line--pending">…</div>');
    logEl.innerHTML = lines.join('') || '<div class="log-line log-line--novel log-line--pending">…</div>';
  } else {
    logEl.innerHTML = game.log.slice(-12).map(entry => {
      const typeClass = entry.type ? `log-line--${entry.type}` : '';
      return `<div class="log-line ${typeClass}">${entry.msg}</div>`;
    }).join('');
  }
  logEl.scrollTop = logEl.scrollHeight;

  // Sidebar label
  const sidebarLabel = document.querySelector('.sidebar-label');
  if (sidebarLabel) sidebarLabel.textContent = roguelikeCtx ? '战 斗 日 志' : '梦 中';

  // Phase indicator
  const indicator = document.getElementById('turn-indicator');
  if (indicator) {
    indicator.textContent = game.over ? '梦散了' : (game.phase === 'player' ? '你在走' : '屋子在动');
  }
  const heroEl = document.querySelector('.player-hero');
  const enemyEl = document.querySelector('.enemy');
  heroEl.classList.toggle('active-turn', game.phase === 'player' && !game.over);
  enemyEl.classList.toggle('active-turn', game.phase === 'ai' && !game.over);

  renderIntent();
  if (!window._dropZonesBound) {
    setupDropZones();
    window._dropZonesBound = true;
  }
}

function describeCard(card) {
  if (!card.effects || card.effects.length === 0) return '';
  return card.effects.map(inv => {
    const eff = lookup(game.db.effects, inv.effectId);
    const name = eff?.displayNameKey || inv.effectId;
    const val = inv.value ? ` ${inv.value}` : '';
    let params = '';
    if (inv.parameters?.buffId_ref) {
      const bdef = lookup(game.db.buffs, inv.parameters.buffId_ref);
      params = ` [${bdef?.nameKey || inv.parameters.buffId_ref}]`;
    }
    return `${name}${val}${params}`;
  }).join('\n');
}
