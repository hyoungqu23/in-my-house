import { DomainError as GameRuleError } from "@/shared/errors/domain-error";
import type {
  SwitchboardAction,
  SwitchboardMatchSetup,
  SwitchboardResult,
  SwitchboardRosterPlayer,
  SwitchboardState,
  SwitchboardTransitionContext,
} from "./types";

export const SWITCHBOARD_DURATION_MS = 12 * 60 * 1_000;
export const PANEL_RESULT_DURATION_MS = 3_000;

const clone = (state: SwitchboardState): SwitchboardState => structuredClone(state);
const currentPanel = (state: SwitchboardState) => state.panels[state.panelIndex];

const requirePlayer = (state: SwitchboardState, seat: number) => {
  if (!state.players.some((player) => player.seat === seat)) {
    throw new GameRuleError("PLAYER_NOT_ACTIVE", "플레이어를 찾을 수 없습니다.");
  }
};

const calculateStars = (remainingMs: number, fusesRemaining: number): 1 | 2 | 3 => {
  if (fusesRemaining === 3 && remainingMs >= 4 * 60 * 1_000) return 3;
  if (fusesRemaining >= 2 && remainingMs >= 2 * 60 * 1_000) return 2;
  return 1;
};

function finish(
  state: SwitchboardState,
  outcome: SwitchboardResult["outcome"],
  now: number,
) {
  const remainingMs = Math.max(0, (state.deadlineAt ?? now) - now);
  const completedPanels = outcome === "RESTORED"
    ? state.panels.length
    : state.panelIndex + (state.phase === "PANEL_RESULT" ? 1 : 0);
  state.phase = "GAME_OVER";
  state.phaseEndsAt = undefined;
  state.result = {
    outcome,
    completedPanels,
    stars: outcome === "RESTORED" ? calculateStars(remainingMs, state.fusesRemaining) : undefined,
    remainingMs,
    fusesRemaining: state.fusesRemaining,
  };
}

const rotateTurn = (state: SwitchboardState, connectedSeats: number[]) => {
  if (connectedSeats.length === 0) return;
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const index = (state.activeTurnIndex + offset) % state.turnOrder.length;
    if (connectedSeats.includes(state.turnOrder[index])) {
      state.activeTurnIndex = index;
      return;
    }
  }
};

const synchronizePresence = (state: SwitchboardState, connectedSeats: number[]) => {
  if (state.phase === "GAME_OVER") return;
  for (const player of state.players) {
    if (!connectedSeats.includes(player.seat) && !state.exposedClueSeats.includes(player.seat)) {
      state.exposedClueSeats.push(player.seat);
    }
  }
  if (state.phase === "SOLVING" && !connectedSeats.includes(state.turnOrder[state.activeTurnIndex])) {
    rotateTurn(state, connectedSeats);
  }
};

const startWhenReady = (state: SwitchboardState, context: SwitchboardTransitionContext) => {
  if (state.phase !== "BRIEFING" || context.connectedSeats.length < 3) return;
  if (!context.connectedSeats.every((seat) => state.readySeats.includes(seat))) return;
  state.phase = "SOLVING";
  state.deadlineAt = context.now + SWITCHBOARD_DURATION_MS;
  const firstConnected = state.turnOrder.findIndex((seat) => context.connectedSeats.includes(seat));
  state.activeTurnIndex = Math.max(0, firstConnected);
};

export function createInitialState(
  roster: SwitchboardRosterPlayer[],
  setup: SwitchboardMatchSetup,
): SwitchboardState {
  if (roster.length < 3 || roster.length > 6) {
    throw new GameRuleError("MIN_PLAYERS", "게임은 3–6명이 필요합니다.");
  }
  if (setup.panels.length !== 3) {
    throw new GameRuleError("INVALID_PUZZLE_SETUP", "난도별 배전반이 하나씩 필요합니다.");
  }
  const seats = new Set(roster.map((player) => player.seat));
  if (setup.turnOrder.length !== roster.length || setup.turnOrder.some((seat) => !seats.has(seat))) {
    throw new GameRuleError("INVALID_PUZZLE_SETUP", "턴 순서가 유효하지 않습니다.");
  }
  return {
    phase: "BRIEFING",
    players: [...roster].sort((a, b) => a.seat - b.seat),
    panels: structuredClone(setup.panels),
    panelIndex: 0,
    turnOrder: [...setup.turnOrder],
    activeTurnIndex: 0,
    readySeats: [],
    exposedClueSeats: [],
    fusesRemaining: 3,
    lockedModuleIds: [],
    rejectedModuleIds: [],
  };
}

export function advanceTimedState(
  input: SwitchboardState,
  context: SwitchboardTransitionContext,
): SwitchboardState {
  const state = clone(input);
  synchronizePresence(state, context.connectedSeats);
  startWhenReady(state, context);

  if (
    state.phase !== "BRIEFING"
    && state.phase !== "GAME_OVER"
    && state.deadlineAt
    && context.now >= state.deadlineAt
  ) {
    finish(state, "TIME_EXPIRED", context.now);
    return state;
  }

  if (
    state.phase === "PANEL_RESULT"
    && state.phaseEndsAt
    && context.now >= state.phaseEndsAt
  ) {
    state.panelIndex += 1;
    state.phase = "SOLVING";
    state.phaseEndsAt = undefined;
    state.lockedModuleIds = [];
    state.rejectedModuleIds = [];
    state.exposedClueSeats = [];
    state.lastAttempt = undefined;
    synchronizePresence(state, context.connectedSeats);
  }
  return state;
}

export function transition(
  input: SwitchboardState,
  actorSeat: number,
  action: SwitchboardAction,
  context: SwitchboardTransitionContext,
): SwitchboardState {
  const state = advanceTimedState(input, context);
  requirePlayer(state, actorSeat);

  if (action.type === "MARK_READY") {
    if (state.phase !== "BRIEFING") {
      throw new GameRuleError("INVALID_PHASE", "단서를 확인하는 단계가 아닙니다.");
    }
    if (!context.connectedSeats.includes(actorSeat)) {
      throw new GameRuleError("PLAYER_NOT_ACTIVE", "연결된 플레이어만 준비할 수 있습니다.");
    }
    if (state.readySeats.includes(actorSeat)) {
      throw new GameRuleError("ALREADY_ACTED", "이미 준비했습니다.");
    }
    state.readySeats.push(actorSeat);
    startWhenReady(state, context);
    return state;
  }

  if (state.phase !== "SOLVING") {
    throw new GameRuleError("INVALID_PHASE", "지금은 스위치를 확정할 때가 아닙니다.");
  }
  const activeSeat = state.turnOrder[state.activeTurnIndex];
  if (actorSeat !== activeSeat) {
    throw new GameRuleError("NOT_YOUR_TURN", "현재 활성 플레이어만 스위치를 확정할 수 있습니다.");
  }
  const panel = currentPanel(state);
  if (!panel.modules.some((module) => module.id === action.moduleId)) {
    throw new GameRuleError("INVALID_TARGET", "현재 배전반에 없는 모듈입니다.");
  }
  if (state.lockedModuleIds.includes(action.moduleId)) {
    throw new GameRuleError("INVALID_TARGET", "이미 잠긴 모듈입니다.");
  }
  if (state.rejectedModuleIds.includes(action.moduleId)) {
    throw new GameRuleError("ALREADY_ATTEMPTED", "이 칸에서 이미 실패한 모듈입니다.");
  }

  const expectedModuleId = panel.solutionModuleIds[state.lockedModuleIds.length];
  const correct = action.moduleId === expectedModuleId;
  state.lastAttempt = { moduleId: action.moduleId, correct, seat: actorSeat, attemptedAt: context.now };
  rotateTurn(state, context.connectedSeats);

  if (!correct) {
    state.fusesRemaining -= 1;
    state.rejectedModuleIds.push(action.moduleId);
    if (state.fusesRemaining === 0) finish(state, "FUSES_BLOWN", context.now);
    return state;
  }

  state.lockedModuleIds.push(action.moduleId);
  state.rejectedModuleIds = [];
  if (state.lockedModuleIds.length === panel.solutionModuleIds.length) {
    if (state.panelIndex === state.panels.length - 1) {
      finish(state, "RESTORED", context.now);
    } else {
      state.phase = "PANEL_RESULT";
      state.phaseEndsAt = context.now + PANEL_RESULT_DURATION_MS;
    }
  }
  return state;
}

export function legalActions(
  state: SwitchboardState,
  seat: number,
  connectedSeats: number[],
): SwitchboardAction["type"][] {
  if (!connectedSeats.includes(seat)) return [];
  if (state.phase === "BRIEFING" && !state.readySeats.includes(seat)) return ["MARK_READY"];
  if (state.phase === "SOLVING" && state.turnOrder[state.activeTurnIndex] === seat) {
    return ["CONFIRM_MODULE"];
  }
  return [];
}
