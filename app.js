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

// 상점 아이템 데이터베이스 (테스트용 데모 데이터)
const ShopData = {
  hair: [
    { id: 'hair_normal', name: '기본 헤어', price: 0, icon: '💇', equipped: true },
    { id: 'hair_warrior', name: '전사의 불꽃 헤어', price: 50, icon: '🔥', equipped: false },
    { id: 'hair_wizard', name: '마법의 퍼플 헤어', price: 80, icon: '🔮', equipped: false },
    { id: 'hair_crown', name: '황금 왕관', price: 150, icon: '👑', equipped: false }
  ],
  costume: [
    { id: 'costume_normal', name: '기본 탐험복', price: 0, icon: '👕', equipped: true },
    { id: 'costume_armor', name: '강철 플레이트 아머', price: 60, icon: '🛡️', equipped: false },
    { id: 'costume_robe', name: '대마법사 로브', price: 90, icon: '🧥', equipped: false }
  ],
  aura: [
    { id: 'aura_none', name: '없음', price: 0, icon: '❌', equipped: true },
    { id: 'aura_fire', name: '이그니스 오라', price: 100, icon: '🔥', equipped: false, effect: 'aura-fire' },
    { id: 'aura_ice', name: '프로스트 오라', price: 100, icon: '❄️', equipped: false, effect: 'aura-ice' },
    { id: 'aura_forest', name: '네이처 오라', price: 120, icon: '🍃', equipped: false, effect: 'aura-forest' }
  ],
  slider: [
    { id: 'slider_normal', name: '나무 슬라이더', price: 0, icon: '🪵', equipped: true },
    { id: 'slider_gold', name: '황금 슬라이더', price: 200, icon: '🔱', equipped: false },
    { id: 'slider_neon', name: '차원 레이저 슬라이더', price: 300, icon: '⚡', equipped: false }
  ]
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
        this.renderShop('hair');
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

  // 상점 아이템 렌더링
  renderShop(category) {
    const grid = document.getElementById(`grid-${category}`);
    if (!grid) return;

    grid.innerHTML = '';
    const items = ShopData[category];

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = `shop-item-card ${item.equipped ? 'equipped' : ''}`;
      card.innerHTML = `
        <div class="shop-item-icon-box">
          <span style="font-size: 2.2rem;">${item.icon}</span>
        </div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price-tag">
          🪙 ${item.price}
        </div>
      `;

      card.onclick = () => this.previewOrBuyItem(category, item);
      grid.appendChild(card);
    });
  },

  // 아이템 미리보기 및 구매 로직
  previewOrBuyItem(category, item) {
    // 1. 이미 보유/장착 중인 경우 장착 토글
    if (item.price === 0 || item.equipped) {
      ShopData[category].forEach(i => i.equipped = false);
      item.equipped = true;
      this.showToast(`✨ ${item.name} 장착 완료!`);
      this.renderShop(category);
      this.updateAvatarPreview();
      return;
    }

    // 2. 구매 필요
    if (PlayerState.coins >= item.price) {
      if (confirm(`🪙 코인 ${item.price}개를 지불하고 [${item.name}]을(를) 구매하시겠습니까?`)) {
        PlayerState.coins -= item.price;
        item.equipped = true;
        // 다른 아이템 장착 해제 후 방금 산 것 장착
        ShopData[category].forEach(i => {
          if (i.id !== item.id) i.equipped = false;
        });
        document.getElementById('shop-coins').textContent = PlayerState.coins;
        this.showToast(`🎉 구매 성공! ${item.name}을(를) 장착했습니다.`);
        this.renderShop(category);
        this.updateAvatarPreview();
      }
    } else {
      this.showToast('🪙 코인이 부족합니다! 게임을 플레이하여 획득하세요.');
    }
  },

  // 아바타 미리보기 실시간 업데이트
  updateAvatarPreview() {
    const previewAvatar = document.getElementById('shop-preview-avatar');
    const previewAura = document.getElementById('preview-aura-effect');
    previewAvatar.src = `assets/avatar_${PlayerState.avatar}.png`;

    // 오라 효과 체크
    const equippedAura = ShopData.aura.find(i => i.equipped);
    previewAura.className = 'aura-effect';
    if (equippedAura && equippedAura.effect) {
      previewAura.classList.add(equippedAura.effect);
    }
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
      // 게임 중인 방은 관리자 콘솔을 통한 관전만 유도하거나 관전 팝업 오픈
      this.openSpectateModal(room);
      return;
    }

    if (room.isPrivate) {
      const pw = prompt('🔑 비밀번호 4자리를 입력하세요:');
      if (pw !== '1234') { // 임시 고정 비밀번호
        this.showToast('❌ 비밀번호가 올바르지 않습니다.');
        return;
      }
    }

    // 입장 완료 모의 처리
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
    // 임시 카운트
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

    // 미니 플레이어 리스트 렌더링
    const miniList = document.getElementById('player-list-mini');
    const leftCards = document.getElementById('player-cards-left');
    miniList.innerHTML = '';
    leftCards.innerHTML = '';

    const listPlayers = room ? room.players : [PlayerState.nickname];
    listPlayers.forEach((p, idx) => {
      // HUD 미니 아이콘
      const mini = document.createElement('div');
      mini.className = `mini-card ${idx === 0 ? 'active-turn' : ''}`;
      mini.innerHTML = `
        <img src="assets/avatar_${PlayerState.avatar}.png" alt="아바타" class="mini-avatar">
      `;
      miniList.appendChild(mini);

      // 사이드바 프로필 카드
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

    // 캔버스 드로잉 시작
    this.drawGrid();
  },

  // 좌표평면 그리드 그리기 (Canvas API)
  drawGrid() {
    const canvas = document.getElementById('coordinate-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const step = size / 12; // -5 to 5 (총 11칸의 범위 + 여백 확보용 12분할)

    // 배경 청소
    ctx.fillStyle = '#1a0f07'; // 어두운 우드 바탕
    ctx.fillRect(0, 0, size, size);

    // 모눈 눈금선 그리기
    ctx.strokeStyle = 'rgba(78, 122, 90, 0.25)'; // 초록빛 격자선
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      const pos = i * step;
      // 가로선
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();

      // 세로선
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
    }

    // 메인 X축 & Y축 그리기
    ctx.strokeStyle = 'rgba(78, 181, 112, 0.7)'; // 선명한 그린 축
    ctx.lineWidth = 3;
    
    // X축
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(size, center);
    ctx.stroke();

    // Y축
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, size);
    ctx.stroke();

    // 눈금 숫자와 좌표 라벨
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
      // X축 눈금 숫자 (가로축 위에 표시)
      ctx.fillText(val.toString(), pos, center + 14);
      // Y축 눈금 숫자 (세로축 옆에 표시)
      ctx.fillText((-val).toString(), center - 14, pos); // Canvas Y축은 위에서 아래로 증가하므로 부호 반전
    }

    // 사분면 네이밍 장식 텍스트
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.font = 'bold 24px MedievalSharp';
    ctx.fillText('I', center + (size / 4), center - (size / 4));
    ctx.fillText('II', center - (size / 4), center - (size / 4));
    ctx.fillText('III', center - (size / 4), center + (size / 4));
    ctx.fillText('IV', center + (size / 4), center + (size / 4));

    // 현재 슬라이더 값에 따른 십자 조준선 및 임시 점 그리기
    this.drawTargetIndicator(ctx, center, step);
  },

  // 현재 슬라이더 조준점 표시
  drawTargetIndicator(ctx, center, step) {
    const x = PlayerState.selectedX;
    const y = PlayerState.selectedY;

    const canvasX = center + (x * step);
    const canvasY = center - (y * step); // 위쪽이 플러스이므로 마이너스 연산

    // 십자 하이라이트 가이드라인
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)'; // 골드 흐릿한 가이드라인
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    ctx.beginPath();
    ctx.moveTo(0, canvasY);
    ctx.lineTo(ctx.canvas.width, canvasY);
    ctx.moveTo(canvasX, 0);
    ctx.lineTo(canvasX, ctx.canvas.height);
    ctx.stroke();
    
    ctx.setLineDash([]); // 대쉬 포맷 해제

    // 타겟 지점 서클링 효과
    ctx.fillStyle = 'var(--gold)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 펄싱 링
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 12, 0, Math.PI * 2);
    ctx.stroke();
  },

  // 슬라이더 조작에 따른 값 실시간 매핑
  updateSliderCoords() {
    const xSlider = document.getElementById('slider-x');
    const ySlider = document.getElementById('slider-y');

    PlayerState.selectedX = parseInt(xSlider.value);
    PlayerState.selectedY = parseInt(ySlider.value);

    // 슬라이더 하단 정보 패널 텍스트 업데이트
    document.getElementById('x-current-val').textContent = `X: ${PlayerState.selectedX}`;
    document.getElementById('y-current-val').textContent = `Y: ${PlayerState.selectedY}`;

    // 선택 좌표 디스플레이 업데이트
    const confirmBtn = document.getElementById('btn-confirm-coord');
    const xyValue = document.getElementById('coord-xy-value');
    
    xyValue.textContent = `( ${PlayerState.selectedX} , ${PlayerState.selectedY} )`;
    confirmBtn.disabled = false;

    // 격자 재선택에 따른 캔버스 드로잉 업데이트
    this.drawGrid();
  }
};

// ══════════════════════════════════════════════
// EVENT LISTENERS & INITIALIZATION
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // 전역에서 UI 모듈을 호출할 수 있도록 윈도우 스코프 바인딩
  window.UI = UI;

  // 닉네임 입력란 글자 수 감지 및 뱃지 미리보기 실시간 업데이트
  const nicknameInput = document.getElementById('input-nickname');
  const previewNickname = document.getElementById('preview-nickname');
  
  if (nicknameInput) {
    nicknameInput.addEventListener('input', (e) => {
      const text = e.target.value.trim();
      previewNickname.textContent = text || '모험가';
    });
  }

  // 아바타 성별/스킨 라디오 변경 감지
  const maleRadio = document.getElementById('avatar-male');
  const femaleRadio = document.getElementById('avatar-female');

  const updateAvatarSelectedStyles = () => {
    const maleOpt = document.getElementById('avatar-opt-male');
    const femaleOpt = document.getElementById('avatar-opt-female');
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

  // 방 비공개 여부에 따른 비밀번호 입력란 열고 닫기
  const publicRadio = document.getElementById('room-public');
  const privateRadio = document.getElementById('room-private');
  const passwordGroup = document.getElementById('password-group');

  if (publicRadio && privateRadio && passwordGroup) {
    publicRadio.addEventListener('change', () => passwordGroup.style.display = 'none');
    privateRadio.addEventListener('change', () => passwordGroup.style.display = 'block');
  }

  // 게임 슬라이더 체인지 감지 바인딩
  const xSlider = document.getElementById('slider-x');
  const ySlider = document.getElementById('slider-y');

  if (xSlider && ySlider) {
    xSlider.addEventListener('input', () => UI.updateSliderCoords());
    ySlider.addEventListener('input', () => UI.updateSliderCoords());
  }

  // 첫 화면 로비 타이틀 플로팅 효과용 파티클
  initParticles();

  // 초기 데이터 연결 확인을 위한 로그
  console.log('🎮 픽셀 이스케이프 클라이언트 구동 완료. UI 이벤트 대기 중...');
});

// 미세 파티클 생성기 (우드 인테리어 내 먼지 불빛 효과)
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
    
    // 키프레임 애니메이션 랜덤 부여
    const duration = Math.random() * 10 + 10;
    const delay = Math.random() * -20;
    particle.style.animation = `floatParticle ${duration}s linear infinite`;
    particle.style.animationDelay = `${delay}s`;
    
    container.appendChild(particle);
  }
}

// Particle Floating Animation 추가
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
