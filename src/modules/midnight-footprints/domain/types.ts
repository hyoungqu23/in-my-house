export type FootprintsZone = "WEST" | "CENTER" | "EAST";
export type FootprintsFloor = "WOOD" | "CARPET" | "TILE";
export type FootprintsLayoutId = "open-gallery" | "crossed-hall" | "ring-manor";
export type FootprintsTargetId = "silver-coins" | "starlight-necklace" | "golden-cat";

export type FootprintsRoom = {
  id: string;
  name: string;
  zone: FootprintsZone;
  floor: FootprintsFloor;
};

export type FootprintsTarget = {
  id: FootprintsTargetId;
  name: string;
  value: 2 | 4 | 6;
  minimumTurns: 5 | 6 | 7;
  roomId: string;
};

export type FootprintsLayout = {
  id: FootprintsLayoutId;
  name: string;
  rooms: FootprintsRoom[];
  passages: Array<readonly [string, string]>;
  entranceRoomIds: [string, string, string];
  guardStartRoomId: string;
  targets: FootprintsTarget[];
};

export type FootprintsMatchSetup = {
  layout: FootprintsLayout;
  intruderSeat: number;
  guardSeat: number;
};

export type FootprintsPlayer = {
  seat: number;
  userId: string;
  nickname: string;
};

export type FootprintsPhase =
  | "ROUND_SETUP"
  | "INTRUDER_TURN"
  | "GUARD_TURN"
  | "ROUND_RESULT"
  | "MATCH_RESULT"
  | "GAME_OVER";

export type FootprintsTrace =
  | { turn: number; kind: "ZONE"; zone: FootprintsZone }
  | { turn: number; kind: "FLOOR"; floor: FootprintsFloor }
  | {
      turn: number;
      kind: "ALARM";
      targetId: FootprintsTargetId;
      roomId: string;
    };

export type FootprintsRoundOutcome =
  | "ESCAPED"
  | "CAUGHT"
  | "ENCLOSED"
  | "TIMEOUT"
  | "FORFEIT";

export type FootprintsRoundResult = {
  round: 1 | 2;
  intruderSeat: number;
  guardSeat: number;
  outcome: FootprintsRoundOutcome;
  completedActions: number;
  targetId?: FootprintsTargetId;
  targetValue?: 2 | 4 | 6;
  path: string[];
};

export type FootprintsMatchResult = {
  winnerSeat?: number;
  roundResults: [FootprintsRoundResult, FootprintsRoundResult];
};

export type FootprintsSessionRecord = {
  seat: number;
  wins: number;
  draws: number;
  losses: number;
};

export type FootprintsActiveBlock = {
  passage: readonly [string, string];
  expiresAfterIntruderAction: number;
};

export type FootprintsPause = {
  disconnectedSeats: number[];
  pausedAt: number;
  forfeitClaimAt: number;
};

export type FootprintsRoomMark = "LIKELY" | "EXCLUDED" | "UNKNOWN";

export type FootprintsPrivatePlayerState = {
  revision: number;
  roomMarks: Record<string, FootprintsRoomMark>;
};

export type FootprintsState = {
  phase: FootprintsPhase;
  players: FootprintsPlayer[];
  layout: FootprintsLayout;
  matchNumber: number;
  round: 1 | 2;
  startingIntruderSeat: number;
  intruderSeat: number;
  guardSeat: number;
  readySeats: number[];
  selectedEntryRoomId?: string;
  initialEntryRoomId?: string;
  intruderRoomId?: string;
  guardRoomId: string;
  turnNumber: number;
  hideRemaining: number;
  blocksRemaining: number;
  activeBlock?: FootprintsActiveBlock;
  stolenTargetId?: FootprintsTargetId;
  traceHistory: FootprintsTrace[];
  failedSearches: Array<{ turn: number; roomId: string }>;
  intruderPath: string[];
  roundResults: FootprintsRoundResult[];
  acknowledgedResultSeats: number[];
  rematchVotes: Array<{ seat: number; vote: "REMATCH" | "END" }>;
  matchResult?: FootprintsMatchResult;
  forfeitWinnerSeat?: number;
  sessionRecords: FootprintsSessionRecord[];
  actionStartedAt: number;
  pause?: FootprintsPause;
};

export type FootprintsAction =
  | { type: "SELECT_ENTRY"; roomId: string }
  | { type: "MARK_READY" }
  | { type: "MOVE_INTRUDER"; roomId: string }
  | { type: "HIDE" }
  | { type: "STEAL"; targetId: FootprintsTargetId }
  | { type: "MOVE_AND_SEARCH"; path: string[] }
  | { type: "BLOCK_PASSAGE"; passage: readonly [string, string] }
  | { type: "ACK_ROUND_RESULT" }
  | { type: "CAST_REMATCH_VOTE"; vote: "REMATCH" | "END" }
  | { type: "CLAIM_FORFEIT" };

export type FootprintsTransitionContext = {
  now: number;
  connectedSeats: number[];
  nextMatchSetup?: FootprintsMatchSetup;
};
