import { DomainError as GameRuleError } from "../../../shared/errors/domain-error";
import type {
  ConnectedForestErrorCode,
  ConnectedForestRules,
  ConnectedForestRulesVersion,
  ConnectedForestSetup,
  ForestAnimalCard,
  ForestHex,
  ForestPatternCell,
  ForestPatternTemplateId,
  ForestSpeciesId,
  ForestTerrainCard,
  ForestTerrainKind,
} from "./types";

export const FOREST_TERRAINS: readonly ForestTerrainKind[] = [
  "TREE",
  "WATER",
  "FLOWER",
  "ROCK",
  "MUSHROOM",
];

export const FOREST_HEXES: readonly ForestHex[] = [
  { id: "h00", q: 0, r: 0, sort: 0 },
  { id: "h01", q: -1, r: 0, sort: 1 },
  { id: "h02", q: -1, r: 1, sort: 2 },
  { id: "h03", q: 0, r: -1, sort: 3 },
  { id: "h04", q: 0, r: 1, sort: 4 },
  { id: "h05", q: 1, r: -1, sort: 5 },
  { id: "h06", q: 1, r: 0, sort: 6 },
  { id: "h07", q: -2, r: 0, sort: 7 },
  { id: "h08", q: -2, r: 1, sort: 8 },
  { id: "h09", q: -2, r: 2, sort: 9 },
  { id: "h10", q: -1, r: -1, sort: 10 },
  { id: "h11", q: -1, r: 2, sort: 11 },
  { id: "h12", q: 0, r: -2, sort: 12 },
  { id: "h13", q: 0, r: 2, sort: 13 },
  { id: "h14", q: 1, r: -2, sort: 14 },
  { id: "h15", q: 1, r: 1, sort: 15 },
  { id: "h16", q: 2, r: -2, sort: 16 },
  { id: "h17", q: 2, r: -1, sort: 17 },
  { id: "h18", q: 2, r: 0, sort: 18 },
];

export const CONNECTED_FOREST_RULES_BY_VERSION: Readonly<
  Record<ConnectedForestRulesVersion, ConnectedForestRules>
> = {
  "prototype-1": {
    version: "prototype-1",
    stayReceiverHearts: 2,
    staySenderLeaves: 1,
    walkReceiverLeaves: 3,
    walkSenderLeaves: 1,
    pathCompletionReceiverLeaves: 3,
    pathCompletionSenderLeaves: 3,
    pathCap: 3,
    draftDeadlineMs: 60_000,
    visitSelectDeadlineMs: 30_000,
    visitResponseDeadlineMs: 20_000,
    revealDurationMs: 1_800,
    forfeitClaimDelayMs: 3 * 60_000,
    balanceBonusHearts: 5,
  },
  "balanced-1": {
    version: "balanced-1",
    stayReceiverHearts: 1,
    visitorDiversityHearts: 1,
    visitorDiversityCap: 2,
    staySenderLeaves: 1,
    walkReceiverLeaves: 2,
    walkSenderLeaves: 1,
    pathCompletionReceiverLeaves: 1,
    pathCompletionSenderLeaves: 1,
    pathCap: 4,
    visitRouting: "ALTERNATE",
    visitTieBreak: "LOW_SEAT",
    draftDeadlineMs: 60_000,
    visitSelectDeadlineMs: 30_000,
    visitResponseDeadlineMs: 20_000,
    revealDurationMs: 1_800,
    forfeitClaimDelayMs: 3 * 60_000,
    balanceBonusHearts: 5,
  },
  "balanced-2": {
    version: "balanced-2",
    stayReceiverHearts: 1,
    visitorDiversityHearts: 1,
    visitorDiversityCap: 2,
    staySenderLeaves: 1,
    walkReceiverLeaves: 2,
    walkSenderLeaves: 1,
    pathCompletionReceiverLeaves: 1,
    pathCompletionSenderLeaves: 1,
    pathCap: 4,
    visitRouting: "ALTERNATE",
    visitTieBreak: "SEASON_DIRECTION",
    draftDeadlineMs: 60_000,
    visitSelectDeadlineMs: 30_000,
    visitResponseDeadlineMs: 20_000,
    revealDurationMs: 1_800,
    forfeitClaimDelayMs: 3 * 60_000,
    balanceBonusHearts: 5,
  },
};

export const CONNECTED_FOREST_CURRENT_RULES_VERSION: ConnectedForestRulesVersion = "balanced-2";

export const forestError = (
  code: ConnectedForestErrorCode,
  message: string,
): never => {
  throw new GameRuleError(code, message);
};

export function connectedForestRules(
  version: ConnectedForestRulesVersion | string,
): ConnectedForestRules {
  const rules = CONNECTED_FOREST_RULES_BY_VERSION[version as ConnectedForestRulesVersion];
  if (!rules) forestError("INVALID_GAME_SETUP", "지원하지 않는 이어지는 숲길 규칙 버전입니다.");
  return rules;
}

type TemplateDefinition = {
  cells: Array<{ q: number; r: number; variable: "A" | "B" | "C" }>;
  hearts: 3 | 5;
};

const FOREST_TEMPLATES: Readonly<Record<ForestPatternTemplateId, TemplateDefinition>> = {
  line3: {
    cells: [
      { q: 0, r: 0, variable: "A" },
      { q: 1, r: 0, variable: "B" },
      { q: 2, r: 0, variable: "A" },
    ],
    hearts: 3,
  },
  bend3: {
    cells: [
      { q: 0, r: 0, variable: "A" },
      { q: 1, r: 0, variable: "B" },
      { q: 0, r: 1, variable: "C" },
    ],
    hearts: 3,
  },
  nest4: {
    cells: [
      { q: 0, r: 0, variable: "A" },
      { q: 1, r: 0, variable: "B" },
      { q: 0, r: 1, variable: "C" },
      { q: 1, r: -1, variable: "A" },
    ],
    hearts: 5,
  },
  trail4: {
    cells: [
      { q: 0, r: 0, variable: "A" },
      { q: 1, r: 0, variable: "B" },
      { q: 1, r: -1, variable: "C" },
      { q: 2, r: -1, variable: "B" },
    ],
    hearts: 5,
  },
};

type SpeciesDefinition = {
  id: ForestSpeciesId;
  name: string;
  A: ForestTerrainKind;
  B: ForestTerrainKind;
  C: ForestTerrainKind;
  visitorTerrain: ForestTerrainKind;
};

const FOREST_SPECIES: readonly SpeciesDefinition[] = [
  { id: "squirrel", name: "다람쥐", A: "TREE", B: "MUSHROOM", C: "ROCK", visitorTerrain: "TREE" },
  { id: "otter", name: "수달", A: "WATER", B: "ROCK", C: "FLOWER", visitorTerrain: "WATER" },
  { id: "rabbit", name: "토끼", A: "FLOWER", B: "TREE", C: "MUSHROOM", visitorTerrain: "FLOWER" },
  { id: "hedgehog", name: "고슴도치", A: "MUSHROOM", B: "TREE", C: "ROCK", visitorTerrain: "MUSHROOM" },
  { id: "frog", name: "개구리", A: "WATER", B: "FLOWER", C: "MUSHROOM", visitorTerrain: "WATER" },
  { id: "fox", name: "여우", A: "ROCK", B: "TREE", C: "FLOWER", visitorTerrain: "ROCK" },
  { id: "owl", name: "부엉이", A: "TREE", B: "ROCK", C: "MUSHROOM", visitorTerrain: "TREE" },
  { id: "beaver", name: "비버", A: "WATER", B: "TREE", C: "ROCK", visitorTerrain: "WATER" },
  { id: "deer", name: "사슴", A: "FLOWER", B: "TREE", C: "WATER", visitorTerrain: "FLOWER" },
  { id: "mole", name: "두더지", A: "ROCK", B: "MUSHROOM", C: "TREE", visitorTerrain: "ROCK" },
  { id: "duck", name: "오리", A: "WATER", B: "FLOWER", C: "TREE", visitorTerrain: "WATER" },
  { id: "tanuki", name: "너구리", A: "MUSHROOM", B: "FLOWER", C: "TREE", visitorTerrain: "MUSHROOM" },
];

const templateIds = Object.keys(FOREST_TEMPLATES) as ForestPatternTemplateId[];

export const FOREST_ANIMAL_CARDS: readonly ForestAnimalCard[] = FOREST_SPECIES.flatMap(
  (species) => templateIds.map((templateId) => {
    const template = FOREST_TEMPLATES[templateId];
    const terrains = { A: species.A, B: species.B, C: species.C };
    const cells: ForestPatternCell[] = template.cells.map((cell) => ({
      q: cell.q,
      r: cell.r,
      terrain: terrains[cell.variable],
    }));
    return {
      id: `${species.id}-${templateId}`,
      speciesId: species.id,
      name: species.name,
      cells,
      visitorTerrain: species.visitorTerrain,
      hearts: template.hearts,
    } as ForestAnimalCard;
  }),
);

export const FOREST_TERRAIN_CARDS: readonly ForestTerrainCard[] = FOREST_TERRAINS.flatMap(
  (kind) => Array.from({ length: 18 }, (_, index) => ({
    id: `terrain-${kind.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
    kind,
  })),
);

const shuffle = <T>(
  values: readonly T[],
  randomIndex: (maxExclusive: number) => number,
) => {
  const next = structuredClone(values) as T[];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    if (!Number.isInteger(target) || target < 0 || target > index) {
      forestError("INVALID_GAME_SETUP", "난수 인덱스가 유효하지 않습니다.");
    }
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
};

export function createMatchSetup(input: {
  seats: number[];
  randomIndex: (maxExclusive: number) => number;
  rulesVersion?: ConnectedForestRulesVersion;
}): ConnectedForestSetup {
  if (input.seats.length < 4 || input.seats.length > 6) {
    forestError("MIN_PLAYERS", "이어지는 숲길은 4–6명이 필요합니다.");
  }
  const seats = [...input.seats].sort((a, b) => a - b);
  if (new Set(seats).size !== seats.length || seats.some((seat) => !Number.isInteger(seat))) {
    forestError("INVALID_GAME_SETUP", "플레이어 좌석이 유효하지 않습니다.");
  }
  const rulesVersion = input.rulesVersion ?? "prototype-1";
  connectedForestRules(rulesVersion);
  const perTerrain = 3 * seats.length;
  const terrainDeck = FOREST_TERRAINS.flatMap((kind) =>
    FOREST_TERRAIN_CARDS.filter((card) => card.kind === kind).slice(0, perTerrain),
  );
  return {
    rulesVersion,
    seats,
    terrainDeck: shuffle(terrainDeck, input.randomIndex),
    animalDeck: shuffle(FOREST_ANIMAL_CARDS, input.randomIndex),
  };
}
