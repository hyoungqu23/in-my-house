export type ConnectedForestPhase =
  | "SEASON_DRAFT"
  | "SEASON_VISIT_SELECT"
  | "SEASON_VISIT_RESPOND"
  | "SEASON_REVEAL"
  | "GAME_OVER";

export type ConnectedForestRulesVersion = "prototype-1" | "balanced-1" | "balanced-2";

export type ForestTerrainKind = "TREE" | "WATER" | "FLOWER" | "ROCK" | "MUSHROOM";

export type ForestSpeciesId =
  | "squirrel"
  | "otter"
  | "rabbit"
  | "hedgehog"
  | "frog"
  | "fox"
  | "owl"
  | "beaver"
  | "deer"
  | "mole"
  | "duck"
  | "tanuki";

export type ForestPatternTemplateId = "line3" | "bend3" | "nest4" | "trail4";

export type ForestHex = {
  id: string;
  q: number;
  r: number;
  sort: number;
};

export type ForestTerrainCard = {
  id: string;
  kind: ForestTerrainKind;
};

export type ForestPatternCell = {
  q: number;
  r: number;
  terrain: ForestTerrainKind;
};

export type ForestAnimalCard = {
  id: `${ForestSpeciesId}-${ForestPatternTemplateId}`;
  speciesId: ForestSpeciesId;
  name: string;
  cells: ForestPatternCell[];
  visitorTerrain: ForestTerrainKind;
  hearts: 3 | 5;
};

export type ConnectedForestRules = {
  version: ConnectedForestRulesVersion;
  stayReceiverHearts: number;
  staySenderLeaves: number;
  walkReceiverLeaves: number;
  walkSenderLeaves: number;
  pathCompletionReceiverLeaves: number;
  pathCompletionSenderLeaves: number;
  pathCap: 2 | 3 | 4;
  draftDeadlineMs: number;
  visitSelectDeadlineMs: number;
  visitResponseDeadlineMs: number;
  revealDurationMs: number;
  forfeitClaimDelayMs: number;
  balanceBonusHearts: number;
  /** Experimental axes; omitted values preserve prototype-1. */
  visitRouting?: "FREE" | "ALTERNATE" | "BALANCED_INCOMING";
  visitorDiversityHearts?: number;
  visitorDiversityCap?: number;
  visitTieBreak?: "LOW_SEAT" | "SEASON_DIRECTION";
};

export type ConnectedForestSetup = {
  rulesVersion: ConnectedForestRulesVersion;
  seats: number[];
  terrainDeck: ForestTerrainCard[];
  animalDeck: ForestAnimalCard[];
};

export type ForestBoardCell = {
  hexId: string;
  terrain?: ForestTerrainKind;
  acornTerrain?: ForestTerrainKind;
};

export type ForestResidentFigure = {
  kind: "RESIDENT";
  figureId: string;
  animalCardId: ForestAnimalCard["id"];
  speciesId: ForestSpeciesId;
  hexId: string;
  visited: boolean;
};

export type ForestVisitorFigure = {
  kind: "VISITOR";
  figureId: string;
  visitId: string;
  speciesId: ForestSpeciesId;
  hexId: string;
  sourceSeat: number;
};

export type ForestFigure = ForestResidentFigure | ForestVisitorFigure;

export type ForestPlayer = {
  seat: number;
  userId: string;
  nickname: string;
  board: ForestBoardCell[];
  hand: ForestTerrainCard[];
  activeAnimals: ForestAnimalCard[];
  figures: ForestFigure[];
  leaves: number;
  leavesFromPaths: number;
  goldenAcornAvailable: boolean;
  animalRefreshAvailable: boolean;
  welcomedThisSeason: boolean;
};

export type ForestWelcomeChoice = {
  animalCardId: ForestAnimalCard["id"];
  originHexId: string;
  rotation: 0 | 1 | 2 | 3 | 4 | 5;
  residentHexId: string;
};

export type ForestLockedPick = {
  seat: number;
  cardId: string;
  hexId: string;
  useGoldenAcorn: boolean;
  acornTerrain?: ForestTerrainKind;
  refreshAnimalCardId?: ForestAnimalCard["id"];
  welcome?: ForestWelcomeChoice;
  submittedAt: number;
};

export type ForestPendingVisit = {
  visitId: string;
  animalCardId: ForestAnimalCard["id"];
  speciesId: ForestSpeciesId;
  visitorTerrain: ForestTerrainKind;
  sourceSeat: number;
  targetSeat: number;
};

export type ForestVisitQueue = {
  visits: ForestPendingVisit[];
  currentIndex: number;
  currentDeadlineAt: number;
};

export type ForestVisitChoice = "STAY" | "WALK" | "FAREWELL";

export type ForestVisitResult = ForestPendingVisit & {
  choice: ForestVisitChoice;
  targetHexId?: string;
};

export type ForestNeighborPath = {
  lowSeat: number;
  highSeat: number;
  length: 0 | 1 | 2 | 3 | 4;
};

export type ForestPlayerScore = {
  seat: number;
  residentHearts: number;
  visitorHearts: number;
  leafHearts: number;
  leafHeartsFromPaths: number;
  balanceBonus: number;
  total: number;
};

export type ConnectedForestResult = {
  forfeited: boolean;
  scores?: ForestPlayerScore[];
  winnerSeats?: number[];
};

export type ForestPause = {
  disconnectedSeats: number[];
  pausedAt: number;
  forfeitClaimAt: number;
};

export type ConnectedForestState = {
  phase: ConnectedForestPhase;
  rulesVersion: ConnectedForestRulesVersion;
  seasonIndex: 0 | 1 | 2 | 3 | 4;
  pickIndex: 0 | 1 | 2;
  passDirection: "LEFT" | "RIGHT";
  phaseKey: string;
  phaseEndsAt?: number;
  terrainDeck: ForestTerrainCard[];
  terrainDiscard: ForestTerrainCard[];
  animalDeck: ForestAnimalCard[];
  animalDiscard: ForestAnimalCard[];
  players: ForestPlayer[];
  draftSubmissions: Record<number, ForestLockedPick>;
  visitSelections: Record<number, ForestPendingVisit | "NONE">;
  visitQueues: Record<number, ForestVisitQueue>;
  seasonVisitResults: ForestVisitResult[];
  neighborPaths: ForestNeighborPath[];
  visitLedger?: Array<{ seasonIndex: number; sourceSeat: number; targetSeat: number }>;
  pause?: ForestPause;
  result?: ConnectedForestResult;
};

export type ConnectedForestAction =
  | {
      type: "LOCK_TERRAIN_PICK";
      cardId: string;
      hexId: string;
      refreshAnimalCardId?: ForestAnimalCard["id"];
      useGoldenAcorn: boolean;
      acornTerrain?: ForestTerrainKind;
      welcome?: ForestWelcomeChoice;
    }
  | {
      type: "CHOOSE_SEASON_VISIT";
      animalCardId: ForestAnimalCard["id"];
      targetSeat: number;
    }
  | {
      type: "RESOLVE_VISIT";
      visitId: string;
      choice: "STAY" | "WALK";
      targetHexId?: string;
    }
  | { type: "CLAIM_FORFEIT" };

export type ConnectedForestTransitionContext = {
  now: number;
  connectedSeats: number[];
};

export type ConnectedForestRosterPlayer = Pick<ForestPlayer, "seat" | "userId" | "nickname">;

export type ConnectedForestErrorCode =
  | "MIN_PLAYERS"
  | "INVALID_GAME_SETUP"
  | "PLAYER_NOT_ACTIVE"
  | "INVALID_PHASE"
  | "ALREADY_ACTED"
  | "CARD_NOT_IN_HAND"
  | "INVALID_PLACEMENT"
  | "INVALID_REFRESH"
  | "INVALID_ACORN"
  | "INVALID_HABITAT"
  | "INVALID_VISIT_TARGET"
  | "INVALID_VISIT_CHOICE"
  | "GAME_PAUSED"
  | "FORFEIT_NOT_AVAILABLE"
  | "CONTENT_INVARIANT_BROKEN";
