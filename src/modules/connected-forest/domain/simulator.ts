import {
  FOREST_HEXES,
  connectedForestRules,
  createMatchSetup,
} from "./content";
import { createInitialState } from "./reducer";
import {
  assertConnectedForestState,
  forestAnimal,
  forestLegalVisitTargetSeats,
  forestPathBetween,
  forestPatternHexes,
  forestHexDistance,
  forestVisitLeafRewards,
  forestVisitOptions,
  forestWelcomeChoices,
  legalForestPlacementHexIds,
  placeForestTerrain,
  scoreConnectedForest,
  forestStayHearts,
  scoreForestPlayer,
} from "./rules";
import type {
  ConnectedForestRules,
  ConnectedForestAction,
  ConnectedForestSetup,
  ConnectedForestState,
  ForestAnimalCard,
  ForestPendingVisit,
  ForestPlayer,
  ForestResidentFigure,
  ForestTerrainCard,
  ForestVisitChoice,
  ForestWelcomeChoice,
} from "./types";

export type ForestSimulationPolicy = "STAY" | "WALK" | "MIXED";
export type ForestAgentPolicy = ForestSimulationPolicy | "ADAPTIVE" | "IMMEDIATE" | "RANDOM";
export type ForestSenderModel = "A_SHORTEST" | "B_RANDOM" | "C_NEARLY_DONE" | "D_LOW_SCORE";

export type ForestSimulationDiagnostics = {
  incomingVisits: number[];
  sentVisits: number[];
  freeChoices: number[];
  freeWalkChoices: number[];
  receiverVisitPoints: number[];
  goldenAcornsUsed: number;
  refreshesUsed: number;
  restrictedSenderChoices: number;
};

export type ForestSimulationStats = {
  stay: number;
  walk: number;
  farewell: number;
  free: number;
  freeWalk: number;
  forcedStay: number;
  forcedWalk: number;
  completedPaths: number;
};

export type ForestSimulationGame = {
  state: ConnectedForestState;
  policies: ForestSimulationPolicy[];
  scores: number[];
  winnerSeats: number[];
  stats: ForestSimulationStats;
  diagnostics: ForestSimulationDiagnostics;
  agentPolicies?: ForestAgentPolicy[];
  trace?: Array<{ now: number; actorSeat?: number; action?: ConnectedForestAction }>;
};

export type ForestSimulationAggregate = {
  playerCount: number;
  policyWinRates: Record<ForestSimulationPolicy, number>;
  freeRate: number;
  freeWalkRate: number;
  walkRate: number;
  forcedStayRate: number;
  forcedWalkRate: number;
  farewellRate: number;
  completedPathsPerGame: number;
  pathScoreShare: number;
};

const POLICIES: readonly ForestSimulationPolicy[] = ["STAY", "WALK", "MIXED"];
export const FOREST_SENDER_MODELS: readonly ForestSenderModel[] = [
  "A_SHORTEST",
  "B_RANDOM",
  "C_NEARLY_DONE",
];

export const FOREST_SIMULATION_RULES: ReadonlyArray<ConnectedForestRules & { name: string }> = [
  { ...connectedForestRules("prototype-1"), name: "prototype-1" },
  { ...connectedForestRules("prototype-1"), name: "stay-3", stayReceiverHearts: 3 },
  { ...connectedForestRules("prototype-1"), name: "path-cap-2", pathCap: 2 },
  { ...connectedForestRules("prototype-1"), name: "stay-3-cap-2", stayReceiverHearts: 3, pathCap: 2 },
  { ...connectedForestRules("prototype-1"), name: "walk-2", stayReceiverHearts: 3, walkReceiverLeaves: 2 },
  { ...connectedForestRules("prototype-1"), name: "symmetric-2", walkReceiverLeaves: 2 },
  { ...connectedForestRules("prototype-1"), name: "stay-4", stayReceiverHearts: 4 },
];

export const createSeededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
};

// A separate stream chooses seat permutations; label rotations balance every
// seat over each three-game block. Deck seeds never select player policies.
export function createForestPolicySchedule(
  playerCount: 4 | 5 | 6,
  runs: number,
  seedBase = 70_000,
): ForestSimulationPolicy[][] {
  const random = createSeededRandom(seedBase ^ 0x85ebca6b);
  const schedule: ForestSimulationPolicy[][] = [];
  while (schedule.length < runs) {
    const labels = Array.from({ length: playerCount }, (_, seat) => seat % POLICIES.length);
    for (let index = labels.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [labels[index], labels[other]] = [labels[other], labels[index]];
    }
    const offset = Math.floor(random() * POLICIES.length);
    for (let rotation = 0; rotation < POLICIES.length && schedule.length < runs; rotation += 1) {
      schedule.push(labels.map((label) => POLICIES[(label + offset + rotation) % POLICIES.length]));
    }
  }
  return schedule;
}

const randomIndexFrom = (random: () => number) => (maxExclusive: number) =>
  Math.floor(random() * maxExclusive);

const emptyStats = (): ForestSimulationStats => ({
  stay: 0,
  walk: 0,
  farewell: 0,
  free: 0,
  freeWalk: 0,
  forcedStay: 0,
  forcedWalk: 0,
  completedPaths: 0,
});

const residents = (player: ForestPlayer) => player.figures.filter(
  (figure): figure is ForestResidentFigure => figure.kind === "RESIDENT",
);

const terrainCount = (player: ForestPlayer, kind: ForestTerrainCard["kind"]) =>
  player.board.filter((cell) => cell.terrain === kind).length;

const hexSort = new Map(FOREST_HEXES.map((hex) => [hex.id, hex.sort]));

type SimulationPattern = Array<{ hexId: string; terrain: ForestTerrainCard["kind"] }>;
const simulationPatterns = new Map<string, { patterns: SimulationPattern[]; byPlacement: Map<string, SimulationPattern[]> }>();
// Geometry is finite and independent of the board. Compile it once; keep the
// authoritative welcome selector for every positive match.
const compiledPatterns = (animal: ForestAnimalCard) => {
  const key = `${animal.id}:${JSON.stringify(animal.cells)}`;
  const cached = simulationPatterns.get(key);
  if (cached) return cached;
  const patterns = FOREST_HEXES.flatMap((origin) => Array.from({ length: 6 }, (_, rotation) => {
    const cells = forestPatternHexes(animal, origin.id, rotation);
    return cells.some((cell) => !cell) ? undefined : cells as SimulationPattern;
  }).filter((cells): cells is SimulationPattern => cells !== undefined));
  const byPlacement = new Map<string, SimulationPattern[]>();
  for (const pattern of patterns) for (const cell of pattern) {
    const cellKey = `${cell.hexId}:${cell.terrain}`;
    const related = byPlacement.get(cellKey) ?? [];
    related.push(pattern);
    byPlacement.set(cellKey, related);
  }
  const result = { patterns, byPlacement };
  simulationPatterns.set(key, result);
  return result;
};
const boardTerrains = (player: ForestPlayer) => new Map(player.board.map((cell) => [cell.hexId, cell.acornTerrain ?? cell.terrain]));

const orderedWelcomeChoices = (player: ForestPlayer, animal: ForestAnimalCard, patterns = compiledPatterns(animal), terrains = boardTerrains(player)) => {
  if (!patterns.patterns.some((pattern) => pattern.every((cell) => terrains.get(cell.hexId) === cell.terrain))) return [];
  return forestWelcomeChoices(player, animal).sort((a, b) =>
    (hexSort.get(a.originHexId) ?? 99) - (hexSort.get(b.originHexId) ?? 99)
    || a.rotation - b.rotation
    || (hexSort.get(a.residentHexId) ?? 99) - (hexSort.get(b.residentHexId) ?? 99));
};

const habitatProgress = (
  patterns: ReturnType<typeof compiledPatterns>,
  terrains: ReturnType<typeof boardTerrains>,
  placedHexId: string,
  placedTerrain: ForestTerrainCard["kind"],
) => {
  let best = 0;
  for (const pattern of patterns.byPlacement.get(`${placedHexId}:${placedTerrain}`) ?? []) {
      let matched = 0;
      let blocked = false;
      for (const cell of pattern) {
        const terrain = terrains.get(cell.hexId);
        if (terrain === cell!.terrain) matched += 1;
        else if (terrain !== undefined) blocked = true;
      }
      if (!blocked) best = Math.max(best, matched);
  }
  return best;
};

type Placement = {
  card: ForestTerrainCard;
  hexId: string;
  welcome?: ForestWelcomeChoice;
  score: number;
  useGoldenAcorn?: boolean;
  acornTerrain?: ForestTerrainCard["kind"];
  refreshAnimalCardId?: ForestAnimalCard["id"];
};

export type ForestGoldenPlacement = {
  seasonIndex: number;
  pickIndex: number;
  seat: number;
  handIndex: number;
  hexId: string;
  welcomeAnimalCardId?: ForestAnimalCard["id"];
  residentHexId?: string;
};

const choosePlacement = (player: ForestPlayer, tools = false, seasonIndex = 0, pickIndex = 0, skill: "GREEDY" | "NOISY" | "RANDOM" = "GREEDY", random = () => 0): Placement => {
  const placements: Placement[] = [];
  const patternsByAnimal = new Map(player.activeAnimals.map((animal) => [animal.id, compiledPatterns(animal)]));
  const canRefresh = tools && player.animalRefreshAvailable && pickIndex === 0 && seasonIndex > 0;
  const currentTerrains = canRefresh ? boardTerrains(player) : new Map<string, ForestTerrainCard["kind"] | undefined>();
  const currentProgress = new Map((canRefresh ? player.activeAnimals : []).map((animal) => [animal.id, Math.max(0, ...patternsByAnimal.get(animal.id)!.patterns.map((pattern) =>
    pattern.some((cell) => currentTerrains.get(cell.hexId) !== undefined && currentTerrains.get(cell.hexId) !== cell.terrain) ? -1 : pattern.filter((cell) => currentTerrains.get(cell.hexId) === cell.terrain).length,
  ))]));
  const refresh = canRefresh ? [...player.activeAnimals].sort((a, b) => {
    return currentProgress.get(a.id)! - currentProgress.get(b.id)!;
  })[0] : undefined;
  const refreshProgress = refresh ? currentProgress.get(refresh.id)! : 99;
  const refreshAnimalCardId = refreshProgress <= 1 ? refresh?.id : undefined;
  const evaluate = (card: ForestTerrainCard, cardIndex: number, acornTerrain?: ForestTerrainCard["kind"]) => {
    for (const hexId of legalForestPlacementHexIds(player)) {
      const preview = { ...player, board: player.board.map((cell) => ({ ...cell })) };
      placeForestTerrain(preview, card, hexId, acornTerrain);
      const terrains = boardTerrains(preview);
      let welcome: ForestWelcomeChoice | undefined;
      if (!player.welcomedThisSeason) {
        for (const animal of preview.activeAnimals) {
          if (animal.id === refreshAnimalCardId) continue;
          welcome = orderedWelcomeChoices(preview, animal, patternsByAnimal.get(animal.id)!, terrains)[0];
          if (welcome) break;
        }
      }
      const progress = preview.activeAnimals.reduce(
        (best, animal) => Math.max(
          best,
          animal.id === refreshAnimalCardId ? 0 : habitatProgress(patternsByAnimal.get(animal.id)!, terrains, hexId, acornTerrain ?? card.kind),
        ),
        0,
      );
      if (acornTerrain && !welcome) continue;
      placements.push({
        card,
        hexId,
        welcome,
        useGoldenAcorn: Boolean(acornTerrain),
        acornTerrain,
        refreshAnimalCardId,
        score: (welcome ? 1_000 + (forestAnimal(welcome.animalCardId)?.hearts ?? 0) * 10 : 0)
          + progress * 12
          + (terrainCount(player, card.kind) < 2 ? 14 : 0)
          - forestHexDistance(hexId)
          - cardIndex / 100 - (acornTerrain ? 30 : 0),
      });
    }
  };
  player.hand.forEach((card, index) => evaluate(card, index));
  const normalHasWelcome = placements.some((placement) => placement.welcome);
  if (tools && player.goldenAcornAvailable && !normalHasWelcome && !player.welcomedThisSeason && skill !== "RANDOM") {
    for (const kind of ["TREE", "WATER", "FLOWER", "ROCK", "MUSHROOM"] as const) evaluate(player.hand[0], 0, kind);
  }
  const selected = placements.sort((a, b) =>
    b.score - a.score
    || (hexSort.get(a.hexId) ?? 99) - (hexSort.get(b.hexId) ?? 99)
    || player.hand.indexOf(a.card) - player.hand.indexOf(b.card))[0];
  if (!selected) throw new Error("No legal simulated placement");
  if (skill === "RANDOM") return placements[Math.floor(random() * placements.length)];
  if (skill === "NOISY" && random() < .25) return placements[Math.min(placements.length - 1, 1 + Math.floor(random() * 2))];
  return selected;
};

const replayPlacement = (
  player: ForestPlayer,
  input: ForestGoldenPlacement,
): Placement => {
  const card = player.hand[input.handIndex];
  if (!card) throw new Error("Golden placement hand index is invalid");
  const preview = structuredClone(player);
  placeForestTerrain(preview, card, input.hexId);
  let welcome: ForestWelcomeChoice | undefined;
  if (input.welcomeAnimalCardId && input.residentHexId) {
    const animal = preview.activeAnimals.find((candidate) =>
      candidate.id === input.welcomeAnimalCardId);
    welcome = animal
      ? orderedWelcomeChoices(preview, animal).find((choice) =>
        choice.residentHexId === input.residentHexId)
      : undefined;
    if (!welcome) throw new Error("Golden welcome choice is invalid");
  }
  return { card, hexId: input.hexId, welcome, score: 0 };
};

const applyPlacement = (
  state: ConnectedForestState,
  player: ForestPlayer,
  placement: Placement,
) => {
  const index = player.hand.findIndex((card) => card.id === placement.card.id);
  const [card] = player.hand.splice(index, 1);
  if (!card) throw new Error("Simulation lost a terrain card");
  placeForestTerrain(player, card, placement.hexId, placement.acornTerrain);
  if (placement.useGoldenAcorn) player.goldenAcornAvailable = false;
  state.terrainDiscard.push(card);
  if (!placement.welcome) return;
  const animalIndex = player.activeAnimals.findIndex(
    (animal) => animal.id === placement.welcome!.animalCardId,
  );
  const [animal] = player.activeAnimals.splice(animalIndex, 1);
  if (!animal) throw new Error("Simulation lost an animal card");
  player.figures.push({
    kind: "RESIDENT",
    figureId: `resident-${player.seat}-${animal.id}`,
    animalCardId: animal.id,
    speciesId: animal.speciesId,
    hexId: placement.welcome.residentHexId,
    visited: false,
  });
  player.welcomedThisSeason = true;
  if (state.seasonIndex < 4) {
    const replacement = state.animalDeck.shift();
    if (!replacement) throw new Error("Simulation exhausted the animal deck");
    player.activeAnimals.push(replacement);
  }
};

const passSimulationHands = (state: ConnectedForestState) => {
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const hands = players.map((player) => structuredClone(player.hand));
  players.forEach((player, index) => {
    const source = state.passDirection === "LEFT"
      ? (index + 1) % players.length
      : (index - 1 + players.length) % players.length;
    player.hand = hands[source];
  });
};

const chooseTarget = (
  state: ConnectedForestState,
  sourceSeat: number,
  model: ForestSenderModel,
  random: () => number,
  rules: ConnectedForestRules,
  targetStream?: Array<number | { sourceSeat: number; targetSeat: number }>,
) => {
  const candidates = forestLegalVisitTargetSeats(state, sourceSeat, rules);
  if (targetStream && targetStream.length > 0) {
    const objectIndex = targetStream.findIndex(
      (entry) => typeof entry !== "number" && entry.sourceSeat === sourceSeat,
    );
    const entry = targetStream.splice(objectIndex >= 0 ? objectIndex : 0, 1)[0];
    const target = typeof entry === "number" ? entry : entry?.targetSeat;
    if (target !== undefined && candidates.includes(target)) return target;
    throw new Error(
      `Golden sender target ${String(target)} is not a neighbor of ${sourceSeat} (${candidates.join(",")})`,
    );
  }
  if (model === "B_RANDOM") return candidates[Math.floor(random() * candidates.length)];
  if (model === "D_LOW_SCORE") return [...candidates].sort((a, b) => scoreForestPlayer(state, state.players.find((player) => player.seat === a)!, rules).total - scoreForestPlayer(state, state.players.find((player) => player.seat === b)!, rules).total || candidates.indexOf(a) - candidates.indexOf(b))[0];
  if (model === "A_SHORTEST") {
    return [...candidates].sort((a, b) =>
      (forestPathBetween(state, sourceSeat, a)?.length ?? 0)
      - (forestPathBetween(state, sourceSeat, b)?.length ?? 0)
      || candidates.indexOf(a) - candidates.indexOf(b))[0];
  }
  return [...candidates].sort((a, b) => {
    const first = forestPathBetween(state, sourceSeat, a)?.length ?? 0;
    const second = forestPathBetween(state, sourceSeat, b)?.length ?? 0;
    const firstOpen = first < rules.pathCap ? 1 : 0;
    const secondOpen = second < rules.pathCap ? 1 : 0;
    return secondOpen - firstOpen || second - first || candidates.indexOf(a) - candidates.indexOf(b);
  })[0];
};

const policyChoice = (
  policy: ForestSimulationPolicy,
  pathLength: number,
  seasonIndex: number,
  pathCap: number,
) => {
  if (policy === "STAY") return "STAY" as const;
  if (policy === "WALK") return "WALK" as const;
  if (pathLength === pathCap - 1) return "WALK" as const;
  return seasonIndex <= 2 ? "WALK" as const : "STAY" as const;
};

const stayOpportunityCost = (player: ForestPlayer, hexId: string, futureSeasons: number) => {
  if (futureSeasons <= 0) return 0;
  const occupied = new Set(player.figures.map((figure) => figure.hexId));
  const terrains = boardTerrains(player);
  let cost = .15;
  for (const animal of player.activeAnimals) for (const pattern of compiledPatterns(animal).patterns) {
    if (!pattern.some((cell) => cell.hexId === hexId)) continue;
    if (pattern.some((cell) => terrains.get(cell.hexId) !== undefined && terrains.get(cell.hexId) !== cell.terrain)) continue;
    const anchors = pattern.filter((cell) => terrains.get(cell.hexId) !== undefined && !occupied.has(cell.hexId)
      && !player.board.find((boardCell) => boardCell.hexId === cell.hexId)?.acornTerrain);
    const matched = pattern.filter((cell) => terrains.get(cell.hexId) === cell.terrain).length;
    if (anchors.length === 1 && anchors[0].hexId === hexId && matched >= pattern.length - 1) cost = Math.max(cost, animal.hearts * .65);
  }
  return cost;
};

const adaptiveVisit = (state: ConnectedForestState, visit: ForestPendingVisit, rules: ConnectedForestRules, planned: boolean) => {
  const receiver = state.players.find((player) => player.seat === visit.targetSeat)!;
  const source = state.players.find((player) => player.seat === visit.sourceSeat)!;
  const options = forestVisitOptions(state, visit, rules);
  const futureSeasons = 4 - state.seasonIndex;
  const opportunityCosts = new Map(options.stayHexIds.map((hexId) => [hexId, stayOpportunityCost(receiver, hexId, futureSeasons)]));
  const targetHexId = [...options.stayHexIds].sort((a, b) => opportunityCosts.get(a)! - opportunityCosts.get(b)! || options.stayHexIds.indexOf(a) - options.stayHexIds.indexOf(b))[0];
  const pathLength = forestPathBetween(state, visit.sourceSeat, visit.targetSeat)!.length;
  const sourceWeight = planned ? scoreForestPlayer(state, source, rules).total >= scoreForestPlayer(state, receiver, rules).total - 3 ? .7 : .2 : 0;
  const visitorCount = receiver.figures.filter((figure) => figure.kind === "VISITOR").length;
  const mostVisitors = Math.max(...state.players.filter((player) => player.seat !== receiver.seat).map((player) => player.figures.filter((figure) => figure.kind === "VISITOR").length));
  const tieValue = visitorCount >= mostVisitors ? .2 : .1;
  const stay = forestStayHearts(receiver, visit.speciesId, rules) - opportunityCosts.get(targetHexId)!
    - sourceWeight * rules.staySenderLeaves + tieValue;
  const walkReward = forestVisitLeafRewards("WALK", pathLength + 1 === rules.pathCap, rules);
  let walk = walkReward.receiverLeaves - sourceWeight * walkReward.senderLeaves;
  let stayValue = stay;
  if (planned && futureSeasons > 0) {
    const futureStay = rules.stayReceiverHearts - .15 - sourceWeight * rules.staySenderLeaves + tieValue;
    const uniqueHosted = new Set(receiver.figures.filter((figure) => figure.kind === "VISITOR").map((figure) => figure.speciesId)).size;
    const budget = Math.max(0, (rules.visitorDiversityCap ?? 3 + uniqueHosted) - uniqueHosted);
    const continuation = (length: number, remainingBonus: number, depth: number): number => {
      if (depth === 0) return 0;
      const chance = remainingBonus > 0 ? .7 : 0;
      const staying = futureStay + chance * (rules.visitorDiversityHearts ?? 0) + .5 * ((1 - chance) * continuation(length, remainingBonus, depth - 1) + chance * continuation(length, Math.max(0, remainingBonus - 1), depth - 1));
      if (length >= rules.pathCap) return staying;
      const reward = forestVisitLeafRewards("WALK", length + 1 === rules.pathCap, rules);
      return Math.max(staying, reward.receiverLeaves - sourceWeight * reward.senderLeaves + .5 * continuation(length + 1, remainingBonus, depth - 1));
    };
    const horizon = Math.min(2, futureSeasons);
    const currentBonus = forestStayHearts(receiver, visit.speciesId, rules) > rules.stayReceiverHearts ? 1 : 0;
    stayValue += .5 * continuation(pathLength, Math.max(0, budget - currentBonus), horizon);
    walk += .5 * continuation(pathLength + 1, budget, horizon);
  }
  return { choice: walk > stayValue ? "WALK" as const : "STAY" as const, targetHexId };
};

const applySimulatedVisit = (
  state: ConnectedForestState,
  visit: ForestPendingVisit,
  policy: ForestAgentPolicy,
  rules: ConnectedForestRules,
  stats: ForestSimulationStats,
  diagnostics: ForestSimulationDiagnostics,
  random: () => number,
  record?: (actorSeat: number, action: ConnectedForestAction) => void,
) => {
  const source = state.players.find((player) => player.seat === visit.sourceSeat)!;
  const receiver = state.players.find((player) => player.seat === visit.targetSeat)!;
  const options = forestVisitOptions(state, visit, rules);
  let choice: ForestVisitChoice;
  let stayHexId = options.stayHexIds[0];
  const beforeScore = scoreForestPlayer(state, receiver, rules).total;
  diagnostics.incomingVisits[visit.targetSeat - 1] += 1;
  if (options.stayHexIds.length > 0 && options.canWalk) {
    stats.free += 1;
    diagnostics.freeChoices[visit.targetSeat - 1] += 1;
    const path = forestPathBetween(state, visit.sourceSeat, visit.targetSeat)!;
    if (policy === "ADAPTIVE" || policy === "IMMEDIATE") {
      const adaptive = adaptiveVisit(state, visit, rules, policy === "ADAPTIVE");
      choice = adaptive.choice;
      stayHexId = adaptive.targetHexId;
    } else if (policy === "RANDOM") choice = random() < .5 ? "STAY" : "WALK";
    else choice = policyChoice(policy, path.length, state.seasonIndex, rules.pathCap);
    if (choice === "WALK") { stats.freeWalk += 1; diagnostics.freeWalkChoices[visit.targetSeat - 1] += 1; }
  } else if (options.stayHexIds.length > 0) {
    choice = "STAY";
    stats.forcedStay += 1;
  } else if (options.canWalk) {
    choice = "WALK";
    stats.forcedWalk += 1;
  } else {
    choice = "FAREWELL";
    stats.farewell += 1;
  }
  if (choice === "STAY") {
    record?.(visit.targetSeat, { type: "RESOLVE_VISIT", visitId: visit.visitId, choice, targetHexId: stayHexId });
    const rewards = forestVisitLeafRewards(choice, false, rules);
    source.leaves += rewards.senderLeaves;
    receiver.figures.push({
      kind: "VISITOR",
      figureId: `visitor-${visit.visitId}`,
      visitId: visit.visitId,
      speciesId: visit.speciesId,
      hexId: stayHexId,
      sourceSeat: source.seat,
    });
    stats.stay += 1;
  } else if (choice === "WALK") {
    record?.(visit.targetSeat, { type: "RESOLVE_VISIT", visitId: visit.visitId, choice });
    const path = forestPathBetween(state, source.seat, receiver.seat)!;
    path.length = (path.length + 1) as typeof path.length;
    const completed = path.length === rules.pathCap;
    const rewards = forestVisitLeafRewards(choice, completed, rules);
    receiver.leaves += rewards.receiverLeaves;
    receiver.leavesFromPaths += rewards.receiverLeaves;
    source.leaves += rewards.senderLeaves;
    source.leavesFromPaths += rewards.senderLeaves;
    stats.walk += 1;
    if (completed) stats.completedPaths += 1;
  } else {
    const rewards = forestVisitLeafRewards(choice, false, rules);
    receiver.leaves += rewards.receiverLeaves;
    source.leaves += rewards.senderLeaves;
  }
  diagnostics.receiverVisitPoints[visit.targetSeat - 1] += scoreForestPlayer(state, receiver, rules).total - beforeScore;
};

export function simulateConnectedForestGame(input: {
  playerCount: 4 | 5 | 6;
  seed: number;
  policies?: ForestSimulationPolicy[];
  senderModel?: ForestSenderModel;
  rules?: ConnectedForestRules;
  setup?: ConnectedForestSetup;
  senderTargets?: Array<number | { sourceSeat: number; targetSeat: number }>;
  placementChoices?: ForestGoldenPlacement[];
  agentPolicies?: ForestAgentPolicy[];
  useTools?: boolean;
  placementSkill?: "GREEDY" | "NOISY" | "RANDOM";
  senderModels?: ForestSenderModel[];
  responseOrder?: "SEAT" | "REVERSE" | "SHUFFLED";
  captureTrace?: boolean;
}): ForestSimulationGame {
  const rules = input.rules ?? connectedForestRules("prototype-1");
  const deckRandom = createSeededRandom(input.seed);
  const senderRandom = createSeededRandom(input.seed ^ 0x9e3779b9);
  const responseRandom = createSeededRandom(input.seed ^ 0x27d4eb2f);
  const placementRandom = createSeededRandom(input.seed ^ 0x165667b1);
  const agentRandom = Array.from({ length: input.playerCount }, (_, index) => createSeededRandom(input.seed ^ Math.imul(index + 1, 0x85ebca6b)));
  const seats = Array.from({ length: input.playerCount }, (_, index) => index + 1);
  const setup = input.setup ?? createMatchSetup({ seats, randomIndex: randomIndexFrom(deckRandom), rulesVersion: rules.version });
  const roster = seats.map((seat) => ({ seat, userId: `sim-${seat}`, nickname: `P${seat}` }));
  const state = createInitialState(roster, setup, 0);
  const policies = input.policies ?? createForestPolicySchedule(input.playerCount, 1, input.seed)[0];
  const senderModel = input.senderModel ?? "A_SHORTEST";
  const stats = emptyStats();
  const trace: NonNullable<ForestSimulationGame["trace"]> = [];
  let logicalNow = 0;
  const record = input.captureTrace ? (actorSeat: number, action: ConnectedForestAction) => { trace.push({ now: ++logicalNow, actorSeat, action: structuredClone(action) }); } : undefined;
  const diagnostics: ForestSimulationDiagnostics = {
    incomingVisits: seats.map(() => 0), sentVisits: seats.map(() => 0), freeChoices: seats.map(() => 0), freeWalkChoices: seats.map(() => 0), receiverVisitPoints: seats.map(() => 0), goldenAcornsUsed: 0, refreshesUsed: 0, restrictedSenderChoices: 0,
  };

  for (let seasonIndex = 0; seasonIndex < 5; seasonIndex += 1) {
    state.seasonIndex = seasonIndex as ConnectedForestState["seasonIndex"];
    state.passDirection = seasonIndex % 2 === 0 ? "LEFT" : "RIGHT";
    for (const player of state.players) player.welcomedThisSeason = false;
    if (seasonIndex > 0) {
      for (const player of state.players) {
        player.hand = state.terrainDeck.splice(0, 3);
      }
    }
    for (let pick = 0; pick < 3; pick += 1) {
      state.pickIndex = pick as ConnectedForestState["pickIndex"];
      const placements = state.players.map((player) => {
        if (!input.placementChoices) return choosePlacement(player, input.useTools, seasonIndex, pick, input.placementSkill, placementRandom);
        const choice = input.placementChoices.shift();
        if (
          !choice
          || choice.seat !== player.seat
          || choice.seasonIndex !== seasonIndex
          || choice.pickIndex !== pick
        ) {
          throw new Error("Golden placement sequence does not match the simulated turn");
        }
        return replayPlacement(player, choice);
      });
      if (record) state.players.forEach((player, index) => {
        const placement = placements[index];
        record(player.seat, { type: "LOCK_TERRAIN_PICK", cardId: placement.card.id, hexId: placement.hexId, useGoldenAcorn: placement.useGoldenAcorn ?? false, acornTerrain: placement.acornTerrain, refreshAnimalCardId: placement.refreshAnimalCardId, welcome: placement.welcome });
      });
      state.players.forEach((player, index) => {
        const refreshId = placements[index].refreshAnimalCardId;
        if (!refreshId) return;
        const animalIndex = player.activeAnimals.findIndex((animal) => animal.id === refreshId);
        state.animalDiscard.push(...player.activeAnimals.splice(animalIndex, 1));
        player.activeAnimals.push(state.animalDeck.shift()!);
        player.animalRefreshAvailable = false;
        diagnostics.refreshesUsed += 1;
      });
      state.players.forEach((player, index) => { if (placements[index].useGoldenAcorn) diagnostics.goldenAcornsUsed += 1; applyPlacement(state, player, placements[index]); });
      if (pick < 2) passSimulationHands(state);
    }

    const visits: ForestPendingVisit[] = [];
    for (const player of state.players) {
      const resident = residents(player)
        .filter((figure) => !figure.visited)
        .sort((a, b) => a.animalCardId.localeCompare(b.animalCardId))[0];
      if (!resident) continue;
      const animal = forestAnimal(resident.animalCardId)!;
      const targetSeat = chooseTarget(
        state,
        player.seat,
        input.senderModels?.[player.seat - 1] ?? senderModel,
        senderRandom,
        rules,
        input.senderTargets,
      );
      resident.visited = true;
      record?.(player.seat, { type: "CHOOSE_SEASON_VISIT", animalCardId: animal.id, targetSeat });
      diagnostics.sentVisits[player.seat - 1] += 1;
      if (forestLegalVisitTargetSeats(state, player.seat, rules).length < 2) diagnostics.restrictedSenderChoices += 1;
      visits.push({
        visitId: `v-${seasonIndex}-${player.seat}`,
        animalCardId: animal.id,
        speciesId: animal.speciesId,
        visitorTerrain: animal.visitorTerrain,
        sourceSeat: player.seat,
        targetSeat,
      });
    }
    visits.sort((a, b) => a.targetSeat - b.targetSeat || a.sourceSeat - b.sourceSeat);
    state.visitLedger ??= [];
    state.visitLedger.push(...visits.map((visit) => ({ seasonIndex, sourceSeat: visit.sourceSeat, targetSeat: visit.targetSeat })));
    const receiverOrder = [...seats];
    if (input.responseOrder === "REVERSE") receiverOrder.reverse();
    if (input.responseOrder === "SHUFFLED") for (let index = receiverOrder.length - 1; index > 0; index -= 1) {
      const other = Math.floor(responseRandom() * (index + 1));
      [receiverOrder[index], receiverOrder[other]] = [receiverOrder[other], receiverOrder[index]];
    }
    const queues = new Map(seats.map((seat) => [seat, visits.filter((visit) => visit.targetSeat === seat)]));
    const applyCurrent = (seat: number) => {
      const visit = queues.get(seat)!.shift()!;
      applySimulatedVisit(state, visit, input.agentPolicies?.[seat - 1] ?? policies[seat - 1], rules, stats, diagnostics, agentRandom[seat - 1], record);
    };
    const settleUnavailable = () => {
      let changed = true;
      while (changed) {
        changed = false;
        for (const seat of seats) {
          const visit = queues.get(seat)![0];
          if (!visit) continue;
          const options = forestVisitOptions(state, visit, rules);
          if (!options.canWalk && options.stayHexIds.length === 0) { applyCurrent(seat); changed = true; }
        }
      }
    };
    settleUnavailable();
    for (const seat of receiverOrder) while (queues.get(seat)!.length) { applyCurrent(seat); settleUnavailable(); }
    if (input.captureTrace) { logicalNow += rules.revealDurationMs + 1; trace.push({ now: logicalNow }); }
  }

  assertConnectedForestState(state, rules);
  const { scores: scoreRecords, winnerSeats } = scoreConnectedForest(state, rules);
  const scores = scoreRecords.map((score) => score.total);
  return {
    state,
    policies,
    scores,
    winnerSeats,
    stats,
    diagnostics,
    agentPolicies: input.agentPolicies,
    trace: input.captureTrace ? trace : undefined,
  };
}

export function evaluateConnectedForest(input: {
  rules?: ConnectedForestRules;
  runs: number;
  playerCount: 4 | 5 | 6;
  senderModel: ForestSenderModel;
  seedBase?: number;
}): ForestSimulationAggregate {
  const policyWins: Record<ForestSimulationPolicy, number> = { STAY: 0, WALK: 0, MIXED: 0 };
  const policySeats: Record<ForestSimulationPolicy, number> = { STAY: 0, WALK: 0, MIXED: 0 };
  const stats = emptyStats();
  let pathShareTotal = 0;
  let scoredPlayers = 0;
  const schedule = createForestPolicySchedule(input.playerCount, input.runs, input.seedBase);
  for (let run = 0; run < input.runs; run += 1) {
    const policies = schedule[run];
    const game = simulateConnectedForestGame({
      playerCount: input.playerCount,
      seed: (input.seedBase ?? 70_000) + run,
      policies,
      senderModel: input.senderModel,
      rules: input.rules,
    });
    for (const key of Object.keys(stats) as Array<keyof ForestSimulationStats>) {
      stats[key] += game.stats[key];
    }
    game.policies.forEach((policy, index) => {
      policySeats[policy] += 1;
      if (game.winnerSeats.includes(index + 1)) policyWins[policy] += 1;
      if (game.scores[index] > 0) {
        pathShareTotal += game.state.players[index].leavesFromPaths / game.scores[index];
        scoredPlayers += 1;
      }
    });
  }
  const decided = stats.stay + stats.walk;
  const visits = decided + stats.farewell;
  return {
    playerCount: input.playerCount,
    policyWinRates: Object.fromEntries(POLICIES.map((policy) => [
      policy,
      policyWins[policy] / Math.max(policySeats[policy], 1),
    ])) as Record<ForestSimulationPolicy, number>,
    freeRate: stats.free / Math.max(visits, 1),
    freeWalkRate: stats.freeWalk / Math.max(stats.free, 1),
    walkRate: stats.walk / Math.max(decided, 1),
    forcedStayRate: stats.forcedStay / Math.max(visits, 1),
    forcedWalkRate: stats.forcedWalk / Math.max(visits, 1),
    farewellRate: stats.farewell / Math.max(visits, 1),
    completedPathsPerGame: stats.completedPaths / Math.max(input.runs, 1),
    pathScoreShare: pathShareTotal / Math.max(scoredPlayers, 1),
  };
}

export function forestWinRateSpread(results: ForestSimulationAggregate[]) {
  const spreads = results.map((result) => {
    const rates = Object.values(result.policyWinRates);
    return Math.max(...rates) - Math.min(...rates);
  });
  return spreads.reduce((sum, value) => sum + value, 0) / Math.max(spreads.length, 1);
}

export function sweepConnectedForest(input: {
  runs: number;
  rules?: ReadonlyArray<ConnectedForestRules & { name?: string }>;
  senderModels?: readonly ForestSenderModel[];
  seedBase?: number;
}) {
  return (input.rules ?? FOREST_SIMULATION_RULES).map((rules) => {
    const gaps = Object.fromEntries((input.senderModels ?? FOREST_SENDER_MODELS).map((senderModel) => {
      const results = ([4, 5, 6] as const).map((playerCount) => evaluateConnectedForest({
        rules,
        runs: input.runs,
        playerCount,
        senderModel,
        seedBase: input.seedBase,
      }));
      return [senderModel, forestWinRateSpread(results)];
    })) as Record<ForestSenderModel, number>;
    return { name: rules.name ?? rules.version, gaps, worst: Math.max(...Object.values(gaps)) };
  });
}

const argument = (name: string, fallback: number) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};

export function runConnectedForestSimulationCli() {
  const runs = argument("--runs", 30);
  const seedBase = argument("--seed", 70_000);
  const fullGrid = process.argv.includes("--grid");
  const senderArgument = process.argv.find((value) => value.startsWith("--sender="))
    ?.split("=")[1] as ForestSenderModel | undefined;
  const senders = senderArgument ? [senderArgument] : FOREST_SENDER_MODELS;
  const rules = fullGrid ? FOREST_SIMULATION_RULES : FOREST_SIMULATION_RULES.slice(0, 2);
  const rows = [];
  for (const candidate of rules) {
    const [row] = sweepConnectedForest({ runs, seedBase, rules: [candidate], senderModels: senders });
    const gaps = Object.entries(row.gaps)
      .map(([sender, gap]) => `${sender} ${(gap * 100).toFixed(1)}%p`)
      .join(" | ");
    console.log(`${row.name}: ${gaps} | worst ${(row.worst * 100).toFixed(1)}%p`);
    rows.push(row);
  }
  return rows;
}

if (import.meta.main) runConnectedForestSimulationCli();
