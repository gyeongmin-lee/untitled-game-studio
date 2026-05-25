export const slots = [
  ["gameplay", "게임플레이"],
  ["story", "스토리"],
  ["visual", "비주얼"],
  ["audio", "사운드"],
  ["systems", "시스템"],
  ["polish", "폴리싱"]
];

export const fmtMoney = (value) => `₩${Math.round(value).toLocaleString("ko-KR")}M`;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function loadData() {
  const [cards, employees, events, identities, traits, tuning, genres] = await Promise.all([
    fetch("./data/cards.json").then((r) => r.json()),
    fetch("./data/employees.json").then((r) => r.json()),
    fetch("./data/events.json").then((r) => r.json()),
    fetch("./data/identities.json").then((r) => r.json()),
    fetch("./data/traits.json").then((r) => r.json()),
    fetch("./data/tuning.json").then((r) => r.json()),
    fetch("./data/genres.json").then((r) => r.json())
  ]);
  return { cards, employees, events, identities, traits, tuning, genres };
}

export function newRun(data, studioName) {
  const initialEmployees = ["kim-jihoon", "park-seoyeon"].map((id) => ({ ...data.employees.find((e) => e.id === id), xp: 0, protected: 0 }));
  const library = unique([
    "core-loop", "paper-prototype", "bug-bash", "refactor", "branch-ending", "npc-banter", "mood-board", "sound-pass", "tutorial-cut", "scope-cut", "crunch-night"
  ]);
  return {
    phase: "studio",
    studioName: studioName || "새벽빌드 스튜디오",
    year: 1,
    quarter: 1,
    cycle: 1,
    ap: 3,
    cash: 250,
    reputation: 8,
    officeLevel: 1,
    employees: initialEmployees,
    library,
    upgraded: [],
    ips: [],
    traits: [],
    shipped: [],
    culture: { indie: 0, commercial: 0, community: 0 },
    counters: { storyGames: 0, smallBudgetGames: 0, publisherRefusals: 0, phenomenons: 0, quits: 0, systemsGames: 0, highMoraleShips: 0, largeGames: 0 },
    eventLog: ["스튜디오가 문을 열었다. 자금은 넉넉하지 않다. 한 번의 실수가 전부를 흔들 수 있다."],
    modal: null,
    draft: null,
    candidates: [],
    project: null,
    launch: null,
    settlement: null,
    activeTab: "studio"
  };
}

export function getTier(state, data) {
  return [...data.tuning.tiers].reverse().find((tier) => state.reputation >= tier.reputation) || data.tuning.tiers[0];
}

export function currentOfficeCap(state, data) {
  const tier = data.tuning.tiers.find((t) => t.level === state.officeLevel);
  return tier ? tier.officeCap : 3;
}

export function cardsById(data) {
  return Object.fromEntries(data.cards.map((card) => [card.id, card]));
}

export function employeeQuality(state) {
  const base = state.reputation < 20 ? 1 : state.reputation < 55 ? 2 : 3;
  const penalty = state.traits.includes("black-company") ? 1 : 0;
  return clamp(base - penalty, 1, 3);
}

export function applyEffects(state, effects, context = "project") {
  const next = structuredClone(state);
  const project = next.project;
  for (const [key, value] of Object.entries(effects || {})) {
    if (slots.some(([slot]) => slot === key) && project) {
      project.board[key] = Math.max(0, project.board[key] + value);
    } else if (key === "add_momentum" && project) {
      project.momentum = clamp((project.momentum || 0) + value, 0, 10);
    } else if (key === "blockDebt" && project) {
      project.blockDebt = (project.blockDebt || 0) + value;
    } else if (key === "debt" && project) {
      project.debt = clamp(project.debt + value, 0, 30);
    } else if (key === "hype" && project) {
      project.hype = clamp(project.hype + value, 0, 100);
    } else if (key === "morale") {
      if (project) project.morale = clamp(project.morale + value, 0, 100);
      next.employees = next.employees.map((e) => ({ ...e, morale: clamp(e.morale + Math.round(value / 2), 0, 100) }));
    } else if (key === "projectCash" && project) {
      project.cash = Math.max(0, project.cash + value);
    } else if (key === "cash") {
      next.cash = Math.max(-999, next.cash + value);
    } else if (key === "reputation") {
      next.reputation = clamp(next.reputation + value, 0, 100);
    } else if (key === "cultureIndie") {
      next.culture.indie += value;
    } else if (key === "cultureCommercial") {
      next.culture.commercial += value;
    } else if (key === "draftCard") {
      next.draft = makeDraft(next, window.__STUDIO_DATA__, false);
    } else if (key === "draftPremium") {
      next.draft = makeDraft(next, window.__STUDIO_DATA__, true);
    } else if (key === "nextHype") {
      next.nextHype = (next.nextHype || 0) + value;
    }
  }
  if (context === "event") next.modal = null;
  return next;
}

export function studioAction(state, data, actionId) {
  if (state.ap <= 0) return state;
  let next = structuredClone(state);
  const spend = (cash, ap = 1) => {
    next.cash -= cash + salaryBurn(next) * ap;
    next.ap -= ap;
    advanceQuarter(next, ap);
  };
  if (actionId === "recruit") {
    if (next.cash < 60 || next.employees.length >= currentOfficeCap(next, data)) return next;
    spend(60);
    const hired = new Set(next.employees.map((e) => e.id));
    const quality = employeeQuality(next);
    next.candidates = shuffle(data.employees.filter((e) => !hired.has(e.id) && e.stars <= quality)).slice(0, 3);
    next.eventLog.unshift("채용 공고를 냈다. 후보 세 명이 포트폴리오와 함께 도착했다.");
  } else if (actionId === "research") {
    if (next.cash < 80) return next;
    spend(80);
    next.draft = makeDraft(next, data, false);
    next.eventLog.unshift("사내 R&D를 진행했다. 팀이 새 카드 후보를 뽑아왔다.");
  } else if (actionId === "conference") {
    if (next.cash < 160) return next;
    spend(160);
    next.reputation = clamp(next.reputation + 5, 0, 100);
    next.draft = makeDraft(next, data, true);
    next.eventLog.unshift("컨퍼런스에서 사람을 만나고 아이디어를 훔치듯 배웠다. 명성 +5.");
  } else if (actionId === "office") {
    const nextTier = data.tuning.tiers.find((tier) => tier.level === next.officeLevel + 1);
    if (!nextTier || next.ap < 3 || next.cash < nextTier.upgradeCost || next.reputation < nextTier.reputation) return next;
    spend(nextTier.upgradeCost, 3);
    next.officeLevel += 1;
    next.eventLog.unshift(`사무실을 확장했다. 이제 ${nextTier.name}급 공간에서 ${nextTier.officeCap}명까지 함께 일할 수 있다.`);
  } else if (actionId === "upgrade-card") {
    const upgradable = next.library.find((id) => !next.upgraded.includes(id));
    if (!upgradable || next.cash < 90) return next;
    spend(90);
    next.upgraded.push(upgradable);
    next.eventLog.unshift(`'${data.cards.find((c) => c.id === upgradable).name}' 카드가 + 버전으로 개선됐다.`);
  } else if (actionId === "retreat") {
    if (next.cash < 70) return next;
    spend(70);
    next.employees = next.employees.map((e) => ({ ...e, morale: clamp(e.morale + 20, 0, 100) }));
    next.eventLog.unshift("팀 워크샵을 다녀왔다. 아무도 빌드 이야기를 꺼내지 않기로 암묵적 합의가 있었다.");
  } else if (actionId === "salary") {
    if (next.cash < 50) return next;
    if (!next.employees.length) return next;
    spend(50);
    const lowest = [...next.employees].sort((a, b) => a.morale - b.morale)[0];
    next.employees = next.employees.map((e) => e.id === lowest.id ? { ...e, salary: e.salary + 8, morale: clamp(e.morale + 16, 0, 100), protected: 3 } : e);
    next.eventLog.unshift(`${lowest.name}의 연봉을 올렸다. 퇴사 면담 분위기가 조금 누그러졌다.`);
  } else if (actionId === "pr") {
    if (next.cash < 90) return next;
    spend(90);
    next.reputation = clamp(next.reputation + 10, 0, 100);
    next.eventLog.unshift("홍보 캠페인이 돌았다. 아직 대표 얼굴은 어색하지만 명성은 올랐다.");
  } else if (actionId === "rest") {
    spend(0);
    next.employees = next.employees.map((e) => ({ ...e, morale: clamp(e.morale + 4, 0, 100) }));
    next.eventLog.unshift("한 분기 숨을 골랐다. 통장 잔고는 줄었지만 팀 표정은 조금 폈다.");
  }
  if (next.year > 5 || next.cash < -250) {
    if (next.year > 5) {
      next.year = 5;
      next.quarter = 4;
    }
    next.phase = "careerEnd";
  }
  return maybeStudioEvent(next, data);
}

export function chooseCandidate(state, employeeId, data) {
  const candidate = data.employees.find((e) => e.id === employeeId);
  if (!candidate) return state;
  const next = structuredClone(state);
  next.employees.push({ ...candidate, xp: 0, protected: 0 });
  next.library = unique([...next.library, ...candidate.cards]);
  next.candidates = [];
  next.eventLog.unshift(`${candidate.name} ${candidate.role}를 영입했다. 시그니처 카드가 라이브러리에 추가됐다.`);
  return next;
}

export function chooseDraft(state, cardId, data) {
  const next = structuredClone(state);
  if (cardId && !next.library.includes(cardId)) {
    next.library.push(cardId);
    next.eventLog.unshift(`새 카드 '${data.cards.find((c) => c.id === cardId).name}'를 영구 라이브러리에 추가했다.`);
  }
  next.draft = null;
  return next;
}

export function startGreenlight(state) {
  if (state.year > 5) return { ...structuredClone(state), phase: "careerEnd" };
  return { ...structuredClone(state), phase: "greenlight", candidates: [], draft: null, activeTab: "project" };
}

export function greenlightProject(state, data, form) {
  const scope = data.tuning.scopes[form.scope];
  const cap = scope.deckCap + (state.traits.includes("aaa-scaler") && ["large", "epic"].includes(form.scope) ? 2 : 0);
  const deck = form.deck.slice(0, cap);
  const sequelIp = form.ipMode === "sequel" ? state.ips.find((ip) => ip.id === form.ipId) : null;
  const dlcIp = form.ipMode === "dlc" ? state.ips.find((ip) => ip.id === form.ipId) : null;
  const ip = sequelIp || dlcIp;
  const requiredReuse = sequelIp ? Math.ceil(deck.length / 2) : 0;
  const reused = sequelIp ? deck.filter((id) => sequelIp.deckMemory.includes(id)).length : 0;
  const budget = form.ipMode === "dlc" ? 100 : scope.budget;
  if (!form.title.trim() || deck.length < Math.min(4, cap) || state.cash < budget || reused < requiredReuse) return state;
  const next = structuredClone(state);
  next.cash -= Math.round(budget * (state.traits.includes("grit-indie") && ["small", "medium"].includes(form.scope) ? 0.9 : 1));
  const months = form.ipMode === "dlc" ? 2 : Math.max(2, scope.months - (sequelIp ? 2 : 0));
  const genre = data.genres ? data.genres.find((g) => g.id === form.genreId) : null;
  const identityId = genre ? genre.identityId : (ip ? ip.identityId : form.identityId);
  next.project = {
    title: form.title.trim(),
    scopeId: form.scope,
    scopeName: scope.name,
    identityId,
    genre: genre || null,
    ipMode: form.ipMode,
    ipId: form.ipId || null,
    month: 1,
    months,
    cash: budget,
    deck,
    discard: [],
    exhausted: [],
    hand: drawHand(deck, 5),
    hours: 8,
    board: Object.fromEntries(slots.map(([slot]) => [slot, 0])),
    morale: average(next.employees.map((e) => e.morale)),
    debt: 0,
    hype: clamp(8 + next.reputation / 3 + (next.nextHype || 0) + (sequelIp ? 20 : 0), 0, 100),
    momentum: 0,
    blockDebt: 0,
    cardsPlayed: [],
    cardsPlayedThisMonth: 0,
    history: [`${scope.name} 프로젝트 '${form.title.trim()}' 개발을 시작했다.${genre ? ` 장르: ${genre.name}(${genre.icon})` : ""}`]
  };
  if (next.traits.includes("story-house")) next.project.board.story += 1;
  if (next.traits.includes("tech-core")) next.project.board.systems += 1;
  next.nextHype = 0;
  next.phase = "development";
  next.activeTab = "project";
  return next;
}

export function playCard(state, cardId, data) {
  const next = structuredClone(state);
  const card = data.cards.find((c) => c.id === cardId);
  if (!next.project || !card || !next.project.hand.includes(cardId)) return state;
  if ((next.project.exhausted || []).includes(cardId)) return state;

  const upgraded = next.upgraded.includes(cardId);
  const hourCost = Math.max(1, card.cost - (upgraded ? 1 : 0));
  const cashCost = Math.max(0, card.cash - (upgraded ? 10 : 0));
  if (next.project.hours < hourCost || next.project.cash < cashCost) return state;

  next.project.hours -= hourCost;
  next.project.cash -= cashCost;
  next.project.hand = next.project.hand.filter((id) => id !== cardId);
  next.project.cardsPlayed.push(cardId);
  next.project.cardsPlayedThisMonth = (next.project.cardsPlayedThisMonth || 0) + 1;

  // Genre bonus: each stat effect +1 if card matches current project genre
  let cardEffects = { ...card.effects };
  if (card.genreTags?.length && next.project.genre?.id && card.genreTags.includes(next.project.genre.id)) {
    for (const [key, val] of Object.entries(cardEffects)) {
      if (slots.some(([s]) => s === key)) cardEffects[key] = val + 1;
    }
  }

  // Exhaust: remove from deck permanently; otherwise discard
  if (card.exhaust) {
    next.project.deck = next.project.deck.filter((id) => id !== cardId);
    next.project.exhausted = [...(next.project.exhausted || []), cardId];
  } else {
    next.project.discard.push(cardId);
  }

  const applied = applyEffects(next, cardEffects);
  applied.project.history.unshift(`'${card.name}${upgraded ? "+" : ""}' 사용: ${card.description}${card.exhaust ? " [소진]" : ""}`);

  return applyCardPlayPassives(applied, card);
}

export function takeRest(state) {
  const next = structuredClone(state);
  next.project.morale = clamp(next.project.morale + 8, 0, 100);
  next.project.hype = clamp(next.project.hype - 1, 0, 100);
  next.project.history.unshift("한 달 일부를 휴식에 썼다. 기대치는 살짝 식었지만 팀은 숨을 쉬었다.");
  return next;
}

export function takeCrunch(state) {
  const next = structuredClone(state);
  next.project.hours += 4;
  next.project.morale = clamp(next.project.morale - 10, 0, 100);
  next.project.debt = clamp(next.project.debt + 2, 0, 30);
  next.project.history.unshift("크런치를 선언했다. 시간은 벌었고, 청구서는 나중에 온다.");
  return next;
}

export function nextMonth(state, data) {
  let next = structuredClone(state);
  if (next.project.month >= next.project.months) return enterLaunch(next, data);

  // Monthly salary burn from studio cash
  const monthlySalary = Math.round(next.employees.reduce((sum, e) => sum + e.salary, 0) / 4);
  next.cash = Math.max(-999, next.cash - monthlySalary);

  // Debt-as-poison: debt > 5 damages a random stat each month
  if (next.project.debt > 5) {
    const shield = next.project.blockDebt || 0;
    const rawDmg = Math.floor(next.project.debt / 3);
    const dmg = Math.max(0, rawDmg - shield);
    if (dmg > 0) {
      const statKeys = slots.map(([s]) => s);
      const targetSlot = statKeys[Math.floor(Math.random() * statKeys.length)];
      const slotLabel = slots.find(([s]) => s === targetSlot)?.[1] || targetSlot;
      next.project.board[targetSlot] = Math.max(0, next.project.board[targetSlot] - dmg);
      next.project.history.unshift(`기술부채 독성: ${slotLabel} -${dmg}. (부채 ${next.project.debt}, 방패 ${shield})`);
    } else if (shield > 0) {
      next.project.history.unshift(`피처 프리즈가 부채 독성을 막았다. (방패 ${shield})`);
    }
  }

  // Momentum decay: no dev cards played this month → lose 1 momentum
  if ((next.project.cardsPlayedThisMonth || 0) === 0 && (next.project.momentum || 0) > 0) {
    next.project.momentum = Math.max(0, next.project.momentum - 1);
    next.project.history.unshift("이번 달 개발 흐름이 끊겼다. 모멘텀이 식는다.");
  }

  // Apply monthly employee passives
  next = applyMonthlyPassives(next);

  next.project.month += 1;
  next.project.hours = 8;
  next.project.blockDebt = 0;
  next.project.cardsPlayedThisMonth = 0;
  next.project.hand = drawHand(next.project.deck, 5);
  next.project.morale = clamp(next.project.morale - 2 - Math.floor(next.project.debt / 8), 0, 100);
  next.project.history.unshift(`${next.project.month}개월차가 시작됐다.`);

  // Check dev morale quitters mid-project
  next = removeQuitters(next);

  if (Math.random() < 0.9) next.modal = { type: "development", event: pick(data.events.development) };
  return next;
}

export function chooseEvent(state, side) {
  const event = state.modal?.event;
  if (!event) return state;
  const option = event[side];
  const next = applyEffects(state, option.effects, "event");
  next.project?.history.unshift(`${event.text} 선택: ${option.label} (${option.effectText})`);
  if (option.effects?.cultureIndie) next.counters.publisherRefusals += 1;
  if (event.id.includes("fan") || event.id.includes("meme")) next.culture.community += 1;
  return next;
}

export function enterLaunch(state, data) {
  const next = structuredClone(state);
  next.phase = "launch";
  next.launch = calculateKpi(next, data);
  next.launch.week = 1;
  next.launch.hand = shuffle(data.events.launch).slice(0, 3);
  next.launch.history = ["출시 1주차. 대시보드 숫자가 대표의 심박수처럼 뛴다."];
  return next;
}

export function playLaunchCard(state, cardId) {
  const next = structuredClone(state);
  const card = next.launch.hand.find((c) => c.id === cardId);
  if (!card) return state;
  next.launch.hand = next.launch.hand.filter((c) => c.id !== cardId);
  next.launch.metacritic = clamp(next.launch.metacritic + (card.effects.metacritic || 0), 30, 99);
  next.launch.steam = clamp(next.launch.steam + (card.effects.steam || 0), 10, 99);
  next.launch.wishlist = clamp(next.launch.wishlist + (card.effects.wishlist || 0), 1, 80);
  next.launch.streamer = clamp(next.launch.streamer + (card.effects.streamer || 0), 0, 100);
  next.launch.sales = Math.max(20, next.launch.sales * (card.effects.salesMultiplier || 1));
  next.launch.history.unshift(`${card.name}: ${card.description}`);
  return next;
}

export function nextLaunchWeek(state, data) {
  const next = structuredClone(state);
  if (next.launch.week >= 4) return settle(next, data);
  next.launch.week += 1;
  next.launch.sales *= 1 + (next.launch.steam - 70) / 300 + next.launch.streamer / 900;
  next.launch.hand = shuffle(data.events.launch).slice(0, 3);
  next.launch.history.unshift(`출시 ${next.launch.week}주차. 리뷰와 방송이 매출 그래프를 다시 흔든다.`);
  return next;
}

export function settle(state, data) {
  let next = structuredClone(state);
  const grade = gradeLaunch(next.launch);
  const identity = data.identities.find((i) => i.id === next.project.identityId);
  const revenue = Math.round(next.launch.sales);
  const repDelta = reputationDelta(grade, next.traits.includes("independent"));
  next.cash += revenue;
  next.reputation = clamp(next.reputation + repDelta, 0, 100);
  next.employees = promoteAndStress(next.employees, grade, next.project.morale);
  next = removeQuitters(next);
  const shipped = {
    id: `game-${Date.now()}-${next.shipped.length}`,
    title: next.project.title,
    year: next.year,
    quarter: next.quarter,
    scope: next.project.scopeName,
    identity: identity.name,
    grade,
    revenue,
    metacritic: next.launch.metacritic,
    board: next.project.board,
    cards: unique(next.project.cardsPlayed)
  };
  next.shipped.push(shipped);
  if (["흥행작", "신드롬"].includes(grade)) {
    next.ips.push({ id: shipped.id, title: shipped.title, identityId: next.project.identityId, heat: grade === "신드롬" ? 3 : 1, deckMemory: shipped.cards });
  }
  addNovelCards(next, shipped.cards);
  updateCounters(next, shipped);
  const earned = checkTraits(next, data);
  next.settlement = {
    shipped,
    grade,
    revenue,
    repDelta,
    earned,
    verdict: verdictFor(grade, shipped.title)
  };
  next.phase = "settlement";
  next.eventLog.unshift(`'${shipped.title}' 출시 결과: ${grade}, 매출 ${fmtMoney(revenue)}, 명성 ${repDelta >= 0 ? "+" : ""}${repDelta}.`);
  return next;
}

export function continueCareer(state) {
  const next = structuredClone(state);
  const elapsed = Math.max(1, Math.ceil((next.project?.months || 3) / 3));
  next.quarter += elapsed;
  while (next.quarter > 4) {
    next.year += 1;
    next.quarter -= 4;
  }
  next.project = null;
  next.launch = null;
  next.settlement = null;
  if (next.year > 5 || next.cash < -250) {
    if (next.year > 5) {
      next.year = 5;
      next.quarter = 4;
    }
    next.phase = "careerEnd";
    return next;
  }
  next.phase = "studio";
  next.ap = 3;
  next.candidates = [];
  next.draft = null;
  next.activeTab = "studio";
  return next;
}

export function calculateKpi(state, data) {
  const p = state.project;
  const identity = data.identities.find((i) => i.id === p.identityId);
  const genre = p.genre;
  const scopeFactor = data.tuning.scopeFactors?.[p.scopeId] ?? 1.0;
  const scopeTarget = data.tuning.scopeTargets?.[p.scopeId] ?? 42;

  // Slot lock (Option A): primary stats that miss scaled minimum contribute 0
  const primaryStats = genre ? genre.primaryStats : [];
  const effectiveBoard = {};
  for (const [slot] of slots) {
    let val = p.board[slot];
    if (primaryStats.includes(slot) && identity?.requires[slot]) {
      const minReq = identity.requires[slot] * scopeFactor;
      if (val < minReq) val = 0;
    }
    effectiveBoard[slot] = val;
  }

  const effectiveSum = Object.values(effectiveBoard).reduce((a, b) => a + b, 0);
  const scopeRatio = Math.min(effectiveSum / scopeTarget, 1.5);

  // Identity fit vs scaled requirements
  const rawFit = identity
    ? Object.entries(identity.requires).reduce((score, [slot, req]) => {
        const scaledReq = req * scopeFactor;
        return score + Math.min(effectiveBoard[slot] / scaledReq, 1);
      }, 0) / Object.keys(identity.requires).length
    : 1;
  const fit = clamp(rawFit * (state.traits.includes("genre-master") ? 1.25 : 1), 0, 1.25);

  const momentumBonus = (p.momentum || 0) * 0.8;
  const traitMeta = state.traits.includes("critic-darling") ? 3 : 0;
  const debt = Math.max(0, p.debt - (state.traits.includes("tech-core") ? 1 : 0));

  const metacritic = clamp(
    Math.round(42 + scopeRatio * 28 + fit * 14 + state.reputation / 10 + momentumBonus + traitMeta - debt * 1.5),
    30, 99
  );
  const steam = clamp(Math.round(46 + effectiveBoard.polish * 2.5 + p.morale / 6 + fit * 8 - debt * 2), 10, 99);
  const wishlist = clamp(Math.round(8 + p.hype / 2 + state.reputation / 5), 1, 80);
  const streamer = clamp(Math.round(p.hype / 2 + effectiveBoard.gameplay * 3 + effectiveBoard.visual * 1.5), 0, 100);
  const scopeMult = { small: 4, medium: 10, large: 22, epic: 45 }[p.scopeId];
  const communityBonus = state.traits.includes("community-first") ? 1.08 : 1;
  const sales = Math.round((metacritic * 3 + steam * 2 + wishlist * 10 + streamer * 6) * scopeMult / 12 * communityBonus);

  return { metacritic, steam, wishlist, streamer, sales };
}

export function gradeLaunch(launch) {
  if (launch.sales >= 2000 && launch.metacritic >= 88) return "신드롬";
  if (launch.sales >= 800 && launch.metacritic >= 75) return "흥행작";
  if (launch.metacritic >= 80 && launch.sales < 800) return "숨은 명작";
  if (launch.sales < 200 && launch.metacritic < 60) return "망작";
  if (launch.sales < 400) return "저조";
  return "준수";
}

function reputationDelta(grade, independent) {
  const base = { "망작": -9, "저조": -4, "숨은 명작": 8, "준수": 4, "흥행작": 14, "신드롬": 24 }[grade] || 0;
  return Math.round(base * (independent && base > 0 ? 1.5 : 1));
}

function verdictFor(grade, title) {
  const map = {
    "망작": [`'${title}'은 무너졌지만, 적어도 어디가 약했는지는 분명해졌다.`, "팀은 조용하다. 다음 게임은 위로가 아니라 복수가 될 것이다."],
    "저조": [`'${title}'은 시장에서 크게 흔들리지 못했다.`, "그래도 몇몇 플레이어는 오래 기억할 장면을 찾았다."],
    "숨은 명작": [`평론가들은 '${title}'을 좋아했다. 문제는 아직 세상이 그걸 모른다는 점이다.`, "언젠가 세일 때 발견될 게임이라는 말은 칭찬이자 숙제다."],
    "준수": [`'${title}'은 스튜디오를 한 분기 더 살렸다.`, "대박은 아니지만, 다음 도전을 위한 발판은 충분하다."],
    "흥행작": [`'${title}'은 스튜디오 이름을 검색창 자동완성에 올렸다.`, "후속작 이야기가 나오기 시작했다. 이제 기대치도 자산이자 빚이다."],
    "신드롬": [`'${title}'은 한 시대를 정의했다.`, "사람들은 이 게임 전과 후로 장르를 나눠 말하기 시작했다."]
  };
  return map[grade] || map["준수"];
}

function promoteAndStress(employees, grade, morale) {
  const xp = { "망작": 5, "저조": 8, "숨은 명작": 14, "준수": 12, "흥행작": 20, "신드롬": 30 }[grade] || 10;
  return employees.map((employee) => {
    let next = { ...employee, xp: (employee.xp || 0) + xp, morale: clamp(employee.morale + (morale - 60) / 5, 0, 100), protected: Math.max(0, (employee.protected || 0) - 1) };
    if (next.xp >= next.stars * 35 && next.stars < 3) {
      next.stars += 1;
      next.xp = 0;
      next.morale = clamp(next.morale + 12, 0, 100);
    }
    return next;
  });
}

function removeQuitters(state) {
  const next = structuredClone(state);
  const protectedByTrait = next.traits.includes("healthy-team") ? 0.2 : 0;
  let leavers = next.employees.filter((e) => e.protected <= 0 && e.morale < 15 && Math.random() < 0.45 - protectedByTrait);
  if (next.employees.length - leavers.length < 1) leavers = leavers.slice(0, Math.max(0, next.employees.length - 1));
  if (!leavers.length) return next;
  next.employees = next.employees.filter((e) => !leavers.some((l) => l.id === e.id));
  // Cascade: remaining employees lose morale (-10 per leaver)
  const cascadeDmg = leavers.length * 10;
  next.employees = next.employees.map((e) => ({ ...e, morale: clamp(e.morale - cascadeDmg, 0, 100) }));
  const removedCards = new Set(leavers.flatMap((e) => e.cards));
  next.library = next.library.filter((id) => !removedCards.has(id) || next.employees.some((e) => e.cards.includes(id)));
  if (next.project) {
    next.project.deck = next.project.deck.filter((id) => !removedCards.has(id) || next.employees.some((e) => e.cards.includes(id)));
  }
  next.counters.quits += leavers.length;
  next.eventLog.unshift(`${leavers.map((e) => e.name).join(", ")}이 회사를 떠났다. 남은 팀원들의 사기가 흔들린다. (-${cascadeDmg})`);
  return next;
}

function applyCardPlayPassives(state, card) {
  let next = state;
  for (const emp of state.employees) {
    if (!emp.passive || emp.passive.trigger !== "on_dev_card_played") continue;
    const cond = emp.passive.condition;
    if (cond?.tag && card.tag !== cond.tag) continue;
    next = applyEffects(next, emp.passive.effect);
  }
  return next;
}

function applyMonthlyPassives(state) {
  let next = state;
  for (const emp of state.employees) {
    if (!emp.passive || emp.passive.trigger !== "on_month_end") continue;
    next = applyEffects(next, emp.passive.effect);
  }
  return next;
}

function addNovelCards(state, usedCards) {
  usedCards.forEach((id) => {
    if (!state.library.includes(id)) state.library.push(id);
  });
}

function updateCounters(state, shipped) {
  if (shipped.board.story >= 4) state.counters.storyGames += 1;
  if (shipped.revenue <= 300) state.counters.smallBudgetGames += 1;
  if (shipped.grade === "신드롬") state.counters.phenomenons += 1;
  if (shipped.board.systems >= 5) state.counters.systemsGames += 1;
  if (["대작", "초대작"].includes(shipped.scope)) state.counters.largeGames += 1;
  if (average(state.employees.map((e) => e.morale)) >= 75) state.counters.highMoraleShips += 1;
}

function checkTraits(state, data) {
  const earned = [];
  for (const trait of data.traits) {
    if (state.traits.includes(trait.id)) continue;
    const c = state.counters;
    const ok =
      (trait.id === "story-house" && c.storyGames >= 3) ||
      (trait.id === "grit-indie" && c.smallBudgetGames >= 3) ||
      (trait.id === "independent" && c.publisherRefusals >= 3) ||
      (trait.id === "critic-darling" && c.phenomenons >= 2) ||
      (trait.id === "black-company" && c.quits >= 2) ||
      (trait.id === "tech-core" && c.systemsGames >= 3) ||
      (trait.id === "community-first" && state.culture.community >= 3) ||
      (trait.id === "aaa-scaler" && c.largeGames >= 2) ||
      (trait.id === "healthy-team" && c.highMoraleShips >= 3) ||
      (trait.id === "genre-master" && hasThreeSameIdentity(state.shipped));
    if (ok) {
      state.traits.push(trait.id);
      earned.push(trait.name);
    }
  }
  return earned;
}

function hasThreeSameIdentity(shipped) {
  const counts = {};
  shipped.forEach((game) => counts[game.identity] = (counts[game.identity] || 0) + 1);
  return Object.values(counts).some((count) => count >= 3);
}

function makeDraft(state, data, premium) {
  const owned = new Set(state.library);
  const pool = data.cards.filter((card) => !owned.has(card.id) && (premium ? ["컨퍼런스", "채용"].includes(card.source) : true));
  return { premium, cards: shuffle(pool.length ? pool : data.cards.filter((c) => !owned.has(c.id))).slice(0, 3).map((c) => c.id) };
}

function maybeStudioEvent(state, data) {
  if (state.ap >= 0 && Math.random() < 0.28) return { ...state, modal: { type: "studio", event: pick(data.events.studio) } };
  return state;
}

export function chooseStudioEvent(state, side) {
  const event = state.modal?.event;
  if (!event) return state;
  const option = event[side];
  const next = applyEffects(state, option.effects, "event");
  next.eventLog.unshift(`${event.text} 선택: ${option.label} (${option.effectText})`);
  if (option.effects?.cultureIndie) next.counters.publisherRefusals += 1;
  return next;
}

function drawHand(deck, count) {
  return shuffle(deck).slice(0, Math.min(count, deck.length));
}

function salaryBurn(state) {
  return Math.round(state.employees.reduce((sum, e) => sum + e.salary, 0) / 8);
}

function advanceQuarter(state, amount) {
  state.quarter += amount;
  while (state.quarter > 4) {
    state.year += 1;
    state.quarter -= 4;
  }
}

function unique(values) {
  return [...new Set(values)];
}

function shuffle(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function average(values) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}
