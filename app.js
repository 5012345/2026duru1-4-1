/**
 * 픽셀 이스케이프: 차원 탈출 서바이벌 - 클라이언트 UI 및 인터랙션 스크립트
 */

// 전역 플레이어 상태
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

// 상점 아이템 데이터베이스 (구매 상태 purchased 플래그 추가)
const ShopData = {
  hair: [
    { id: 'hair_normal', name: '기본 헤어', price: 0, icon: '💇', purchased: true, equipped: true },
    { id: 'hair_warrior', name: '전사의 불꽃 헤어', price: 50, icon: '🔥', purchased: false, equipped: false },
    { id: 'hair_wizard', name: '마법의 퍼플 헤어', price: 80, icon: '🔮', purchased: false, equipped: false },
    { id: 'hair_crown', name: '황금 왕관', price: 150, icon: '👑', purchased: false, equipped: false }
  ],
  costume: [
    { id: 'costume_normal', name: '기본 탐험복', price: 0, icon: '👕', purchased: true, equipped: true },
    { id: 'costume_armor', name: '강철 플레이트 아머', price: 60, icon: '🛡️', purchased: false, equipped: false },
    { id: 'costume_robe', name: '대마법사 로브', price: 90, icon: '🧥', purchased: false, equipped: false }
  ],
  aura: [
    { id: 'aura_none', name: '없음', price: 0, icon: '❌', purchased: true, equipped: true },
    { id: 'aura_fire', name: '이그니스 오라', price: 100, icon: '🔥', purchased: false, equipped: false, effect: 'aura-fire' },
    { id: 'aura_ice', name: '프로스트 오라', price: 100, icon: '❄️', purchased: false, equipped: false, effect: 'aura-ice' },
    { id: 'aura_forest', name: '네이처 오라', price: 120, icon: '🍃', purchased: false, equipped: false, effect: 'aura-forest' }
  ],
  slider: [
    { id: 'slider_normal', name: '나무 슬라이더', price: 0, icon: '🪵', purchased: true, equipped: true },
    { id: 'slider_gold', name: '황금 슬라이더', price: 200, icon: '🔱', purchased: false, equipped: false },
    { id: 'slider_neon', name: '차원 레이저 슬라이더', price: 300, icon: '⚡', purchased: false, equipped: false }
  ]
};

// 실시간 적용을 묻기 전에 담아두는 "임시 미리보기 상태"
const PreviewState = {
  hair: 'hair_normal',
  costume: 'costume_normal',
  aura: 'aura_none',
  slider: 'slider_normal'
};

// AI 대전 설정 임시 상태
const AIMatchConfig = {
  aiCount: 1,
  difficulty: 'easy'
};

// 가상의 방 데이터베이스 (대기실 & 관리자 콘솔용)
let MockRooms = [
  { id: 'room_1', name: '좌표 마스터들의 전쟁', maxPlayers: 4, currentPlayers: 3, status: '대기중', isPrivate: false, players: ['알파', '베타', '감마'] },
  { id: 'room_2', name: '중1 수학 정복방 (비번 1234)', maxPlayers: 2, currentPlayers: 1, status: '대기중', isPrivate: true, players: ['델타'] },
  { id: 'room_3', name: '차원탈출 고수만 컴온', maxPlayers: 4, currentPlayers: 4, status: '게임중', isPrivate: false, players: ['A', 'B', 'C', 'D'] }
];

// UI 모듈 정의
const UI = {
  // 화면 전환 (Lobby -> RoomList -> Shop -> Game 등)
  navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.classList.add('active');
      this.showToast(`🗺️ 화면 이동: ${this.getScreenName(screenId)}`);

      // 특정 화면 진입 시 초기화 작업
      if (screenId === 'screen-room-list') {
        this.renderRooms();
      } else if (screenId === 'screen-shop') {
        // 상점 진입 시 현재 장착된 아이템으로 PreviewState 동기화
        this.syncPreviewWithEquipped();
        this.renderShop('hair');
        this.updateAvatarPreview();
      } else if (screenId === 'screen-game') {
        this.initGameBoard();
      }
    }
  },

  getScreenName(screenId) {
    switch (screenId) {
      case 'screen-lobby': return '메인 로비';
      case 'screen-room-list': return '모험가 대기실';
      case 'screen-shop': return '아바타 상점';
      case 'screen-game': return '게임 영역';
      default: return '알 수 없는 곳';
    }
  },

  // 팝업 모달 열기
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      if (modalId === 'modal-admin') {
        this.renderAdminConsole();
      }
    }
  },

  // 팝업 모달 닫기
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  },

  // 토스트 메시지 출력
  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  // 로비 정보 업데이트 및 대기실 입장
  enterLobby() {
    const nicknameInput = document.getElementById('input-nickname');
    let nickname = nicknameInput.value.trim();
    if (!nickname) {
      this.showToast('⚠️ 닉네임을 입력해 주세요!');
      return;
    }
    if (nickname.length < 2) {
      this.showToast('⚠️ 닉네임은 최소 2글자 이상이어야 합니다.');
      return;
    }

    const selectedAvatar = document.querySelector('input[name="avatar"]:checked').value;
    
    // 글로벌 상태 저장
    PlayerState.nickname = nickname;
    PlayerState.avatar = selectedAvatar;

    // 헤더 프로필 갱신
    document.getElementById('header-nickname').textContent = nickname;
    document.getElementById('header-avatar-img').src = `assets/avatar_${selectedAvatar}.png`;
    document.getElementById('header-wins').textContent = `🏆 ${PlayerState.wins}`;

    this.showToast(`👋 환영합니다, ${nickname} 님!`);
    this.navigateTo('screen-room-list');
  },

  // AI 대전 설정 모달 열기
  openAIMatchModal() {
    const nicknameInput = document.getElementById('input-nickname');
    let nickname = nicknameInput.value.trim();
    if (!nickname) {
      this.showToast('⚠️ 먼저 닉네임을 입력해 주세요!');
      return;
    }
    if (nickname.length < 2) {
      this.showToast('⚠️ 닉네임은 최소 2글자 이상이어야 합니다.');
      return;
    }

    const selectedAvatar = document.querySelector('input[name="avatar"]:checked').value;
    PlayerState.nickname = nickname;
    PlayerState.avatar = selectedAvatar;

    this.openModal('modal-ai-match');
  },

  // AI 수 선택
  selectAICount(count) {
    AIMatchConfig.aiCount = count;
    for (let i = 1; i <= 3; i++) {
      const btn = document.getElementById(`ai-cnt-${i}`);
      if (btn) btn.classList.remove('active');
    }
    document.getElementById(`ai-cnt-${count}`).classList.add('active');
  },

  // AI 난이도 선택
  selectAIDifficulty(diff) {
    AIMatchConfig.difficulty = diff;
    const diffs = ['easy', 'normal', 'hard'];
    diffs.forEach(d => {
      const btn = document.getElementById(`ai-diff-${d}`);
      if (btn) btn.classList.remove('active');
    });
    document.getElementById(`ai-diff-${diff}`).classList.add('active');
  },

  // AI 대전 시작
  startAIMatch() {
    this.closeModal('modal-ai-match');
    
    const diffLabel = AIMatchConfig.difficulty === 'easy' ? '초급' : AIMatchConfig.difficulty === 'normal' ? '중급' : '고급';
    const roomName = `🤖 AI 대전 (난이도: ${diffLabel})`;
    
    // AI 플레이어 생성
    const players = [PlayerState.nickname];
    for (let i = 1; i <= AIMatchConfig.aiCount; i++) {
      players.push(`인공지능_${i}(${diffLabel})`);
    }

    // 모의 룸 생성
    const aiRoom = {
      id: `ai_room_${Date.now()}`,
      name: roomName,
      maxPlayers: AIMatchConfig.aiCount + 1,
      currentPlayers: AIMatchConfig.aiCount + 1,
      status: '게임중',
      isPrivate: false,
      players: players
    };

    PlayerState.currentRoom = aiRoom;
    this.showToast(`⚔️ AI 대전 시작! 난이도: ${diffLabel}`);
    this.navigateTo('screen-game');
  },

  // 규칙서 탭 전환
  switchRulesTab(tabName) {
    document.querySelectorAll('.rules-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.rules-content').forEach(content => content.classList.remove('active'));

    document.getElementById(`rtab-${tabName}`).classList.add('active');
    document.getElementById(`rcontent-${tabName}`).classList.add('active');
  },

  // 상점 탭 전환
  switchShopTab(tabName) {
    document.querySelectorAll('.shop-tab').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.shop-panel').forEach(panel => panel.classList.remove('active'));

    const tab = document.getElementById(`tab-${tabName}`);
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    document.getElementById(`panel-${tabName}`).classList.add('active');

    this.renderShop(tabName);
  },

  // 현재 실제 장착된 목록으로 PreviewState 동기화
  syncPreviewWithEquipped() {
    Object.keys(ShopData).forEach(category => {
      const equippedItem = ShopData[category].find(i => i.equipped);
      if (equippedItem) {
        PreviewState[category] = equippedItem.id;
      }
    });
  },

  // 상점 아이템 렌더링
  renderShop(category) {
    const grid = document.getElementById(`grid-${category}`);
    if (!grid) return;

    grid.innerHTML = '';
    const items = ShopData[category];

    items.forEach(item => {
      const isCurrentlyPreviewed = PreviewState[category] === item.id;
      const card = document.createElement('div');
      
      // 장착된 경우 또는 임시 선택된(미리보기 중인) 경우 클래스 부여
      let cardClasses = 'shop-item-card';
      if (isCurrentlyPreviewed) {
        cardClasses += ' equipped'; // 테두리 강조 효과 재사용
      }

      let badgeText = '';
      if (item.equipped) {
        badgeText = '<span style="position:absolute; top:4px; left:4px; background:var(--green-light); color:#wrap; font-size:0.65rem; padding:1px 4px; border-radius:4px;">장착됨</span>';
      } else if (item.purchased) {
        badgeText = '<span style="position:absolute; top:4px; left:4px; background:var(--wood-light); color:#wrap; font-size:0.65rem; padding:1px 4px; border-radius:4px;">보유</span>';
      }

      card.className = cardClasses;
      card.innerHTML = `
        ${badgeText}
        <div class="shop-item-icon-box">
          <span style="font-size: 2.2rem;">${item.icon}</span>
        </div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price-tag">
          ${item.price === 0 || item.purchased ? '보유중' : `🪙 ${item.price}`}
        </div>
      `;

      card.onclick = () => this.selectItemForPreview(category, item);
      grid.appendChild(card);
    });
  },

  // 아이템 클릭 시 장착이 아니라 "미리보기 상태"에 우선 세팅
  selectItemForPreview(category, item) {
    PreviewState[category] = item.id;
    this.renderShop(category);
    this.updateAvatarPreview();
  },

  // 아바타 미리보기 실시간 업데이트
  updateAvatarPreview() {
    const previewAvatar = document.getElementById('shop-preview-avatar');
    const previewAura = document.getElementById('preview-aura-effect');
    previewAvatar.src = `assets/avatar_${PlayerState.avatar}.png`;

    // 미리보기 오라 효과 적용
    const auraId = PreviewState.aura;
    const auraItem = ShopData.aura.find(i => i.id === auraId);
    previewAura.className = 'aura-effect';
    if (auraItem && auraItem.effect) {
      previewAura.classList.add(auraItem.effect);
    }

    // 우측 하단 미리보기 상세 텍스트 목록 렌더링
    const previewItemsList = document.getElementById('shop-preview-items');
    if (previewItemsList) {
      previewItemsList.innerHTML = '';
      
      const categories = [
        { label: '💇 헤어', key: 'hair' },
        { label: '👕 의상', key: 'costume' },
        { label: '✨ 오라', key: 'aura' },
        { label: '🎚️ 슬라이더', key: 'slider' }
      ];

      categories.forEach(cat => {
        const itemId = PreviewState[cat.key];
        const item = ShopData[cat.key].find(i => i.id === itemId);
        if (item) {
          const statusText = item.purchased ? '<span style="color:var(--green-bright);">[보유]</span>' : `<span style="color:var(--gold);">[미보유: 🪙${item.price}]</span>`;
          const div = document.createElement('div');
          div.style.display = 'flex';
          div.style.justify = 'space-between';
          div.innerHTML = `<span>${cat.label}: ${item.name}</span> ${statusText}`;
          previewItemsList.appendChild(div);
        }
      });
    }
  },

  // 적용하기 클릭 시 모아서 일괄 구매 및 장착 처리
  applyPreviewItems() {
    const toBuyList = [];
    let totalPrice = 0;

    // 카테고리별 미리보기 품목 중 미구매 건을 추출
    Object.keys(PreviewState).forEach(category => {
      const itemId = PreviewState[category];
      const item = ShopData[category].find(i => i.id === itemId);
      if (item && !item.purchased) {
        toBuyList.push(item);
        totalPrice += item.price;
      }
    });

    // 1. 미구매 아이템이 있을 경우 구매 컨펌 창 팝업
    if (toBuyList.length > 0) {
      const itemsNames = toBuyList.map(i => i.name).join(', ');
      if (PlayerState.coins >= totalPrice) {
        if (confirm(`🪙 미보유 아이템 [${itemsNames}]의 구매를 위해 총 ${totalPrice} 코인을 지불하시겠습니까?`)) {
          // 코인 차감 및 구매 상태 전환
          PlayerState.coins -= totalPrice;
          document.getElementById('shop-coins').textContent = PlayerState.coins;
          
          toBuyList.forEach(item => {
            item.purchased = true;
          });

          this.equipSelectedPreviewItems();
          this.showToast(`🎉 구매 및 아바타 스킨 적용이 완료되었습니다!`);
        }
      } else {
        this.showToast(`⚠️ 코인이 부족합니다. (필요: 🪙${totalPrice} / 보유: 🪙${PlayerState.coins})`);
      }
    } else {
      // 2. 모든 미리보기 아이템이 이미 보유 중인 경우 바로 장착 처리
      this.equipSelectedPreviewItems();
      this.showToast(`✨ 아바타 스킨이 모두 적용되었습니다!`);
    }
  },

  // 미리보기 상태의 아이템들을 실제 장착(equipped) 상태로 반영
  equipSelectedPreviewItems() {
    Object.keys(PreviewState).forEach(category => {
      const itemId = PreviewState[category];
      ShopData[category].forEach(item => {
        item.equipped = (item.id === itemId);
      });
    });
    
    // UI 다시 그리기
    const activeTab = document.querySelector('.shop-tab.active');
    if (activeTab) {
      const cat = activeTab.id.replace('tab-', '');
      this.renderShop(cat);
    }
    this.updateAvatarPreview();
  },

  // 방 목록 렌더링
  renderRooms() {
    const grid = document.getElementById('rooms-grid');
    const countLabel = document.getElementById('room-count');
    if (!grid) return;

    grid.innerHTML = '';
    countLabel.textContent = MockRooms.length;

    if (MockRooms.length === 0) {
      grid.innerHTML = `
        <div class="empty-rooms">
          <span class="empty-icon">🪵</span>
          <p>아직 열린 방이 없어요.<br />방을 새로 만들어 보세요!</p>
        </div>
      `;
      return;
    }

    MockRooms.forEach(room => {
      const fillPercentage = (room.currentPlayers / room.maxPlayers) * 100;
      const card = document.createElement('div');
      card.className = 'room-card wood-panel';
      card.innerHTML = `
        <div class="room-card-header">
          <div class="room-name">${room.name}</div>
          ${room.isPrivate ? '<span class="room-lock-icon">🔒</span>' : ''}
        </div>
        <div class="room-status ${room.status === '게임중' ? 'playing' : ''}">
          ${room.status}
        </div>
        <div class="room-players">
          <span>👥 ${room.currentPlayers} / ${room.maxPlayers} 명</span>
          <div class="player-count-bar">
            <div class="player-count-fill" style="width: ${fillPercentage}%"></div>
          </div>
        </div>
      `;

      card.onclick = () => this.tryEnterRoom(room);
      grid.appendChild(card);
    });
  },

  // 방 입장 시도
  tryEnterRoom(room) {
    if (room.status === '게임중') {
      this.openSpectateModal(room);
      return;
    }

    if (room.isPrivate) {
      const pw = prompt('🔑 비밀번호 4자리를 입력하세요:');
      if (pw !== '1234') {
        this.showToast('❌ 비밀번호가 올바르지 않습니다.');
        return;
      }
    }

    PlayerState.currentRoom = room;
    this.showToast(`🚪 ${room.name} 방에 입장합니다.`);
    this.navigateTo('screen-game');
  },

  // 관전 확인 창 띄우기
  openSpectateModal(room) {
    PlayerState.currentRoom = room;
    document.getElementById('spectate-room-info').textContent = `방 이름: ${room.name}`;
    this.openModal('modal-spectate');
  },

  // 관전 모드 입장
  enterSpectateMode() {
    this.closeModal('modal-spectate');
    PlayerState.isSpectating = true;
    this.showToast(`👁️ 관전 모드로 ${PlayerState.currentRoom.name} 에 입장합니다.`);
    this.navigateTo('screen-game');
  },

  // 대기실 새로고침
  refreshRooms() {
    this.showToast('🔄 방 목록을 새로 불러왔습니다.');
    this.renderRooms();
  },

  // 최대 인원 선택 처리
  selectedMaxPlayers: 2,
  selectPlayerCount(count) {
    this.selectedMaxPlayers = count;
    document.querySelectorAll('.count-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`cnt-${count}`).classList.add('active');
  },

  // 새 방 생성
  createRoom() {
    const nameInput = document.getElementById('input-room-name');
    const roomName = nameInput.value.trim();
    if (!roomName) {
      this.showToast('⚠️ 방 이름을 입력해 주세요!');
      return;
    }

    const isPrivate = document.getElementById('room-private').checked;
    const password = document.getElementById('input-room-pw').value;

    if (isPrivate && (!password || password.length !== 4)) {
      this.showToast('⚠️ 비공개 방은 4자리 비밀번호가 필수입니다.');
      return;
    }

    const newRoom = {
      id: `room_${Date.now()}`,
      name: roomName,
      maxPlayers: this.selectedMaxPlayers,
      currentPlayers: 1,
      status: '대기중',
      isPrivate: isPrivate,
      players: [PlayerState.nickname]
    };

    MockRooms.push(newRoom);
    this.closeModal('modal-create-room');
    this.showToast(`🚀 방 [${roomName}] 생성 완료!`);
    
    // 생성자 자동 입장
    PlayerState.currentRoom = newRoom;
    this.navigateTo('screen-game');

    // 입력 폼 초기화
    nameInput.value = '';
    document.getElementById('input-room-pw').value = '';
  },

  // 관리자 전광판 렌더링
  renderAdminConsole() {
    const grid = document.getElementById('admin-rooms-grid');
    if (!grid) return;

    document.getElementById('admin-rooms-count').textContent = MockRooms.length;
    const totalPlayers = MockRooms.reduce((acc, r) => acc + r.currentPlayers, 0) + 1;
    document.getElementById('admin-players-count').textContent = totalPlayers;

    grid.innerHTML = '';
    if (MockRooms.length === 0) {
      grid.innerHTML = `
        <div class="admin-empty-msg">
          <span>🪵</span><br/>현재 진행 중인 방이 없습니다.
        </div>
      `;
      return;
    }

    MockRooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'admin-room-card';
      card.innerHTML = `
        <div class="admin-room-title">🗺️ ${room.name}</div>
        <div class="admin-room-details">
          상태: <strong style="color:var(--gold);">${room.status}</strong><br/>
          인원: ${room.currentPlayers}/${room.maxPlayers} 명<br/>
          플레이어: ${room.players.join(', ')}
        </div>
      `;
      card.onclick = () => {
        this.closeModal('modal-admin');
        this.openSpectateModal(room);
      };
      grid.appendChild(card);
    });
  },

  // 게임 보드 그리기 초기화 (Canvas)
  initGameBoard() {
    const room = PlayerState.currentRoom;
    document.getElementById('hud-room-name').textContent = room ? room.name : '개인 연습실';
    document.getElementById('turn-player-name').textContent = PlayerState.nickname;

    const miniList = document.getElementById('player-list-mini');
    const leftCards = document.getElementById('player-cards-left');
    miniList.innerHTML = '';
    leftCards.innerHTML = '';

    const listPlayers = room ? room.players : [PlayerState.nickname];
    listPlayers.forEach((p, idx) => {
      const mini = document.createElement('div');
      mini.className = `mini-card ${idx === 0 ? 'active-turn' : ''}`;
      mini.innerHTML = `
        <img src="assets/avatar_${PlayerState.avatar}.png" alt="아바타" class="mini-avatar">
      `;
      miniList.appendChild(mini);

      const card = document.createElement('div');
      card.className = `game-player-card ${idx === 0 ? 'active-turn' : ''}`;
      card.innerHTML = `
        <div class="game-player-avatar-box">
          <img src="assets/avatar_${PlayerState.avatar}.png" alt="아바타" class="game-player-avatar">
        </div>
        <div class="player-details">
          <div class="p-name">${p}</div>
          <div class="p-score">🏆 0승 · 🪙 0</div>
        </div>
        <span class="p-status-dot online"></span>
      `;
      leftCards.appendChild(card);
    });

    this.drawGrid();
  },

  // 좌표평면 그리드 그리기 (Canvas API)
  drawGrid() {
    const canvas = document.getElementById('coordinate-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const step = size / 12;

    ctx.fillStyle = '#1a0f07';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(78, 122, 90, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      const pos = i * step;
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(78, 181, 112, 0.7)';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(size, center);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, size);
    ctx.stroke();

    ctx.fillStyle = '#d9b48f';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let val = -5; val <= 5; val++) {
      if (val === 0) {
        ctx.fillText('0', center - 12, center + 12);
        continue;
      }
      
      const pos = center + (val * step);
      ctx.fillText(val.toString(), pos, center + 14);
      ctx.fillText((-val).toString(), center - 14, pos);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.font = 'bold 24px MedievalSharp';
    ctx.fillText('I', center + (size / 4), center - (size / 4));
    ctx.fillText('II', center - (size / 4), center - (size / 4));
    ctx.fillText('III', center - (size / 4), center + (size / 4));
    ctx.fillText('IV', center + (size / 4), center + (size / 4));

    this.drawTargetIndicator(ctx, center, step);
  },

  drawTargetIndicator(ctx, center, step) {
    const x = PlayerState.selectedX;
    const y = PlayerState.selectedY;

    const canvasX = center + (x * step);
    const canvasY = center - (y * step);

    ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    ctx.beginPath();
    ctx.moveTo(0, canvasY);
    ctx.lineTo(ctx.canvas.width, canvasY);
    ctx.moveTo(canvasX, 0);
    ctx.lineTo(canvasX, ctx.canvas.height);
    ctx.stroke();
    
    ctx.setLineDash([]);

    ctx.fillStyle = 'var(--gold)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(241, 196, 15, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 12, 0, Math.PI * 2);
    ctx.stroke();
  },

  updateSliderCoords() {
    const xSlider = document.getElementById('slider-x');
    const ySlider = document.getElementById('slider-y');

    PlayerState.selectedX = parseInt(xSlider.value);
    PlayerState.selectedY = parseInt(ySlider.value);

    document.getElementById('x-current-val').textContent = `X: ${PlayerState.selectedX}`;
    document.getElementById('y-current-val').textContent = `Y: ${PlayerState.selectedY}`;

    const confirmBtn = document.getElementById('btn-confirm-coord');
    const xyValue = document.getElementById('coord-xy-value');
    
    xyValue.textContent = `( ${PlayerState.selectedX} , ${PlayerState.selectedY} )`;
    confirmBtn.disabled = false;

    this.drawGrid();
  }
};

// ══════════════════════════════════════════════
// EVENT LISTENERS & INITIALIZATION
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  window.UI = UI;

  const nicknameInput = document.getElementById('input-nickname');
  const previewNickname = document.getElementById('preview-nickname');
  
  if (nicknameInput) {
    nicknameInput.addEventListener('input', (e) => {
      const text = e.target.value.trim();
      previewNickname.textContent = text || '모험가';
    });
  }

  const maleRadio = document.getElementById('avatar-male');
  const femaleRadio = document.getElementById('avatar-female');

  const updateAvatarSelectedStyles = () => {
    if (maleRadio.checked) {
      PlayerState.avatar = 'male';
    } else {
      PlayerState.avatar = 'female';
    }
  };

  if (maleRadio && femaleRadio) {
    maleRadio.addEventListener('change', updateAvatarSelectedStyles);
    femaleRadio.addEventListener('change', updateAvatarSelectedStyles);
  }

  const publicRadio = document.getElementById('room-public');
  const privateRadio = document.getElementById('room-private');
  const passwordGroup = document.getElementById('password-group');

  if (publicRadio && privateRadio && passwordGroup) {
    publicRadio.addEventListener('change', () => passwordGroup.style.display = 'none');
    privateRadio.addEventListener('change', () => passwordGroup.style.display = 'block');
  }

  const xSlider = document.getElementById('slider-x');
  const ySlider = document.getElementById('slider-y');

  if (xSlider && ySlider) {
    xSlider.addEventListener('input', () => UI.updateSliderCoords());
    ySlider.addEventListener('input', () => UI.updateSliderCoords());
  }

  initParticles();
  console.log('🎮 픽셀 이스케이프 클라이언트 구동 완료. UI 이벤트 대기 중...');
});

function initParticles() {
  const container = document.getElementById('dustParticles');
  if (!container) return;

  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.style.position = 'absolute';
    particle.style.width = `${Math.random() * 4 + 2}px`;
    particle.style.height = particle.style.width;
    particle.style.background = 'rgba(241, 196, 15, 0.4)';
    particle.style.borderRadius = '50%';
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.left = `${Math.random() * 100}%`;
    
    const duration = Math.random() * 10 + 10;
    const delay = Math.random() * -20;
    particle.style.animation = `floatParticle ${duration}s linear infinite`;
    particle.style.animationDelay = `${delay}s`;
    
    container.appendChild(particle);
  }
}

const style = document.createElement('style');
style.textContent = `
@keyframes floatParticle {
  0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
  10% { opacity: 0.8; }
  90% { opacity: 0.8; }
  100% { transform: translateY(-120px) translateX(${Math.random() * 40 - 20}px) scale(0.6); opacity: 0; }
}
`;
document.head.appendChild(style);
