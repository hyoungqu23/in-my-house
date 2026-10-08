import type {
  GameAction as DarkHouseAction,
  GamePhase as DarkHousePhase,
  RoundResult as DarkHouseRoundResult,
  Token,
  TokenKind,
} from "@/modules/dark-house/domain/types";
import type { GameId } from "@/modules/game-catalog/games";
import type {
  ConnectedForestAction,
  ConnectedForestPhase,
  ConnectedForestResult,
  ConnectedForestRulesVersion,
  ForestAnimalCard,
  ForestBoardCell,
  ForestFigure,
  ForestLockedPick,
  ForestNeighborPath,
  ForestPendingVisit,
  ForestPlayerScore,
  ForestTerrainCard,
  ForestVisitResult,
} from "@/modules/connected-forest/domain/types";
import type {
  CircuitModule,
  PuzzleDifficulty,
  SwitchboardAction,
  SwitchboardAttempt,
  SwitchboardPhase,
  SwitchboardResult,
} from "@/modules/dawn-switchboard/domain/types";
import type {
  SuspiciousInviteAction,
  SuspiciousInvitePhase,
  SuspiciousRoundResult,
} from "@/modules/suspicious-invite/domain/types";
import type {
  FootprintsAction,
  FootprintsActiveBlock,
  FootprintsLayout,
  FootprintsPhase,
  FootprintsPrivatePlayerState,
  FootprintsRoundResult,
  FootprintsSessionRecord,
  FootprintsTargetId,
  FootprintsTrace,
} from "@/modules/midnight-footprints/domain/types";

export type AdministrativeAction = { type: "START_GAME" } | { type: "START_REMATCH" };
export type RoomAction =
  | DarkHouseAction
  | SuspiciousInviteAction
  | SwitchboardAction
  | FootprintsAction
  | ConnectedForestAction
  | AdministrativeAction;

export type ActionRequest = {
  clientActionId: string;
  expectedVersion: number;
  action: RoomAction;
};

export type Viewer = {
  roles: Array<"DISPLAY" | "HOST" | "PLAYER">;
  playerSeat?: number;
  legalAdministrativeActions: Array<
    "START_GAME" | "ROTATE_INVITE" | "ROTATE_DISPLAY" | "START_REMATCH"
  >;
};

type RoomViewBase<TGameId extends GameId, TPhase extends string> = {
  room: {
    code: string;
    gameId: TGameId;
    status: "lobby" | "playing" | "finished";
    version: number;
  };
  serverNow: string;
  phase: TPhase;
  viewer: Viewer;
};

export type LobbyRoomView = RoomViewBase<GameId, "LOBBY"> & {
  projection: "public";
  players: Array<{
    seat: number;
    nickname: string;
    connected: boolean;
    isHost: boolean;
  }>;
};

export type DarkHousePublicRoomView = RoomViewBase<"dark-house", DarkHousePhase> & {
  projection: "public";
  players: Array<{
    seat: number;
    nickname: string;
    connected: boolean;
    active: boolean;
    isHost: boolean;
    tokenCount: number;
    keyCount: number;
    flashlightUsed: boolean;
    passed: boolean;
  }>;
  stacks: Array<{
    seat: number;
    count: number;
    revealed: Array<{ kind: TokenKind }>;
  }>;
  turnSeat?: number;
  bid?: { amount: number; bidderSeat: number };
  reveal?: {
    sequenceId: string;
    targetSeat: number;
    revealAt: string;
    settleAt: string;
    kind?: TokenKind;
  };
  roundResult?: DarkHouseRoundResult;
  winnerSeat?: number;
};

export type DarkHousePlayerRoomView = Omit<DarkHousePublicRoomView, "projection"> & {
  projection: "player";
  privacyLocked: boolean;
  self?: {
    seat: number;
    hand: Token[];
    ownStack: Array<Token & { revealed: boolean }>;
    flashlightAvailable: boolean;
    lastPeek?: { kind: TokenKind; expiresAt: string };
    removedTokenKind?: TokenKind;
    legalActions: DarkHouseAction["type"][];
  };
};

export type SuspiciousInvitePublicRoomView = RoomViewBase<"suspicious-invite", SuspiciousInvitePhase> & {
  projection: "public";
  round: number;
  category: string;
  cluePrompts: string[];
  phaseEndsAt?: string;
  players: Array<{
    seat: number;
    nickname: string;
    connected: boolean;
    isHost: boolean;
    score: number;
  }>;
  clues?: Array<{ seat: number; entries: string[] }>;
  accusedSeat?: number;
  submittedCount: {
    clues: number;
    suspicionVotes: number;
    endVotes: number;
  };
  lastRound?: SuspiciousRoundResult;
  winnerSeats?: number[];
};

export type SuspiciousInvitePlayerRoomView = Omit<SuspiciousInvitePublicRoomView, "projection"> & {
  projection: "player";
  self: {
    seat: number;
    role: "GUEST" | "STRANGER";
    secretWord?: string;
    guessOptions?: Array<{ id: string; word: string }>;
    submittedClues?: string[];
    legalActions: SuspiciousInviteAction["type"][];
  };
};

export type DawnSwitchboardPublicRoomView = RoomViewBase<"dawn-switchboard", SwitchboardPhase> & {
  projection: "public";
  phaseEndsAt?: string;
  deadlineAt?: string;
  stage: number;
  stageCount: number;
  panel: {
    title: string;
    difficulty: PuzzleDifficulty;
    slotCount: number;
  };
  fusesRemaining: number;
  activeSeat?: number;
  players: Array<{
    seat: number;
    nickname: string;
    connected: boolean;
    isHost: boolean;
    ready: boolean;
    active: boolean;
    clueCount: number;
    cluesExposed: boolean;
  }>;
  modules: CircuitModule[];
  lockedSequence: CircuitModule[];
  rejectedModuleIds: string[];
  exposedClues: Array<{ seat: number; entries: string[] }>;
  lastAttempt?: SwitchboardAttempt;
  result?: SwitchboardResult;
};

export type DawnSwitchboardPlayerRoomView = Omit<DawnSwitchboardPublicRoomView, "projection"> & {
  projection: "player";
  self: {
    seat: number;
    ready: boolean;
    clues: string[];
    legalActions: SwitchboardAction["type"][];
  };
};

export type MidnightFootprintsPublicRoomView =
  RoomViewBase<"midnight-footprints", FootprintsPhase> & {
    projection: "public";
    matchNumber: number;
    round: 1 | 2;
    activeSeat?: number;
    actionStartedAt: string;
    players: Array<{
      seat: number;
      nickname: string;
      connected: boolean;
      isHost: boolean;
      role: "INTRUDER" | "GUARD";
      ready: boolean;
      record: Omit<FootprintsSessionRecord, "seat">;
    }>;
    layout: FootprintsLayout;
    guardRoomId: string;
    blocksRemaining: number;
    activeBlock?: FootprintsActiveBlock;
    traceHistory: FootprintsTrace[];
    failedSearches: Array<{ turn: number; roomId: string }>;
    roundResults: Array<Omit<FootprintsRoundResult, "path">>;
    revealedPaths?: Array<{ round: 1 | 2; intruderSeat: number; path: string[] }>;
    pause?: {
      disconnectedSeats: number[];
      pausedAt: string;
      forfeitClaimAt: string;
    };
    rematchVoteCount: number;
    matchWinnerSeat?: number;
    forfeitWinnerSeat?: number;
  };

export type MidnightFootprintsPlayerRoomView =
  Omit<MidnightFootprintsPublicRoomView, "projection"> & {
    projection: "player";
    self: {
      seat: number;
      role: "INTRUDER" | "GUARD";
      ready: boolean;
      legalActions: FootprintsAction["type"][];
      ownRematchVote?: "REMATCH" | "END";
      entryRoomIds?: string[];
      currentRoomId?: string;
      initialEntryRoomId?: string;
      legalMoveRoomIds?: string[];
      hideRemaining?: number;
      stolenTargetId?: FootprintsTargetId;
      path?: string[];
      privateStateRevision?: number;
      roomMarks?: FootprintsPrivatePlayerState["roomMarks"];
      legalGuardPaths?: string[][];
      blockablePassages?: Array<readonly [string, string]>;
    };
  };

export type ConnectedForestPublicRoomView = RoomViewBase<"connected-forest", ConnectedForestPhase> & {
  projection: "public";
  matchId?: string;
  rulesVersion: ConnectedForestRulesVersion;
  seasonIndex: number;
  pickIndex: number;
  passDirection: "LEFT" | "RIGHT";
  phaseKey: string;
  phaseEndsAt?: string;
  players: Array<{
    seat: number;
    nickname: string;
    connected: boolean;
    isHost: boolean;
    board: ForestBoardCell[];
    figures: ForestFigure[];
    score: ForestPlayerScore;
    locked: boolean;
    visitSelected: boolean;
  }>;
  neighborPaths: ForestNeighborPath[];
  seasonVisitResults: ForestVisitResult[];
  pause?: { disconnectedSeats: number[]; pausedAt: string; forfeitClaimAt: string };
  result?: ConnectedForestResult;
};

export type ConnectedForestPlayerRoomView = Omit<ConnectedForestPublicRoomView, "projection"> & {
  projection: "player";
  self: {
    seat: number;
    hand: ForestTerrainCard[];
    activeAnimals: ForestAnimalCard[];
    goldenAcornAvailable: boolean;
    animalRefreshAvailable: boolean;
    welcomedThisSeason: boolean;
    legalActions: ConnectedForestAction["type"][];
    legalPlacementHexIds: string[];
    lockedPick?: Omit<ForestLockedPick, "seat" | "submittedAt">;
    neighborSeats: number[];
    visitTargetSeats: number[];
    visitAnimalCardIds: ForestAnimalCard["id"][];
    visitSelection?: ForestPendingVisit | "NONE";
    currentVisit?: ForestPendingVisit;
    visitQueueIndex: number;
    visitQueueTotal: number;
    respondEndsAt?: string;
    stayHexIds: string[];
    canWalk: boolean;
    stayHearts?: number;
  };
};

export type PublicRoomView =
  | LobbyRoomView
  | DarkHousePublicRoomView
  | SuspiciousInvitePublicRoomView
  | DawnSwitchboardPublicRoomView
  | MidnightFootprintsPublicRoomView
  | ConnectedForestPublicRoomView;
export type PlayerRoomView =
  | DarkHousePlayerRoomView
  | SuspiciousInvitePlayerRoomView
  | DawnSwitchboardPlayerRoomView
  | MidnightFootprintsPlayerRoomView
  | ConnectedForestPlayerRoomView;
export type RoomView = PublicRoomView | PlayerRoomView;
