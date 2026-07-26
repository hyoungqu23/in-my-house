export type SwitchboardPhase = "BRIEFING" | "SOLVING" | "PANEL_RESULT" | "GAME_OVER";

export type SwitchboardAction =
  | { type: "MARK_READY" }
  | { type: "CONFIRM_MODULE"; moduleId: string };

export type CircuitColor = "red" | "blue" | "yellow" | "green" | "purple" | "orange";
export type CircuitSymbol = "triangle" | "circle" | "star" | "square" | "moon" | "bolt";
export type PuzzleDifficulty = "EASY" | "MEDIUM" | "HARD";

export type CircuitModule = {
  id: string;
  label: string;
  color: CircuitColor;
  colorLabel: string;
  symbol: CircuitSymbol;
  symbolLabel: string;
};

export type CircuitConstraint =
  | { kind: "BEFORE"; firstModuleId: string; secondModuleId: string }
  | { kind: "ADJACENT"; firstModuleId: string; secondModuleId: string }
  | { kind: "POSITION"; moduleId: string; position: number }
  | { kind: "BETWEEN"; firstModuleId: string; secondModuleId: string; count: number }
  | { kind: "EDGE"; moduleId: string };

export type CircuitClue = {
  id: string;
  text: string;
  constraint: CircuitConstraint;
};

export type PuzzleDefinition = {
  id: string;
  title: string;
  difficulty: PuzzleDifficulty;
  modules: CircuitModule[];
  solutionModuleIds: string[];
  clues: CircuitClue[];
};

export type SwitchboardPanelSetup = PuzzleDefinition & {
  cluesBySeat: Record<number, CircuitClue[]>;
};

export type SwitchboardMatchSetup = {
  panels: SwitchboardPanelSetup[];
  turnOrder: number[];
};

export type SwitchboardPlayer = {
  seat: number;
  userId: string;
  nickname: string;
};

export type SwitchboardResult = {
  outcome: "RESTORED" | "FUSES_BLOWN" | "TIME_EXPIRED";
  completedPanels: number;
  stars?: 1 | 2 | 3;
  remainingMs: number;
  fusesRemaining: number;
};

export type SwitchboardAttempt = {
  moduleId: string;
  correct: boolean;
  seat: number;
  attemptedAt: number;
};

export type SwitchboardState = {
  phase: SwitchboardPhase;
  phaseEndsAt?: number;
  deadlineAt?: number;
  players: SwitchboardPlayer[];
  panels: SwitchboardPanelSetup[];
  panelIndex: number;
  turnOrder: number[];
  activeTurnIndex: number;
  readySeats: number[];
  exposedClueSeats: number[];
  fusesRemaining: number;
  lockedModuleIds: string[];
  rejectedModuleIds: string[];
  lastAttempt?: SwitchboardAttempt;
  result?: SwitchboardResult;
};

export type SwitchboardTransitionContext = {
  now: number;
  connectedSeats: number[];
};

export type SwitchboardRosterPlayer = Pick<SwitchboardPlayer, "seat" | "userId" | "nickname">;
