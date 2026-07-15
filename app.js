/**
 * 픽셀 이스케이프: 차원 탈출 서바이벌
 * ─ UI 컨트롤러 + 게임 엔진 + AI 엔진
 *
 * [핵심 규칙] 마커를 놓을 때는 직전 마커(커서)와 비교하여
 *  X 값 또는 Y 값 중 하나만 변경된 좌표에만 놓을 수 있음.
 *  (첫 번째 이동은 제한 없음)
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
//  게임 보드 상태
// ══════════════════════════════════════════════
const GameState = {
  board: null,          // 11×11 배열 (row=Y 내림차순, col=X)
  players: [],
  currentTurn: 0,
  isGameOver: false,
  isAIMode: false,
  timerInterval: null,
  timeLeft: 30,

  // 직전 배치 좌표 (이동 제한 기준)
  lastX: null,
  lastY: null,
  isFirstMove: true,

  coordToIdx(v) { return v + 5; },
  idxToCoord(i) { return i - 5; },

  init(players, isAI) {
    this.board = Array.from({ length: 11 }, () => Array(11).fill(null));
    
    // 각 플레이어별 적용된 스킨의 avatarUrl 주입
    this.players = players.map(p => {
      if (p.isAI) {
        let aiAvatar = 'male';
        let aiHair = 'hair_normal';
        let aiCostume = 'costume_normal';
        if (p.difficulty === 'hard') {
          aiHair = 'hair_warrior';
          aiCostume = 'costume_armor';
          aiAvatar = 'male';
        } else if (p.difficulty === 'normal') {
          aiHair = 'hair_wizard';
          aiCostume = 'costume_robe';
          aiAvatar = 'female';
        }
        p.avatarUrl = UI.getAvatarImageBySpec(aiAvatar, aiHair, aiCostume);
      } else {
        p.avatarUrl = UI.getEquippedAvatarImage(PlayerState.avatar);
      }
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

  /**
   * 이동 규칙 검사: 첫 수는 자유, 이후는 직전 좌표와 X 또는 Y 중 하나만 달라야 함.
   */
  isValidMove(x, y) {
    if (!this.canPlace(x, y)) return false;
    if (this.isFirstMove) return true;
    const sameX = (x === this.lastX);
    const sameY = (y === this.lastY);
    // X만 다르거나, Y만 다른 경우만 허용 (둘 다 같으면 이미 놓여있어 false, 둘 다 다르면 규칙 위반)
    return sameX !== sameY; // XOR: 정확히 하나만 달라야 함
  },

  place(x, y, playerIdx) {
    if (!this.isValidMove(x, y)) return false;
    this.board[this.coordToIdx(y)][this.coordToIdx(x)] = playerIdx;
    this.lastX = x;
    this.lastY = y;
    this.isFirstMove = false;
    return true;
  },

  /** 4연속 승리 체크 */
  checkWin(playerIdx) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        if (this.board[r][c] !== playerIdx) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let s = 1; s < 4; s++) {
            const nr = r + dr*s, nc = c + dc*s;
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

  isFull() {
    return this.board.every(row => row.every(c => c !== null));
  },

  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
  },

  /** 유효한 이동 목록 반환 (빈 셀 + 이동 규칙 충족) */
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
    // 유효한 이동이 없으면 전체 빈 칸 허용 (deadlock 방지)
    if (moves.length === 0) {
      for (let r = 0; r < 11; r++)
        for (let c = 0; c < 11; c++)
          if (this.board[r][c] === null) moves.push([r, c]);
    }
    return moves;
  }
};

// ══════════════════════════════════════════════
//  AI 엔진 (규칙 준수 + 난이도별 전략)
// ══════════════════════════════════════════════
const AIEngine = {
  /** n연속 완성/차단 가능한 좌표 탐색 (유효 이동 내에서만) */
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

  /** 가중치 기반 최선 위치 (유효 이동 내에서) */
  bestStrategicCell(playerIdx, validMoves) {
    if (!validMoves.length) return null;

    const scored = validMoves.map(([r, c]) => {
      let score = 0;
      const dirs = [[1,0],[0,1],[1,1],[1,-1]];
      for (const [dr, dc] of dirs) {
        for (let s = -3; s <= 0; s++) {
          const win = [];
          let valid = true;
          for (let k = 0; k < 4; k++) {
            const nr = r + (s+k)*dr, nc = c + (s+k)*dc;
            if (nr < 0 || nr > 10 || nc < 0 || nc > 10) { valid = false; break; }
            win.push(GameState.board[nr][nc]);
          }
          if (!valid) continue;
          const my = win.filter(v => v === playerIdx).length;
          const empty = win.filter(v => v === null).length;
          if (my + empty === 4) score += my * my * 10;
        }
      }
      // 중앙 선호
      score += Math.max(0, 10 - Math.abs(r-5) - Math.abs(c-5));
      return { r, c, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return [scored[0].r, scored[0].c];
  },

  /** 난이도별 이동 결정 — 반드시 validMoves 내에서만 선택 */
  think(aiPlayerIdx, difficulty) {
    const valid = GameState.validMoves();
    if (!valid.length) return null;

    if (difficulty === 'easy') {
      // 초급: 유효 이동 중 랜덤
      return valid[Math.floor(Math.random() * valid.length)];
    }

    if (difficulty === 'normal') {
      // 중급: 이기는 수 → 막는 수 → 랜덤
      const win = this.findNInARow(aiPlayerIdx, 4, valid);
      if (win) return win;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const block = this.findNInARow(p, 4, valid);
        if (block) return block;
      }
      return valid[Math.floor(Math.random() * valid.length)];
    }

    if (difficulty === 'hard') {
      // 고급: 4연 완성 → 4연 차단 → 3연 연장 → 3연 차단 → 전략 배치
      const win4 = this.findNInARow(aiPlayerIdx, 4, valid);
      if (win4) return win4;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const b4 = this.findNInARow(p, 4, valid);
        if (b4) return b4;
      }
      const ext3 = this.findNInARow(aiPlayerIdx, 3, valid);
      if (ext3) return ext3;
      for (let p = 0; p < GameState.players.length; p++) {
        if (p === aiPlayerIdx) continue;
        const b3 = this.findNInARow(p, 3, valid);
        if (b3) return b3;
      }
      return this.bestStrategicCell(aiPlayerIdx, valid) ?? valid[0];
    }

    return valid[Math.floor(Math.random() * valid.length)];
  }
};

// ══════════════════════════════════════════════
//  상점 데이터
// ══════════════════════════════════════════════
const ShopData = {
  hair: [
    { id: 'hair_normal',  name: '기본 헤어',       price: 0,   icon: '💇', purchased: true,  equipped: true  },
    { id: 'hair_warrior', name: '전사의 불꽃 헤어', price: 50,  icon: '🔥', purchased: false, equipped: false },
    { id: 'hair_wizard',  name: '마법의 퍼플 헤어', price: 80,  icon: '🔮', purchased: false, equipped: false },
    { id: 'hair_crown',   name: '황금 왕관',        price: 150, icon: '👑', purchased: false, equipped: false }
  ],
  costume: [
    { id: 'costume_normal', name: '기본 탐험복',        price: 0,  icon: '👕', purchased: true,  equipped: true  },
    { id: 'costume_armor',  name: '강철 플레이트 아머', price: 60, icon: '🛡️', purchased: false, equipped: false },
    { id: 'costume_robe',   name: '대마법사 로브',       price: 90, icon: '🧥', purchased: false, equipped: false }
  ],
  aura: [
    { id: 'aura_none',   name: '없음',         price: 0,   icon: '❌', purchased: true,  equipped: true,  effect: null          },
    { id: 'aura_fire',   name: '이그니스 오라', price: 100, icon: '🔥', purchased: false, equipped: false, effect: 'aura-fire'   },
    { id: 'aura_ice',    name: '프로스트 오라', price: 100, icon: '❄️', purchased: false, equipped: false, effect: 'aura-ice'    },
    { id: 'aura_forest', name: '네이처 오라',   price: 120, icon: '🍃', purchased: false, equipped: false, effect: 'aura-forest' }
  ],
  slider: [
    { id: 'slider_normal', name: '나무 슬라이더',       price: 0,   icon: '🪵', purchased: true,  equipped: true  },
    { id: 'slider_gold',   name: '황금 슬라이더',        price: 200, icon: '🔱', purchased: false, equipped: false },
    { id: 'slider_neon',   name: '차원 레이저 슬라이더', price: 300, icon: '⚡', purchased: false, equipped: false }
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
      this.switchShopTab('aura');
    } else if (screenId === 'screen-game') this.initGameBoard();
  },

  getScreenName(id) {
    return { 'screen-lobby':'메인 로비','screen-room-list':'대기실','screen-shop':'아바타 상점','screen-game':'게임' }[id] || '?';
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

  // ── 로비 ──────────────────────────────
  enterLobby() {
    const nick = document.getElementById('input-nickname')?.value.trim();
    if (!nick || nick.length < 2) { this.showToast('⚠️ 닉네임을 2자 이상 입력하세요!'); return; }
    PlayerState.nickname = nick;
    PlayerState.avatar = document.querySelector('input[name="avatar"]:checked')?.value ?? 'male';
    document.getElementById('header-nickname').textContent = nick;
    document.getElementById('header-avatar-img').src = this.getEquippedAvatarImage(PlayerState.avatar);
    document.getElementById('header-wins').textContent = `🏆 ${PlayerState.wins}`;
    this.showToast(`👋 환영합니다, ${nick}!`);
    this.navigateTo('screen-room-list');
  },

  // ── AI 대전 ───────────────────────────
  openAIMatchModal() {
    const nick = document.getElementById('input-nickname')?.value.trim();
    if (!nick || nick.length < 2) { this.showToast('⚠️ 먼저 닉네임을 입력하세요!'); return; }
    PlayerState.nickname = nick;
    PlayerState.avatar = document.querySelector('input[name="avatar"]:checked')?.value ?? 'male';
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
    for (let i = 1; i <= AIMatchConfig.aiCount; i++)
      players.push({ name:`AI_${i}(${diffLabel})`, color: PLAYER_COLORS[i % PLAYER_COLORS.length], isAI:true, difficulty: AIMatchConfig.difficulty });

    PlayerState.currentRoom = {
      id: `ai_${Date.now()}`, name:`🤖 AI 대전 (${diffLabel})`,
      maxPlayers: players.length, currentPlayers: players.length,
      status:'게임중', isPrivate:false, players: players.map(p=>p.name)
    };
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
      const card = document.createElement('div');
      card.className = `shop-item-card${PreviewState[category]===item.id?' equipped':''}`;
      let badge = item.equipped
        ? `<span style="position:absolute;top:4px;left:4px;background:var(--green-light);font-size:.65rem;padding:1px 4px;border-radius:4px;color:#fff;">장착됨</span>`
        : item.purchased
          ? `<span style="position:absolute;top:4px;left:4px;background:var(--wood-light);font-size:.65rem;padding:1px 4px;border-radius:4px;color:#fff;">보유</span>`
          : '';
      card.innerHTML = `${badge}<div class="shop-item-icon-box"><span style="font-size:2.2rem;">${item.icon}</span></div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price-tag">${item.price===0||item.purchased?'보유중':`🪙 ${item.price}`}</div>`;
      card.onclick = () => this.selectItemForPreview(category, item);
      grid.appendChild(card);
    });
  },

  selectItemForPreview(cat, item) { PreviewState[cat] = item.id; this.renderShop(cat); this.updateAvatarPreview(); },

  getAvatarImageBySpec(gender, hair, costume) {
    // 1. 완벽한 세트 매핑
    if (hair === 'hair_warrior' && costume === 'costume_armor') {
      return `assets/avatar_${gender}_warrior_armor.png`;
    }
    if (hair === 'hair_wizard' && costume === 'costume_robe') {
      return `assets/avatar_${gender}_wizard_robe.png`;
    }
    if (hair === 'hair_crown') {
      return `assets/avatar_${gender}_crown_normal.png`;
    }
    
    // 2. 단품 장착 시에도 최적의 이미지로 fallback
    if (hair === 'hair_warrior') {
      return `assets/avatar_${gender}_warrior_armor.png`; // 불꽃머리 우선
    }
    if (costume === 'costume_armor') {
      return `assets/avatar_${gender}_warrior_armor.png`; // 갑옷 우선
    }
    if (hair === 'hair_wizard') {
      return `assets/avatar_${gender}_wizard_robe.png`; // 마법머리 우선
    }
    if (costume === 'costume_robe') {
      return `assets/avatar_${gender}_wizard_robe.png`; // 로브 우선
    }
    
    return `assets/avatar_${gender}.png`;
  },

  getEquippedAvatarImage(gender) {
    const hair = ShopData.hair.find(i => i.equipped)?.id || 'hair_normal';
    const costume = ShopData.costume.find(i => i.equipped)?.id || 'costume_normal';
    return this.getAvatarImageBySpec(gender, hair, costume);
  },

  updateAvatarPreview() {
    const el = document.getElementById('shop-preview-avatar');
    const auraEl = document.getElementById('preview-aura-effect');
    
    // 현재 선택한 스킨 스펙에 맞게 통째로 바뀐 아바타 그래픽을 로드
    const currentHair = PreviewState.hair;
    const currentCostume = PreviewState.costume;
    
    if (el) {
      el.src = this.getAvatarImageBySpec(PlayerState.avatar, currentHair, currentCostume);
      el.style.filter = 'none'; // 기존 CSS 필터 제거
    }
    
    // 이모지 오버레이는 이제 아바타 자체의 외형으로 완전히 녹아들었으므로 겹쳐 그리지 않음
    const hairOverlay = document.getElementById('preview-hair-overlay');
    const costumeOverlay = document.getElementById('preview-costume-overlay');
    const sliderOverlay = document.getElementById('preview-slider-overlay');
    
    // 동적 생성 보장
    const container = document.querySelector('.preview-avatar-container');
    if (container) {
      if (!hairOverlay) {
        let ho = document.createElement('div'); ho.id = 'preview-hair-overlay'; ho.className = 'preview-decor-overlay hair';
        container.appendChild(ho);
      }
      if (!costumeOverlay) {
        let co = document.createElement('div'); co.id = 'preview-costume-overlay'; co.className = 'preview-decor-overlay costume';
        container.appendChild(co);
      }
      if (!sliderOverlay) {
        let so = document.createElement('div'); so.id = 'preview-slider-overlay'; so.className = 'preview-decor-overlay slider';
        container.appendChild(so);
      }
    }
    
    if (document.getElementById('preview-hair-overlay')) document.getElementById('preview-hair-overlay').textContent = '';
    if (document.getElementById('preview-costume-overlay')) document.getElementById('preview-costume-overlay').textContent = '';
    
    // 슬라이더 이펙트 (발밑에 🪵/🔱/⚡가 미니 효과로 유지되게 함)
    if (document.getElementById('preview-slider-overlay')) {
      let sliderEmoji = '';
      const sliderId = PreviewState.slider;
      if (sliderId === 'slider_gold') sliderEmoji = '🔱';
      else if (sliderId === 'slider_neon') sliderEmoji = '⚡';
      else if (sliderId === 'slider_normal') sliderEmoji = '🪵';
      document.getElementById('preview-slider-overlay').textContent = sliderEmoji;
    }

    // 오라 효과 설정 및 동적 애니메이션 파티클 생성
    const aura = ShopData.aura.find(i => i.id === PreviewState.aura);
    if (auraEl) { 
      auraEl.className = 'aura-effect'; 
      if (aura?.effect) auraEl.classList.add(aura.effect); 
      
      // 기존 파티클 리셋
      auraEl.innerHTML = '';
      
      let pClass = '';
      if (aura?.id === 'aura_fire') pClass = 'flame';
      else if (aura?.id === 'aura_ice') pClass = 'snow';
      else if (aura?.id === 'aura_forest') pClass = 'leaf';
      
      if (pClass) {
        for (let i = 0; i < 15; i++) {
          const p = document.createElement('div');
          p.className = `aura-particle ${pClass}`;
          p.style.left = `${Math.random() * 90 + 5}%`;
          p.style.animationDelay = `${Math.random() * 2}s`;
          p.style.animationDuration = `${Math.random() * 1.5 + 1.2}s`;
          
          if (pClass === 'snow') {
            const symbols = ['❄', '❅', '❆', '•'];
            p.textContent = symbols[Math.floor(Math.random() * symbols.length)];
          } else if (pClass === 'leaf') {
            // 다양한 나뭇잎 각도 및 크기
            const scale = Math.random() * 0.4 + 0.8;
            p.style.transform = `scale(${scale})`;
          }
          auraEl.appendChild(p);
        }
      }
    }
    
    // 하단 텍스트 목록 업데이트 (헤어, 의상 제외하고 오라, 슬라이더만 출력)
    const list = document.getElementById('shop-preview-items');
    if (!list) return;
    list.innerHTML = '';
    [['✨ 오라','aura'],['🎚️ 슬라이더','slider']].forEach(([label,key]) => {
      const item = ShopData[key].find(i => i.id === PreviewState[key]);
      if (!item) return;
      const st = item.purchased
        ? `<span style="color:var(--green-bright);">[보유]</span>`
        : `<span style="color:var(--gold);">[미보유: 🪙${item.price}]</span>`;
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap;font-size:.8rem;';
      d.innerHTML = `<span>${label}: ${item.name}</span>${st}`;
      list.appendChild(d);
    });
  },

  applyPreviewItems() {
    const toBuy = []; let total = 0;
    Object.keys(PreviewState).forEach(cat => {
      const item = ShopData[cat].find(i => i.id === PreviewState[cat]);
      if (item && !item.purchased) { toBuy.push(item); total += item.price; }
    });
    if (toBuy.length > 0) {
      if (PlayerState.coins < total) { this.showToast(`⚠️ 코인 부족! (필요:🪙${total}/보유:🪙${PlayerState.coins})`); return; }
      if (!confirm(`🪙 [${toBuy.map(i=>i.name).join(', ')}] 구매 (총 ${total} 코인)?`)) return;
      PlayerState.coins -= total;
      const el = document.getElementById('shop-coins'); if (el) el.textContent = PlayerState.coins;
      toBuy.forEach(i => i.purchased = true);
    }
    this.equipSelectedPreviewItems();
    this.showToast('✨ 아바타 스킨 적용 완료!');
  },

  equipSelectedPreviewItems() {
    Object.keys(PreviewState).forEach(cat => ShopData[cat].forEach(i => i.equipped = (i.id === PreviewState[cat])));
    const activeTab = document.querySelector('.shop-tab.active');
    if (activeTab) this.renderShop(activeTab.id.replace('tab-',''));
    this.updateAvatarPreview();
    
    // 로비 상단 헤더 아바타도 장착 스킨으로 실시간 갱신
    const headerImg = document.getElementById('header-avatar-img');
    if (headerImg) {
      headerImg.src = this.getEquippedAvatarImage(PlayerState.avatar);
    }
  },

  // ── 방 목록 ───────────────────────────
  renderRooms() {
    const grid = document.getElementById('rooms-grid');
    if (!grid) return;
    const cnt = document.getElementById('room-count');
    grid.innerHTML = '';
    if (cnt) cnt.textContent = MockRooms.length;
    if (!MockRooms.length) {
      grid.innerHTML = `<div class="empty-rooms"><span class="empty-icon">🪵</span><p>열린 방이 없어요.</p></div>`;
      return;
    }
    MockRooms.forEach(room => {
      const fill = (room.currentPlayers / room.maxPlayers) * 100;
      const card = document.createElement('div');
      card.className = 'room-card wood-panel';
      card.innerHTML = `
        <div class="room-card-header"><div class="room-name">${room.name}</div>${room.isPrivate?'<span>🔒</span>':''}</div>
        <div class="room-status ${room.status==='게임중'?'playing':''}">${room.status}</div>
        <div class="room-players"><span>👥 ${room.currentPlayers}/${room.maxPlayers}</span>
          <div class="player-count-bar"><div class="player-count-fill" style="width:${fill}%"></div></div></div>`;
      card.onclick = () => this.tryEnterRoom(room);
      grid.appendChild(card);
    });
  },

  tryEnterRoom(room) {
    if (room.status === '게임중') { this.openSpectateModal(room); return; }
    if (room.isPrivate && prompt('🔑 비밀번호:') !== '1234') { this.showToast('❌ 비밀번호 오류'); return; }
    PlayerState.currentRoom = room;
    const players = room.players.map((n, i) => ({ name:n, color:PLAYER_COLORS[i%PLAYER_COLORS.length], isAI:false }));
    GameState.init(players, false);
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
    this.showToast(`👁️ 관전 모드: ${PlayerState.currentRoom?.name}`);
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
    const room = { id:`room_${Date.now()}`, name, maxPlayers:this.selectedMaxPlayers, currentPlayers:1, status:'대기중', isPrivate, players:[PlayerState.nickname] };
    MockRooms.push(room);
    this.closeModal('modal-create-room');
    this.showToast(`🚀 방 [${name}] 생성!`);
    PlayerState.currentRoom = room;
    GameState.init([{name:PlayerState.nickname, color:PLAYER_COLORS[0], isAI:false}], false);
    this.navigateTo('screen-game');
    if (document.getElementById('input-room-name')) document.getElementById('input-room-name').value = '';
    if (document.getElementById('input-room-pw')) document.getElementById('input-room-pw').value = '';
  },

  renderAdminConsole() {
    const grid = document.getElementById('admin-rooms-grid');
    if (!grid) return;
    const el1 = document.getElementById('admin-rooms-count');
    const el2 = document.getElementById('admin-players-count');
    if (el1) el1.textContent = MockRooms.length;
    if (el2) el2.textContent = MockRooms.reduce((a,r) => a+r.currentPlayers, 0)+1;
    grid.innerHTML = '';
    if (!MockRooms.length) { grid.innerHTML = `<div class="admin-empty-msg"><span>🪵</span><br/>방 없음</div>`; return; }
    MockRooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'admin-room-card';
      card.innerHTML = `<div class="admin-room-title">🗺️ ${room.name}</div>
        <div class="admin-room-details">상태:<strong style="color:var(--gold);">${room.status}</strong><br/>
        ${room.currentPlayers}/${room.maxPlayers}명 · ${room.players.join(', ')}</div>`;
      card.onclick = () => { this.closeModal('modal-admin'); this.openSpectateModal(room); };
      grid.appendChild(card);
    });
  },

  // ══════════════════════════════════════════════
  //  게임 보드 초기화
  // ══════════════════════════════════════════════
  initGameBoard() {
    const room = PlayerState.currentRoom;
    const rn = document.getElementById('hud-room-name');
    if (rn) rn.textContent = room?.name ?? '개인 연습실';
    this.renderPlayerPanels();
    this.updateHUDTurn();
    // 슬라이더 초기화
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
      const avatarSrc = p.avatarUrl || `assets/avatar_${PlayerState.avatar}.png`;
      if (mini) {
        const el = document.createElement('div');
        el.className = `mini-card ${idx===GameState.currentTurn?'active-turn':''}`;
        el.id = `mini-card-${idx}`;
        el.style.borderColor = p.color;
        el.innerHTML = `<img src="${avatarSrc}" class="mini-avatar">`;
        mini.appendChild(el);
      }
      if (left) {
        const el = document.createElement('div');
        el.className = `game-player-card ${idx===GameState.currentTurn?'active-turn':''}`;
        el.id = `player-card-${idx}`;
        el.innerHTML = `
          <div class="game-player-avatar-box" style="border-left:3px solid ${p.color};">
            <img src="${avatarSrc}" class="game-player-avatar">
          </div>
          <div class="player-details">
            <div class="p-name">${p.isAI?'🤖 ':''}${p.name}</div>
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
    if (el && p) el.textContent = `${p.isAI?'🤖 ':''}${p.name}`;
    document.querySelectorAll('.game-player-card').forEach((c,i) => c.classList.toggle('active-turn', i===GameState.currentTurn));
    document.querySelectorAll('.mini-card').forEach((c,i) => c.classList.toggle('active-turn', i===GameState.currentTurn));
    const isMyTurn = !GameState.players[GameState.currentTurn]?.isAI;
    const confirmBtn = document.getElementById('btn-confirm-coord');
    const xs = document.getElementById('slider-x');
    const ys = document.getElementById('slider-y');
    if (confirmBtn) confirmBtn.disabled = !isMyTurn;
    if (xs) xs.disabled = !isMyTurn;
    if (ys) ys.disabled = !isMyTurn;
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

  addLog(msg, cls='log-action') {
    const log = document.getElementById('game-log');
    if (!log) return;
    const d = document.createElement('div');
    d.className = `log-entry ${cls}`; d.textContent = msg;
    log.prepend(d);
    if (log.children.length > 30) log.lastChild.remove();
  },

  // ── 좌표 확인 버튼 핸들러 ────────────
  confirmCoord() {
    if (GameState.isGameOver) return;
    const p = GameState.players[GameState.currentTurn];
    if (p?.isAI) return;
    const x = PlayerState.selectedX, y = PlayerState.selectedY;
    if (!GameState.isValidMove(x, y)) {
      if (!GameState.canPlace(x, y)) {
        this.showToast('⚠️ 이미 마커가 있는 좌표입니다!');
      } else {
        const lastInfo = GameState.lastX !== null
          ? `(직전 위치: ${GameState.lastX}, ${GameState.lastY})`
          : '';
        this.showToast(`⚠️ 규칙 위반! X 또는 Y 중 하나만 변경할 수 있습니다. ${lastInfo}`);
      }
      return;
    }
    this.placeMarker(x, y, GameState.currentTurn);
  },

  // ── 마커 배치 ─────────────────────────
  placeMarker(x, y, playerIdx) {
    if (!GameState.place(x, y, playerIdx)) {
      this.showToast('⚠️ 배치 실패 (규칙 위반 또는 이미 점유됨)');
      return;
    }
    const p = GameState.players[playerIdx];
    this.addLog(`🎯 ${p.name} → (${x}, ${y})`, 'log-action');
    this.drawGrid();

    if (GameState.checkWin(playerIdx)) {
      GameState.isGameOver = true;
      clearInterval(GameState.timerInterval);
      PlayerState.wins++;
      PlayerState.coins += 50;
      this.addLog(`🏆 ${p.name} 승리! +50코인`, 'log-system');
      this.showToast(`🏆 ${p.name} 승리!`);
      this.drawGrid(playerIdx);
      return;
    }
    if (GameState.isFull()) {
      GameState.isGameOver = true;
      clearInterval(GameState.timerInterval);
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
    this.drawGrid(); // 유효 이동 하이라이트 갱신
    if (GameState.isAIMode && next.isAI) setTimeout(() => this.doAITurn(), 900);
  },

  // ── AI 턴 ──────────────────────────────
  doAITurn() {
    if (GameState.isGameOver) return;
    const p = GameState.players[GameState.currentTurn];
    if (!p?.isAI) return;

    const result = AIEngine.think(GameState.currentTurn, p.difficulty);
    if (!result) { this.addLog('🤖 AI: 둘 수 없음, 패스.', 'log-error'); this.advanceTurn(); return; }

    const [r, c] = result;
    const x = GameState.idxToCoord(c);
    const y = GameState.idxToCoord(r);

    this.addLog(`🤖 ${p.name} 생각 중…`, 'log-system');
    // 슬라이더 시각적 이동
    const xs = document.getElementById('slider-x');
    const ys = document.getElementById('slider-y');
    if (xs) xs.value = x;
    if (ys) ys.value = y;
    PlayerState.selectedX = x; PlayerState.selectedY = y;
    this.updateCoordDisplay();
    this.drawGrid();
    setTimeout(() => this.placeMarker(x, y, GameState.currentTurn), 600);
  },

  // ── 슬라이더 & 좌표 표시 ─────────────
  updateSliderCoords() {
    const xs = document.getElementById('slider-x');
    const ys = document.getElementById('slider-y');
    PlayerState.selectedX = parseInt(xs?.value ?? 0);
    PlayerState.selectedY = parseInt(ys?.value ?? 0);
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
    // 유효 이동 여부 표시
    const confirmBtn = document.getElementById('btn-confirm-coord');
    if (confirmBtn && !GameState.players[GameState.currentTurn]?.isAI) {
      const isValid = GameState.isValidMove(PlayerState.selectedX, PlayerState.selectedY);
      confirmBtn.disabled = !isValid;
      confirmBtn.style.opacity = isValid ? '1' : '0.4';
    }
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

    // 유효 이동 하이라이트 (사람 턴일 때만)
    const curPlayer = GameState.players[GameState.currentTurn];
    if (!GameState.isGameOver && curPlayer && !curPlayer.isAI && !GameState.isFirstMove) {
      const validSet = new Set(GameState.validMoves().map(([r,c]) => `${GameState.idxToCoord(c)},${GameState.idxToCoord(r)}`));
      ctx.fillStyle = 'rgba(46,181,112,0.08)';
      for (let v = -5; v <= 5; v++) {
        // 같은 X 열 하이라이트
        if (validSet.has(`${GameState.lastX},${v}`) || validSet.has(`${v},${GameState.lastY}`)) {
          // valid 셀만 강조
        }
      }
      // 유효 행(lastY) 강조
      const hY = center - (GameState.lastY * step);
      ctx.fillStyle = 'rgba(46,181,112,0.08)';
      ctx.fillRect(0, hY - step/2, size, step);
      // 유효 열(lastX) 강조
      const hX = center + (GameState.lastX * step);
      ctx.fillRect(hX - step/2, 0, step, size);
    }

    // 모눈선
    ctx.strokeStyle = 'rgba(78,122,90,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      const p = i * step;
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    }

    // 축
    ctx.strokeStyle = 'rgba(78,181,112,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, center); ctx.lineTo(size, center); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center, 0); ctx.lineTo(center, size); ctx.stroke();

    // 눈금 숫자
    ctx.fillStyle = '#d9b48f';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let v = -5; v <= 5; v++) {
      if (v === 0) { ctx.fillText('0', center-12, center+12); continue; }
      const pos = center + (v * step);
      ctx.fillText(v.toString(), pos, center+14);
      ctx.fillText((-v).toString(), center-14, pos);
    }

    // 사분면 로마자
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('I',   center+size/4, center-size/4);
    ctx.fillText('II',  center-size/4, center-size/4);
    ctx.fillText('III', center-size/4, center+size/4);
    ctx.fillText('IV',  center+size/4, center+size/4);

    // 마커 렌더링
    if (GameState.board) {
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          const pIdx = GameState.board[r][c];
          if (pIdx === null) continue;
          const px = center + ((c-5) * step);
          const py = center - ((r-5) * step);
          const color = GameState.players[pIdx]?.color ?? '#fff';
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(px, py, step*0.38, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.floor(step*0.32)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(GameState.players[pIdx]?.name[0] ?? '?', px, py);
        }
      }
    }

    // 조준 표시
    this.drawTargetIndicator(ctx, center, step);

    // 승리 오버레이
    if (winnerIdx !== null && GameState.players[winnerIdx]) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, size/2-40, size, 80);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`🏆 ${GameState.players[winnerIdx].name} 승리!`, center, size/2);
    }
  },

  drawTargetIndicator(ctx, center, step) {
    if (GameState.isGameOver) return;
    const x = PlayerState.selectedX, y = PlayerState.selectedY;
    const cx = center + (x * step), cy = center - (y * step);
    const isValid = GameState.isValidMove(x, y);
    const color = isValid ? '#f1c40f' : '#e74c3c';

    ctx.strokeStyle = isValid ? 'rgba(241,196,15,0.3)' : 'rgba(231,76,60,0.3)';
    ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(ctx.canvas.width, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ctx.canvas.height); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = isValid ? 'rgba(241,196,15,0.8)' : 'rgba(231,76,60,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI*2); ctx.stroke();
  }
};

// ══════════════════════════════════════════════
//  이벤트 리스너 초기화
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  window.UI = UI;

  // 닉네임 미리보기
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
