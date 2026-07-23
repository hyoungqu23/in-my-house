export type TokenKind = "EMPTY" | "GHOST";

export type Token = {
  id: string;
  kind: TokenKind;
};

export type GamePhase =
  | "INITIAL_PLACEMENT"
  | "TURN"
  | "BIDDING"
  | "REVEAL_CHOICE"
  | "REVEALING"
  | "ROUND_END"
  | "GAME_OVER";

export type GameAction =
  | { type: "PLACE_INITIAL_TOKEN"; tokenId: string }
  | { type: "PLACE_TOKEN"; tokenId: string }
  | { type: "OPEN_BID"; bid: number }
  | { type: "RAISE_BID"; bid: number }
  | { type: "PASS" }
  | { type: "USE_FLASHLIGHT_AND_RAISE"; targetSeat: number; bid: number }
  | { type: "CHOOSE_REVEAL_TARGET"; targetSeat: number };

export type PlayerState = {
  seat: number;
  userId: string;
  nickname: string;
  active: boolean;
  connected: boolean;
  hand: Token[];
  stack: Token[];
  keyCount: number;
  flashlightUsed: boolean;
  passed: boolean;
  removedTokenKind?: TokenKind;
};

export type PublicReveal = {
  sequenceId: string;
  seat: number;
  tokenId: string;
  kind: TokenKind;
  revealAt: number;
  settleAt: number;
};

export type RoundResult = {
  outcome: "SUCCESS" | "GHOST";
  actorSeat: number;
  ghostOwnerSeat?: number;
};

export type DarkHouseState = {
  phase: GamePhase;
  round: number;
  starterSeat: number;
  activeSeat?: number;
  players: PlayerState[];
  highBid?: { amount: number; bidderSeat: number };
  challengerSeat?: number;
  revealCount: number;
  revealedTokenIds: string[];
  currentReveal?: PublicReveal;
  roundResult?: RoundResult;
  continueAt?: number;
  notBefore?: number;
  winnerSeat?: number;
  lastPeekBySeat: Record<number, { kind: TokenKind; expiresAt: number }>;
};

export type TransitionContext = {
  now: number;
  randomRemovalTokenId?: string;
  sequenceId?: string;
};

export type RosterPlayer = Pick<PlayerState, "seat" | "userId" | "nickname">;
