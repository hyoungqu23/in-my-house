import {
  FOREST_ANIMAL_CARDS,
  connectedForestRules,
  forestError,
} from "./content";
import {
  assertConnectedForestState,
  createForestBoard,
  createForestNeighborPaths,
  forestAnimal,
  forestHexDistance,
  forestLegalVisitTargetSeats,
  forestPathBetween,
  forestVisitOptions,
  forestVisitLeafRewards,
  isValidForestWelcome,
  legalForestPlacementHexIds,
  placeForestTerrain,
  scoreConnectedForest,
} from "./rules";
import type {
  ConnectedForestAction,
  ConnectedForestRosterPlayer,
  ConnectedForestSetup,
  ConnectedForestState,
  ConnectedForestTransitionContext,
  ForestAnimalCard,
  ForestLockedPick,
  ForestPendingVisit,
  ForestPlayer,
  ForestResidentFigure,
  ForestTerrainCard,
  ForestVisitChoice,
  ForestVisitQueue,
} from "./types";

const clone = (state: ConnectedForestState): ConnectedForestState => structuredClone(state);

const phaseKey = (
  state: Pick<ConnectedForestState, "seasonIndex" | "pickIndex">,
  phase: "draft" | "visit-select" | "visit-respond" | "reveal",
) => phase === "draft"
  ? `connected-forest:${state.seasonIndex}:${state.pickIndex}`
  : `connected-forest:${state.seasonIndex}:${phase}`;

const requirePlayer = (state: ConnectedForestState, seat: number): ForestPlayer => {
  const player = state.players.find((candidate) => candidate.seat === seat);
  if (!player) return forestError("PLAYER_NOT_ACTIVE", "플레이어를 찾을 수 없습니다.");
  return player;
};

const drawAnimal = (state: ConnectedForestState): ForestAnimalCard => {
  const card = state.animalDeck.shift();
  if (!card) return forestError("CONTENT_INVARIANT_BROKEN", "동물 덱이 예상보다 일찍 소진되었습니다.");
  return card;
};

const drawTerrain = (state: ConnectedForestState): ForestTerrainCard => {
  const card = state.terrainDeck.shift();
  if (!card) return forestError("CONTENT_INVARIANT_BROKEN", "지형 덱이 예상보다 일찍 소진되었습니다.");
  return card;
};

const dealTerrainHands = (state: ConnectedForestState) => {
  for (const player of state.players) {
    player.hand = [drawTerrain(state), drawTerrain(state), drawTerrain(state)];
  }
};

const sortedPlayers = (state: ConnectedForestState) =>
  [...state.players].sort((a, b) => a.seat - b.seat);

const residentFigures = (player: ForestPlayer) =>
  player.figures.filter(
    (figure): figure is ForestResidentFigure => figure.kind === "RESIDENT",
  );

const unvisitedResidents = (player: ForestPlayer) =>
  residentFigures(player).filter((figure) => !figure.visited);

const setDraftDeadline = (state: ConnectedForestState, now: number) => {
  const rules = connectedForestRules(state.rulesVersion);
  state.phase = "SEASON_DRAFT";
  state.phaseKey = phaseKey(state, "draft");
  state.phaseEndsAt = now + rules.draftDeadlineMs;
  state.draftSubmissions = {};
};

const beginSeason = (state: ConnectedForestState, now: number) => {
  state.pickIndex = 0;
  state.passDirection = state.seasonIndex % 2 === 0 ? "LEFT" : "RIGHT";
  state.visitSelections = {};
  state.visitQueues = {};
  state.seasonVisitResults = [];
  for (const player of state.players) player.welcomedThisSeason = false;
  dealTerrainHands(state);
  setDraftDeadline(state, now);
};

const autoLockedPick = (player: ForestPlayer, now: number): ForestLockedPick => {
  const card = [...player.hand].sort((a, b) => a.id.localeCompare(b.id))[0]!;
  const hexId = legalForestPlacementHexIds(player)
    .sort((a, b) => forestHexDistance(a) - forestHexDistance(b) || a.localeCompare(b))[0]!;
  return {
    seat: player.seat,
    cardId: card.id,
    hexId,
    useGoldenAcorn: false,
    submittedAt: now,
  };
};

const requireTerrainCard = (player: ForestPlayer, cardId: string): ForestTerrainCard => {
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card) return forestError("CARD_NOT_IN_HAND", "손에 없는 지형 카드입니다.");
  return card;
};

const previewLockedPick = (
  player: ForestPlayer,
  card: ForestTerrainCard,
  action: Extract<ConnectedForestAction, { type: "LOCK_TERRAIN_PICK" }>,
) => {
  const preview = structuredClone(player);
  placeForestTerrain(preview, card, action.hexId, action.useGoldenAcorn ? action.acornTerrain : undefined);
  return preview;
};

const validateLockedPick = (
  state: ConnectedForestState,
  player: ForestPlayer,
  action: Extract<ConnectedForestAction, { type: "LOCK_TERRAIN_PICK" }>,
) => {
  const card = requireTerrainCard(player, action.cardId);
  if (!legalForestPlacementHexIds(player).includes(action.hexId)) {
    forestError("INVALID_PLACEMENT", "지형을 놓을 수 없는 칸입니다.");
  }
  if (action.useGoldenAcorn) {
    if (!player.goldenAcornAvailable || !action.acornTerrain) {
      forestError("INVALID_ACORN", "황금 도토리를 사용할 수 없습니다.");
    }
  } else if (action.acornTerrain) {
    forestError("INVALID_ACORN", "황금 도토리를 사용할 때만 대체 지형을 고를 수 있습니다.");
  }
  if (action.refreshAnimalCardId) {
    if (
      state.pickIndex !== 0
      || !player.animalRefreshAvailable
      || !player.activeAnimals.some((animal) => animal.id === action.refreshAnimalCardId)
    ) {
      forestError("INVALID_REFRESH", "동물 카드를 교환할 수 없습니다.");
    }
    if (action.welcome?.animalCardId === action.refreshAnimalCardId) {
      forestError("INVALID_REFRESH", "교환할 동물을 같은 선택에서 맞이할 수 없습니다.");
    }
  }
  if (action.welcome) {
    if (player.welcomedThisSeason) {
      forestError("INVALID_HABITAT", "이번 계절에는 이미 동물을 맞이했습니다.");
    }
    const preview = previewLockedPick(player, card, action);
    if (!isValidForestWelcome(preview, action.welcome)) {
      forestError("INVALID_HABITAT", "완성되지 않은 동물 서식지입니다.");
    }
  }
  return card;
};

const applyRefreshes = (state: ConnectedForestState, picks: ForestLockedPick[]) => {
  for (const pick of picks) {
    if (!pick.refreshAnimalCardId) continue;
    const player = requirePlayer(state, pick.seat);
    const index = player.activeAnimals.findIndex((card) => card.id === pick.refreshAnimalCardId);
    const [discarded] = player.activeAnimals.splice(index, 1) as [ForestAnimalCard];
    state.animalDiscard.push(discarded);
    player.activeAnimals.push(drawAnimal(state));
    player.animalRefreshAvailable = false;
  }
};

const applyPlacement = (state: ConnectedForestState, pick: ForestLockedPick) => {
  const player = requirePlayer(state, pick.seat);
  const cardIndex = player.hand.findIndex((card) => card.id === pick.cardId);
  const [card] = player.hand.splice(cardIndex, 1) as [ForestTerrainCard];
  placeForestTerrain(player, card, pick.hexId, pick.useGoldenAcorn ? pick.acornTerrain : undefined);
  state.terrainDiscard.push(card);
  if (pick.useGoldenAcorn) player.goldenAcornAvailable = false;
  if (!pick.welcome) return;
  const animalIndex = player.activeAnimals.findIndex(
    (animal) => animal.id === pick.welcome!.animalCardId,
  );
  const [animal] = player.activeAnimals.splice(animalIndex, 1) as [ForestAnimalCard];
  player.figures.push({
    kind: "RESIDENT",
    figureId: `resident-${player.seat}-${animal.id}`,
    animalCardId: animal.id,
    speciesId: animal.speciesId,
    hexId: pick.welcome.residentHexId,
    visited: false,
  });
  player.welcomedThisSeason = true;
  if (state.seasonIndex < 4) player.activeAnimals.push(drawAnimal(state));
};

const passHands = (state: ConnectedForestState) => {
  const players = sortedPlayers(state);
  const hands = players.map((player) => structuredClone(player.hand));
  players.forEach((player, index) => {
    const source = state.passDirection === "LEFT"
      ? (index + 1) % players.length
      : (index - 1 + players.length) % players.length;
    player.hand = hands[source];
  });
};

const hasEligibleVisit = (player: ForestPlayer) => unvisitedResidents(player).length > 0;

const beginReveal = (state: ConnectedForestState, now: number) => {
  const rules = connectedForestRules(state.rulesVersion);
  state.phase = "SEASON_REVEAL";
  state.phaseKey = phaseKey(state, "reveal");
  state.phaseEndsAt = now + rules.revealDurationMs;
  state.visitSelections = {};
  state.visitQueues = {};
};

const beginVisitSelection = (state: ConnectedForestState, now: number) => {
  if (!state.players.some(hasEligibleVisit)) {
    beginReveal(state, now);
    return;
  }
  const rules = connectedForestRules(state.rulesVersion);
  state.phase = "SEASON_VISIT_SELECT";
  state.phaseKey = phaseKey(state, "visit-select");
  state.phaseEndsAt = now + rules.visitSelectDeadlineMs;
  state.visitSelections = Object.fromEntries(
    state.players.filter((player) => !hasEligibleVisit(player)).map((player) => [player.seat, "NONE"]),
  );
};

const resolveDraft = (state: ConnectedForestState, now: number, timedOut: boolean) => {
  if (timedOut) {
    for (const player of sortedPlayers(state)) {
      state.draftSubmissions[player.seat] ??= autoLockedPick(player, now);
    }
  }
  if (Object.keys(state.draftSubmissions).length !== state.players.length) return;
  const picks = Object.values(state.draftSubmissions).sort((a, b) => a.seat - b.seat);
  applyRefreshes(state, picks);
  for (const pick of picks) applyPlacement(state, pick);
  state.draftSubmissions = {};
  if (state.pickIndex < 2) {
    passHands(state);
    state.pickIndex = (state.pickIndex + 1) as ConnectedForestState["pickIndex"];
    setDraftDeadline(state, now);
  } else {
    beginVisitSelection(state, now);
  }
};

const autoVisitSelection = (state: ConnectedForestState, player: ForestPlayer) => {
  const resident = [...unvisitedResidents(player)].sort(
    (a, b) => a.animalCardId.localeCompare(b.animalCardId),
  )[0]!;
  const targetOptions = forestLegalVisitTargetSeats(state, player.seat);
  const targetSeat = [...targetOptions]
    .sort((a, b) => {
      const first = forestPathBetween(state, player.seat, a)!.length;
      const second = forestPathBetween(state, player.seat, b)!.length;
      return first - second || targetOptions.indexOf(a) - targetOptions.indexOf(b);
    })[0];
  const animal = forestAnimal(resident.animalCardId)!;
  return {
    visitId: `v-${state.seasonIndex}-${player.seat}`,
    animalCardId: animal.id,
    speciesId: animal.speciesId,
    visitorTerrain: animal.visitorTerrain,
    sourceSeat: player.seat,
    targetSeat: targetSeat!,
  } satisfies ForestPendingVisit;
};

const visitSelectionsComplete = (state: ConnectedForestState) =>
  state.players.every((player) => Object.hasOwn(state.visitSelections, player.seat));

const beginVisitResponses = (state: ConnectedForestState, now: number) => {
  const rules = connectedForestRules(state.rulesVersion);
  const visits = Object.values(state.visitSelections)
    .filter((visit): visit is ForestPendingVisit => visit !== "NONE")
    .sort((a, b) => a.targetSeat - b.targetSeat || a.sourceSeat - b.sourceSeat);
  for (const visit of visits) {
    const source = requirePlayer(state, visit.sourceSeat);
    const resident = residentFigures(source).find(
      (figure) => figure.animalCardId === visit.animalCardId && !figure.visited,
    );
    if (!resident) return forestError("CONTENT_INVARIANT_BROKEN", "방문할 주민을 찾을 수 없습니다.");
    resident.visited = true;
  }
  state.visitLedger ??= [];
  state.visitLedger.push(...visits.map((visit) => ({ seasonIndex: state.seasonIndex, sourceSeat: visit.sourceSeat, targetSeat: visit.targetSeat })));
  if (visits.length === 0) {
    beginReveal(state, now);
    return;
  }
  const queues: Record<number, ForestVisitQueue> = {};
  for (const visit of visits) {
    queues[visit.targetSeat] ??= {
      visits: [],
      currentIndex: 0,
      currentDeadlineAt: now + rules.visitResponseDeadlineMs,
    };
    queues[visit.targetSeat].visits.push(visit);
  }
  state.phase = "SEASON_VISIT_RESPOND";
  state.phaseKey = phaseKey(state, "visit-respond");
  state.phaseEndsAt = undefined;
  state.visitQueues = queues;
  settleUnavailableVisits(state, now);
};

const resolveVisitSelections = (state: ConnectedForestState, now: number, timedOut: boolean) => {
  if (timedOut) {
    for (const player of sortedPlayers(state)) {
      if (!Object.hasOwn(state.visitSelections, player.seat)) {
        state.visitSelections[player.seat] = autoVisitSelection(state, player);
      }
    }
  }
  if (visitSelectionsComplete(state)) beginVisitResponses(state, now);
};

const currentVisit = (queue: ForestVisitQueue) => queue.visits[queue.currentIndex];

const queuesComplete = (state: ConnectedForestState) =>
  Object.values(state.visitQueues).every((queue) => queue.currentIndex >= queue.visits.length);

const applyVisit = (
  state: ConnectedForestState,
  visit: ForestPendingVisit,
  choice: ForestVisitChoice,
  now: number,
  targetHexId?: string,
) => {
  const rules = connectedForestRules(state.rulesVersion);
  const source = requirePlayer(state, visit.sourceSeat);
  const receiver = requirePlayer(state, visit.targetSeat);
  const options = forestVisitOptions(state, visit, rules);
  if (choice === "STAY") {
    const stayHexId = targetHexId;
    if (!stayHexId || !options.stayHexIds.includes(stayHexId)) {
      return forestError("INVALID_VISIT_CHOICE", "방문객이 머물 수 없는 칸입니다.");
    }
    receiver.figures.push({
      kind: "VISITOR",
      figureId: `visitor-${visit.visitId}`,
      visitId: visit.visitId,
      speciesId: visit.speciesId,
      hexId: stayHexId,
      sourceSeat: visit.sourceSeat,
    });
    const rewards = forestVisitLeafRewards("STAY", false, rules);
    receiver.leaves += rewards.receiverLeaves;
    source.leaves += rewards.senderLeaves;
  } else if (choice === "WALK") {
    const path = forestPathBetween(state, visit.sourceSeat, visit.targetSeat)!;
    path.length = (path.length + 1) as typeof path.length;
    const rewards = forestVisitLeafRewards("WALK", path.length === rules.pathCap, rules);
    receiver.leaves += rewards.receiverLeaves;
    receiver.leavesFromPaths += rewards.receiverLeaves;
    source.leaves += rewards.senderLeaves;
    source.leavesFromPaths += rewards.senderLeaves;
  } else {
    const rewards = forestVisitLeafRewards("FAREWELL", false, rules);
    receiver.leaves += rewards.receiverLeaves;
    source.leaves += rewards.senderLeaves;
  }
  state.seasonVisitResults.push({ ...visit, choice, targetHexId });
  const queue = state.visitQueues[visit.targetSeat];
  queue.currentIndex += 1;
  if (queue.currentIndex < queue.visits.length) {
    queue.currentDeadlineAt = now + rules.visitResponseDeadlineMs;
  }
};

const settleUnavailableVisits = (state: ConnectedForestState, now: number) => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const seat of Object.keys(state.visitQueues).map(Number).sort((a, b) => a - b)) {
      const queue = state.visitQueues[seat];
      const visit = currentVisit(queue);
      if (!visit) continue;
      const options = forestVisitOptions(state, visit);
      if (options.stayHexIds.length === 0 && !options.canWalk) {
        applyVisit(state, visit, "FAREWELL", now);
        changed = true;
      }
    }
  }
  if (queuesComplete(state)) beginReveal(state, now);
};

const autoResolveVisit = (state: ConnectedForestState, visit: ForestPendingVisit, now: number) => {
  const options = forestVisitOptions(state, visit);
  if (options.stayHexIds.length > 0) {
    applyVisit(state, visit, "STAY", now, options.stayHexIds[0]);
  } else if (options.canWalk) {
    applyVisit(state, visit, "WALK", now);
  } else {
    applyVisit(state, visit, "FAREWELL", now);
  }
  settleUnavailableVisits(state, now);
};

const synchronizePresence = (
  state: ConnectedForestState,
  context: ConnectedForestTransitionContext,
) => {
  if (state.phase === "GAME_OVER") return false;
  // Pause the whole game only when a missing player owes an input.
  // Re-evaluate at phase boundaries: a submitted seat may owe the next pick.
  const waitingSeats = state.players.filter((player) => {
    switch (state.phase) {
      case "SEASON_DRAFT": return !Object.hasOwn(state.draftSubmissions, player.seat);
      case "SEASON_VISIT_SELECT": return !Object.hasOwn(state.visitSelections, player.seat);
      case "SEASON_VISIT_RESPOND": {
        const queue = state.visitQueues[player.seat];
        return queue !== undefined && currentVisit(queue) !== undefined;
      }
      default: return false;
    }
  }).map((player) => player.seat);
  const disconnectedSeats = waitingSeats
    .filter((seat) => !context.connectedSeats.includes(seat));
  if (disconnectedSeats.length > 0) {
    if (state.pause) {
      state.pause.disconnectedSeats = disconnectedSeats;
    } else {
      const rules = connectedForestRules(state.rulesVersion);
      state.pause = {
        disconnectedSeats,
        pausedAt: context.now,
        forfeitClaimAt: context.now + rules.forfeitClaimDelayMs,
      };
    }
    return true;
  }
  if (!state.pause) return false;
  const offset = context.now - state.pause.pausedAt;
  if (state.phaseEndsAt !== undefined) state.phaseEndsAt += offset;
  for (const queue of Object.values(state.visitQueues)) queue.currentDeadlineAt += offset;
  state.pause = undefined;
  return false;
};

const finishNormalGame = (state: ConnectedForestState) => {
  const result = scoreConnectedForest(state);
  state.phase = "GAME_OVER";
  state.phaseKey = "connected-forest:game-over";
  state.phaseEndsAt = undefined;
  state.result = { forfeited: false, ...result };
};

const finishReveal = (state: ConnectedForestState, now: number) => {
  if (state.seasonIndex === 4) {
    finishNormalGame(state);
    return;
  }
  state.seasonIndex = (state.seasonIndex + 1) as ConnectedForestState["seasonIndex"];
  beginSeason(state, now);
};

export function createInitialState(
  roster: ConnectedForestRosterPlayer[],
  setup: ConnectedForestSetup,
  now: number,
): ConnectedForestState {
  if (roster.length < 4 || roster.length > 6) {
    forestError("MIN_PLAYERS", "이어지는 숲길은 4–6명이 필요합니다.");
  }
  connectedForestRules(setup.rulesVersion);
  const rosterSeats = roster.map((player) => player.seat).sort((a, b) => a - b);
  if (
    new Set(rosterSeats).size !== rosterSeats.length
    || rosterSeats.length !== setup.seats.length
    || rosterSeats.some((seat, index) => seat !== setup.seats[index])
    || setup.terrainDeck.length !== roster.length * 15
    || setup.animalDeck.length !== FOREST_ANIMAL_CARDS.length
  ) {
    forestError("INVALID_GAME_SETUP", "게임 setup과 플레이어 좌석이 일치하지 않습니다.");
  }
  const state: ConnectedForestState = {
    phase: "SEASON_DRAFT",
    rulesVersion: setup.rulesVersion,
    seasonIndex: 0,
    pickIndex: 0,
    passDirection: "LEFT",
    phaseKey: "connected-forest:0:0",
    terrainDeck: structuredClone(setup.terrainDeck),
    terrainDiscard: [],
    animalDeck: structuredClone(setup.animalDeck),
    animalDiscard: [],
    players: [...roster]
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({
        ...player,
        board: createForestBoard(),
        hand: [],
        activeAnimals: [],
        figures: [],
        leaves: 0,
        leavesFromPaths: 0,
        goldenAcornAvailable: true,
        animalRefreshAvailable: true,
        welcomedThisSeason: false,
      })),
    draftSubmissions: {},
    visitSelections: {},
    visitQueues: {},
    seasonVisitResults: [],
    neighborPaths: createForestNeighborPaths(rosterSeats),
    visitLedger: [],
  };
  for (const player of state.players) {
    player.activeAnimals = [drawAnimal(state), drawAnimal(state)];
  }
  beginSeason(state, now);
  assertConnectedForestState(state);
  return state;
}

export function advanceTimedState(
  input: ConnectedForestState,
  context: ConnectedForestTransitionContext,
): ConnectedForestState {
  const state = clone(input);
  if (synchronizePresence(state, context)) {
    assertConnectedForestState(state);
    return state;
  }
  for (let guard = 0; guard < 100 && state.phase !== "GAME_OVER"; guard += 1) {
    if (synchronizePresence(state, context)) break;
    if (state.phase === "SEASON_DRAFT") {
      if (state.phaseEndsAt === undefined || context.now < state.phaseEndsAt) break;
      resolveDraft(state, state.phaseEndsAt, true);
      continue;
    }
    if (state.phase === "SEASON_VISIT_SELECT") {
      if (state.phaseEndsAt === undefined || context.now < state.phaseEndsAt) break;
      resolveVisitSelections(state, state.phaseEndsAt, true);
      continue;
    }
    if (state.phase === "SEASON_VISIT_RESPOND") {
      const expired = Object.entries(state.visitQueues)
        .map(([seat, queue]) => ({ seat: Number(seat), queue }))
        .filter(({ queue }) => currentVisit(queue) && context.now >= queue.currentDeadlineAt)
        .sort((a, b) => a.queue.currentDeadlineAt - b.queue.currentDeadlineAt || a.seat - b.seat)[0];
      if (!expired) break;
      const visit = currentVisit(expired.queue);
      autoResolveVisit(state, visit, expired.queue.currentDeadlineAt);
      continue;
    }
    if (state.phaseEndsAt === undefined || context.now < state.phaseEndsAt) break;
    finishReveal(state, state.phaseEndsAt);
  }
  assertConnectedForestState(state);
  return state;
}

export function transition(
  input: ConnectedForestState,
  actorSeat: number,
  action: ConnectedForestAction,
  context: ConnectedForestTransitionContext,
): ConnectedForestState {
  const state = advanceTimedState(input, context);
  const actor = requirePlayer(state, actorSeat);
  if (!context.connectedSeats.includes(actorSeat)) {
    forestError("PLAYER_NOT_ACTIVE", "연결된 플레이어만 행동할 수 있습니다.");
  }
  if (state.pause) {
    if (action.type !== "CLAIM_FORFEIT") {
      forestError("GAME_PAUSED", "연결이 끊겨 게임이 일시정지되었습니다.");
    }
    if (state.pause.disconnectedSeats.includes(actorSeat) || context.now < state.pause.forfeitClaimAt) {
      forestError("FORFEIT_NOT_AVAILABLE", "연결 해제 후 3분이 지나야 종료할 수 있습니다.");
    }
    state.phase = "GAME_OVER";
    state.phaseKey = "connected-forest:game-over";
    state.phaseEndsAt = undefined;
    state.pause = undefined;
    state.result = { forfeited: true };
    assertConnectedForestState(state);
    return state;
  }
  if (action.type === "CLAIM_FORFEIT") {
    return forestError("INVALID_PHASE", "지금은 기권 종료를 청구할 수 없습니다.");
  }
  if (action.type === "LOCK_TERRAIN_PICK") {
    if (state.phase !== "SEASON_DRAFT") {
      forestError("INVALID_PHASE", "지금은 지형을 선택할 때가 아닙니다.");
    }
    if (state.draftSubmissions[actorSeat]) {
      forestError("ALREADY_ACTED", "이번 선택을 이미 잠갔습니다.");
    }
    validateLockedPick(state, actor, action);
    state.draftSubmissions[actorSeat] = {
      seat: actorSeat,
      cardId: action.cardId,
      hexId: action.hexId,
      refreshAnimalCardId: action.refreshAnimalCardId,
      useGoldenAcorn: action.useGoldenAcorn,
      acornTerrain: action.acornTerrain,
      welcome: structuredClone(action.welcome),
      submittedAt: context.now,
    };
    resolveDraft(state, context.now, false);
  } else if (action.type === "CHOOSE_SEASON_VISIT") {
    if (state.phase !== "SEASON_VISIT_SELECT") {
      forestError("INVALID_PHASE", "지금은 방문을 보낼 때가 아닙니다.");
    }
    if (Object.hasOwn(state.visitSelections, actorSeat)) {
      forestError("ALREADY_ACTED", "이번 계절의 방문을 이미 골랐습니다.");
    }
    const resident = unvisitedResidents(actor).find(
      (figure) => figure.animalCardId === action.animalCardId,
    );
    const animal = resident ? forestAnimal(resident.animalCardId) : undefined;
    if (!resident || !animal || !forestLegalVisitTargetSeats(state, actorSeat).includes(action.targetSeat)) {
      return forestError("INVALID_VISIT_TARGET", "방문시킬 주민이나 이웃이 유효하지 않습니다.");
    }
    state.visitSelections[actorSeat] = {
      visitId: `v-${state.seasonIndex}-${actorSeat}`,
      animalCardId: animal.id,
      speciesId: animal.speciesId,
      visitorTerrain: animal.visitorTerrain,
      sourceSeat: actorSeat,
      targetSeat: action.targetSeat,
    };
    resolveVisitSelections(state, context.now, false);
  } else {
    if (state.phase !== "SEASON_VISIT_RESPOND") {
      forestError("INVALID_PHASE", "지금은 방문에 응답할 때가 아닙니다.");
    }
    const queue = state.visitQueues[actorSeat];
    const visit = queue ? currentVisit(queue) : undefined;
    if (!visit || visit.visitId !== action.visitId) {
      return forestError("INVALID_VISIT_TARGET", "현재 응답할 방문이 아닙니다.");
    }
    const options = forestVisitOptions(state, visit);
    if (action.choice === "STAY" && options.stayHexIds.length === 0) {
      forestError("INVALID_VISIT_CHOICE", "방문객이 머물 수 없습니다.");
    }
    if (action.choice === "WALK" && !options.canWalk) {
      forestError("INVALID_VISIT_CHOICE", "공동 숲길을 더 이을 수 없습니다.");
    }
    applyVisit(state, visit, action.choice, context.now, action.targetHexId);
    settleUnavailableVisits(state, context.now);
  }
  synchronizePresence(state, context);
  assertConnectedForestState(state);
  return state;
}

export function legalActions(
  state: ConnectedForestState,
  seat: number,
  connectedSeats: number[],
): ConnectedForestAction["type"][] {
  if (!connectedSeats.includes(seat) || !state.players.some((player) => player.seat === seat)) {
    return [];
  }
  if (state.pause) return ["CLAIM_FORFEIT"];
  if (state.phase === "SEASON_DRAFT" && !state.draftSubmissions[seat]) {
    return ["LOCK_TERRAIN_PICK"];
  }
  if (state.phase === "SEASON_VISIT_SELECT" && !Object.hasOwn(state.visitSelections, seat)) {
    return ["CHOOSE_SEASON_VISIT"];
  }
  const queue = state.visitQueues[seat];
  if (state.phase === "SEASON_VISIT_RESPOND" && queue && currentVisit(queue)) {
    return ["RESOLVE_VISIT"];
  }
  return [];
}
