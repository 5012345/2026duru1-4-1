/**
 * 픽셀 이스케이프: 차원 탈출 서바이벌
 * ─ UI 컨트롤러 + 게임 엔진 + AI 엔진
 */

// ══════════════════════════════════════════════
//  전역 상태
// ══════════════════════════════════════════════
const PlayerState = {
  nickname: '모험가',
  avatar: 'male',
  wins: 0,
  coins: 150,
  currentRoom: null,
  selectedX: 0,
  selectedY: 0,
  isSpectating: false
};

const PreviewState = {
  hair: 'hair_normal',
  costume: 'costume_normal',
  aura: 'aura_none',
  slider: 'slider_normal'
};

const AIMatchConfig = {
  aiCount: 1,
  difficulty: 'easy'
};

// ══════════════════════════════════════════════
//  게임 보드 상태 (인게임 핵심 데이터)
// ══════════════════════════════════════════════
const GameState = {
  board: null,          // 11×11 배열 (인덱스 0~10 → 좌표 -5~+5)
  players: [],          // [{name, color, isAI, difficulty, score}]
  currentTurn: 0,       // players 배열 인덱스
  isGameOver: false,
  isAIMode: false,
  timerInterval: null,
  timeLeft: 30,

  /* 좌표 ↔ 배열 인덱스 변환 */
  coordToIndex(v) { return v + 5; },  // -5→0, 0→5, 5→10
  indexToCoord(i) { return i - 5; },

  init(players, isAI) {
    this.board = Array.from({ length: 11 }, () => Array(11).fill(null));
    this.players = players;
    this.currentTurn = 0;
    this.isGameOver = false;
    this.isAIMode = isAI;
    this.timeLeft = 30;
  },

  /** 해당 셀에 놓을 수 있는지 확인 */
  canPlace(x, y) {
    if (x < -5 || x > 5 || y < -5 || y > 5) return false;
    return this.board[this.coordToIndex(y)][this.coordToIndex(x)] === null;
  },

  /** 셀에 마커 놓기 */
  place(x, y, playerIdx) {
    if (!this.canPlace(x, y)) return false;
    this.board[this.coordToIndex(y)][this.coordToIndex(x)] = playerIdx;
    return true;
  },

  /** 4연속 승리 체크 */
  checkWin(playerIdx) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 11; col++) {
        if (this.board[row][col] !== playerIdx) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let s = 1; s < 4; s++) {
            const nr = row + dr * s;
            const nc = col + dc * s;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) break;
            if (this.board[nr][nc] !== playerIdx) break;
            count++;
          }
          if (count >= 4) return true;
        }
      }
    }
    return false;
  },

  /** 무승부(보드 꽉 참) */
  isFull() {
    return this.board.every(row => row.every(cell => cell !== null));
  },

  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
  }
};

// ══════════════════════════════════════════════
//  AI 엔진 (Minimax 기반)
// ══════════════════════════════════════════════
const AIEngine = {
  PLAYER_COLORS: ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6'],

  /** 빈 셀 목록 */
  emptyCells() {
    const cells = [];
    for (let r = 0; r < 11; r++)
      for (let c = 0; c < 11; c++)
        if (GameState.board[r][c] === null)
          cells.push([r, c]);
    return cells;
  },

  /** n연속이 가능한 셀이 있으면 반환 */
  findNInARow(playerIdx, n) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        for (const [dr, dc] of dirs) {
          // 이 방향으로 n칸 짜리 창을 슬라이드
          const cells = [];
          let valid = true;
          for (let s = 0; s < n; s++) {
            const nr = r + dr * s;
            const nc = c + dc * s;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) { valid = false; break; }
            cells.push([nr, nc]);
          }
          if (!valid) continue;

          const owned = cells.filter(([nr, nc]) => GameState.board[nr][nc] === playerIdx).length;
          const empty = cells.filter(([nr, nc]) => GameState.board[nr][nc] === null).length;
          if (owned === n - 1 && empty === 1) {
            // 빈 셀 반환
            const [er, ec] = cells.find(([nr, nc]) => GameState.board[nr][nc] === null);
            return [er, ec];
          }
        }
      }
    }
    return null;
  },

  /** 가장 "무거운" 위치 (가중치 맵 기반 전략 이동) */
  bestStrategicCell(playerIdx) {
    const empty = this.emptyCells();
    if (empty.length === 0) return null;

    const scores = empty.map(([r, c]) => {
      let score = 0;
      const dirs = [[1,0],[0,1],[1,1],[1,-1]];

      for (const [dr, dc] of dirs) {
        for (let start = -3; start <= 0; start++) {
          const window = [];
          let valid = true;
          for (let s = 0; s < 4; s++) {
            const nr = r + (start + s) * dr;
            const nc = c + (start + s) * dc;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) { valid = false; break; }
            window.push(GameState.board[nr][nc]);
          }
          if (!valid) continue;
          const myCount = window.filter(v => v === playerIdx).length;
          const nullCount = window.filter(v => v === null).length;
          if (nullCount + myCount === 4) {
            score += myCount * myCount * 10;
          }
        }
      }

      // 중앙 선호도
      const distFromCenter = Math.abs(r - 5) + Math.abs(c - 5);
      score += Math.max(0, 10 - distFromCenter);

      return { r, c, score };
    });

    scores.sort((a, b) => b.score - a.score);
    return [scores[0].r, scores[0].c];
  },

  /** 난이도별 AI 행동 결정 */
  think(aiPlayerIdx, difficulty) {
    const empty = this.emptyCells();
    if (empty.length === 0) return null;

    if (difficulty === 'easy') {
      // 초급: 완전 랜덤
      return empty[Math.floor(Math.random() * empty.length)];
    }

    if (difficulty === 'normal') {
      // 중급: 이기는 수 → 막는 수 → 랜덤
      const win = this.findNInARow(aiPlayerIdx, 4);
      if (win) return win;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const block = this.findNInARow(p, 4);
        if (block) return block;
      }
      return empty[Math.floor(Math.random() * empty.length)];
    }

    if (difficulty === 'hard') {
      // 고급: 이기는 수 → 막는 수(3연) → 전략 배치
      const win = this.findNInARow(aiPlayerIdx, 4);
      if (win) return win;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const block4 = this.findNInARow(p, 4);
        if (block4) return block4;
      }
      // 자신의 3연 완성 도모
      const extend = this.findNInARow(aiPlayerIdx, 3);
      if (extend) return extend;
      // 상대 3연 차단
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const block3 = this.findNInARow(p, 3);
        if (block3) return block3;
      }
      return this.bestStrategicCell(aiPlayerIdx);
    }

    return empty[Math.floor(Math.random() * empty.length)];
  }
};

// ══════════════════════════════════════════════
//  상점 데이터
// ══════════════════════════════════════════════
const ShopData = {
  hair: [
    { id: 'hair_normal',  name: '기본 헤어',      price: 0,   icon: '💇', purchased: true,  equipped: true  },
    { id: 'hair_warrior', name: '전사의 불꽃 헤어', price: 50,  icon: '🔥', purchased: false, equipped: false },
    { id: 'hair_wizard',  name: '마법의 퍼플 헤어', price: 80,  icon: '🔮', purchased: false, equipped: false },
    { id: 'hair_crown',   name: '황금 왕관',       price: 150, icon: '👑', purchased: false, equipped: false }
  ],
  costume: [
    { id: 'costume_normal', name: '기본 탐험복',       price: 0,  icon: '👕', purchased: true,  equipped: true  },
    { id: 'costume_armor',  name: '강철 플레이트 아머', price: 60, icon: '🛡️', purchased: false, equipped: false },
    { id: 'costume_robe',   name: '대마법사 로브',      price: 90, icon: '🧥', purchased: false, equipped: false }
  ],
  aura: [
    { id: 'aura_none',   name: '없음',         price: 0,   icon: '❌', purchased: true,  equipped: true,  effect: null          },
    { id: 'aura_fire',   name: '이그니스 오라', price: 100, icon: '🔥', purchased: false, equipped: false, effect: 'aura-fire'   },
    { id: 'aura_ice',    name: '프로스트 오라', price: 100, icon: '❄️', purchased: false, equipped: false, effect: 'aura-ice'    },
    { id: 'aura_forest', name: '네이처 오라',   price: 120, icon: '🍃', purchased: false, equipped: false, effect: 'aura-forest' }
  ],
  slider: [
    { id: 'slider_normal', name: '나무 슬라이더',          price: 0,   icon: '🪵', purchased: true,  equipped: true  },
    { id: 'slider_gold',   name: '황금 슬라이더',           price: 200, icon: '🔱', purchased: false, equipped: false },
    { id: 'slider_neon',   name: '차원 레이저 슬라이더',    price: 300, icon: '⚡', purchased: false, equipped: false }
  ]
};

// 가상 방 목록
let MockRooms = [
  { id: 'room_1', name: '좌표 마스터들의 전쟁',       maxPlayers: 4, currentPlayers: 3, status: '대기중', isPrivate: false, players: ['알파', '베타', '감마'] },
  { id: 'room_2', name: '중1 수학 정복방 (비번 1234)', maxPlayers: 2, currentPlayers: 1, status: '대기중', isPrivate: true,  players: ['델타'] },
  { id: 'room_3', name: '차원탈출 고수만 컴온',        maxPlayers: 4, currentPlayers: 4, status: '게임중', isPrivate: false, players: ['A', 'B', 'C', 'D'] }
];

// 플레이어 색상 팔레트
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

// ══════════════════════════════════════════════
//  UI 모듈
// ══════════════════════════════════════════════
const UI = {
  // ── 화면 전환 ──────────────────────────
  navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (!target) return;
    target.classList.add('active');
    this.showToast(`🗺️ ${this.getScreenName(screenId)}`);

    if (screenId === 'screen-room-list') this.renderRooms();
    else if (screenId === 'screen-shop') {
      this.syncPreviewWithEquipped();
      this.renderShop('hair');
      this.updateAvatarPreview();
    } else if (screenId === 'screen-game') this.initGameBoard();
  },

  getScreenName(id) {
    return { 'screen-lobby': '메인 로비', 'screen-room-list': '모험가 대기실',
             'screen-shop': '아바타 상점', 'screen-game': '게임 영역' }[id] || '?';
  },

  // ── 모달 ──────────────────────────────
  openModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.add('active');
      if (id === 'modal-admin') this.renderAdminConsole();
    }
  },
  closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
  },

  // ── 토스트 ────────────────────────────
  showToast(msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-10px)'; setTimeout(() => t.remove(), 300); }, 2500);
  },

  // ── 로비 ──────────────────────────────
  enterLobby() {
    const nick = document.getElementById('input-nickname').value.trim();
    if (!nick || nick.length < 2) { this.showToast('⚠️ 닉네임을 2자 이상 입력하세요!'); return; }
    PlayerState.nickname = nick;
    PlayerState.avatar = document.querySelector('input[name="avatar"]:checked').value;

    document.getElementById('header-nickname').textContent = nick;
    document.getElementById('header-avatar-img').src = `assets/avatar_${PlayerState.avatar}.png`;
    document.getElementById('header-wins').textContent = `🏆 ${PlayerState.wins}`;
    this.showToast(`👋 환영합니다, ${nick} 님!`);
    this.navigateTo('screen-room-list');
  },

  // ── AI 대전 ───────────────────────────
  openAIMatchModal() {
    const nick = document.getElementById('input-nickname').value.trim();
    if (!nick || nick.length < 2) { this.showToast('⚠️ 먼저 닉네임을 입력해 주세요!'); return; }
    PlayerState.nickname = nick;
    PlayerState.avatar = document.querySelector('input[name="avatar"]:checked').value;
    this.openModal('modal-ai-match');
  },

  selectAICount(n) {
    AIMatchConfig.aiCount = n;
    [1,2,3].forEach(i => document.getElementById(`ai-cnt-${i}`)?.classList.remove('active'));
    document.getElementById(`ai-cnt-${n}`)?.classList.add('active');
  },

  selectAIDifficulty(d) {
    AIMatchConfig.difficulty = d;
    ['easy','normal','hard'].forEach(x => document.getElementById(`ai-diff-${x}`)?.classList.remove('active'));
    document.getElementById(`ai-diff-${d}`)?.classList.add('active');
  },

  startAIMatch() {
    this.closeModal('modal-ai-match');
    const diffLabel = { easy:'초급', normal:'중급', hard:'고급' }[AIMatchConfig.difficulty];

    const players = [{ name: PlayerState.nickname, color: PLAYER_COLORS[0], isAI: false }];
    for (let i = 1; i <= AIMatchConfig.aiCount; i++) {
      players.push({ name: `AI_${i}(${diffLabel})`, color: PLAYER_COLORS[i % PLAYER_COLORS.length], isAI: true, difficulty: AIMatchConfig.difficulty });
    }

    const room = {
      id: `ai_${Date.now()}`, name: `🤖 AI 대전 (${diffLabel})`,
      maxPlayers: players.length, currentPlayers: players.length,
      status: '게임중', isPrivate: false,
      players: players.map(p => p.name)
    };
    PlayerState.currentRoom = room;

    GameState.init(players, true);
    this.showToast(`⚔️ AI 대전 시작! 난이도: ${diffLabel}`);
    this.navigateTo('screen-game');
  },

  // ── 규칙서 탭 ─────────────────────────
  switchRulesTab(name) {
    document.querySelectorAll('.rules-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.rules-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`rtab-${name}`)?.classList.add('active');
    document.getElementById(`rcontent-${name}`)?.classList.add('active');
  },

  // ── 상점 ──────────────────────────────
  switchShopTab(name) {
    document.querySelectorAll('.shop-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    document.querySelectorAll('.shop-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${name}`)?.classList.add('active');
    document.getElementById(`tab-${name}`)?.setAttribute('aria-selected','true');
    document.getElementById(`panel-${name}`)?.classList.add('active');
    this.renderShop(name);
  },

  syncPreviewWithEquipped() {
    Object.keys(ShopData).forEach(cat => {
      const eq = ShopData[cat].find(i => i.equipped);
      if (eq) PreviewState[cat] = eq.id;
    });
  },

  renderShop(category) {
    const grid = document.getElementById(`grid-${category}`);
    if (!grid) return;
    grid.innerHTML = '';
    ShopData[category].forEach(item => {
      const isPreviewing = PreviewState[category] === item.id;
      const card = document.createElement('div');
      card.className = `shop-item-card${isPreviewing ? ' equipped' : ''}`;
      let badge = '';
      if (item.equipped)        badge = `<span style="position:absolute;top:4px;left:4px;background:var(--green-light);font-size:.65rem;padding:1px 4px;border-radius:4px;color:#fff;">장착됨</span>`;
      else if (item.purchased)  badge = `<span style="position:absolute;top:4px;left:4px;background:var(--wood-light);font-size:.65rem;padding:1px 4px;border-radius:4px;color:#fff;">보유</span>`;

      card.innerHTML = `${badge}
        <div class="shop-item-icon-box"><span style="font-size:2.2rem;">${item.icon}</span></div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price-tag">${item.price === 0 || item.purchased ? '보유중' : `🪙 ${item.price}`}</div>`;
      card.onclick = () => this.selectItemForPreview(category, item);
      grid.appendChild(card);
    });
  },

  selectItemForPreview(category, item) {
    PreviewState[category] = item.id;
    this.renderShop(category);
    this.updateAvatarPreview();
  },

  updateAvatarPreview() {
    const el = document.getElementById('shop-preview-avatar');
    const auraEl = document.getElementById('preview-aura-effect');
    if (el) el.src = `assets/avatar_${PlayerState.avatar}.png`;

    const auraItem = ShopData.aura.find(i => i.id === PreviewState.aura);
    if (auraEl) {
      auraEl.className = 'aura-effect';
      if (auraItem?.effect) auraEl.classList.add(auraItem.effect);
    }

    const list = document.getElementById('shop-preview-items');
    if (!list) return;
    list.innerHTML = '';
    [['💇 헤어','hair'],['👕 의상','costume'],['✨ 오라','aura'],['🎚️ 슬라이더','slider']].forEach(([label, key]) => {
      const item = ShopData[key].find(i => i.id === PreviewState[key]);
      if (!item) return;
      const status = item.purchased
        ? `<span style="color:var(--green-bright);">[보유]</span>`
        : `<span style="color:var(--gold);">[미보유: 🪙${item.price}]</span>`;
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap;';
      div.innerHTML = `<span>${label}: ${item.name}</span>${status}`;
      list.appendChild(div);
    });
  },

  applyPreviewItems() {
    const toBuy = [];
    let total = 0;
    Object.keys(PreviewState).forEach(cat => {
      const item = ShopData[cat].find(i => i.id === PreviewState[cat]);
      if (item && !item.purchased) { toBuy.push(item); total += item.price; }
    });

    if (toBuy.length > 0) {
      if (PlayerState.coins < total) {
        this.showToast(`⚠️ 코인 부족! (필요: 🪙${total} / 보유: 🪙${PlayerState.coins})`);
        return;
      }
      const names = toBuy.map(i => i.name).join(', ');
      if (!confirm(`🪙 [${names}] 구매 (총 ${total} 코인)?`)) return;
      PlayerState.coins -= total;
      document.getElementById('shop-coins').textContent = PlayerState.coins;
      toBuy.forEach(i => i.purchased = true);
    }

    this.equipSelectedPreviewItems();
    this.showToast('✨ 아바타 스킨이 적용되었습니다!');
  },

  equipSelectedPreviewItems() {
    Object.keys(PreviewState).forEach(cat => {
      ShopData[cat].forEach(i => i.equipped = (i.id === PreviewState[cat]));
    });
    const activeTab = document.querySelector('.shop-tab.active');
    if (activeTab) this.renderShop(activeTab.id.replace('tab-', ''));
    this.updateAvatarPreview();
  },

  // ── 방 목록 ───────────────────────────
  renderRooms() {
    const grid = document.getElementById('rooms-grid');
    const cnt = document.getElementById('room-count');
    if (!grid) return;
    grid.innerHTML = '';
    if (cnt) cnt.textContent = MockRooms.length;

    if (!MockRooms.length) {
      grid.innerHTML = `<div class="empty-rooms"><span class="empty-icon">🪵</span><p>아직 열린 방이 없어요.<br/>방을 새로 만들어 보세요!</p></div>`;
      return;
    }
    MockRooms.forEach(room => {
      const fill = (room.currentPlayers / room.maxPlayers) * 100;
      const card = document.createElement('div');
      card.className = 'room-card wood-panel';
      card.innerHTML = `
        <div class="room-card-header">
          <div class="room-name">${room.name}</div>
          ${room.isPrivate ? '<span class="room-lock-icon">🔒</span>' : ''}
        </div>
        <div class="room-status ${room.status==='게임중'?'playing':''}">${room.status}</div>
        <div class="room-players">
          <span>👥 ${room.currentPlayers} / ${room.maxPlayers} 명</span>
          <div class="player-count-bar"><div class="player-count-fill" style="width:${fill}%"></div></div>
        </div>`;
      card.onclick = () => this.tryEnterRoom(room);
      grid.appendChild(card);
    });
  },

  tryEnterRoom(room) {
    if (room.status === '게임중') { this.openSpectateModal(room); return; }
    if (room.isPrivate) {
      const pw = prompt('🔑 비밀번호 4자리:');
      if (pw !== '1234') { this.showToast('❌ 비밀번호 오류'); return; }
    }
    PlayerState.currentRoom = room;
    const players = room.players.map((n, i) => ({ name: n, color: PLAYER_COLORS[i % PLAYER_COLORS.length], isAI: false }));
    GameState.init(players, false);
    this.showToast(`🚪 ${room.name} 입장!`);
    this.navigateTo('screen-game');
  },

  openSpectateModal(room) {
    PlayerState.currentRoom = room;
    const el = document.getElementById('spectate-room-info');
    if (el) el.textContent = `방 이름: ${room.name}`;
    this.openModal('modal-spectate');
  },

  enterSpectateMode() {
    this.closeModal('modal-spectate');
    PlayerState.isSpectating = true;
    this.showToast(`👁️ 관전 모드 입장: ${PlayerState.currentRoom?.name}`);
    this.navigateTo('screen-game');
  },

  refreshRooms() { this.showToast('🔄 방 목록 갱신!'); this.renderRooms(); },

  selectedMaxPlayers: 2,
  selectPlayerCount(n) {
    this.selectedMaxPlayers = n;
    document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`cnt-${n}`)?.classList.add('active');
  },

  createRoom() {
    const name = document.getElementById('input-room-name')?.value.trim();
    if (!name) { this.showToast('⚠️ 방 이름을 입력하세요!'); return; }
    const isPrivate = document.getElementById('room-private')?.checked;
    const pw = document.getElementById('input-room-pw')?.value;
    if (isPrivate && (!pw || pw.length !== 4)) { this.showToast('⚠️ 비공개 방은 4자리 비밀번호 필요!'); return; }

    const room = {
      id: `room_${Date.now()}`, name,
      maxPlayers: this.selectedMaxPlayers, currentPlayers: 1,
      status: '대기중', isPrivate, players: [PlayerState.nickname]
    };
    MockRooms.push(room);
    this.closeModal('modal-create-room');
    this.showToast(`🚀 방 [${name}] 생성!`);

    PlayerState.currentRoom = room;
    const players = [{ name: PlayerState.nickname, color: PLAYER_COLORS[0], isAI: false }];
    GameState.init(players, false);
    this.navigateTo('screen-game');

    document.getElementById('input-room-name').value = '';
    if (document.getElementById('input-room-pw')) document.getElementById('input-room-pw').value = '';
  },

  // ── 관리자 콘솔 ─────────────────────
  renderAdminConsole() {
    const grid = document.getElementById('admin-rooms-grid');
    if (!grid) return;
    const el1 = document.getElementById('admin-rooms-count');
    const el2 = document.getElementById('admin-players-count');
    if (el1) el1.textContent = MockRooms.length;
    if (el2) el2.textContent = MockRooms.reduce((a, r) => a + r.currentPlayers, 0) + 1;

    grid.innerHTML = '';
    if (!MockRooms.length) {
      grid.innerHTML = `<div class="admin-empty-msg"><span>🪵</span><br/>방 없음</div>`;
      return;
    }
    MockRooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'admin-room-card';
      card.innerHTML = `<div class="admin-room-title">🗺️ ${room.name}</div>
        <div class="admin-room-details">상태: <strong style="color:var(--gold);">${room.status}</strong><br/>
        인원: ${room.currentPlayers}/${room.maxPlayers} 명<br/>플레이어: ${room.players.join(', ')}</div>`;
      card.onclick = () => { this.closeModal('modal-admin'); this.openSpectateModal(room); };
      grid.appendChild(card);
    });
  },

  // ══════════════════════════════════════════════
  //  게임 보드 초기화 & 그리기
  // ══════════════════════════════════════════════
  initGameBoard() {
    const room = PlayerState.currentRoom;
    const hRoomName = document.getElementById('hud-room-name');
    if (hRoomName) hRoomName.textContent = room ? room.name : '개인 연습실';

    this.renderPlayerPanels();
    this.updateHUDTurn();
    this.drawGrid();
    this.startTurnTimer();

    // AI 모드에서 첫 번째 플레이어가 AI이면 바로 AI 수행
    if (GameState.isAIMode && GameState.players[0]?.isAI) {
      setTimeout(() => this.doAITurn(), 800);
    }
  },

  renderPlayerPanels() {
    const mini = document.getElementById('player-list-mini');
    const left = document.getElementById('player-cards-left');
    if (mini) mini.innerHTML = '';
    if (left) left.innerHTML = '';

    GameState.players.forEach((p, idx) => {
      if (mini) {
        const el = document.createElement('div');
        el.className = `mini-card ${idx === GameState.currentTurn ? 'active-turn' : ''}`;
        el.id = `mini-card-${idx}`;
        el.style.borderColor = p.color;
        el.innerHTML = `<img src="assets/avatar_${PlayerState.avatar}.png" class="mini-avatar">`;
        mini.appendChild(el);
      }
      if (left) {
        const el = document.createElement('div');
        el.className = `game-player-card ${idx === GameState.currentTurn ? 'active-turn' : ''}`;
        el.id = `player-card-${idx}`;
        el.innerHTML = `
          <div class="game-player-avatar-box" style="border-left:3px solid ${p.color};">
            <img src="assets/avatar_${PlayerState.avatar}.png" class="game-player-avatar">
          </div>
          <div class="player-details">
            <div class="p-name">${p.isAI ? '🤖 ' : ''}${p.name}</div>
            <div class="p-score" id="score-${idx}">🏆 0점</div>
          </div>
          <span class="p-status-dot online"></span>`;
        left.appendChild(el);
      }
    });
  },

  updateHUDTurn() {
    const p = GameState.players[GameState.currentTurn];
    const el = document.getElementById('turn-player-name');
    if (el && p) el.textContent = `${p.isAI ? '🤖 ' : ''}${p.name}`;

    // 활성 플레이어 카드 강조
    document.querySelectorAll('.game-player-card').forEach((c, i) => {
      c.classList.toggle('active-turn', i === GameState.currentTurn);
    });
    document.querySelectorAll('.mini-card').forEach((c, i) => {
      c.classList.toggle('active-turn', i === GameState.currentTurn);
    });

    // 슬라이더 비활성화 여부 (내 턴이 아닐 때 또는 AI 턴)
    const isMyTurn = !GameState.players[GameState.currentTurn]?.isAI;
    const confirmBtn = document.getElementById('btn-confirm-coord');
    const xSlider = document.getElementById('slider-x');
    const ySlider = document.getElementById('slider-y');
    if (confirmBtn) confirmBtn.disabled = !isMyTurn;
    if (xSlider) xSlider.disabled = !isMyTurn;
    if (ySlider) ySlider.disabled = !isMyTurn;
  },

  // ── 타이머 ────────────────────────────
  startTurnTimer() {
    if (GameState.timerInterval) clearInterval(GameState.timerInterval);
    GameState.timeLeft = 30;
    const timerEl = document.getElementById('timer-value');
    if (timerEl) timerEl.textContent = GameState.timeLeft;

    GameState.timerInterval = setInterval(() => {
      if (GameState.isGameOver) { clearInterval(GameState.timerInterval); return; }
      GameState.timeLeft--;
      if (timerEl) timerEl.textContent = GameState.timeLeft;

      if (GameState.timeLeft <= 0) {
        clearInterval(GameState.timerInterval);
        const p = GameState.players[GameState.currentTurn];
        this.addLog(`⏱️ ${p.name} 시간 초과! 턴 넘김.`, 'log-error');
        this.advanceTurn();
      }
    }, 1000);
  },

  // ── 로그 ──────────────────────────────
  addLog(msg, cls = 'log-action') {
    const log = document.getElementById('game-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = `log-entry ${cls}`;
    div.textContent = msg;
    log.prepend(div); // 최신이 상단
    if (log.children.length > 30) log.lastChild.remove();
  },

  // ── 좌표 확인 버튼 핸들러 ────────────
  confirmCoord() {
    if (GameState.isGameOver) return;
    const p = GameState.players[GameState.currentTurn];
    if (p?.isAI) return; // AI 턴에 사람이 누르지 못하게

    this.placeMarker(PlayerState.selectedX, PlayerState.selectedY, GameState.currentTurn);
  },

  // ── 마커 배치 (사람/AI 공통) ──────────
  placeMarker(x, y, playerIdx) {
    if (!GameState.canPlace(x, y)) {
      this.showToast('⚠️ 이미 마커가 있는 좌표입니다!');
      return;
    }

    GameState.place(x, y, playerIdx);
    const p = GameState.players[playerIdx];
    this.addLog(`🎯 ${p.name} → (${x}, ${y})`, 'log-action');
    this.drawGrid();

    // 승리 판정
    if (GameState.checkWin(playerIdx)) {
      GameState.isGameOver = true;
      clearInterval(GameState.timerInterval);
      PlayerState.wins++;
      PlayerState.coins += 50; // 승리 보너스
      this.addLog(`🏆 ${p.name} 승리! +50코인`, 'log-system');
      this.showToast(`🏆 ${p.name} 승리!`);
      this.drawGrid(playerIdx);
      return;
    }

    // 무승부
    if (GameState.isFull()) {
      GameState.isGameOver = true;
      clearInterval(GameState.timerInterval);
      this.addLog('🤝 무승부!', 'log-system');
      this.showToast('🤝 무승부입니다!');
      return;
    }

    this.advanceTurn();
  },

  // ── 다음 턴 ───────────────────────────
  advanceTurn() {
    GameState.nextTurn();
    this.updateHUDTurn();
    this.startTurnTimer();

    const next = GameState.players[GameState.currentTurn];
    this.addLog(`🔄 ${next.name}의 턴`, 'log-turn');

    // AI 턴이면 자동으로 수행
    if (GameState.isAIMode && next.isAI) {
      setTimeout(() => this.doAITurn(), 900);
    }
  },

  // ── AI 턴 수행 ────────────────────────
  doAITurn() {
    if (GameState.isGameOver) return;
    const p = GameState.players[GameState.currentTurn];
    if (!p.isAI) return;

    const result = AIEngine.think(GameState.currentTurn, p.difficulty);
    if (!result) return;

    const [r, c] = result;
    const x = GameState.indexToCoord(c);
    const y = GameState.indexToCoord(r);

    this.addLog(`🤖 ${p.name} 생각 중…`, 'log-system');
    // 슬라이더도 AI 위치에 맞춰 시각적으로 이동
    const xSlider = document.getElementById('slider-x');
    const ySlider = document.getElementById('slider-y');
    if (xSlider) { xSlider.value = x; }
    if (ySlider) { ySlider.value = y; }
    PlayerState.selectedX = x;
    PlayerState.selectedY = y;
    this.updateCoordDisplay();
    this.drawGrid(); // 조준 표시

    // 실제 배치는 0.6초 지연 (연출 효과)
    setTimeout(() => this.placeMarker(x, y, GameState.currentTurn), 600);
  },

  // ── 슬라이더 & 좌표 표시 업데이트 ────
  updateSliderCoords() {
    const xEl = document.getElementById('slider-x');
    const yEl = document.getElementById('slider-y');
    PlayerState.selectedX = parseInt(xEl?.value ?? 0);
    PlayerState.selectedY = parseInt(yEl?.value ?? 0);
    this.updateCoordDisplay();
    this.drawGrid();
  },

  updateCoordDisplay() {
    const xCur = document.getElementById('x-current-val');
    const yCur = document.getElementById('y-current-val');
    const xy   = document.getElementById('coord-xy-value');
    if (xCur) xCur.textContent = `X: ${PlayerState.selectedX}`;
    if (yCur) yCur.textContent = `Y: ${PlayerState.selectedY}`;
    if (xy)   xy.textContent   = `( ${PlayerState.selectedX} , ${PlayerState.selectedY} )`;
    const btn = document.getElementById('btn-confirm-coord');
    if (btn) btn.disabled = GameState.players[GameState.currentTurn]?.isAI ?? false;
  },

  // ══════════════════════════════════════════════
  //  Canvas 그리기
  // ══════════════════════════════════════════════
  drawGrid(winnerIdx = null) {
    const canvas = document.getElementById('coordinate-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const step = size / 12;

    // 배경
    ctx.fillStyle = '#1a0f07';
    ctx.fillRect(0, 0, size, size);

    // 모눈선
    ctx.strokeStyle = 'rgba(78,122,90,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      const p = i * step;
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    }

    // X축 / Y축
    ctx.strokeStyle = 'rgba(78,181,112,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, center); ctx.lineTo(size, center); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center, 0); ctx.lineTo(center, size); ctx.stroke();

    // 눈금 숫자
    ctx.fillStyle = '#d9b48f';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let v = -5; v <= 5; v++) {
      if (v === 0) { ctx.fillText('0', center - 12, center + 12); continue; }
      const pos = center + (v * step);
      ctx.fillText(v.toString(), pos, center + 14);
      ctx.fillText((-v).toString(), center - 14, pos);
    }

    // 사분면 로마자
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('I',   center + size/4, center - size/4);
    ctx.fillText('II',  center - size/4, center - size/4);
    ctx.fillText('III', center - size/4, center + size/4);
    ctx.fillText('IV',  center + size/4, center + size/4);

    // 보드 위 마커 렌더링
    if (GameState.board) {
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          const playerIdx = GameState.board[r][c];
          if (playerIdx === null) continue;
          const px = center + ((c - 5) * step);
          const py = center - ((r - 5) * step);
          const color = GameState.players[playerIdx]?.color ?? '#ffffff';

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, step * 0.38, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // 이니셜 표시
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.floor(step * 0.35)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(GameState.players[playerIdx]?.name[0] ?? '?', px, py);
        }
      }
    }

    // 현재 선택 좌표 조준선 + 점
    this.drawTargetIndicator(ctx, center, step);

    // 승리자 이름 오버레이
    if (winnerIdx !== null && GameState.players[winnerIdx]) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, size/2 - 40, size, 80);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🏆 ${GameState.players[winnerIdx].name} 승리!`, center, size/2);
    }
  },

  drawTargetIndicator(ctx, center, step) {
    if (GameState.isGameOver) return;
    const x = PlayerState.selectedX;
    const y = PlayerState.selectedY;
    const cx = center + (x * step);
    const cy = center - (y * step);

    ctx.strokeStyle = 'rgba(241,196,15,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(ctx.canvas.width, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ctx.canvas.height); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = 'rgba(241,196,15,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
  }
};

// ══════════════════════════════════════════════
//  이벤트 리스너 초기화
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  window.UI = UI;

  // 닉네임 → 뱃지 실시간 반영
  document.getElementById('input-nickname')?.addEventListener('input', e => {
    const el = document.getElementById('preview-nickname');
    if (el) el.textContent = e.target.value.trim() || '모험가';
  });

  // 아바타 라디오
  document.getElementById('avatar-male')?.addEventListener('change', () => PlayerState.avatar = 'male');
  document.getElementById('avatar-female')?.addEventListener('change', () => PlayerState.avatar = 'female');

  // 방 공개/비공개 토글
  document.getElementById('room-public')?.addEventListener('change', () => {
    const g = document.getElementById('password-group');
    if (g) g.style.display = 'none';
  });
  document.getElementById('room-private')?.addEventListener('change', () => {
    const g = document.getElementById('password-group');
    if (g) g.style.display = 'block';
  });

  // 슬라이더
  document.getElementById('slider-x')?.addEventListener('input', () => UI.updateSliderCoords());
  document.getElementById('slider-y')?.addEventListener('input', () => UI.updateSliderCoords());

  // 좌표 확인 버튼
  document.getElementById('btn-confirm-coord')?.addEventListener('click', () => UI.confirmCoord());

  initParticles();
  console.log('🎮 픽셀 이스케이프 초기화 완료');
});

function initParticles() {
  const c = document.getElementById('dustParticles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    const sz = Math.random() * 4 + 2;
    p.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;background:rgba(241,196,15,0.4);
      border-radius:50%;top:${Math.random()*100}%;left:${Math.random()*100}%;
      animation:floatParticle ${Math.random()*10+10}s linear infinite;
      animation-delay:${Math.random()*-20}s;`;
    c.appendChild(p);
  }
}

const _ps = document.createElement('style');
_ps.textContent = `@keyframes floatParticle{0%{transform:translateY(0) scale(1);opacity:0}10%{opacity:.8}90%{opacity:.8}100%{transform:translateY(-120px) scale(0.6);opacity:0}}`;
document.head.appendChild(_ps);
