import { DomainError as GameRuleError } from "@/shared/errors/domain-error";
import type {
  FootprintsAction,
  FootprintsMatchSetup,
  FootprintsPlayer,
  FootprintsRoundOutcome,
  FootprintsState,
  FootprintsTrace,
  FootprintsTransitionContext,
} from "./types";

export const FORFEIT_CLAIM_DELAY_MS = 3 * 60 * 1_000;

const clone = (state: FootprintsState): FootprintsState => structuredClone(state);

const passageKey = (passage: readonly [string, string]) =>
  [...passage].sort().join(":");

const hasPassage = (
  state: FootprintsState,
  first: string,
  second: string,
) => state.layout.passages.some(
  (passage) => passageKey(passage) === passageKey([first, second]),
);

const isBlocked = (
  state: FootprintsState,
  first: string,
  second: string,
) => state.activeBlock
  ? passageKey(state.activeBlock.passage) === passageKey([first, second])
  : false;

const requirePlayer = (state: FootprintsState, seat: number) => {
  if (!state.players.some((player) => player.seat === seat)) {
    throw new GameRuleError("PLAYER_NOT_ACTIVE", "플레이어를 찾을 수 없습니다.");
  }
};

const requirePhase = (state: FootprintsState, phase: FootprintsState["phase"]) => {
  if (state.phase !== phase) {
    throw new GameRuleError("INVALID_PHASE", "지금 수행할 수 없는 행동입니다.");
  }
};

const traceAtCurrentRoom = (state: FootprintsState): FootprintsTrace => {
  const room = state.layout.rooms.find((candidate) => candidate.id === state.intruderRoomId)!;
  return state.turnNumber % 2 === 1
    ? { turn: state.turnNumber, kind: "ZONE", zone: room.zone }
    : { turn: state.turnNumber, kind: "FLOOR", floor: room.floor };
};

const finishRound = (
  state: FootprintsState,
  outcome: FootprintsRoundOutcome,
  now: number,
) => {
  const target = state.layout.targets.find(
    (candidate) => candidate.id === state.stolenTargetId,
  );
  state.roundResults.push({
    round: state.round,
    intruderSeat: state.intruderSeat,
    guardSeat: state.guardSeat,
    outcome,
    completedActions: state.turnNumber,
    targetId: target?.id,
    targetValue: target?.value,
    path: [...state.intruderPath],
  });
  state.phase = "ROUND_RESULT";
  state.acknowledgedResultSeats = [];
  state.actionStartedAt = now;
};

const compareRoundResults = (state: FootprintsState) => {
  const [first, second] = state.roundResults;
  const firstEscaped = first.outcome === "ESCAPED";
  const secondEscaped = second.outcome === "ESCAPED";
  if (firstEscaped !== secondEscaped) {
    return firstEscaped ? first.intruderSeat : second.intruderSeat;
  }
  if (firstEscaped && secondEscaped) {
    if (first.targetValue !== second.targetValue) {
      return (first.targetValue ?? 0) > (second.targetValue ?? 0)
        ? first.intruderSeat
        : second.intruderSeat;
    }
    if (first.completedActions !== second.completedActions) {
      return first.completedActions < second.completedActions
        ? first.intruderSeat
        : second.intruderSeat;
    }
    return undefined;
  }
  if (first.completedActions !== second.completedActions) {
    return first.completedActions > second.completedActions
      ? first.intruderSeat
      : second.intruderSeat;
  }
  return undefined;
};

const prepareSecondRound = (state: FootprintsState, now: number) => {
  state.phase = "ROUND_SETUP";
  state.round = 2;
  [state.intruderSeat, state.guardSeat] = [state.guardSeat, state.intruderSeat];
  state.readySeats = [];
  state.selectedEntryRoomId = undefined;
  state.initialEntryRoomId = undefined;
  state.intruderRoomId = undefined;
  state.guardRoomId = state.layout.guardStartRoomId;
  state.turnNumber = 0;
  state.hideRemaining = 2;
  state.blocksRemaining = 2;
  state.activeBlock = undefined;
  state.stolenTargetId = undefined;
  state.traceHistory = [];
  state.failedSearches = [];
  state.intruderPath = [];
  state.acknowledgedResultSeats = [];
  state.actionStartedAt = now;
};

const finishMatch = (state: FootprintsState, now: number) => {
  const winnerSeat = compareRoundResults(state);
  state.matchResult = {
    winnerSeat,
    roundResults: structuredClone(state.roundResults) as [
      FootprintsState["roundResults"][number],
      FootprintsState["roundResults"][number],
    ],
  };
  for (const record of state.sessionRecords) {
    if (winnerSeat === undefined) {
      record.draws += 1;
    } else if (record.seat === winnerSeat) {
      record.wins += 1;
    } else {
      record.losses += 1;
    }
  }
  state.phase = "MATCH_RESULT";
  state.acknowledgedResultSeats = [];
  state.actionStartedAt = now;
};

const startRematch = (
  state: FootprintsState,
  setup: FootprintsMatchSetup,
  now: number,
) => {
  const expectedIntruderSeat = state.players.find(
    (player) => player.seat !== state.startingIntruderSeat,
  )?.seat;
  if (
    setup.layout.id === state.layout.id
    || setup.intruderSeat !== expectedIntruderSeat
    || setup.guardSeat === setup.intruderSeat
  ) {
    throw new GameRuleError(
      "INVALID_GAME_SETUP",
      "재경기 지도 또는 시작 역할이 유효하지 않습니다.",
    );
  }
  state.phase = "ROUND_SETUP";
  state.layout = structuredClone(setup.layout);
  state.matchNumber += 1;
  state.round = 1;
  state.startingIntruderSeat = setup.intruderSeat;
  state.intruderSeat = setup.intruderSeat;
  state.guardSeat = setup.guardSeat;
  state.readySeats = [];
  state.selectedEntryRoomId = undefined;
  state.initialEntryRoomId = undefined;
  state.intruderRoomId = undefined;
  state.guardRoomId = setup.layout.guardStartRoomId;
  state.turnNumber = 0;
  state.hideRemaining = 2;
  state.blocksRemaining = 2;
  state.activeBlock = undefined;
  state.stolenTargetId = undefined;
  state.traceHistory = [];
  state.failedSearches = [];
  state.intruderPath = [];
  state.roundResults = [];
  state.acknowledgedResultSeats = [];
  state.rematchVotes = [];
  state.matchResult = undefined;
  state.forfeitWinnerSeat = undefined;
  state.actionStartedAt = now;
};

const beginRoundWhenReady = (
  state: FootprintsState,
  context: FootprintsTransitionContext,
) => {
  if (
    state.phase !== "ROUND_SETUP"
    || !state.selectedEntryRoomId
    || state.players.some((player) => !state.readySeats.includes(player.seat))
  ) {
    return;
  }
  state.initialEntryRoomId = state.selectedEntryRoomId;
  state.intruderRoomId = state.selectedEntryRoomId;
  state.intruderPath = [state.selectedEntryRoomId];
  state.turnNumber = 1;
  state.traceHistory = [traceAtCurrentRoom(state)];
  state.phase = "GUARD_TURN";
  state.actionStartedAt = context.now;
};

const completeIntruderAction = (
  state: FootprintsState,
  now: number,
  trace?: FootprintsTrace,
) => {
  if (
    state.stolenTargetId
    && state.intruderRoomId !== state.initialEntryRoomId
    && state.layout.entranceRoomIds.includes(state.intruderRoomId ?? "")
  ) {
    finishRound(state, "ESCAPED", now);
    return;
  }
  if (state.turnNumber >= 10) {
    finishRound(state, "TIMEOUT", now);
    return;
  }
  state.traceHistory.push(trace ?? traceAtCurrentRoom(state));
  state.phase = "GUARD_TURN";
  state.actionStartedAt = now;
};

const hasLegalIntruderAction = (state: FootprintsState) => {
  if (state.hideRemaining > 0) return true;
  if (
    !state.stolenTargetId
    && state.layout.targets.some((target) => target.roomId === state.intruderRoomId)
  ) {
    return true;
  }
  return state.layout.passages.some(([first, second]) => {
    if (first !== state.intruderRoomId && second !== state.intruderRoomId) return false;
    const destination = first === state.intruderRoomId ? second : first;
    return destination !== state.guardRoomId
      && !isBlocked(state, first, second);
  });
};

const beginIntruderTurn = (state: FootprintsState, now: number) => {
  if (!hasLegalIntruderAction(state)) {
    finishRound(state, "ENCLOSED", now);
    return false;
  }
  state.phase = "INTRUDER_TURN";
  state.actionStartedAt = now;
  return true;
};

export function createInitialState(
  roster: FootprintsPlayer[],
  setup: FootprintsMatchSetup,
  now: number,
): FootprintsState {
  if (roster.length !== 2) {
    throw new GameRuleError("MIN_PLAYERS", "한밤의 발자국은 정확히 2명이 필요합니다.");
  }
  const seats = new Set(roster.map((player) => player.seat));
  if (!seats.has(setup.intruderSeat) || !seats.has(setup.guardSeat)) {
    throw new GameRuleError("INVALID_GAME_SETUP", "역할 좌석이 유효하지 않습니다.");
  }
  return {
    phase: "ROUND_SETUP",
    players: [...roster].sort((a, b) => a.seat - b.seat),
    layout: structuredClone(setup.layout),
    matchNumber: 1,
    round: 1,
    startingIntruderSeat: setup.intruderSeat,
    intruderSeat: setup.intruderSeat,
    guardSeat: setup.guardSeat,
    readySeats: [],
    guardRoomId: setup.layout.guardStartRoomId,
    turnNumber: 0,
    hideRemaining: 2,
    blocksRemaining: 2,
    traceHistory: [],
    failedSearches: [],
    intruderPath: [],
    roundResults: [],
    acknowledgedResultSeats: [],
    rematchVotes: [],
    sessionRecords: roster.map((player) => ({
      seat: player.seat,
      wins: 0,
      draws: 0,
      losses: 0,
    })),
    actionStartedAt: now,
  };
}

export function advanceTimedState(
  input: FootprintsState,
  context: FootprintsTransitionContext,
): FootprintsState {
  const state = clone(input);
  if (state.phase === "GAME_OVER") return state;
  const disconnectedSeats = state.players
    .map((player) => player.seat)
    .filter((seat) => !context.connectedSeats.includes(seat));
  if (disconnectedSeats.length > 0) {
    if (state.pause) {
      state.pause.disconnectedSeats = disconnectedSeats;
    } else {
      state.pause = {
        disconnectedSeats,
        pausedAt: context.now,
        forfeitClaimAt: context.now + FORFEIT_CLAIM_DELAY_MS,
      };
    }
    return state;
  }
  if (state.pause) {
    state.actionStartedAt += context.now - state.pause.pausedAt;
    state.pause = undefined;
  }
  return state;
}

export function transition(
  input: FootprintsState,
  actorSeat: number,
  action: FootprintsAction,
  context: FootprintsTransitionContext,
): FootprintsState {
  const state = advanceTimedState(input, context);
  requirePlayer(state, actorSeat);

  if (action.type === "CLAIM_FORFEIT") {
    if (!state.pause || state.pause.disconnectedSeats.includes(actorSeat)) {
      throw new GameRuleError("INVALID_PHASE", "기권 종료를 청구할 수 없습니다.");
    }
    if (context.now < state.pause.forfeitClaimAt) {
      throw new GameRuleError("FORFEIT_NOT_AVAILABLE", "연결 해제 후 3분이 지나야 청구할 수 있습니다.");
    }
    state.phase = "GAME_OVER";
    state.forfeitWinnerSeat = actorSeat;
    state.pause = undefined;
    state.actionStartedAt = context.now;
    for (const record of state.sessionRecords) {
      if (record.seat === actorSeat) record.wins += 1;
      else record.losses += 1;
    }
    return state;
  }

  if (state.pause) {
    throw new GameRuleError("GAME_PAUSED", "연결이 끊겨 게임이 일시정지되었습니다.");
  }

  if (action.type === "SELECT_ENTRY") {
    requirePhase(state, "ROUND_SETUP");
    if (actorSeat !== state.intruderSeat) {
      throw new GameRuleError("NOT_YOUR_TURN", "침입자만 입구를 선택할 수 있습니다.");
    }
    if (!state.layout.entranceRoomIds.includes(action.roomId)) {
      throw new GameRuleError("INVALID_TARGET", "선택할 수 없는 입구입니다.");
    }
    state.selectedEntryRoomId = action.roomId;
    beginRoundWhenReady(state, context);
    return state;
  }

  if (action.type === "MARK_READY") {
    requirePhase(state, "ROUND_SETUP");
    if (state.readySeats.includes(actorSeat)) {
      throw new GameRuleError("ALREADY_ACTED", "이미 준비했습니다.");
    }
    state.readySeats.push(actorSeat);
    beginRoundWhenReady(state, context);
    return state;
  }

  if (action.type === "MOVE_INTRUDER") {
    requirePhase(state, "INTRUDER_TURN");
    if (actorSeat !== state.intruderSeat) {
      throw new GameRuleError("NOT_YOUR_TURN", "침입자 차례입니다.");
    }
    if (
      !state.intruderRoomId
      || !hasPassage(state, state.intruderRoomId, action.roomId)
      || isBlocked(state, state.intruderRoomId, action.roomId)
      || action.roomId === state.guardRoomId
    ) {
      throw new GameRuleError("INVALID_TARGET", "이동할 수 없는 방입니다.");
    }
    state.intruderRoomId = action.roomId;
    state.turnNumber += 1;
    state.intruderPath.push(action.roomId);
    completeIntruderAction(state, context.now);
    return state;
  }

  if (action.type === "STEAL") {
    requirePhase(state, "INTRUDER_TURN");
    if (actorSeat !== state.intruderSeat) {
      throw new GameRuleError("NOT_YOUR_TURN", "침입자 차례입니다.");
    }
    const target = state.layout.targets.find(
      (candidate) =>
        candidate.id === action.targetId
        && candidate.roomId === state.intruderRoomId,
    );
    if (!target || state.stolenTargetId) {
      throw new GameRuleError("INVALID_TARGET", "이 방에서 훔칠 수 없습니다.");
    }
    state.stolenTargetId = target.id;
    state.turnNumber += 1;
    state.intruderPath.push(state.intruderRoomId!);
    completeIntruderAction(state, context.now, {
      turn: state.turnNumber,
      kind: "ALARM",
      targetId: target.id,
      roomId: target.roomId,
    });
    return state;
  }

  if (action.type === "HIDE") {
    requirePhase(state, "INTRUDER_TURN");
    if (actorSeat !== state.intruderSeat) {
      throw new GameRuleError("NOT_YOUR_TURN", "침입자 차례입니다.");
    }
    if (state.hideRemaining <= 0) {
      throw new GameRuleError("ACTION_EXHAUSTED", "잠복을 모두 사용했습니다.");
    }
    state.hideRemaining -= 1;
    state.turnNumber += 1;
    state.intruderPath.push(state.intruderRoomId!);
    completeIntruderAction(state, context.now);
    return state;
  }

  if (action.type === "MOVE_AND_SEARCH") {
    requirePhase(state, "GUARD_TURN");
    if (actorSeat !== state.guardSeat) {
      throw new GameRuleError("NOT_YOUR_TURN", "경비 차례입니다.");
    }
    if (action.path.length > 2) {
      throw new GameRuleError("INVALID_TARGET", "경비는 최대 2칸 이동할 수 있습니다.");
    }
    let roomId = state.guardRoomId;
    for (const nextRoomId of action.path) {
      if (!hasPassage(state, roomId, nextRoomId)) {
        throw new GameRuleError("INVALID_TARGET", "이어지지 않은 이동 경로입니다.");
      }
      if (isBlocked(state, roomId, nextRoomId)) {
        throw new GameRuleError("PASSAGE_BLOCKED", "봉쇄된 통로는 지날 수 없습니다.");
      }
      roomId = nextRoomId;
    }
    state.guardRoomId = roomId;
    if (roomId === state.intruderRoomId) {
      finishRound(state, "CAUGHT", context.now);
      return state;
    }
    state.failedSearches.push({ turn: state.turnNumber, roomId });
    const canContinue = beginIntruderTurn(state, context.now);
    if (!canContinue) return state;
    if (
      state.activeBlock
      && state.turnNumber >= state.activeBlock.expiresAfterIntruderAction
    ) {
      state.activeBlock = undefined;
    }
    return state;
  }

  if (action.type === "BLOCK_PASSAGE") {
    requirePhase(state, "GUARD_TURN");
    if (actorSeat !== state.guardSeat) {
      throw new GameRuleError("NOT_YOUR_TURN", "경비 차례입니다.");
    }
    if (state.blocksRemaining <= 0) {
      throw new GameRuleError("ACTION_EXHAUSTED", "통로 봉쇄를 모두 사용했습니다.");
    }
    const [first, second] = action.passage;
    if (
      !hasPassage(state, first, second)
      || (first !== state.guardRoomId && second !== state.guardRoomId)
    ) {
      throw new GameRuleError("INVALID_TARGET", "경비와 인접한 내부 통로만 봉쇄할 수 있습니다.");
    }
    state.blocksRemaining -= 1;
    state.activeBlock = {
      passage: [...action.passage] as [string, string],
      expiresAfterIntruderAction: state.turnNumber + 1,
    };
    beginIntruderTurn(state, context.now);
    return state;
  }

  if (action.type === "ACK_ROUND_RESULT") {
    requirePhase(state, "ROUND_RESULT");
    if (state.acknowledgedResultSeats.includes(actorSeat)) {
      throw new GameRuleError("ALREADY_ACTED", "이미 결과를 확인했습니다.");
    }
    state.acknowledgedResultSeats.push(actorSeat);
    if (state.players.every((player) =>
      state.acknowledgedResultSeats.includes(player.seat)
    )) {
      if (state.round === 1) prepareSecondRound(state, context.now);
      else finishMatch(state, context.now);
    }
    return state;
  }

  if (action.type === "CAST_REMATCH_VOTE") {
    requirePhase(state, "MATCH_RESULT");
    if (state.rematchVotes.some((vote) => vote.seat === actorSeat)) {
      throw new GameRuleError("ALREADY_ACTED", "이미 재경기 선택을 제출했습니다.");
    }
    state.rematchVotes.push({ seat: actorSeat, vote: action.vote });
    if (action.vote === "END") {
      state.phase = "GAME_OVER";
      state.actionStartedAt = context.now;
      return state;
    }
    if (state.rematchVotes.length === state.players.length) {
      if (!context.nextMatchSetup) {
        throw new GameRuleError("INVALID_GAME_SETUP", "재경기 설정이 필요합니다.");
      }
      startRematch(state, context.nextMatchSetup, context.now);
    }
    return state;
  }

  throw new GameRuleError("INVALID_GAME_ACTION", "아직 사용할 수 없는 행동입니다.");
}

export function legalActions(
  state: FootprintsState,
  seat: number,
  connectedSeats: number[],
): FootprintsAction["type"][] {
  if (!connectedSeats.includes(seat)) return [];
  if (state.pause) {
    return state.pause.disconnectedSeats.includes(seat) ? [] : ["CLAIM_FORFEIT"];
  }
  if (state.phase === "ROUND_SETUP") {
    const actions: FootprintsAction["type"][] = [];
    if (seat === state.intruderSeat) actions.push("SELECT_ENTRY");
    if (!state.readySeats.includes(seat)) actions.push("MARK_READY");
    return actions;
  }
  if (state.phase === "INTRUDER_TURN" && seat === state.intruderSeat) {
    const actions: FootprintsAction["type"][] = [];
    if (state.layout.passages.some(([first, second]) => {
      if (first !== state.intruderRoomId && second !== state.intruderRoomId) return false;
      const destination = first === state.intruderRoomId ? second : first;
      return destination !== state.guardRoomId && !isBlocked(state, first, second);
    })) actions.push("MOVE_INTRUDER");
    if (state.hideRemaining > 0) actions.push("HIDE");
    if (
      !state.stolenTargetId
      && state.layout.targets.some((target) => target.roomId === state.intruderRoomId)
    ) actions.push("STEAL");
    return actions;
  }
  if (state.phase === "GUARD_TURN" && seat === state.guardSeat) {
    return state.blocksRemaining > 0
      ? ["MOVE_AND_SEARCH", "BLOCK_PASSAGE"]
      : ["MOVE_AND_SEARCH"];
  }
  if (
    state.phase === "ROUND_RESULT"
    && !state.acknowledgedResultSeats.includes(seat)
  ) {
    return ["ACK_ROUND_RESULT"];
  }
  if (
    state.phase === "MATCH_RESULT"
    && !state.rematchVotes.some((vote) => vote.seat === seat)
  ) {
    return ["CAST_REMATCH_VOTE"];
  }
  return [];
}
