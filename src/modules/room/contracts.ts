import type {
  GameAction as DarkHouseAction,
  GamePhase as DarkHousePhase,
  RoundResult as DarkHouseRoundResult,
  Token,
  TokenKind,
} from "@/modules/dark-house/domain/types";
import type { GameId } from "@/modules/game-catalog/games";
import type {
  SuspiciousInviteAction,
  SuspiciousInvitePhase,
  SuspiciousRoundResult,
} from "@/modules/suspicious-invite/domain/types";

export type AdministrativeAction = { type: "START_GAME" } | { type: "START_REMATCH" };
export type RoomAction = DarkHouseAction | SuspiciousInviteAction | AdministrativeAction;

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

export type PublicRoomView = LobbyRoomView | DarkHousePublicRoomView | SuspiciousInvitePublicRoomView;
export type PlayerRoomView = DarkHousePlayerRoomView | SuspiciousInvitePlayerRoomView;
export type RoomView = PublicRoomView | PlayerRoomView;
