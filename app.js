/**
 * 픽셀 이스케이프: 차원 탈출 서바이벌
 * ─ UI 컨트롤러 + 게임 엔진 + AI 엔진
 *
 * [3목 승리 조건] 가로, 세로, 대각선 중 한 방향으로 3개의 마커가 놓이면 승리합니다.
 * [이동 규칙] X축 또는 Y축 중 하나의 좌표만 직전 위치와 다르게 움직여 배치해야 합니다.
 * [마커 상점] 획득한 코인으로 그라데이션이 적용된 불꽃, 무궁화, 별 마커를 구매 및 적용할 수 있습니다.
 */

// ══════════════════════════════════════════════
//  전역 상태 (아바타/오라가 제거되고 마커 장착으로 최적화)
// ══════════════════════════════════════════════
const PlayerState = {
  nickname: '모험가',
  wins: 0,
  coins: 0,
  markerSkin: 'marker_normal',
  currentRoom: null,
  selectedX: 0,
  selectedY: 0,
  isSpectating: false
};

const PreviewState = {
  markerSkin: 'marker_normal'
};

const AIMatchConfig = {
  aiCount: 1,
  difficulty: 'easy'
};

// ══════════════════════════════════════════════
//  게임 보드 상태 (3목 최적화)
// ══════════════════════════════════════════════
const GameState = {
  board: null,
  players: [],
  currentTurn: 0,
  isGameOver: false,
  isAIMode: false,
  timerInterval: null,
  timeLeft: 30,
  lastX: null,
  lastY: null,
  isFirstMove: true,

  coordToIdx(v) { return v + 5; },
  idxToCoord(i) { return i - 5; },

  init(players, isAI) {
    this.board = Array.from({ length: 11 }, () => Array(11).fill(null));
    this.players = players.map(p => {
      p.markerSkin = p.isAI ? 'marker_normal' : PlayerState.markerSkin;
      return p;
    });
    this.currentTurn = 0;
    this.isGameOver = false;
    this.isAIMode = isAI;
    this.timeLeft = 30;
    this.lastX = null;
    this.lastY = null;
    this.isFirstMove = true;
  },

  canPlace(x, y) {
    if (x < -5 || x > 5 || y < -5 || y > 5) return false;
    return this.board[this.coordToIdx(y)][this.coordToIdx(x)] === null;
  },

  isValidMove(x, y) {
    if (!this.canPlace(x, y)) return false;
    if (this.isFirstMove) return true;
    const sameX = (x === this.lastX);
    const sameY = (y === this.lastY);
    return sameX !== sameY;
  },

  place(x, y, playerIdx) {
    if (!this.isValidMove(x, y)) return false;
    this.board[this.coordToIdx(y)][this.coordToIdx(x)] = playerIdx;
    this.lastX = x;
    this.lastY = y;
    this.isFirstMove = false;
    return true;
  },

  checkWin(playerIdx) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        if (this.board[r][c] !== playerIdx) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let s = 1; s < 3; s++) {
            const nr = r + dr*s, nc = c + dc*s;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) break;
            if (this.board[nr][nc] !== playerIdx) break;
            count++;
          }
          if (count >= 3) return true;
        }
      }
    }
    return false;
  },

  isFull() {
    return this.board.every(row => row.every(c => c !== null));
  },

  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
  },

  validMoves() {
    const moves = [];
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        if (this.board[r][c] !== null) continue;
        const x = this.idxToCoord(c);
        const y = this.idxToCoord(r);
        if (this.isValidMove(x, y)) moves.push([r, c]);
      }
    }
    if (moves.length === 0) {
      for (let r = 0; r < 11; r++)
        for (let c = 0; c < 11; c++)
          if (this.board[r][c] === null) moves.push([r, c]);
    }
    return moves;
  }
};

// ══════════════════════════════════════════════
//  AI 엔진 (3목 최적화 규칙)
// ══════════════════════════════════════════════
const AIEngine = {
  findNInARow(playerIdx, n, validMoves) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    const validSet = new Set(validMoves.map(([r,c]) => `${r},${c}`));
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        for (const [dr, dc] of dirs) {
          const cells = [];
          let ok = true;
          for (let s = 0; s < n; s++) {
            const nr = r + dr*s, nc = c + dc*s;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) { ok = false; break; }
            cells.push([nr, nc]);
          }
          if (!ok) continue;
          const owned = cells.filter(([nr,nc]) => GameState.board[nr][nc] === playerIdx).length;
          const empty = cells.filter(([nr,nc]) => GameState.board[nr][nc] === null);
          if (owned === n - 1 && empty.length === 1) {
            const [er, ec] = empty[0];
            if (validSet.has(`${er},${ec}`)) return [er, ec];
          }
        }
      }
    }
    return null;
  },

  bestStrategicCell(playerIdx, validMoves) {
    if (!validMoves.length) return null;
    const scored = validMoves.map(([r, c]) => {
      let score = 0;
      const dirs = [[1,0],[0,1],[1,1],[1,-1]];
      for (const [dr, dc] of dirs) {
        for (let s = -2; s <= 0; s++) {
          const win = [];
          let valid = true;
          for (let k = 0; k < 3; k++) {
            const nr = r + (s+k)*dr, nc = c + (s+k)*dc;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) { valid = false; break; }
            win.push(GameState.board[nr][nc]);
          }
          if (!valid) continue;
          const my = win.filter(v => v === playerIdx).length;
          const empty = win.filter(v => v === null).length;
          if (my + empty === 3) score += my * my * 15;
        }
      }
      score += Math.max(0, 10 - Math.abs(r-5) - Math.abs(c-5));
      return { r, c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return [scored[0].r, scored[0].c];
  },

  think(aiPlayerIdx, difficulty) {
    const valid = GameState.validMoves();
    if (!valid.length) return null;
    if (difficulty === 'easy') return valid[Math.floor(Math.random() * valid.length)];
    if (difficulty === 'normal') {
      const win = this.findNInARow(aiPlayerIdx, 3, valid);
      if (win) return win;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const block = this.findNInARow(p, 3, valid);
        if (block) return block;
      }
      return valid[Math.floor(Math.random() * valid.length)];
    }
    if (difficulty === 'hard') {
      const win3 = this.findNInARow(aiPlayerIdx, 3, valid);
      if (win3) return win3;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const b3 = this.findNInARow(p, 3, valid);
        if (b3) return b3;
      }
      const ext2 = this.findNInARow(aiPlayerIdx, 2, valid);
      if (ext2) return ext2;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const b2 = this.findNInARow(p, 2, valid);
        if (b2) return b2;
      }
      return this.bestStrategicCell(aiPlayerIdx, valid) ?? valid[0];
    }
    return valid[Math.floor(Math.random() * valid.length)];
  }
};

// ══════════════════════════════════════════════
//  마커 상점 데이터 (각 2코인)
// ══════════════════════════════════════════════
const ShopData = {
  marker: [
    { id: 'marker_normal', name: '기본 마커', price: 0, icon: '🔴', purchased: true, equipped: true },
    { id: 'marker_flame', name: '불꽃 마커', price: 2, icon: '🔥', purchased: false, equipped: false },
    { id: 'marker_rose', name: '무궁화 마커', price: 2, icon: '🌺', purchased: false, equipped: false },
    { id: 'marker_star', name: '별 마커', price: 2, icon: '⭐', purchased: false, equipped: false }
  ]
};

let MockRooms = [
  { id: 'room_1', name: '좌표 마스터들의 전쟁',       maxPlayers: 4, currentPlayers: 3, status: '대기중', isPrivate: false, players: ['알파', '베타', '감마'] },
  { id: 'room_2', name: '중1 수학 정복방 (비번 1234)', maxPlayers: 2, currentPlayers: 1, status: '대기중', isPrivate: true,  players: ['델타'] },
  { id: 'room_3', name: '차원탈출 고수만 컴온',        maxPlayers: 4, currentPlayers: 4, status: '게임중', isPrivate: false, players: ['A', 'B', 'C', 'D'] }
];

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

// ══════════════════════════════════════════════
//  UI 모듈
// ══════════════════════════════════════════════
const UI = {
  navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (!target) return;
    target.classList.add('active');
    this.showToast(`🗺️ ${this.getScreenName(screenId)}`);
    if (screenId === 'screen-room-list') this.renderRooms();
    else if (screenId === 'screen-shop') {
      this.syncPreviewWithEquipped();
      this.renderShop();
      this.updateMarkerPreview();
    } else if (screenId === 'screen-game') this.initGameBoard();
  },

  getScreenName(id) {
    return { 'screen-lobby':'메인 로비','screen-room-list':'대기실','screen-shop':'마커 상점','screen-game':'게임' }[id] || '?';
  },

  openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('active'); if (id === 'modal-admin') this.renderAdminConsole(); }
  },
  closeModal(id) { document.getElementById(id)?.classList.remove('active'); },

  showToast(msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(-10px)'; setTimeout(()=>t.remove(),300); }, 2500);
  },

  enterLobby() {
    const nick = document.getElementById('input-nickname')?.value.trim();
    if (!nick || nick.length < 2) { this.showToast('⚠️ 닉네임을 2자 이상 입력하세요!'); return; }
    PlayerState.nickname = nick;
    document.getElementById('header-nickname').textContent = nick;
    this.updateCoinsDisplay();
    document.getElementById('header-wins').textContent = `🏆 ${PlayerState.wins}`;
    this.showToast(`👋 환영합니다, ${nick}!`);
    this.navigateTo('screen-room-list');
  },

  updateCoinsDisplay() {
    const headerCoins = document.getElementById('header-coins');
    const shopCoins = document.getElementById('shop-coins');
    if (headerCoins) headerCoins.textContent = `🪙 ${PlayerState.coins}`;
    if (shopCoins) shopCoins.textContent = PlayerState.coins;
  },

  openAIMatchModal() {
    const nick = document.getElementById('input-nickname')?.value.trim();
    if (!nick || nick.length < 2) { this.showToast('⚠️ 먼저 닉네임을 입력하세요!'); return; }
    PlayerState.nickname = nick;
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
    PlayerState.coins += 1;
    this.updateCoinsDisplay();
    const diffLabel = { easy:'초급', normal:'중급', hard:'고급' }[AIMatchConfig.difficulty];
    const players = [{ name: PlayerState.nickname, color: PLAYER_COLORS[0], isAI: false }];
    for (let i = 1; i <= AIMatchConfig.aiCount; i++)
      players.push({ name:`AI_${i}(${diffLabel})`, color: PLAYER_COLORS[i % PLAYER_COLORS.length], isAI:true, difficulty: AIMatchConfig.difficulty });

    PlayerState.currentRoom = {
      id: `ai_${Date.now()}`, name:`🤖 AI 대전 (${diffLabel})`,
      maxPlayers: players.length, currentPlayers: players.length,
      status:'게임중', isPrivate:false, players: players.map(p=>p.name)
    };
    GameState.init(players, true);
    this.showToast(`⚔️ 대전 참가! 🪙 1코인 획득!`);
    this.navigateTo('screen-game');
  },

  switchRulesTab(name) {
    document.querySelectorAll('.rules-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.rules-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`rtab-${name}`)?.classList.add('active');
    document.getElementById(`rcontent-${name}`)?.classList.add('active');
  },

  syncPreviewWithEquipped() {
    const eq = ShopData.marker.find(i => i.equipped);
    if (eq) PreviewState.markerSkin = eq.id;
  },

  renderShop() {
    const grid = document.getElementById('grid-marker');
    if (!grid) return;
    grid.innerHTML = '';
    ShopData.marker.forEach(item => {
      const card = document.createElement('div');
      card.className = `shop-item-card${PreviewState.markerSkin===item.id?' equipped':''}`;
      let badge = item.equipped
        ? `<span style="position:absolute;top:4px;left:4px;background:var(--green-light);font-size:.65rem;padding:1px 4px;border-radius:4px;color:#fff;">장착됨</span>`
        : item.purchased
          ? `<span style="position:absolute;top:4px;left:4px;background:var(--wood-light);font-size:.65rem;padding:1px 4px;border-radius:4px;color:#fff;">보유</span>`
          : '';
      card.innerHTML = `${badge}<div class="shop-item-icon-box"><span style="font-size:2.2rem;">${item.icon}</span></div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price-tag">${item.price===0||item.purchased?'보유중':`🪙 ${item.price}`}</div>`;
      card.onclick = () => this.selectMarkerForPreview(item);
      grid.appendChild(card);
    });
  },

  selectMarkerForPreview(item) {
    PreviewState.markerSkin = item.id;
    this.renderShop();
    this.updateMarkerPreview();
  },

  updateMarkerPreview() {
    const canvas = document.getElementById('shop-preview-marker-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a0f07';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(78, 122, 90, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(120, 60); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(60, 120); ctx.stroke();
      const markerId = PreviewState.markerSkin;
      drawMarkerBySkin(ctx, 60, 60, 36, markerId, PLAYER_COLORS[0]);
    }
    const item = ShopData.marker.find(i => i.id === PreviewState.markerSkin);
    const pName = document.getElementById('shop-preview-name');
    if (pName && item) pName.textContent = item.name;
    const list = document.getElementById('shop-preview-items');
    if (!list || !item) return;
    list.innerHTML = '';
    const st = item.purchased
      ? `<span style="color:var(--green-bright);">[보유]</span>`
      : `<span style="color:var(--gold);">[미보유: 🪙${item.price}]</span>`;
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap;font-size:.8rem;';
    d.innerHTML = `<span>선택 스킨: ${item.name}</span>${st}`;
    list.appendChild(d);
  },

  applyPreviewItems() {
    const item = ShopData.marker.find(i => i.id === PreviewState.markerSkin);
    if (!item) return;
    if (!item.purchased) {
      if (PlayerState.coins < item.price) {
        this.showToast(`⚠️ 코인 부족! (필요:🪙${item.price}/보유:🪙${PlayerState.coins})`);
        return;
      }
      if (!confirm(`🪙 [${item.name}] 스킨을 ${item.price}코인에 구매하시겠습니까?`)) return;
      PlayerState.coins -= item.price;
      this.updateCoinsDisplay();
      item.purchased = true;
    }
    ShopData.marker.forEach(i => i.equipped = (i.id === item.id));
    PlayerState.markerSkin = item.id;
    this.renderShop();
    this.updateMarkerPreview();
    this.showToast('✨ 마커 스킨 장착 완료!');
  },

  renderRooms() {
    const grid = document.getElementById('rooms-grid');
    if (!grid) return;
    const cnt = document.getElementById('room-count');
    grid.innerHTML = '';
    if (cnt) cnt.textContent = MockRooms.length;
    if (!MockRooms.length) { grid.innerHTML = `<div class="empty-rooms">열린 방이 없어요.</div>`; return; }
    MockRooms.forEach(room => {
      const fill = (room.currentPlayers / room.maxPlayers) * 100;
      const card = document.createElement('div');
      card.className = 'room-card wood-panel';
      card.innerHTML = `<div class="room-name">${room.name}</div>
        <div class="room-status">${room.status}</div>
        <div class="player-count-bar"><div class="player-count-fill" style="width:${fill}%"></div></div>`;
      card.onclick = () => this.tryEnterRoom(room);
      grid.appendChild(card);
    });
  },

  tryEnterRoom(room) {
    if (room.status === '게임중') { this.openSpectateModal(room); return; }
    if (room.isPrivate && prompt('🔑 비밀번호:') !== '1234') { this.showToast('❌ 비밀번호 오류'); return; }
    PlayerState.coins += 1;
    this.updateCoinsDisplay();
    PlayerState.currentRoom = room;
    const players = room.players.map((n, i) => ({ name:n, color:PLAYER_COLORS[i%PLAYER_COLORS.length], isAI:false }));
    GameState.init(players, false);
    this.showToast(`🚪 참가 코인 1코인 획득!`);
    this.navigateTo('screen-game');
  },

  openSpectateModal(room) {
    PlayerState.currentRoom = room;
    const el = document.getElementById('spectate-room-info');
    if (el) el.textContent = `방 이름: ${room.name}`;
    this.openModal('modal-spectate');
  },
  enterSpectateMode() {
    this.closeModal('modal-spectate'); PlayerState.isSpectating = true;
    this.showToast(`👁️ 관전 모드`);
    this.navigateTo('screen-game');
  },

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
    PlayerState.coins += 1;
    this.updateCoinsDisplay();
    const room = { id:`room_${Date.now()}`, name, maxPlayers:this.selectedMaxPlayers, currentPlayers:1, status:'대기중', isPrivate, players:[PlayerState.nickname] };
    MockRooms.push(room);
    this.closeModal('modal-create-room');
    PlayerState.currentRoom = room;
    GameState.init([{name:PlayerState.nickname, color:PLAYER_COLORS[0], isAI:false}], false);
    this.showToast(`🚀 방 생성! 참가 코인 1코인 획득!`);
    this.navigateTo('screen-game');
  },

  renderAdminConsole() {
    const grid = document.getElementById('admin-rooms-grid');
    if (!grid) return;
    grid.innerHTML = '';
    MockRooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'admin-room-card';
      card.innerHTML = `<div>🗺️ ${room.name}</div>`;
      card.onclick = () => { this.closeModal('modal-admin'); this.openSpectateModal(room); };
      grid.appendChild(card);
    });
  },

  initGameBoard() {
    const room = PlayerState.currentRoom;
    const rn = document.getElementById('hud-room-name');
    if (rn) rn.textContent = room?.name ?? '개인 연습실';
    this.updateCoinsDisplay();
    this.renderPlayerPanels();
    this.updateHUDTurn();
    const xs = document.getElementById('slider-x');
    const ys = document.getElementById('slider-y');
    if (xs) xs.value = 0;
    if (ys) ys.value = 0;
    PlayerState.selectedX = 0; PlayerState.selectedY = 0;
    this.updateCoordDisplay();
    this.drawGrid();
    this.startTurnTimer();
    if (GameState.isAIMode && GameState.players[0]?.isAI) setTimeout(() => this.doAITurn(), 800);
  },

  renderPlayerPanels() {
    const mini = document.getElementById('player-list-mini');
    const left = document.getElementById('player-cards-left');
    if (mini) mini.innerHTML = '';
    if (left) left.innerHTML = '';
    GameState.players.forEach((p, idx) => {
      if (mini) {
        const el = document.createElement('div');
        el.className = `mini-card ${idx===GameState.currentTurn?'active-turn':''}`;
        el.style.borderColor = p.color;
        el.innerHTML = `<div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${p.color};"></div>`;
        mini.appendChild(el);
      }
      if (left) {
        const el = document.createElement('div');
        el.className = `game-player-card ${idx===GameState.currentTurn?'active-turn':''}`;
        el.innerHTML = `
          <div class="game-player-avatar-box" style="border-left:3px solid ${p.color}; background-color: var(--wood-darkest); color: ${p.color}; font-size: 1.4rem; font-weight: bold; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 4px;">
            ${p.name[0]}
          </div>
          <div class="player-details">
            <div class="p-name">${p.isAI?'🤖 ':''}${p.name}</div>
            <div class="p-score" id="score-${idx}">🏆 0승</div>
          </div>`;
        left.appendChild(el);
      }
    });
  },

  updateHUDTurn() {
    const isMyTurn = !GameState.players[GameState.currentTurn]?.isAI;
    const confirmBtn = document.getElementById('btn-confirm-coord');
    if (confirmBtn) confirmBtn.disabled = !isMyTurn;
  },

  startTurnTimer() {
    if (GameState.timerInterval) clearInterval(GameState.timerInterval);
    GameState.timeLeft = 30;
    GameState.timerInterval = setInterval(() => {
      if (GameState.isGameOver) { clearInterval(GameState.timerInterval); return; }
      GameState.timeLeft--;
      if (GameState.timeLeft <= 0) {
        clearInterval(GameState.timerInterval);
        this.advanceTurn();
      }
    }, 1000);
  },

  addLog(msg, cls='log-action') {
    const log = document.getElementById('game-log');
    if (!log) return;
    const d = document.createElement('div');
    d.className = `log-entry ${cls}`; d.textContent = msg;
    log.prepend(d);
  },

  confirmCoord() {
    if (GameState.isGameOver) return;
    const p = GameState.players[GameState.currentTurn];
    if (p?.isAI) return;
    this.placeMarker(PlayerState.selectedX, PlayerState.selectedY, GameState.currentTurn);
  },

  placeMarker(x, y, playerIdx) {
    if (!GameState.place(x, y, playerIdx)) {
      this.showToast('⚠️ 배치 실패');
      return;
    }
    const p = GameState.players[playerIdx];
    this.addLog(`🎯 ${p.name} → (${x}, ${y})`, 'log-action');
    this.drawGrid();
    if (GameState.checkWin(playerIdx)) {
      GameState.isGameOver = true;
      clearInterval(GameState.timerInterval);
      if (!p.isAI) {
        PlayerState.wins++;
        PlayerState.coins += 3;
        this.updateCoinsDisplay();
        this.addLog(`🏆 ${p.name} 승리! 🪙 3코인 획득!`, 'log-system');
      } else {
        this.addLog(`🏆 ${p.name} 승리!`, 'log-system');
      }
      this.showToast(`🏆 ${p.name} 승리!`);
      this.drawGrid(playerIdx);
      return;
    }
    if (GameState.isFull()) {
      GameState.isGameOver = true;
      this.addLog('🤝 무승부!', 'log-system');
      this.showToast('🤝 무승부!');
      return;
    }
    this.advanceTurn();
  },

  advanceTurn() {
    GameState.nextTurn();
    this.updateHUDTurn();
    this.startTurnTimer();
    const next = GameState.players[GameState.currentTurn];
    this.addLog(`🔄 ${next.name}의 턴`, 'log-turn');
    this.drawGrid();
    if (GameState.isAIMode && next.isAI) setTimeout(() => this.doAITurn(), 900);
  },

  doAITurn() {
    if (GameState.isGameOver) return;
    const p = GameState.players[GameState.currentTurn];
    if (!p?.isAI) return;
    const result = AIEngine.think(GameState.currentTurn, p.difficulty);
    if (!result) { this.advanceTurn(); return; }
    const [r, c] = result;
    const x = GameState.idxToCoord(c), y = GameState.idxToCoord(r);
    this.addLog(`🤖 ${p.name} 생각 중…`, 'log-system');
    PlayerState.selectedX = x; PlayerState.selectedY = y;
    this.updateCoordDisplay();
    this.drawGrid();
    setTimeout(() => this.placeMarker(x, y, GameState.currentTurn), 600);
  },

  updateSliderCoords() {
    const xs = document.getElementById('slider-x'), ys = document.getElementById('slider-y');
    PlayerState.selectedX = parseInt(xs?.value ?? 0);
    PlayerState.selectedY = parseInt(ys?.value ?? 0);
    this.updateCoordDisplay();
    this.drawGrid();
  },

  updateCoordDisplay() {
    const xCur = document.getElementById('x-current-val'), yCur = document.getElementById('y-current-val'), xy = document.getElementById('coord-xy-value');
    if (xCur) xCur.textContent = `X: ${PlayerState.selectedX}`;
    if (yCur) yCur.textContent = `Y: ${PlayerState.selectedY}`;
    if (xy) xy.textContent = `( ${PlayerState.selectedX} , ${PlayerState.selectedY} )`;
    const confirmBtn = document.getElementById('btn-confirm-coord');
    if (confirmBtn && !GameState.players[GameState.currentTurn]?.isAI) {
      const isValid = GameState.isValidMove(PlayerState.selectedX, PlayerState.selectedY);
      confirmBtn.disabled = !isValid;
      confirmBtn.style.opacity = isValid ? '1' : '0.4';
    }
  },

  drawGrid(winnerIdx = null) {
    const canvas = document.getElementById('coordinate-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), size = canvas.width, center = size / 2, step = size / 12;
    ctx.fillStyle = '#1a0f07'; ctx.fillRect(0, 0, size, size);
    if (!GameState.isGameOver && !GameState.isFirstMove) {
      ctx.fillStyle = 'rgba(46,181,112,0.08)';
      ctx.fillRect(0, center - (GameState.lastY * step) - step/2, size, step);
      ctx.fillRect(center + (GameState.lastX * step) - step/2, 0, step, size);
    }
    ctx.strokeStyle = 'rgba(78,122,90,0.25)';
    for (let i = 1; i < 12; i++) {
      ctx.beginPath(); ctx.moveTo(0, i*step); ctx.lineTo(size, i*step); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i*step, 0); ctx.lineTo(i*step, size); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(78,181,112,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, center); ctx.lineTo(size, center); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center, 0); ctx.lineTo(center, size); ctx.stroke();
    if (GameState.board) {
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          const pIdx = GameState.board[r][c];
          if (pIdx === null) continue;
          const px = center + ((c-5) * step), py = center - ((r-5) * step);
          const player = GameState.players[pIdx];
          drawMarkerBySkin(ctx, px, py, step * 0.38, player?.markerSkin ?? 'marker_normal', player?.color ?? '#ff0000');
        }
      }
    }
    this.drawTargetIndicator(ctx, center, step);
    if (winnerIdx !== null && GameState.players[winnerIdx]) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, size/2-40, size, 80);
      ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(`🏆 ${GameState.players[winnerIdx].name} 승리!`, center, size/2);
    }
  },

  drawTargetIndicator(ctx, center, step) {
    if (GameState.isGameOver) return;
    const x = PlayerState.selectedX, y = PlayerState.selectedY;
    const cx = center + (x * step), cy = center - (y * step);
    const isValid = GameState.isValidMove(x, y);
    ctx.strokeStyle = isValid ? 'rgba(241,196,15,0.3)' : 'rgba(231,76,60,0.3)';
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(ctx.canvas.width, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ctx.canvas.height); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isValid ? '#f1c40f' : '#e74c3c'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI*2); ctx.fill();
  }
};

function drawMarkerBySkin(ctx, cx, cy, radius, skinId, mainColor) {
  if (skinId === 'marker_flame') drawFlameMarker(ctx, cx, cy, radius);
  else if (skinId === 'marker_rose') drawRoseMarker(ctx, cx, cy, radius);
  else if (skinId === 'marker_star') drawStarMarker(ctx, cx, cy, radius);
  else drawNormalMarker(ctx, cx, cy, radius, mainColor);
}

function drawNormalMarker(ctx, cx, cy, radius, mainColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, '#ffffff'); // 하이라이트
  grad.addColorStop(0.2, lightenColor(mainColor, 35));
  grad.addColorStop(0.8, mainColor);
  grad.addColorStop(1, darkenColor(mainColor, 35));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawFlameMarker(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.bezierCurveTo(radius * 0.5, -radius * 0.4, radius * 0.8, 0, radius * 0.6, radius * 0.6);
  ctx.bezierCurveTo(radius * 0.4, radius * 0.9, -radius * 0.4, radius * 0.9, -radius * 0.6, radius * 0.6);
  ctx.bezierCurveTo(-radius * 0.8, 0, -radius * 0.5, -radius * 0.4, 0, -radius);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, -radius, 0, radius);
  grad.addColorStop(0, '#ffeb3b'); // 노란 불꽃 끝
  grad.addColorStop(0.5, '#ff9800'); // 주황 불꽃 중간
  grad.addColorStop(1, '#e64a19'); // 주황붉은 불꽃 밑둥
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawRoseMarker(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.5, radius * 0.35, radius * 0.5, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(0, 0, 1, 0, -radius * 0.5, radius * 0.6);
    grad.addColorStop(0, '#e91e63'); // 핫핑크
    grad.addColorStop(0.4, '#f06292');
    grad.addColorStop(1, '#f8bbd0'); // 연분홍 겉잎
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.rotate((Math.PI * 2) / 5);
  }
  // 꽃술 원형
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.25, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.25);
  coreGrad.addColorStop(0, '#ffeb3b');
  coreGrad.addColorStop(1, '#fbc02d');
  ctx.fillStyle = coreGrad;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

function drawStarMarker(ctx, cx, cy, radius) {
  ctx.save();
  const spikes = 5;
  const outerRadius = radius;
  const innerRadius = radius * 0.45;
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;
    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();

  const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  grad.addColorStop(0, '#ffd54f'); // 황금 노랑
  grad.addColorStop(0.5, '#ffb300');
  grad.addColorStop(1, '#ff8f00'); // 황금 주황
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function lightenColor(hex, percent) {
  const num = parseInt(hex.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = (num >> 8 & 0x00FF) + amt,
        B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}

function darkenColor(hex, percent) {
  const num = parseInt(hex.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) - amt,
        G = (num >> 8 & 0x00FF) - amt,
        B = (num & 0x0000FF) - amt;
  return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}

window.addEventListener('DOMContentLoaded', () => {
  window.UI = UI;
  document.getElementById('input-nickname')?.addEventListener('input', e => {
    const el = document.getElementById('preview-nickname');
    if (el) el.textContent = e.target.value.trim() || '모험가';
  });

  // 아바타 라디오
  document.getElementById('avatar-male')?.addEventListener('change', () => { PlayerState.avatar = 'male'; });
  document.getElementById('avatar-female')?.addEventListener('change', () => { PlayerState.avatar = 'female'; });

  // 방 공개/비공개
  document.getElementById('room-public')?.addEventListener('change', () => {
    const g = document.getElementById('password-group'); if (g) g.style.display = 'none';
  });
  document.getElementById('room-private')?.addEventListener('change', () => {
    const g = document.getElementById('password-group'); if (g) g.style.display = 'block';
  });

  // 슬라이더 — input 이벤트 (마우스/키보드)
  document.getElementById('slider-x')?.addEventListener('input', () => UI.updateSliderCoords());
  document.getElementById('slider-y')?.addEventListener('input', () => UI.updateSliderCoords());

  // ─ 터치 기반 슬라이더 제어 (태블릿) ─
  // touchmove의 passive:false + preventDefault로 페이지 스크롤 차단
  ['slider-x', 'slider-y'].forEach(id => {
    const slider = document.getElementById(id);
    if (!slider) return;

    slider.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    slider.addEventListener('touchmove', e => {
      e.preventDefault(); // 스크롤 차단
      e.stopPropagation();
    }, { passive: false });
    slider.addEventListener('touchend', () => UI.updateSliderCoords(), { passive: true });
  });

  // 좌표 확인 버튼
  document.getElementById('btn-confirm-coord')?.addEventListener('click', () => UI.confirmCoord());

  // 윈도우 리사이즈 시 게임 화면 캔버스 재드로우
  window.addEventListener('resize', () => {
    if (document.getElementById('screen-game')?.classList.contains('active')) {
      UI.drawGrid();
    }
  });

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
