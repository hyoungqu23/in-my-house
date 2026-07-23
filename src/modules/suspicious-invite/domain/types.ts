export type SuspiciousInvitePhase =
  | "ROUND_INTRO"
  | "CLUE_SUBMISSION"
  | "CLUE_REVEAL"
  | "DISCUSSION"
  | "VOTING"
  | "STRANGER_GUESS"
  | "ROUND_RESULT"
  | "END_VOTE"
  | "GAME_OVER";

export type SuspiciousInviteAction =
  | { type: "SUBMIT_CLUE"; clues: string[] }
  | { type: "CAST_SUSPICION_VOTE"; targetSeat: number }
  | { type: "GUESS_WORD"; wordId: string }
  | { type: "CAST_END_VOTE"; vote: "CONTINUE" | "END" };

export type SuspiciousInvitePlayer = {
  seat: number;
  userId: string;
  nickname: string;
  score: number;
};

export type RoundSetup = {
  wordId: string;
  word: string;
  category: string;
  strangerSeat: number;
  guessOptions: Array<{ id: string; word: string }>;
  cluePrompts: string[];
};

export type SuspiciousRoundResult = {
  round: number;
  outcome: "STRANGER_ESCAPED" | "STRANGER_GUESSED" | "GUESTS_CAUGHT";
  strangerSeat: number;
  accusedSeat?: number;
  wordId: string;
  word: string;
  suspicionCounts: Record<number, number>;
  scoreDelta: Record<number, number>;
};

export type SuspiciousInviteState = {
  phase: SuspiciousInvitePhase;
  phaseEndsAt?: number;
  round: number;
  players: SuspiciousInvitePlayer[];
  setup: RoundSetup;
  usedWordIds: string[];
  cluesBySeat: Record<number, string[]>;
  suspicionVotesBySeat: Record<number, number>;
  endVotesBySeat: Record<number, "CONTINUE" | "END">;
  lastRound?: SuspiciousRoundResult;
  winnerSeats?: number[];
};

export type SuspiciousTransitionContext = {
  now: number;
  nextRound: RoundSetup;
};

export type SuspiciousRosterPlayer = Pick<SuspiciousInvitePlayer, "seat" | "userId" | "nickname">;
