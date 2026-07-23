import { DomainError as GameRuleError } from "@/shared/errors/domain-error";
import type {
  RoundSetup,
  SuspiciousInviteAction,
  SuspiciousInviteState,
  SuspiciousRosterPlayer,
  SuspiciousRoundResult,
  SuspiciousTransitionContext,
} from "./types";

const INTRO_DURATION_MS = 2_000;
const CLUE_REVEAL_DURATION_MS = 2_500;
const DISCUSSION_DURATION_MS = 45_000;
const RESULT_DURATION_MS = 4_000;

const clone = (state: SuspiciousInviteState): SuspiciousInviteState => structuredClone(state);

const requirePlayer = (state: SuspiciousInviteState, seat: number) => {
  const player = state.players.find((candidate) => candidate.seat === seat);
  if (!player) throw new GameRuleError("PLAYER_NOT_ACTIVE", "플레이어를 찾을 수 없습니다.");
  return player;
};

const normalizeClue = (clue: string) => clue.normalize("NFKC").replace(/\s+/gu, " ").trim();

const clueLength = (clue: string) =>
  [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(clue)].length;

function startRound(state: SuspiciousInviteState, setup: RoundSetup, now: number) {
  state.phase = "ROUND_INTRO";
  state.phaseEndsAt = now + INTRO_DURATION_MS;
  state.round += 1;
  state.setup = setup;
  if (!state.usedWordIds.includes(setup.wordId)) state.usedWordIds.push(setup.wordId);
  state.cluesBySeat = {};
  state.suspicionVotesBySeat = {};
  state.endVotesBySeat = {};
  state.lastRound = undefined;
}

export function createInitialState(
  roster: SuspiciousRosterPlayer[],
  setup: RoundSetup,
  now: number,
): SuspiciousInviteState {
  if (roster.length < 3 || roster.length > 6) {
    throw new GameRuleError("MIN_PLAYERS", "게임은 3–6명이 필요합니다.");
  }
  const players = [...roster]
    .sort((a, b) => a.seat - b.seat)
    .map((player) => ({ ...player, score: 0 }));
  if (!players.some((player) => player.seat === setup.strangerSeat)) {
    throw new GameRuleError("INVALID_ROUND_SETUP", "Stranger 좌석이 유효하지 않습니다.");
  }
  return {
    phase: "ROUND_INTRO",
    phaseEndsAt: now + INTRO_DURATION_MS,
    round: 1,
    players,
    setup,
    usedWordIds: [setup.wordId],
    cluesBySeat: {},
    suspicionVotesBySeat: {},
    endVotesBySeat: {},
  };
}

export function advanceTimedState(input: SuspiciousInviteState, now: number): SuspiciousInviteState {
  const state = clone(input);
  let advanced = true;
  while (advanced) {
    advanced = false;
    const endsAt = state.phaseEndsAt;
    if (!endsAt || now < endsAt) break;
    if (state.phase === "ROUND_INTRO") {
      state.phase = "CLUE_SUBMISSION";
      state.phaseEndsAt = undefined;
      advanced = true;
    } else if (state.phase === "CLUE_REVEAL") {
      state.phase = "DISCUSSION";
      state.phaseEndsAt = endsAt + DISCUSSION_DURATION_MS;
      advanced = true;
    } else if (state.phase === "DISCUSSION") {
      state.phase = "VOTING";
      state.phaseEndsAt = undefined;
      advanced = true;
    } else if (state.phase === "ROUND_RESULT") {
      state.phase = "END_VOTE";
      state.phaseEndsAt = undefined;
      advanced = true;
    }
  }
  return state;
}

const suspicionCounts = (state: SuspiciousInviteState) => {
  const counts: Record<number, number> = {};
  for (const targetSeat of Object.values(state.suspicionVotesBySeat)) {
    counts[targetSeat] = (counts[targetSeat] ?? 0) + 1;
  }
  return counts;
};

const accusedSeat = (counts: Record<number, number>) => {
  const entries = Object.entries(counts).map(([seat, count]) => ({ seat: Number(seat), count }));
  const max = Math.max(0, ...entries.map(({ count }) => count));
  const leaders = entries.filter(({ count }) => count === max);
  return leaders.length === 1 ? leaders[0].seat : undefined;
};

function finishRound(
  state: SuspiciousInviteState,
  outcome: SuspiciousRoundResult["outcome"],
  now: number,
  accused?: number,
) {
  const delta: Record<number, number> = {};
  if (outcome === "GUESTS_CAUGHT") {
    for (const [voterSeat, targetSeat] of Object.entries(state.suspicionVotesBySeat)) {
      if (targetSeat === state.setup.strangerSeat) delta[Number(voterSeat)] = 1;
    }
  } else {
    delta[state.setup.strangerSeat] = 2;
  }
  for (const player of state.players) player.score += delta[player.seat] ?? 0;
  state.lastRound = {
    round: state.round,
    outcome,
    strangerSeat: state.setup.strangerSeat,
    accusedSeat: accused,
    wordId: state.setup.wordId,
    word: state.setup.word,
    suspicionCounts: suspicionCounts(state),
    scoreDelta: delta,
  };
  state.phase = "ROUND_RESULT";
  state.phaseEndsAt = now + RESULT_DURATION_MS;
}

export function transition(
  input: SuspiciousInviteState,
  actorSeat: number,
  action: SuspiciousInviteAction,
  context: SuspiciousTransitionContext,
): SuspiciousInviteState {
  const state = advanceTimedState(input, context.now);
  requirePlayer(state, actorSeat);

  switch (action.type) {
    case "SUBMIT_CLUE": {
      if (state.phase !== "CLUE_SUBMISSION") throw new GameRuleError("INVALID_PHASE", "지금은 단서를 제출할 때가 아닙니다.");
      if (state.cluesBySeat[actorSeat]) throw new GameRuleError("ALREADY_ACTED", "이미 단서를 제출했습니다.");
      if (action.clues.length !== state.setup.cluePrompts.length) {
        throw new GameRuleError("INVALID_CLUE", "모든 질문에 단서를 입력해 주세요.");
      }
      const clues = action.clues.map(normalizeClue);
      if (clues.some((clue) => clueLength(clue) < 1 || clueLength(clue) > 24)) {
        throw new GameRuleError("INVALID_CLUE", "단서는 각각 1–24자로 입력해 주세요.");
      }
      const secret = state.setup.word.normalize("NFKC").toLocaleLowerCase("ko");
      if (clues.some((clue) => clue.toLocaleLowerCase("ko").includes(secret))) {
        throw new GameRuleError("SECRET_IN_CLUE", "비밀 단어를 단서에 직접 쓸 수 없습니다.");
      }
      state.cluesBySeat[actorSeat] = clues;
      if (Object.keys(state.cluesBySeat).length === state.players.length) {
        state.phase = "CLUE_REVEAL";
        state.phaseEndsAt = context.now + CLUE_REVEAL_DURATION_MS;
      }
      return state;
    }
    case "CAST_SUSPICION_VOTE": {
      if (state.phase !== "VOTING") throw new GameRuleError("INVALID_PHASE", "지금은 Stranger를 지목할 때가 아닙니다.");
      if (state.suspicionVotesBySeat[actorSeat]) throw new GameRuleError("ALREADY_ACTED", "이미 투표했습니다.");
      requirePlayer(state, action.targetSeat);
      if (action.targetSeat === actorSeat) throw new GameRuleError("INVALID_TARGET", "자신에게 투표할 수 없습니다.");
      state.suspicionVotesBySeat[actorSeat] = action.targetSeat;
      if (Object.keys(state.suspicionVotesBySeat).length === state.players.length) {
        const accused = accusedSeat(suspicionCounts(state));
        if (accused === state.setup.strangerSeat) {
          state.phase = "STRANGER_GUESS";
        } else {
          finishRound(state, "STRANGER_ESCAPED", context.now, accused);
        }
      }
      return state;
    }
    case "GUESS_WORD": {
      if (state.phase !== "STRANGER_GUESS") throw new GameRuleError("INVALID_PHASE", "지금은 비밀 단어를 추측할 때가 아닙니다.");
      if (actorSeat !== state.setup.strangerSeat) throw new GameRuleError("NOT_YOUR_TURN", "Stranger만 추측할 수 있습니다.");
      if (!state.setup.guessOptions.some((option) => option.id === action.wordId)) {
        throw new GameRuleError("INVALID_GUESS", "후보에 없는 단어입니다.");
      }
      finishRound(
        state,
        action.wordId === state.setup.wordId ? "STRANGER_GUESSED" : "GUESTS_CAUGHT",
        context.now,
        state.setup.strangerSeat,
      );
      return state;
    }
    case "CAST_END_VOTE": {
      if (state.phase !== "END_VOTE") throw new GameRuleError("INVALID_PHASE", "지금은 게임 종료 여부를 투표할 때가 아닙니다.");
      if (state.endVotesBySeat[actorSeat]) throw new GameRuleError("ALREADY_ACTED", "이미 종료 투표를 제출했습니다.");
      state.endVotesBySeat[actorSeat] = action.vote;
      if (Object.keys(state.endVotesBySeat).length === state.players.length) {
        const endCount = Object.values(state.endVotesBySeat).filter((vote) => vote === "END").length;
        if (endCount > state.players.length / 2) {
          const highScore = Math.max(...state.players.map((player) => player.score));
          state.winnerSeats = state.players.filter((player) => player.score === highScore).map((player) => player.seat);
          state.phase = "GAME_OVER";
          state.phaseEndsAt = undefined;
        } else {
          startRound(state, context.nextRound, context.now);
        }
      }
      return state;
    }
  }
}

export function legalActions(state: SuspiciousInviteState, seat: number): SuspiciousInviteAction["type"][] {
  if (!state.players.some((player) => player.seat === seat)) return [];
  if (state.phase === "CLUE_SUBMISSION" && !state.cluesBySeat[seat]) return ["SUBMIT_CLUE"];
  if (state.phase === "VOTING" && !state.suspicionVotesBySeat[seat]) return ["CAST_SUSPICION_VOTE"];
  if (state.phase === "STRANGER_GUESS" && state.setup.strangerSeat === seat) return ["GUESS_WORD"];
  if (state.phase === "END_VOTE" && !state.endVotesBySeat[seat]) return ["CAST_END_VOTE"];
  return [];
}
