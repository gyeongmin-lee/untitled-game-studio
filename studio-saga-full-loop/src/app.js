import {
  loadData, newRun, fmtMoney, clamp,
  studioAction, chooseCandidate, chooseDraft,
  startGreenlight, greenlightProject,
  playCard, takeRest, takeCrunch, nextMonth, chooseEvent,
  playLaunchCard, nextLaunchWeek,
  continueCareer, getTier, currentOfficeCap, cardsById, gradeLaunch,
  chooseStudioEvent
} from './game.js';

const SAVE_KEY = 'studio-saga-v3';
let state = null;
let data = null;

// ── Persistence ──────────────────────────────────────────────────────────────

function saveGame(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (_) {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

function dispatch(fn, ...args) {
  const next = fn(state, ...args);
  if (next === state) return;
  state = next;
  saveGame(state);
  render();
}

function dispatchWith(fn, ...args) {
  const next = fn(state, data, ...args);
  if (next === state) return;
  state = next;
  saveGame(state);
  render();
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  data = await loadData();
  window.__STUDIO_DATA__ = data;
  const saved = loadSave();
  state = saved || null;
  if (!state) {
    renderMainMenu();
  } else {
    render();
  }
}

function renderMainMenu() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center bg-gray-950 screen-enter">
      <div class="text-center mb-10">
        <h1 class="text-5xl font-black text-white mb-2 tracking-tight">🎮 Studio Saga</h1>
        <p class="text-gray-400 text-lg">5년간 스튜디오를 운영하고 전설을 만들어라</p>
      </div>
      <div class="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl border border-gray-800">
        <label class="block text-sm text-gray-400 mb-2">스튜디오 이름</label>
        <input id="studio-name-input"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-blue-500 mb-6"
          placeholder="새벽빌드 스튜디오"
          maxlength="24"
        />
        <button id="start-btn"
          class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-lg transition-colors mb-3 disabled:opacity-40"
        >새 게임 시작</button>
        ${loadSave() ? `<button id="continue-btn"
          class="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-colors">
          계속하기
        </button>` : ''}
      </div>
      <p class="text-gray-600 text-xs mt-6">모든 인게임 텍스트는 한국어 · Vanilla JS + Tailwind</p>
    </div>`;

  const input = document.getElementById('studio-name-input');
  const btn = document.getElementById('start-btn');
  const contBtn = document.getElementById('continue-btn');

  input.addEventListener('input', () => {
    btn.disabled = !input.value.trim();
  });
  btn.disabled = true;

  btn.addEventListener('click', () => {
    const name = input.value.trim() || '새벽빌드 스튜디오';
    state = newRun(data, name);
    saveGame(state);
    render();
  });

  if (contBtn) {
    contBtn.addEventListener('click', () => {
      state = loadSave();
      render();
    });
  }
}

// ── Main render router ───────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  if (!state) { renderMainMenu(); return; }

  // Build modal HTML first
  let modalHtml = '';
  if (state.modal) modalHtml = renderModal(state.modal);
  else if (state.candidates && state.candidates.length > 0) modalHtml = renderCandidatesModal();
  else if (state.draft) modalHtml = renderDraftModal();

  const screenHtml = (() => {
    switch (state.phase) {
      case 'studio':     return renderStudio();
      case 'greenlight': return renderGreenlight();
      case 'deckbuild':  return renderDeckbuild();
      case 'development':return renderDevelopment();
      case 'launch':     return renderLaunch();
      case 'settlement': return renderSettlement();
      case 'careerEnd':  return renderCareerEnd();
      default:           return `<div class="p-8 text-gray-400">알 수 없는 화면: ${state.phase}</div>`;
    }
  })();

  app.innerHTML = `<div class="screen-enter">${screenHtml}</div>${modalHtml}`;
  bindEvents();
}

// ── Shared UI helpers ────────────────────────────────────────────────────────

function stars(n, max = 3) {
  return Array.from({length: max}, (_, i) =>
    `<span class="${i < n ? 'star-filled' : 'star-empty'}">★</span>`
  ).join('');
}

function tierBadge(level, name) {
  return `<span class="tier-${name} text-white text-xs font-bold px-2 py-0.5 rounded-full">${name}</span>`;
}

function repBar(rep) {
  return `
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-400 w-10">명성</span>
      <div class="flex-1 bg-gray-800 rounded-full h-2">
        <div class="bg-yellow-500 h-2 rounded-full bar-fill" style="width:${rep}%"></div>
      </div>
      <span class="text-xs text-gray-300 w-7 text-right">${rep}</span>
    </div>`;
}

function moraleBar(morale, small = false) {
  const color = morale >= 70 ? 'bg-green-500' : morale >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  const h = small ? 'h-1.5' : 'h-2';
  return `<div class="w-full bg-gray-700 rounded-full ${h}">
    <div class="${color} ${h} rounded-full bar-fill" style="width:${morale}%"></div>
  </div>`;
}

function topBar() {
  const tier = getTier(state, data);
  return `
    <div class="flex items-center gap-4 px-6 py-3 bg-gray-900 border-b border-gray-800 flex-wrap">
      <span class="font-black text-white text-lg">${state.studioName}</span>
      ${tierBadge(tier.level, tier.name)}
      <span class="text-gray-400 text-sm">${state.year}년차 ${state.quarter}분기</span>
      <div class="flex-1 min-w-32">${repBar(state.reputation)}</div>
      <span class="text-green-400 font-bold text-sm">${fmtMoney(state.cash)}</span>
      <button data-action="go-main-menu" class="text-gray-600 hover:text-gray-400 text-xs ml-auto">메인 메뉴</button>
    </div>`;
}

function cardTile(card, opts = {}) {
  const { clickable = true, selected = false, small = false } = opts;
  const disabled = !clickable ? 'disabled' : '';
  const ring = selected ? 'ring-2 ring-blue-400' : '';
  const bg = selected ? 'bg-blue-900/40' : 'bg-gray-800';
  const textSize = small ? 'text-xs' : 'text-sm';
  return `
    <div class="game-card ${disabled} ${ring} ${bg} border border-gray-700 rounded-xl p-3 cursor-pointer select-none"
      data-card-id="${card.id}" ${!clickable ? 'style="pointer-events:none"' : ''}>
      <div class="${textSize} font-bold text-white mb-1 leading-tight">${card.name}</div>
      <div class="text-xs text-gray-400 leading-snug mb-2">${card.description}</div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded">${card.cost}시간</span>
        ${card.cash > 0 ? `<span class="bg-gray-700 text-yellow-400 text-xs px-1.5 py-0.5 rounded">₩${card.cash}M</span>` : ''}
        <span class="text-gray-500 text-xs">${card.tag}</span>
      </div>
    </div>`;
}

function employeeCard(emp, opts = {}) {
  const { showActions = false } = opts;
  const cards = data.cards.filter(c => emp.cards.includes(c.id));
  const moraleWarn = emp.morale < 30 ? '⚠️' : '';
  const moraleColor = emp.morale < 15 ? 'text-red-400' : emp.morale < 30 ? 'text-orange-400' : 'text-gray-500';
  return `
    <div class="bg-gray-800 border ${emp.morale < 15 ? 'border-red-700' : 'border-gray-700'} rounded-xl p-4">
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="font-bold text-white">${emp.name} ${moraleWarn}</div>
          <div class="text-xs text-gray-400">${emp.role} · <span class="text-blue-300">${emp.specialty}</span></div>
        </div>
        <div class="text-sm">${stars(emp.stars)}</div>
      </div>
      ${moraleBar(emp.morale, true)}
      <div class="text-xs ${moraleColor} mt-1 mb-3">사기 ${emp.morale} · 연봉 ${fmtMoney(emp.salary)}</div>
      <div class="flex flex-wrap gap-1">
        ${cards.map(c => `<span class="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">${c.name}</span>`).join('')}
      </div>
      ${emp.passive ? `<div class="text-xs text-indigo-400 mt-2">⚡ ${emp.passive.desc}</div>` : ''}
    </div>`;
}

// ── SCREEN: Studio Phase ─────────────────────────────────────────────────────

function renderStudio() {
  const tier = getTier(state, data);
  const officeCap = currentOfficeCap(state, data);
  const nextTier = data.tuning.tiers.find(t => t.level === state.officeLevel + 1);

  const apDots = Array.from({length: 3}, (_, i) =>
    `<div class="w-4 h-4 rounded-full ${i < state.ap ? 'bg-blue-500' : 'bg-gray-700'}"></div>`
  ).join('');

  const actions = [
    { id: 'recruit',      label: '채용 공고',   cost: '1AP + ₩60M', icon: '👤', disabled: state.ap < 1 || state.cash < 60 || state.employees.length >= officeCap },
    { id: 'research',     label: '사내 R&D',    cost: '1AP + ₩80M', icon: '🔬', disabled: state.ap < 1 || state.cash < 80 },
    { id: 'conference',   label: '컨퍼런스',     cost: '1AP + ₩160M',icon: '🎪', disabled: state.ap < 1 || state.cash < 160 },
    { id: 'upgrade-card', label: '기술 투자',    cost: '1AP + ₩90M', icon: '⬆️', disabled: state.ap < 1 || state.cash < 90 || !state.library.some(id => !state.upgraded.includes(id)) },
    { id: 'retreat',      label: '팀 워크샵',    cost: '1AP + ₩70M', icon: '🏕️', disabled: state.ap < 1 || state.cash < 70 },
    { id: 'salary',       label: '연봉 인상',    cost: '1AP + ₩50M', icon: '💰', disabled: state.ap < 1 || state.cash < 50 || state.employees.length === 0 },
    { id: 'pr',           label: '홍보 캠페인',   cost: '1AP + ₩90M', icon: '📣', disabled: state.ap < 1 || state.cash < 90 },
    { id: 'rest',         label: '숨고르기',     cost: '1AP',        icon: '😴', disabled: state.ap < 1 },
    { id: 'office',       label: '사무실 확장',   cost: `3AP + ₩${nextTier ? nextTier.upgradeCost : '?'}M`, icon: '🏢',
      disabled: state.ap < 3 || !nextTier || state.cash < (nextTier?.upgradeCost || 9999) || state.reputation < (nextTier?.reputation || 999) },
  ];

  return `
    ${topBar()}
    <div class="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-56px)]">

      <!-- Left: Employees -->
      <div class="lg:w-72 xl:w-80 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-bold text-white">직원 <span class="text-gray-400 text-sm font-normal">${state.employees.length}/${officeCap}</span></h2>
        </div>
        <div class="space-y-3">
          ${state.employees.length === 0
            ? '<p class="text-gray-600 text-sm">직원이 없습니다</p>'
            : state.employees.map(e => employeeCard(e)).join('')}
        </div>

        <!-- Shipped games mini timeline -->
        ${state.shipped.length > 0 ? `
        <div class="mt-6">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">출시 이력</h3>
          <div class="space-y-1.5">
            ${state.shipped.map(g => `
              <div class="flex items-center gap-2 text-xs">
                <span class="grade-${g.grade} font-bold w-16 shrink-0">${g.grade}</span>
                <span class="text-gray-300 truncate">${g.title}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Owned IPs -->
        ${state.ips.length > 0 ? `
        <div class="mt-4">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">보유 IP</h3>
          <div class="space-y-1">
            ${state.ips.map(ip => `
              <div class="text-xs text-blue-300 flex items-center gap-1">
                <span>📦</span> ${ip.title}
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Studio Traits -->
        ${state.traits.length > 0 ? `
        <div class="mt-4">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">획득 특성</h3>
          <div class="flex flex-wrap gap-1">
            ${state.traits.map(tid => {
              const t = data.traits.find(tr => tr.id === tid);
              return t ? `<span class="bg-purple-900/60 text-purple-300 text-xs px-2 py-0.5 rounded-full border border-purple-700">${t.name}</span>` : '';
            }).join('')}
          </div>
        </div>` : ''}
      </div>

      <!-- Center: Actions + Event log -->
      <div class="flex-1 p-5 overflow-y-auto">

        <!-- AP tracker -->
        <div class="flex items-center gap-3 mb-5">
          <span class="text-sm text-gray-400">행동력</span>
          <div class="flex gap-1.5">${apDots}</div>
          <span class="text-sm text-gray-500">${state.ap}/3</span>
        </div>

        <!-- Actions grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          ${actions.map(a => `
            <button data-action="studio-action" data-action-id="${a.id}"
              class="flex flex-col items-start p-3.5 rounded-xl border transition-colors text-left
                ${a.disabled
                  ? 'bg-gray-800/40 border-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-gray-600 text-white'}"
              ${a.disabled ? 'disabled' : ''}>
              <span class="text-xl mb-1">${a.icon}</span>
              <span class="font-semibold text-sm">${a.label}</span>
              <span class="text-xs ${a.disabled ? 'text-gray-700' : 'text-gray-400'} mt-0.5">${a.cost}</span>
            </button>`).join('')}
        </div>

        <!-- Event log -->
        ${state.eventLog.length > 0 ? `
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">최근 로그</h3>
          <div class="space-y-1.5 max-h-40 overflow-y-auto">
            ${state.eventLog.slice(0, 8).map((e, i) =>
              `<p class="text-sm ${i === 0 ? 'text-gray-300' : 'text-gray-600'}">${e}</p>`
            ).join('')}
          </div>
        </div>` : ''}
      </div>

      <!-- Right: New project CTA -->
      <div class="lg:w-56 xl:w-64 bg-gray-900 border-l border-gray-800 p-5 flex flex-col">
        <div class="flex-1"></div>
        <div>
          <div class="bg-gray-800 rounded-xl p-4 mb-4">
            <div class="text-xs text-gray-400 mb-1">라이브러리</div>
            <div class="text-2xl font-black text-white">${state.library.length}<span class="text-sm text-gray-500 font-normal">장</span></div>
            <div class="text-xs text-gray-500 mt-1">${state.upgraded.length}장 업그레이드됨</div>
          </div>
          <button data-action="go-greenlight"
            class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition-colors">
            🎯 새 프로젝트 시작
          </button>
          ${state.year > 5 ? `<button data-action="go-career-end" class="w-full mt-2 bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 rounded-xl text-xs transition-colors">커리어 종료 보기</button>` : ''}
        </div>
      </div>
    </div>`;
}

// ── SCREEN: Greenlight ────────────────────────────────────────────────────────

function renderGreenlight() {
  const scopes = data.tuning.scopes;
  const selectedScope = state._glScope || 'small';
  const selectedIp = state._glIp || 'new';
  const selectedIpId = state._glIpId || null;
  const scope = scopes[selectedScope];
  const tier = getTier(state, data);
  const canEpic = tier.level >= 4;

  const sequelIps = state.ips.filter(ip => ['흥행작', '신드롬'].includes(state.shipped.find(g => g.id === ip.id)?.grade));

  return `
    ${topBar()}
    <div class="max-w-2xl mx-auto p-6 screen-enter">
      <h2 class="text-2xl font-black text-white mb-6">🎯 프로젝트 기획</h2>

      <!-- Title input -->
      <div class="mb-5">
        <label class="block text-sm text-gray-400 mb-2">게임 제목 <span class="text-red-400">*</span></label>
        <input id="game-title-input"
          class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-xl font-bold placeholder-gray-600 focus:outline-none focus:border-blue-500"
          placeholder="게임 제목을 입력하세요"
          value="${state._glTitle || ''}"
          maxlength="32"
        />
      </div>

      <!-- Scope selector -->
      <div class="mb-5">
        <label class="block text-sm text-gray-400 mb-2">개발 규모</label>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          ${Object.entries(scopes).map(([id, sc]) => {
            const locked = id === 'epic' && !canEpic;
            const sel = selectedScope === id;
            return `
              <button data-action="select-scope" data-scope="${id}"
                class="p-3 rounded-xl border text-left transition-colors
                  ${locked ? 'opacity-40 cursor-not-allowed bg-gray-800/30 border-gray-800' :
                    sel ? 'bg-blue-900/60 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 hover:border-gray-500 text-gray-300'}"
                ${locked ? 'disabled' : ''}>
                <div class="font-bold text-sm">${sc.name}</div>
                <div class="text-xs text-gray-400 mt-1">${sc.months}개월 · ₩${sc.budget}M</div>
                <div class="text-xs text-gray-500">덱 ${sc.deckCap}장</div>
                ${locked ? '<div class="text-xs text-red-500 mt-1">명문 이상 필요</div>' : ''}
              </button>`;
          }).join('')}
        </div>
      </div>

      <!-- Genre selector -->
      <div class="mb-5">
        <label class="block text-sm text-gray-400 mb-2">장르 <span class="text-red-400">*</span> <span class="text-gray-500 text-xs">· 주요 스탯을 충족해야 점수에 반영됩니다</span></label>
        <div class="grid grid-cols-4 gap-2">
          ${(data.genres || []).map(g => {
            const sel = (state._glGenreId === g.id);
            return `
              <button data-action="select-genre" data-genre-id="${g.id}"
                class="p-3 rounded-xl border text-left transition-colors
                  ${sel ? 'bg-indigo-900/60 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 hover:border-gray-500 text-gray-300'}">
                <div class="text-xl mb-1">${g.icon}</div>
                <div class="font-bold text-xs">${g.name}</div>
                <div class="text-xs text-gray-500 mt-0.5 leading-tight">${g.primaryStats.map(s => slotKo(s)).join('·')}</div>
              </button>`;
          }).join('')}
        </div>
        ${state._glGenreId
          ? `<div class="mt-2 text-xs text-indigo-300">시너지: ${(data.genres||[]).find(g=>g.id===state._glGenreId)?.synergy}</div>`
          : `<div class="mt-2 text-xs text-red-400">장르를 먼저 선택하세요</div>`}
      </div>

      <!-- IP Mode -->
      <div class="mb-5">
        <label class="block text-sm text-gray-400 mb-2">IP 유형</label>
        <div class="flex gap-2 flex-wrap">
          <button data-action="select-ip" data-ip="new"
            class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors
              ${selectedIp === 'new' ? 'bg-blue-900/60 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}">
            신규 IP
          </button>
          ${sequelIps.length > 0 ? sequelIps.map(ip => `
            <button data-action="select-ip" data-ip="sequel" data-ip-id="${ip.id}"
              class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                ${selectedIp === 'sequel' && selectedIpId === ip.id ? 'bg-purple-900/60 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}">
              📦 속편: ${ip.title}
            </button>`).join('') : ''}
        </div>
      </div>

      <!-- Budget preview -->
      <div class="bg-gray-800 rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><div class="text-xs text-gray-500">개발 기간</div><div class="font-bold text-white">${scope.months}개월</div></div>
        <div><div class="text-xs text-gray-500">예산</div><div class="font-bold text-yellow-400">₩${scope.budget}M</div></div>
        <div><div class="text-xs text-gray-500">덱 한도</div><div class="font-bold text-white">${scope.deckCap}장</div></div>
        <div><div class="text-xs text-gray-500">위험도</div><div class="font-bold ${scope.risk === '파산급' ? 'text-red-400' : scope.risk === '높음' ? 'text-orange-400' : 'text-gray-300'}">${scope.risk}</div></div>
      </div>

      <div id="gl-error-msg" class="text-red-400 text-sm mb-2 min-h-[1.25rem]"></div>
      <div class="flex gap-3">
        <button data-action="go-studio" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-colors">← 돌아가기</button>
        <button id="go-deckbuild-btn" data-action="go-deckbuild"
          class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          덱 구성으로 →
        </button>
      </div>
    </div>`;
}

// ── SCREEN: Deckbuild ────────────────────────────────────────────────────────

function renderDeckbuild() {
  const glScope = state._glScope || 'small';
  const scope = data.tuning.scopes[glScope];
  const deckCap = scope.deckCap;
  const currentDeck = state._glDeck || [];
  const cb = cardsById(data);
  const libraryCards = state.library.map(id => cb[id]).filter(Boolean);

  // Live identity detection
  const identityMatch = detectIdentity(currentDeck, data);

  return `
    ${topBar()}
    <div class="flex flex-col lg:flex-row min-h-[calc(100vh-56px)]">

      <!-- Library -->
      <div class="flex-1 p-5 overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-white text-lg">카드 라이브러리 <span class="text-gray-400 text-sm font-normal">${libraryCards.length}장</span></h2>
          <span class="text-sm text-gray-400">클릭해서 덱에 추가</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          ${libraryCards.map(c => {
            const inDeck = currentDeck.includes(c.id);
            return cardTile(c, { clickable: !inDeck || currentDeck.length < deckCap, selected: inDeck });
          }).join('')}
        </div>
      </div>

      <!-- Right: Deck + Identity -->
      <div class="lg:w-72 xl:w-80 bg-gray-900 border-l border-gray-800 p-5 flex flex-col overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white">현재 덱</h3>
          <span class="text-sm ${currentDeck.length >= deckCap ? 'text-red-400' : 'text-gray-400'}">${currentDeck.length}/${deckCap}</span>
        </div>

        <div class="space-y-1.5 mb-5 flex-1 overflow-y-auto">
          ${currentDeck.length === 0
            ? '<p class="text-gray-600 text-sm">카드를 선택하세요</p>'
            : currentDeck.map(id => {
                const c = cb[id];
                if (!c) return '';
                return `<div class="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span class="text-sm text-white">${c.name}</span>
                  <button data-action="remove-from-deck" data-card-id="${id}" class="text-gray-600 hover:text-red-400 text-xs ml-2">✕</button>
                </div>`;
              }).join('')}
        </div>

        <!-- Genre + Identity panel -->
        ${(() => {
          const genre = (data.genres || []).find(g => g.id === state._glGenreId);
          const identity = genre ? data.identities.find(i => i.id === genre.identityId) : null;
          const scopeFactor = data.tuning.scopeFactors?.[glScope] ?? 1.0;
          return `<div class="bg-gray-800 rounded-xl p-4 mb-4">
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">장르 목표</h3>
            ${genre ? `
              <div class="text-indigo-300 font-bold text-sm mb-1">${genre.icon} ${genre.name}</div>
              <div class="text-xs text-gray-400 mb-2">${genre.synergy}</div>
              ${identity ? `<div class="text-xs text-gray-500 mb-1">주요 스탯 최소치 (${data.tuning.scopes[glScope].name}):</div>
              <div class="space-y-0.5">
                ${genre.primaryStats.map(s => {
                  const req = identity.requires[s];
                  const minReq = req ? Math.ceil(req * scopeFactor) : null;
                  return minReq ? `<div class="text-xs ${minReq ? 'text-red-300' : 'text-gray-500'}">${slotKo(s)} ≥ ${minReq}</div>` : '';
                }).join('')}
              </div>` : ''}` : `<div class="text-red-400 text-xs">← 먼저 장르를 선택하세요</div>`}
          </div>`;
        })()}

        <div class="flex flex-col gap-2">
          <button data-action="go-greenlight" class="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors">← 기획으로</button>
          ${(() => {
            const minCards = Math.min(4, deckCap);
            const sequelIp = state._glIp === 'sequel' ? state.ips.find(ip => ip.id === state._glIpId) : null;
            const devErrors = [];
            if (currentDeck.length < minCards) devErrors.push(`카드 최소 ${minCards}장 필요 (현재 ${currentDeck.length}장)`);
            if (sequelIp) {
              const required = Math.ceil(currentDeck.length / 2);
              const reused = currentDeck.filter(id => sequelIp.deckMemory.includes(id)).length;
              if (reused < required) devErrors.push(`속편: 이전 IP 카드 ${required}장 이상 포함 필요 (현재 ${reused}장)`);
            }
            const budget = state._glIp === 'dlc' ? 100 : data.tuning.scopes[glScope].budget;
            if (state.cash < budget) devErrors.push(`자금 부족 — 필요 ₩${budget}M`);
            return `
              ${devErrors.length ? `<div class="text-red-400 text-xs leading-snug">${devErrors.join('<br>')}</div>` : ''}
              <button data-action="start-dev"
                class="bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                ${devErrors.length ? 'disabled' : ''}>
                🚀 개발 시작
              </button>`;
          })()}
        </div>
      </div>
    </div>`;
}

function slotKo(slot) {
  const map = {gameplay:'게임플레이',story:'스토리',visual:'비주얼',audio:'사운드',systems:'시스템',polish:'폴리싱'};
  return map[slot] || slot;
}

function detectIdentity(deck, data) {
  if (!deck.length) return null;
  const cb = cardsById(data);
  const tagCounts = {};
  deck.forEach(id => {
    const c = cb[id];
    if (c?.tag) tagCounts[c.tag] = (tagCounts[c.tag] || 0) + 1;
  });
  // Check identities by required slot scores (approximate from tag counts)
  for (const id of data.identities) {
    const totalReq = Object.values(id.requires).reduce((a, b) => a + b, 0);
    const matched = id.tags.some(tag => (tagCounts[tag] || 0) >= 2);
    if (matched) return id;
  }
  return null;
}

// ── SCREEN: Development ──────────────────────────────────────────────────────

function renderDevelopment() {
  const p = state.project;
  if (!p) return '<div class="p-8 text-gray-400">프로젝트 없음</div>';
  const cb = cardsById(data);
  const slotKeys = ['gameplay','story','visual','audio','systems','polish'];
  const slotNames = slotKeys.map(slotKo);

  const totalBoard = Object.values(p.board).reduce((a, b) => a + b, 0);

  return `
    ${topBar()}
    <div class="flex flex-col lg:flex-row min-h-[calc(100vh-56px)]">

      <!-- Left: Build board + gauges -->
      <div class="lg:w-64 xl:w-72 bg-gray-900 border-r border-gray-800 p-4">
        <div class="mb-4">
          <div class="font-black text-white text-lg leading-tight">${p.title}</div>
          <div class="text-xs text-gray-400 mt-1">${p.scopeName} · ${p.month}/${p.months}개월</div>
        </div>

        <!-- Genre + momentum status -->
        ${p.genre ? `<div class="flex items-center gap-2 mb-3 text-xs">
          <span class="text-indigo-300">${p.genre.icon} ${p.genre.name}</span>
          <span class="text-gray-600">·</span>
          <span class="text-gray-400">모멘텀</span>
          <div class="flex gap-0.5">${Array.from({length:10},(_,i)=>`<div class="w-2 h-2 rounded-sm ${i < (p.momentum||0) ? 'bg-yellow-400' : 'bg-gray-700'}"></div>`).join('')}</div>
          <span class="text-yellow-400 font-medium">${p.momentum||0}</span>
        </div>` : ''}

        <!-- Build board -->
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">빌드 보드</h3>
        <div class="space-y-2 mb-5">
          ${(() => {
            const maxVal = Math.max(20, ...slotKeys.map(s => p.board[s]));
            const primaryStats = p.genre?.primaryStats || [];
            const identity = data.identities.find(i => i.id === p.identityId);
            const scopeFactor = data.tuning.scopeFactors?.[p.scopeId] ?? 1.0;
            return slotKeys.map((slot, i) => {
              const val = p.board[slot];
              const pct = Math.min(100, (val / maxVal) * 100);
              const isPrimary = primaryStats.includes(slot);
              const minReq = isPrimary && identity?.requires[slot] ? identity.requires[slot] * scopeFactor : null;
              const locked = minReq !== null && val < minReq;
              return `<div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="${isPrimary ? 'text-indigo-300 font-medium' : 'text-gray-400'}">${slotNames[i]}${isPrimary ? ' *' : ''}</span>
                  <span class="${locked ? 'text-red-400' : 'text-gray-300'} font-medium">${val}${minReq !== null ? `/${Math.ceil(minReq)}` : ''}</span>
                </div>
                <div class="bg-gray-800 rounded-full h-1.5">
                  <div class="${locked ? 'bg-red-500' : isPrimary ? 'bg-indigo-400' : 'bg-blue-500'} h-1.5 rounded-full bar-fill" style="width:${pct}%"></div>
                </div>
              </div>`;
            }).join('');
          })()}
        </div>

        <!-- Gauges -->
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">리소스</h3>
        <div class="space-y-2">
          ${gaugeFormatted('프로젝트 자금', fmtMoney(p.cash), Math.min(100, (p.cash / (p.cash + 200)) * 100), 'text-yellow-400')}
          ${gaugeFormatted('팀 사기', `${Math.round(p.morale)}${p.morale < 30 ? ' ⚠️' : ''}`, p.morale, p.morale >= 60 ? 'text-green-400' : p.morale >= 30 ? 'text-yellow-400' : 'text-red-400')}
          ${gaugeFormatted('기술 부채', `${Math.round(p.debt)}${p.debt > 5 ? ` 💀-${Math.floor(p.debt/3)}/달` : ''}`, (p.debt / 30) * 100, 'text-orange-400', true)}
          ${gaugeFormatted('기대치', `${Math.round(p.hype)}`, p.hype, 'text-blue-400')}
        </div>
        <div class="mt-3 text-xs text-gray-600">
          월 급여: ${fmtMoney(Math.round(state.employees.reduce((s,e)=>s+e.salary,0)/4))}
        </div>
      </div>

      <!-- Center: Hand + controls -->
      <div class="flex-1 p-5 overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-white">이번 달 <span class="text-gray-400 text-sm font-normal">남은 시간: ${p.hours}h</span></h2>
        </div>

        <!-- Hand -->
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          ${p.hand.length === 0
            ? '<p class="text-gray-600 col-span-full text-center py-8">손패가 없습니다. 다음 달로 넘어가세요.</p>'
            : p.hand.map(id => {
                const c = cb[id];
                if (!c) return '';
                const upgraded = state.upgraded.includes(id);
                const affordable = p.hours >= Math.max(1, c.cost - (upgraded ? 1 : 0)) && p.cash >= Math.max(0, c.cash - (upgraded ? 10 : 0));
                const hasGenreBonus = p.genre && c.genreTags?.includes(p.genre.id);
                return `
                  <div class="game-card ${!affordable ? 'disabled' : ''} bg-gray-800 border ${hasGenreBonus ? 'border-indigo-500' : 'border-gray-700'} rounded-xl p-3 cursor-pointer select-none"
                    data-action="play-card" data-card-id="${id}" ${!affordable ? 'style="pointer-events:none"' : ''}>
                    <div class="text-sm font-bold text-white mb-1">${c.name}${upgraded ? ' <span class="text-blue-400 text-xs">+</span>' : ''}${c.exhaust ? ' <span class="text-orange-400 text-xs">소진</span>' : ''}</div>
                    <div class="text-xs text-gray-400 leading-snug mb-2">${c.description}</div>
                    <div class="flex gap-1.5 flex-wrap">
                      <span class="bg-gray-700 text-xs px-1.5 py-0.5 rounded ${!affordable ? 'text-gray-600' : 'text-gray-300'}">${Math.max(1, c.cost - (upgraded ? 1 : 0))}h</span>
                      ${c.cash > 0 ? `<span class="bg-gray-700 text-yellow-400 text-xs px-1.5 py-0.5 rounded">₩${Math.max(0, c.cash - (upgraded ? 10 : 0))}M</span>` : ''}
                      ${hasGenreBonus ? '<span class="text-indigo-300 text-xs">+1 시너지</span>' : ''}
                    </div>
                  </div>`;
              }).join('')}
        </div>

        <!-- Recent actions log -->
        ${p.history.length > 1 ? `
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">개발 로그</h3>
          <div class="space-y-1 max-h-32 overflow-y-auto">
            ${p.history.slice(0, 6).map((h, i) =>
              `<p class="text-xs ${i === 0 ? 'text-gray-300' : 'text-gray-600'}">${h}</p>`
            ).join('')}
          </div>
        </div>` : ''}

        <!-- Controls -->
        <div class="flex gap-3 flex-wrap">
          <button data-action="take-crunch"
            class="bg-orange-800 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
            🔥 크런치 (+4h, 사기-10)
          </button>
          <button data-action="take-rest"
            class="bg-teal-800 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
            😴 휴식 (사기+8)
          </button>
          <button data-action="next-month"
            class="ml-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
            다음 달 →
          </button>
        </div>
      </div>
    </div>`;
}

function gauge(label, value, max, colorClass, inverse = false) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = inverse
    ? (pct > 66 ? 'bg-red-500' : pct > 33 ? 'bg-yellow-500' : 'bg-green-500')
    : (pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500');
  const display = typeof value === 'number' && value > 999
    ? `₩${Math.round(value).toLocaleString('ko-KR')}M`
    : value;
  return `<div>
    <div class="flex justify-between text-xs mb-1">
      <span class="text-gray-400">${label}</span>
      <span class="${colorClass} font-medium">${display}</span>
    </div>
    <div class="bg-gray-800 rounded-full h-1.5">
      <div class="${barColor} h-1.5 rounded-full bar-fill" style="width:${pct}%"></div>
    </div>
  </div>`;
}

function gaugeFormatted(label, displayText, pct, colorClass, inverse = false) {
  const barColor = inverse
    ? (pct > 66 ? 'bg-red-500' : pct > 33 ? 'bg-yellow-500' : 'bg-green-500')
    : (pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500');
  return `<div>
    <div class="flex justify-between text-xs mb-1">
      <span class="text-gray-400">${label}</span>
      <span class="${colorClass} font-medium">${displayText}</span>
    </div>
    <div class="bg-gray-800 rounded-full h-1.5">
      <div class="${barColor} h-1.5 rounded-full bar-fill" style="width:${Math.min(100,pct)}%"></div>
    </div>
  </div>`;
}

// ── SCREEN: Launch ───────────────────────────────────────────────────────────

function renderLaunch() {
  const l = state.launch;
  if (!l) return '<div class="p-8 text-gray-400">출시 데이터 없음</div>';

  const kpis = [
    { label: '메타크리틱', value: l.metacritic, max: 99, unit: '점', color: l.metacritic >= 80 ? 'text-green-400' : l.metacritic >= 65 ? 'text-yellow-400' : 'text-red-400' },
    { label: '스팀 평가', value: l.steam, max: 99, unit: '%', color: l.steam >= 75 ? 'text-green-400' : 'text-yellow-400' },
    { label: '위시리스트 전환', value: l.wishlist, max: 80, unit: '%', color: 'text-blue-400' },
    { label: '스트리머 픽업', value: Math.round(l.streamer), max: 100, unit: '', color: 'text-purple-400' },
    { label: '현재 매출', value: Math.round(l.sales), max: 3000, unit: 'M', color: l.sales >= 800 ? 'text-green-400' : 'text-gray-300', isMoney: true },
  ];

  const launchCards = l.hand || [];

  return `
    ${topBar()}
    <div class="max-w-3xl mx-auto p-5 screen-enter">
      <div class="flex items-center gap-3 mb-5">
        <h2 class="text-xl font-black text-white">🚀 출시 운영</h2>
        <span class="text-gray-400">${state.project.title}</span>
        <span class="ml-auto text-sm text-gray-400">${l.week}/4주차</span>
      </div>

      <!-- KPI tiles -->
      <div class="grid grid-cols-5 gap-3 mb-6">
        ${kpis.map(k => `
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
            <div class="text-xs text-gray-500 mb-1">${k.label}</div>
            <div class="${k.color} text-xl font-black">${k.isMoney ? `₩${k.value}M` : `${k.value}${k.unit}`}</div>
            <div class="bg-gray-700 h-1 rounded-full mt-2">
              <div class="bg-current h-1 rounded-full" style="width:${Math.min(100, (k.value/k.max)*100)}%"></div>
            </div>
          </div>`).join('')}
      </div>

      <!-- Launch cards -->
      <h3 class="font-bold text-white mb-3">출시 카드 <span class="text-gray-400 text-sm font-normal">(클릭해서 사용)</span></h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${launchCards.map(c => `
          <button data-action="play-launch-card" data-card-id="${c.id}"
            class="game-card bg-gray-800 border border-gray-700 rounded-xl p-3 text-left cursor-pointer hover:border-blue-500 transition-colors">
            <div class="font-bold text-sm text-white mb-1">${c.name}</div>
            <div class="text-xs text-gray-400 leading-snug">${c.description}</div>
          </button>`).join('')}
        ${launchCards.length === 0 ? '<p class="text-gray-600 text-sm col-span-full">이번 주 카드가 없습니다</p>' : ''}
      </div>

      <!-- Weekly history -->
      ${l.history && l.history.length > 0 ? `
      <div class="bg-gray-900 rounded-xl p-4 mb-5">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">출시 로그</h3>
        <div class="space-y-1.5">
          ${l.history.map((h, i) => `<p class="text-xs ${i === 0 ? 'text-gray-300' : 'text-gray-600'}">${h}</p>`).join('')}
        </div>
      </div>` : ''}

      <button data-action="next-launch-week"
        class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
        ${l.week >= 4 ? '결산으로 →' : `${l.week + 1}주차로 →`}
      </button>
    </div>`;
}

// ── SCREEN: Settlement ───────────────────────────────────────────────────────

function renderSettlement() {
  const s = state.settlement;
  if (!s) return '<div class="p-8 text-gray-400">결산 데이터 없음</div>';
  const { shipped, grade, revenue, repDelta, earned, verdict } = s;

  const gradeColors = {
    '망작': 'text-red-400', '저조': 'text-orange-400', '숨은 명작': 'text-purple-400',
    '준수': 'text-gray-300', '흥행작': 'text-green-400', '신드롬': 'text-yellow-400'
  };
  const gradeBg = {
    '망작': 'bg-red-950', '저조': 'bg-orange-950', '숨은 명작': 'bg-purple-950',
    '준수': 'bg-gray-800', '흥행작': 'bg-green-950', '신드롬': 'bg-yellow-950'
  };

  return `
    ${topBar()}
    <div class="max-w-2xl mx-auto p-6 screen-enter">
      <div class="text-center mb-8">
        <div class="text-3xl font-black text-white mb-1">${shipped.title}</div>
        <div class="text-gray-400">${shipped.scope} · ${shipped.identity} · ${shipped.year}년차</div>
      </div>

      <!-- Grade reveal -->
      <div class="${gradeBg[grade]} border border-gray-700 rounded-2xl p-6 mb-6 text-center">
        <div class="${gradeColors[grade]} text-5xl font-black mb-3">${grade}</div>
        <div class="text-gray-300 text-sm leading-relaxed mb-3">${verdict?.join('<br>') || ''}</div>
        <div class="flex justify-center gap-6 text-sm">
          <div><span class="text-gray-500">메타크리틱</span> <span class="font-bold text-white">${state.launch?.metacritic}점</span></div>
          <div><span class="text-gray-500">매출</span> <span class="font-bold text-yellow-400">${fmtMoney(revenue)}</span></div>
        </div>
      </div>

      <!-- Studio impact -->
      <div class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <h3 class="font-bold text-white mb-3">스튜디오 변화</h3>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-gray-400 w-20">명성</span>
            <span class="${repDelta >= 0 ? 'text-green-400' : 'text-red-400'} font-medium">${repDelta >= 0 ? '+' : ''}${repDelta} → ${state.reputation}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-400 w-20">자금</span>
            <span class="text-yellow-400 font-medium">+${fmtMoney(revenue)} → ${fmtMoney(state.cash)}</span>
          </div>
          ${['흥행작','신드롬'].includes(grade) ? `
          <div class="flex items-center gap-2">
            <span class="text-gray-400 w-20">IP 등록</span>
            <span class="text-blue-300 font-medium">📦 ${shipped.title}</span>
          </div>` : ''}
          ${earned && earned.length > 0 ? earned.map(t => `
          <div class="flex items-center gap-2">
            <span class="text-gray-400 w-20">특성 획득</span>
            <span class="text-purple-300 font-medium">✨ ${t}</span>
          </div>`).join('') : ''}
        </div>
      </div>

      <!-- Build board final -->
      <div class="bg-gray-900 rounded-xl p-4 mb-6">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">최종 빌드</h3>
        <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
          ${Object.entries(shipped.board).map(([slot, val]) => `
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">${slotKo(slot)}</div>
              <div class="text-lg font-black text-white">${val}</div>
            </div>`).join('')}
        </div>
      </div>

      <button data-action="continue-career"
        class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
        ${state.year >= 5 ? '커리어 종료 →' : '스튜디오로 돌아가기 →'}
      </button>
    </div>`;
}

// ── SCREEN: Career End ───────────────────────────────────────────────────────

function renderCareerEnd() {
  const totalRev = state.shipped.reduce((sum, g) => sum + (g.revenue || 0), 0);
  const tier = getTier(state, data);
  const careerGrade = getCareerGrade(state);

  return `
    <div class="min-h-screen bg-gray-950 screen-enter">
      ${topBar()}
      <div class="max-w-3xl mx-auto p-6">
        <div class="text-center mb-8">
          <div class="text-5xl mb-3">🏆</div>
          <h1 class="text-3xl font-black text-white mb-1">커리어 종료</h1>
          <p class="text-gray-400">명예의 전당 — ${state.studioName}</p>
        </div>

        <!-- Career grade -->
        <div class="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8 text-center">
          <div class="text-4xl font-black ${careerGradeColor(careerGrade)} mb-2">${careerGrade}</div>
          <div class="grid grid-cols-3 gap-4 text-sm mt-4">
            <div><div class="text-gray-500">최종 등급</div><div class="font-bold text-white">${tier.name}</div></div>
            <div><div class="text-gray-500">최종 명성</div><div class="font-bold text-yellow-400">${state.reputation}</div></div>
            <div><div class="text-gray-500">총 매출</div><div class="font-bold text-green-400">${fmtMoney(totalRev)}</div></div>
          </div>
        </div>

        <!-- Traits earned -->
        ${state.traits.length > 0 ? `
        <div class="mb-6">
          <h3 class="font-bold text-white mb-3">획득한 특성</h3>
          <div class="flex flex-wrap gap-2">
            ${state.traits.map(tid => {
              const t = data.traits.find(tr => tr.id === tid);
              return t ? `<span class="bg-purple-900/60 text-purple-300 text-sm px-3 py-1 rounded-full border border-purple-700">${t.name}</span>` : '';
            }).join('')}
          </div>
        </div>` : ''}

        <!-- Hall of Fame -->
        <h2 class="font-black text-white text-xl mb-4">명예의 전당</h2>
        ${state.shipped.length === 0
          ? '<p class="text-gray-600">출시된 게임이 없습니다.</p>'
          : `<div class="space-y-3">
            ${state.shipped.map((g, i) => {
              const gradeColors = {'망작':'text-red-400','저조':'text-orange-400','숨은 명작':'text-purple-400','준수':'text-gray-300','흥행작':'text-green-400','신드롬':'text-yellow-400'};
              const c = gradeColors[g.grade] || 'text-gray-300';
              return `
                <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
                  <div class="text-2xl font-black text-gray-600">#${i+1}</div>
                  <div class="flex-1">
                    <div class="font-bold text-white">${g.title}</div>
                    <div class="text-xs text-gray-400 mt-0.5">${g.identity} · ${g.scope} · ${g.year}년차 ${g.quarter}분기</div>
                  </div>
                  <div class="text-right">
                    <div class="${c} font-bold text-lg">${g.grade}</div>
                    <div class="text-xs text-gray-400">MC ${g.metacritic} · ${fmtMoney(g.revenue)}</div>
                  </div>
                </div>`;
            }).join('')}
          </div>`}

        <div class="mt-8 text-center">
          <button data-action="new-game"
            class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-xl transition-colors">
            새 게임 시작
          </button>
        </div>
      </div>
    </div>`;
}

function getCareerGrade(s) {
  const totalRev = s.shipped.reduce((sum, g) => sum + (g.revenue || 0), 0);
  if (s.cash < -200) return '파산';
  if (totalRev >= 5000 && s.reputation >= 80) return '전설';
  if (totalRev >= 2500 && s.reputation >= 60) return '명문';
  if (totalRev >= 1000) return '준수함';
  return '무난함';
}

function careerGradeColor(g) {
  const map = {'파산':'text-red-400','무난함':'text-gray-400','준수함':'text-blue-400','명문':'text-purple-400','전설':'text-yellow-400'};
  return map[g] || 'text-gray-400';
}

// ── MODALS ───────────────────────────────────────────────────────────────────

function renderModal(modal) {
  const event = modal.event;
  if (!event) return '';

  const isStudio = modal.type === 'studio';
  const resolveAction = isStudio ? 'resolve-studio-event' : 'resolve-event';

  const previewEffect = (effects) => {
    if (!effects) return '';
    return Object.entries(effects).map(([k, v]) => {
      const labels = {cash:'자금',reputation:'명성',morale:'사기',hype:'기대치',story:'스토리',gameplay:'게임플레이',visual:'비주얼',audio:'사운드',systems:'시스템',polish:'폴리싱',debt:'부채',projectCash:'프로젝트 자금'};
      const label = labels[k] || k;
      if (k === 'draftCard' || k === 'draftPremium') return `카드 드래프트`;
      if (k === 'cultureIndie' || k === 'cultureCommercial' || k === 'nextHype' || k === 'quitRisk') return null;
      return `${label} ${v > 0 ? '+' : ''}${v}`;
    }).filter(Boolean).join(' · ');
  };

  return `
    <div class="modal-backdrop fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 border border-yellow-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div class="text-xs text-yellow-500 font-bold uppercase tracking-widest mb-3">🔔 사건 발생</div>
        <p class="text-gray-100 text-base leading-relaxed mb-6">${event.text}</p>
        <div class="flex flex-col gap-3">
          <button data-action="${resolveAction}" data-side="left"
            class="text-left bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 transition-colors">
            <div class="font-bold text-white text-sm">${event.left.label}</div>
            <div class="text-xs text-gray-400 mt-1">${previewEffect(event.left.effects)} — ${event.left.effectText}</div>
          </button>
          <button data-action="${resolveAction}" data-side="right"
            class="text-left bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 transition-colors">
            <div class="font-bold text-white text-sm">${event.right.label}</div>
            <div class="text-xs text-gray-400 mt-1">${previewEffect(event.right.effects)} — ${event.right.effectText}</div>
          </button>
        </div>
      </div>
    </div>`;
}

function renderCandidatesModal() {
  return `
    <div class="modal-backdrop fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        <div class="flex items-center justify-between mb-5">
          <h3 class="font-bold text-white text-lg">👤 채용 후보</h3>
          <button data-action="dismiss-candidates" class="text-gray-600 hover:text-gray-400 text-sm">취소</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${state.candidates.map(c => `
            <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div class="flex items-center justify-between mb-2">
                <div class="font-bold text-white">${c.name}</div>
                <div>${stars(c.stars)}</div>
              </div>
              <div class="text-xs text-gray-400 mb-1">${c.role} · ${c.specialty}</div>
              <div class="text-xs text-gray-500 mb-3">연봉 ${fmtMoney(c.salary)} / 영입비 ${fmtMoney(c.salary * 2)}</div>
              <div class="flex flex-wrap gap-1 mb-3">
                ${c.cards.map(id => {
                  const card = data.cards.find(cd => cd.id === id);
                  return card ? `<span class="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded">${card.name}</span>` : '';
                }).join('')}
              </div>
              <button data-action="hire-candidate" data-employee-id="${c.id}"
                class="w-full bg-blue-700 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                영입
              </button>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderDraftModal() {
  const draft = state.draft;
  const cb = cardsById(data);
  return `
    <div class="modal-backdrop fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        <div class="flex items-center justify-between mb-5">
          <h3 class="font-bold text-white text-lg">${draft.premium ? '✨ 프리미엄 카드 드래프트' : '🔬 R&D 카드 드래프트'}</h3>
          <button data-action="dismiss-draft" class="text-gray-600 hover:text-gray-400 text-sm">건너뛰기</button>
        </div>
        <p class="text-sm text-gray-400 mb-4">1장을 영구 라이브러리에 추가합니다.</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${draft.cards.map(id => {
            const c = cb[id];
            if (!c) return '';
            return `
              <div class="bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-xl p-4 cursor-pointer transition-colors"
                data-action="choose-draft" data-card-id="${id}">
                <div class="font-bold text-white mb-1">${c.name}</div>
                <div class="text-xs text-gray-400 leading-snug mb-3">${c.description}</div>
                <div class="flex gap-2">
                  <span class="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded">${c.cost}시간</span>
                  <span class="text-gray-500 text-xs">${c.tag}</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ── Event binding ────────────────────────────────────────────────────────────

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleAction);
  });

  // Greenlight: live validation for "덱 구성으로" button
  const titleInput = document.getElementById('game-title-input');
  const goDeckBtn = document.getElementById('go-deckbuild-btn');
  const glErrorDiv = document.getElementById('gl-error-msg');
  if (titleInput && goDeckBtn) {
    const updateGlBtn = () => {
      const scope = data.tuning.scopes[state._glScope || 'small'];
      const ipMode = state._glIp || 'new';
      const budget = ipMode === 'dlc' ? 100 : scope.budget;
      const errors = [];
      if (!titleInput.value.trim()) errors.push('게임 제목을 입력하세요');
      if (!state._glGenreId) errors.push('장르를 선택하세요');
      if (state.cash < budget) errors.push(`자금 부족 — 필요 ₩${budget}M, 보유 ${fmtMoney(state.cash)}`);
      goDeckBtn.disabled = errors.length > 0;
      if (glErrorDiv) glErrorDiv.textContent = errors.join(' · ');
    };
    titleInput.addEventListener('input', updateGlBtn);
    updateGlBtn();
  }
}

function handleAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;

  switch (action) {
    case 'go-main-menu':
      if (confirm('메인 메뉴로 돌아가시겠습니까? 진행 상황은 저장됩니다.')) {
        renderMainMenu();
      }
      break;

    case 'go-greenlight':
      state = startGreenlight(state);
      state._glScope = 'small';
      state._glIp = 'new';
      state._glIpId = null;
      state._glTitle = '';
      state._glDeck = [];
      state._glGenreId = null;
      saveGame(state);
      render();
      break;

    case 'go-studio':
      state = { ...state, phase: 'studio' };
      saveGame(state);
      render();
      break;

    case 'go-career-end':
      state = { ...state, phase: 'careerEnd' };
      saveGame(state);
      render();
      break;

    case 'studio-action': {
      const actionId = el.dataset.actionId;
      dispatchWith(studioAction, actionId);
      break;
    }

    case 'hire-candidate': {
      const empId = el.dataset.employeeId;
      const next = chooseCandidate(state, empId, data);
      if (next !== state) { state = next; saveGame(state); render(); }
      break;
    }

    case 'dismiss-candidates':
      state = { ...state, candidates: [] };
      saveGame(state);
      render();
      break;

    case 'choose-draft': {
      const cardId = el.dataset.cardId;
      const next = chooseDraft(state, cardId, data);
      if (next !== state) { state = next; saveGame(state); render(); }
      break;
    }

    case 'dismiss-draft': {
      const next = chooseDraft(state, null, data);
      if (next !== state) { state = next; saveGame(state); render(); }
      break;
    }

    case 'select-scope': {
      const scope = el.dataset.scope;
      state._glScope = scope;
      state._glDeck = [];
      saveGame(state);
      render();
      break;
    }

    case 'select-ip': {
      state._glIp = el.dataset.ip;
      state._glIpId = el.dataset.ipId || null;
      saveGame(state);
      render();
      break;
    }

    case 'select-genre': {
      state._glGenreId = el.dataset.genreId;
      saveGame(state);
      render();
      break;
    }

    case 'go-deckbuild': {
      const titleInput = document.getElementById('game-title-input');
      if (!titleInput?.value.trim()) return;
      state._glTitle = titleInput.value.trim();
      state._glDeck = state._glDeck || [];
      state.phase = 'deckbuild';
      saveGame(state);
      render();
      break;
    }

    case 'remove-from-deck': {
      const cardId = el.dataset.cardId;
      state._glDeck = (state._glDeck || []).filter(id => id !== cardId);
      saveGame(state);
      render();
      break;
    }

    case 'start-dev': {
      const scope = state._glScope || 'small';
      const form = {
        title: state._glTitle || '무제',
        scope,
        genreId: state._glGenreId || null,
        ipMode: state._glIp || 'new',
        ipId: state._glIpId || null,
        identityId: detectIdentity(state._glDeck || [], data)?.id || data.identities[0].id,
        deck: state._glDeck || [],
      };
      dispatchWith(greenlightProject, form);
      break;
    }

    case 'play-card': {
      const cardId = el.dataset.cardId;
      const next = playCard(state, cardId, data);
      if (next !== state) { state = next; saveGame(state); render(); }
      break;
    }

    case 'take-rest':
      dispatch(takeRest);
      break;

    case 'take-crunch':
      dispatch(takeCrunch);
      break;

    case 'next-month':
      dispatchWith(nextMonth);
      break;

    case 'resolve-event': {
      const side = el.dataset.side;
      dispatch(chooseEvent, side);
      break;
    }

    case 'resolve-studio-event': {
      const side = el.dataset.side;
      dispatch(chooseStudioEvent, side);
      break;
    }

    case 'play-launch-card': {
      const cardId = el.dataset.cardId;
      dispatch(playLaunchCard, cardId);
      break;
    }

    case 'next-launch-week':
      dispatchWith(nextLaunchWeek);
      break;

    case 'continue-career':
      dispatch(continueCareer);
      break;

    case 'new-game':
      localStorage.removeItem(SAVE_KEY);
      state = null;
      renderMainMenu();
      break;
  }
}

// Also handle card clicks in deckbuild screen
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-card-id]');
  if (!card || !state || state.phase !== 'deckbuild') return;
  const action = card.dataset.action;
  if (action) return; // already handled
  const cardId = card.dataset.cardId;
  if (!cardId) return;

  const scope = data.tuning.scopes[state._glScope || 'small'];
  const deck = state._glDeck || [];
  if (deck.includes(cardId)) return; // already in deck
  if (deck.length >= scope.deckCap) return; // deck full

  state._glDeck = [...deck, cardId];
  saveGame(state);
  render();
});

// ── Boot ─────────────────────────────────────────────────────────────────────
init();
