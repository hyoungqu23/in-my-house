import type {
  GameAction,
  GamePhase,
  RoundResult,
  Token,
  TokenKind,
} from "@/modules/dark-house/domain/types";
import type { GameId } from "@/modules/game-catalog/games";

export type AdministrativeAction = { type: "START_GAME" } | { type: "START_REMATCH" };
export type RoomAction = GameAction | AdministrativeAction;

export type ActionRequest = {
  clientActionId: string;
  expectedVersion: number;
  action: RoomAction;
};

export type PublicRoomView = {
  room: {
    code: string;
    gameId: GameId;
    status: "lobby" | "playing" | "finished";
    version: number;
  };
  serverNow: string;
  phase: "LOBBY" | GamePhase;
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
  roundResult?: RoundResult;
  winnerSeat?: number;
  viewer: {
    roles: Array<"DISPLAY" | "HOST" | "PLAYER">;
    playerSeat?: number;
    legalAdministrativeActions: Array<
      "START_GAME" | "ROTATE_INVITE" | "ROTATE_DISPLAY" | "START_REMATCH"
    >;
  };
};

export type PlayerRoomView = PublicRoomView & {
  privacyLocked: boolean;
  self?: {
    seat: number;
    hand: Token[];
    ownStack: Array<Token & { revealed: boolean }>;
    flashlightAvailable: boolean;
    lastPeek?: { kind: TokenKind; expiresAt: string };
    removedTokenKind?: TokenKind;
    legalActions: GameAction["type"][];
  };
};

export type RoomView = PublicRoomView | PlayerRoomView;
