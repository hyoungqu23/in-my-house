import {
  FOREST_ANIMAL_CARDS,
  FOREST_HEXES,
  FOREST_TERRAINS,
  connectedForestRules,
  forestError,
} from "./content";
import type {
  ConnectedForestRules,
  ConnectedForestState,
  ForestAnimalCard,
  ForestBoardCell,
  ForestFigure,
  ForestNeighborPath,
  ForestPendingVisit,
  ForestPlayer,
  ForestPlayerScore,
  ForestTerrainCard,
  ForestTerrainKind,
  ForestVisitChoice,
  ForestWelcomeChoice,
} from "./types";

const directions = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

const hexById = new Map(FOREST_HEXES.map((hex) => [hex.id, hex]));
const hexByCoordinate = new Map(FOREST_HEXES.map((hex) => [`${hex.q}:${hex.r}`, hex]));
const animalById = new Map<string, ForestAnimalCard>(
  FOREST_ANIMAL_CARDS.map((card) => [card.id, card]),
);

export const forestHex = (hexId: string) => hexById.get(hexId);

export const forestAnimal = (cardId: string) => animalById.get(cardId);

export const forestHexDistance = (hexId: string) => {
  const hex = forestHex(hexId);
  if (!hex) return Number.POSITIVE_INFINITY;
  return (Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(hex.q + hex.r)) / 2;
};

export const areForestHexesAdjacent = (firstId: string, secondId: string) => {
  const first = forestHex(firstId);
  const second = forestHex(secondId);
  if (!first || !second) return false;
  return directions.some(([q, r]) => first.q + q === second.q && first.r + r === second.r);
};

export const rotateForestCoordinate = (q: number, r: number, turns: number) => {
  let nextQ = q;
  let nextR = r;
  for (let index = 0; index < ((turns % 6) + 6) % 6; index += 1) {
    [nextQ, nextR] = [-nextR, nextQ + nextR];
  }
  return { q: nextQ, r: nextR };
};

export const createForestBoard = (): ForestBoardCell[] =>
  FOREST_HEXES.map((hex) => ({ hexId: hex.id }));

export const forestTerrainAt = (cell: ForestBoardCell) =>
  cell.acornTerrain ?? cell.terrain;

export const forestFiguresByHex = (player: ForestPlayer) =>
  new Map(player.figures.map((figure) => [figure.hexId, figure]));

export function legalForestPlacementHexIds(player: ForestPlayer) {
  const occupiedTerrain = player.board.filter((cell) => forestTerrainAt(cell));
  if (occupiedTerrain.length === 0) return ["h00"];
  return player.board
    .filter((cell) => !forestTerrainAt(cell))
    .filter((cell) => occupiedTerrain.some((placed) =>
      areForestHexesAdjacent(cell.hexId, placed.hexId)))
    .map((cell) => cell.hexId);
}

export function placeForestTerrain(
  player: ForestPlayer,
  card: ForestTerrainCard,
  hexId: string,
  acornTerrain?: ForestTerrainKind,
) {
  if (!legalForestPlacementHexIds(player).includes(hexId)) {
    forestError("INVALID_PLACEMENT", "지형을 놓을 수 없는 칸입니다.");
  }
  const cell = player.board.find((candidate) => candidate.hexId === hexId)!;
  if (acornTerrain) {
    cell.acornTerrain = acornTerrain;
    cell.terrain = undefined;
  } else {
    cell.terrain = card.kind;
    cell.acornTerrain = undefined;
  }
}

export function forestPatternHexes(
  card: ForestAnimalCard,
  originHexId: string,
  rotation: number,
) {
  const origin = forestHex(originHexId);
  if (!origin || !Number.isInteger(rotation) || rotation < 0 || rotation > 5) return [];
  return card.cells.map((cell) => {
    const rotated = rotateForestCoordinate(cell.q, cell.r, rotation);
    const hex = hexByCoordinate.get(`${origin.q + rotated.q}:${origin.r + rotated.r}`);
    return hex ? { hexId: hex.id, terrain: cell.terrain } : undefined;
  });
}

export function isForestHabitatMatch(
  player: ForestPlayer,
  card: ForestAnimalCard,
  originHexId: string,
  rotation: number,
) {
  const pattern = forestPatternHexes(card, originHexId, rotation);
  if (pattern.length !== card.cells.length || pattern.some((cell) => !cell)) return false;
  return pattern.every((cell) => {
    const boardCell = player.board.find((candidate) => candidate.hexId === cell!.hexId);
    return boardCell && forestTerrainAt(boardCell) === cell!.terrain;
  });
}

export function isValidForestWelcome(
  player: ForestPlayer,
  choice: ForestWelcomeChoice,
) {
  const card = player.activeAnimals.find((candidate) => candidate.id === choice.animalCardId);
  if (!card || !isForestHabitatMatch(player, card, choice.originHexId, choice.rotation)) {
    return false;
  }
  const pattern = forestPatternHexes(card, choice.originHexId, choice.rotation);
  const patternIds = new Set(pattern.map((cell) => cell?.hexId));
  return patternIds.has(choice.residentHexId)
    && !forestFiguresByHex(player).has(choice.residentHexId)
    && !player.board.find((cell) => cell.hexId === choice.residentHexId)?.acornTerrain;
}

export function forestWelcomeChoices(
  player: ForestPlayer,
  card: ForestAnimalCard,
): ForestWelcomeChoice[] {
  const figures = forestFiguresByHex(player);
  const choices: ForestWelcomeChoice[] = [];
  for (const origin of FOREST_HEXES) {
    for (let rotation = 0; rotation < 6; rotation += 1) {
      if (!isForestHabitatMatch(player, card, origin.id, rotation)) continue;
      const pattern = forestPatternHexes(card, origin.id, rotation);
      for (const cell of pattern) {
        const boardCell = player.board.find((candidate) => candidate.hexId === cell!.hexId);
        if (figures.has(cell!.hexId) || boardCell?.acornTerrain) continue;
        choices.push({
          animalCardId: card.id,
          originHexId: origin.id,
          rotation: rotation as ForestWelcomeChoice["rotation"],
          residentHexId: cell!.hexId,
        });
      }
    }
  }
  return choices;
}

export function forestNeighborSeats(state: ConnectedForestState, seat: number) {
  const seats = state.players.map((player) => player.seat).sort((a, b) => a - b);
  const index = seats.indexOf(seat);
  if (index < 0) return [];
  return [...new Set([
    seats[(index - 1 + seats.length) % seats.length],
    seats[(index + 1) % seats.length],
  ])].sort((a, b) => a - b);
}

/** All selections in a season use the same, committed history, never pending submissions. */
export function forestLegalVisitTargetSeats(
  state: ConnectedForestState,
  seat: number,
  rules: ConnectedForestRules = connectedForestRules(state.rulesVersion),
) {
  let neighbors = forestNeighborSeats(state, seat);
  if (rules.visitTieBreak === "SEASON_DIRECTION" && neighbors.length > 0) {
    const seats = state.players.map((player) => player.seat).sort((a, b) => a - b);
    const index = seats.indexOf(seat);
    const preferred = seats[(index + (state.passDirection === "LEFT" ? seats.length - 1 : 1)) % seats.length];
    neighbors = [...neighbors].sort((a, b) => Number(b === preferred) - Number(a === preferred));
  }
  if (!rules.visitRouting || rules.visitRouting === "FREE" || neighbors.length === 0) return neighbors;
  const history = state.visitLedger ?? [];
  const counts = neighbors.map((targetSeat) => ({
    targetSeat,
    count: history.filter((entry) => entry.targetSeat === targetSeat
      && (rules.visitRouting !== "ALTERNATE" || entry.sourceSeat === seat)).length,
  }));
  const minimum = Math.min(...counts.map((entry) => entry.count));
  return counts.filter((entry) => entry.count === minimum).map((entry) => entry.targetSeat);
}

export function forestStayHearts(player: ForestPlayer, speciesId: ForestFigure["speciesId"], rules: ConnectedForestRules) {
  const hostedSpecies = new Set(player.figures.filter((figure) => figure.kind === "VISITOR").map((figure) => figure.speciesId));
  const bonusAvailable = !hostedSpecies.has(speciesId) && hostedSpecies.size < (rules.visitorDiversityCap ?? Number.POSITIVE_INFINITY);
  return rules.stayReceiverHearts + (bonusAvailable ? rules.visitorDiversityHearts ?? 0 : 0);
}

export const forestPathKey = (firstSeat: number, secondSeat: number) =>
  firstSeat < secondSeat ? `${firstSeat}:${secondSeat}` : `${secondSeat}:${firstSeat}`;

export function forestPathBetween(
  state: ConnectedForestState,
  firstSeat: number,
  secondSeat: number,
) {
  const key = forestPathKey(firstSeat, secondSeat);
  return state.neighborPaths.find((path) => forestPathKey(path.lowSeat, path.highSeat) === key);
}

export function forestVisitOptions(
  state: ConnectedForestState,
  visit: ForestPendingVisit,
  rules: ConnectedForestRules = connectedForestRules(state.rulesVersion),
) {
  const receiver = state.players.find((player) => player.seat === visit.targetSeat);
  const path = forestPathBetween(state, visit.sourceSeat, visit.targetSeat);
  if (!receiver || !path) return { stayHexIds: [] as string[], canWalk: false };
  const figures = forestFiguresByHex(receiver);
  const stayHexIds = receiver.board
    .filter((cell) => cell.terrain === visit.visitorTerrain)
    .filter((cell) => !cell.acornTerrain && !figures.has(cell.hexId))
    .sort((first, second) =>
      forestHexDistance(second.hexId) - forestHexDistance(first.hexId)
      || first.hexId.localeCompare(second.hexId))
    .map((cell) => cell.hexId);
  return { stayHexIds, canWalk: path.length < rules.pathCap };
}

export function forestVisitLeafRewards(
  choice: ForestVisitChoice,
  completesPath: boolean,
  rules: ConnectedForestRules,
) {
  if (choice === "STAY") {
    return { receiverLeaves: 0, senderLeaves: rules.staySenderLeaves };
  }
  if (choice === "FAREWELL") return { receiverLeaves: 1, senderLeaves: 1 };
  return {
    receiverLeaves: rules.walkReceiverLeaves
      + (completesPath ? rules.pathCompletionReceiverLeaves : 0),
    senderLeaves: rules.walkSenderLeaves
      + (completesPath ? rules.pathCompletionSenderLeaves : 0),
  };
}

export function forestAnimalCardForResident(figure: ForestFigure) {
  return figure.kind === "RESIDENT" ? forestAnimal(figure.animalCardId) : undefined;
}

export function scoreForestPlayer(
  state: ConnectedForestState,
  player: ForestPlayer,
  rules: ConnectedForestRules = connectedForestRules(state.rulesVersion),
): ForestPlayerScore {
  const residentHearts = player.figures
    .filter((figure) => figure.kind === "RESIDENT")
    .reduce((sum, figure) => sum + forestAnimalCardForResident(figure)!.hearts, 0);
  const visitors = player.figures.filter((figure) => figure.kind === "VISITOR");
  const visitorHearts = visitors.length * rules.stayReceiverHearts
    + Math.min(new Set(visitors.map((figure) => figure.speciesId)).size, rules.visitorDiversityCap ?? Number.POSITIVE_INFINITY) * (rules.visitorDiversityHearts ?? 0);
  const terrainCounts = new Map<ForestTerrainKind, number>();
  for (const cell of player.board) {
    if (cell.terrain) terrainCounts.set(cell.terrain, (terrainCounts.get(cell.terrain) ?? 0) + 1);
  }
  const balanceBonus = FOREST_TERRAINS.every((terrain) => (terrainCounts.get(terrain) ?? 0) >= 2)
    ? rules.balanceBonusHearts
    : 0;
  return {
    seat: player.seat,
    residentHearts,
    visitorHearts,
    leafHearts: player.leaves,
    leafHeartsFromPaths: player.leavesFromPaths,
    balanceBonus,
    total: residentHearts + visitorHearts + player.leaves + balanceBonus,
  };
}

export function scoreConnectedForest(
  state: ConnectedForestState,
  rules: ConnectedForestRules = connectedForestRules(state.rulesVersion),
) {
  const scores = state.players.map((player) => scoreForestPlayer(state, player, rules));
  const best = Math.max(...scores.map((score) => score.total));
  let contenders = scores.filter((score) => score.total === best);
  if (contenders.length > 1) {
    const visitorCounts = new Map(state.players.map((player) => [
      player.seat,
      player.figures.filter((figure) => figure.kind === "VISITOR").length,
    ]));
    const bestVisitors = Math.max(...contenders.map((score) => visitorCounts.get(score.seat)!));
    contenders = contenders.filter((score) => visitorCounts.get(score.seat) === bestVisitors);
  }
  if (contenders.length > 1) {
    const residentCounts = new Map(state.players.map((player) => [
      player.seat,
      player.figures.filter((figure) => figure.kind === "RESIDENT").length,
    ]));
    const bestResidents = Math.max(...contenders.map((score) => residentCounts.get(score.seat)!));
    contenders = contenders.filter((score) => residentCounts.get(score.seat) === bestResidents);
  }
  return { scores, winnerSeats: contenders.map((score) => score.seat) };
}

const uniqueCardIds = (cards: Array<{ id: string }>) => new Set(cards.map((card) => card.id)).size;

export function assertConnectedForestState(state: ConnectedForestState, rules: ConnectedForestRules = connectedForestRules(state.rulesVersion)) {
  connectedForestRules(state.rulesVersion);
  const playerSeats = state.players.map((player) => player.seat);
  if (state.players.length < 4 || state.players.length > 6 || new Set(playerSeats).size !== playerSeats.length) {
    forestError("CONTENT_INVARIANT_BROKEN", "플레이어 상태가 유효하지 않습니다.");
  }
  const terrainCards = [
    ...state.terrainDeck,
    ...state.terrainDiscard,
    ...state.players.flatMap((player) => player.hand),
  ];
  if (terrainCards.length !== state.players.length * 15 || uniqueCardIds(terrainCards) !== terrainCards.length) {
    forestError("CONTENT_INVARIANT_BROKEN", "지형 카드 보존 규칙이 깨졌습니다.");
  }
  const residentCardIds = state.players.flatMap((player) => player.figures)
    .filter((figure): figure is Extract<ForestFigure, { kind: "RESIDENT" }> => figure.kind === "RESIDENT")
    .map((figure) => figure.animalCardId);
  const animalCards = [
    ...state.animalDeck,
    ...state.animalDiscard,
    ...state.players.flatMap((player) => player.activeAnimals),
  ];
  const animalIds = [...animalCards.map((card) => card.id), ...residentCardIds];
  if (animalIds.length !== FOREST_ANIMAL_CARDS.length || new Set(animalIds).size !== animalIds.length) {
    forestError("CONTENT_INVARIANT_BROKEN", "동물 카드 보존 규칙이 깨졌습니다.");
  }
  for (const player of state.players) {
    if (
      player.board.length !== FOREST_HEXES.length
      || new Set(player.board.map((cell) => cell.hexId)).size !== FOREST_HEXES.length
    ) {
      forestError("CONTENT_INVARIANT_BROKEN", "개인 숲 보드가 유효하지 않습니다.");
    }
    const figureIds = player.figures.map((figure) => figure.figureId);
    const figureHexIds = player.figures.map((figure) => figure.hexId);
    if (new Set(figureIds).size !== figureIds.length || new Set(figureHexIds).size !== figureHexIds.length) {
      forestError("CONTENT_INVARIANT_BROKEN", "피규어가 중복되었습니다.");
    }
    for (const figure of player.figures) {
      const cell = player.board.find((candidate) => candidate.hexId === figure.hexId);
      if (!cell?.terrain || cell.acornTerrain) {
        forestError("CONTENT_INVARIANT_BROKEN", "피규어가 유효하지 않은 지형에 있습니다.");
      }
    }
  }
  const pathKeys = state.neighborPaths.map((path) => forestPathKey(path.lowSeat, path.highSeat));
  if (new Set(pathKeys).size !== state.neighborPaths.length) {
    forestError("CONTENT_INVARIANT_BROKEN", "공동 숲길이 중복되었습니다.");
  }
  if (state.neighborPaths.some((path) => path.length < 0 || path.length > rules.pathCap)) {
    forestError("CONTENT_INVARIANT_BROKEN", "공동 숲길 길이가 유효하지 않습니다.");
  }
  if (state.phase === "SEASON_VISIT_RESPOND" && state.phaseEndsAt !== undefined) {
    forestError("CONTENT_INVARIANT_BROKEN", "방문 응답 단계는 공용 마감을 사용하지 않습니다.");
  }
}

export function createForestNeighborPaths(seats: number[]): ForestNeighborPath[] {
  const sorted = [...seats].sort((a, b) => a - b);
  const paths = new Map<string, ForestNeighborPath>();
  sorted.forEach((seat, index) => {
    const other = sorted[(index + 1) % sorted.length];
    const [lowSeat, highSeat] = seat < other ? [seat, other] : [other, seat];
    paths.set(forestPathKey(lowSeat, highSeat), { lowSeat, highSeat, length: 0 });
  });
  return [...paths.values()].sort((a, b) => a.lowSeat - b.lowSeat || a.highSeat - b.highSeat);
}
