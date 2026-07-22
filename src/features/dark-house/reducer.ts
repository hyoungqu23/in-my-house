import {
  DarkHouseState,
  GameAction,
  GameRuleError,
  PlayerState,
  RosterPlayer,
  Token,
  TransitionContext,
} from "./types";

const makeTokens = (seat: number): Token[] => [
  { id: `${seat}-empty-1`, kind: "EMPTY" },
  { id: `${seat}-empty-2`, kind: "EMPTY" },
  { id: `${seat}-empty-3`, kind: "EMPTY" },
  { id: `${seat}-ghost`, kind: "GHOST" },
];

export function createInitialState(roster: RosterPlayer[]): DarkHouseState {
  if (roster.length < 3 || roster.length > 6) {
    throw new GameRuleError("MIN_PLAYERS", "게임은 3–6명이 필요합니다.");
  }

  const players: PlayerState[] = [...roster]
    .sort((a, b) => a.seat - b.seat)
    .map((player) => ({
      ...player,
      active: true,
      connected: true,
      hand: makeTokens(player.seat),
      stack: [],
      keyCount: 0,
      flashlightUsed: false,
      passed: false,
    }));

  return {
    phase: "INITIAL_PLACEMENT",
    round: 1,
    starterSeat: players[0].seat,
    players,
    revealCount: 0,
    revealedTokenIds: [],
    lastPeekBySeat: {},
  };
}

const requirePlayer = (state: DarkHouseState, seat: number) => {
  const player = state.players.find((candidate) => candidate.seat === seat && candidate.active);
  if (!player) throw new GameRuleError("PLAYER_NOT_ACTIVE", "활성 플레이어가 아닙니다.");
  return player;
};

const totalStacked = (state: DarkHouseState) =>
  state.players.reduce((sum, player) => sum + player.stack.length, 0);

const eligibleSeats = (state: DarkHouseState) =>
  state.players.filter((player) => player.active && !player.passed).map((player) => player.seat);

const nextSeat = (state: DarkHouseState, fromSeat: number, candidates?: number[]) => {
  const seats = (candidates ?? state.players.filter((player) => player.active).map((player) => player.seat)).sort(
    (a, b) => a - b,
  );
  const next = seats.find((seat) => seat > fromSeat);
  return next ?? seats[0];
};

const moveTokenToStack = (player: PlayerState, tokenId: string) => {
  const index = player.hand.findIndex((token) => token.id === tokenId);
  if (index < 0) throw new GameRuleError("TOKEN_NOT_IN_HAND", "손에 없는 방입니다.");
  const [token] = player.hand.splice(index, 1);
  player.stack.push(token);
};

const cloneState = (state: DarkHouseState): DarkHouseState => structuredClone(state);

const resetRound = (state: DarkHouseState, starterSeat: number) => {
  for (const player of state.players) {
    player.hand.push(...player.stack);
    player.stack = [];
    player.passed = false;
  }
  state.phase = "INITIAL_PLACEMENT";
  state.round += 1;
  state.starterSeat = starterSeat;
  state.activeSeat = undefined;
  state.highBid = undefined;
  state.challengerSeat = undefined;
  state.revealCount = 0;
  state.revealedTokenIds = [];
  state.currentReveal = undefined;
  state.roundResult = undefined;
  state.continueAt = undefined;
  state.notBefore = undefined;
};

function resolveBidIfComplete(state: DarkHouseState) {
  const eligible = eligibleSeats(state);
  const maxed = state.highBid?.amount === totalStacked(state);
  if (eligible.length === 1 || maxed) {
    const challengerSeat = state.highBid?.bidderSeat;
    if (challengerSeat === undefined) throw new GameRuleError("NO_BID", "입찰자가 없습니다.");
    state.phase = "REVEAL_CHOICE";
    state.challengerSeat = challengerSeat;
    state.activeSeat = challengerSeat;
    state.notBefore = undefined;
    return true;
  }
  return false;
}

function finishFailure(state: DarkHouseState, context: TransitionContext, ghostOwnerSeat: number) {
  const challenger = requirePlayer(state, state.challengerSeat!);
  for (const player of state.players) {
    player.hand.push(...player.stack);
    player.stack = [];
  }
  const removable = challenger.hand;
  const removalId = context.randomRemovalTokenId;
  const removalIndex = removable.findIndex((token) => token.id === removalId);
  if (removalIndex < 0) {
    throw new GameRuleError("INVALID_RANDOM_REMOVAL", "제거 후보가 유효하지 않습니다.");
  }
  const [removed] = removable.splice(removalIndex, 1);
  challenger.removedTokenKind = removed.kind;
  if (challenger.hand.length === 0) challenger.active = false;
  const survivors = state.players.filter((player) => player.active);
  state.roundResult = { outcome: "GHOST", actorSeat: challenger.seat, ghostOwnerSeat };
  if (survivors.length === 1) {
    state.phase = "GAME_OVER";
    state.winnerSeat = survivors[0].seat;
    return;
  }
  state.phase = "ROUND_END";
  state.continueAt = context.now + 2_000;
}

function finishSuccess(state: DarkHouseState, context: TransitionContext) {
  const challenger = requirePlayer(state, state.challengerSeat!);
  challenger.keyCount += 1;
  state.roundResult = { outcome: "SUCCESS", actorSeat: challenger.seat };
  if (challenger.keyCount >= 2) {
    state.phase = "GAME_OVER";
    state.winnerSeat = challenger.seat;
    return;
  }
  state.phase = "ROUND_END";
  state.continueAt = context.now + 2_000;
}

export function advanceTimedState(input: DarkHouseState, context: TransitionContext): DarkHouseState {
  const state = cloneState(input);
  if (state.phase === "REVEALING" && state.currentReveal && context.now >= state.currentReveal.settleAt) {
    const reveal = state.currentReveal;
    state.currentReveal = undefined;
    if (reveal.kind === "GHOST") {
      finishFailure(state, context, reveal.seat);
    } else if (state.revealCount >= (state.highBid?.amount ?? 0)) {
      finishSuccess(state, context);
    } else {
      state.phase = "REVEAL_CHOICE";
    }
  }
  if (state.phase === "ROUND_END" && state.continueAt && context.now >= state.continueAt) {
    const result = state.roundResult;
    const challenger = state.challengerSeat!;
    let starter = challenger;
    if (result?.outcome === "GHOST") {
      starter = result.ghostOwnerSeat === challenger
        ? nextSeat(state, challenger)
        : result.ghostOwnerSeat ?? nextSeat(state, challenger);
    }
    resetRound(state, starter);
  }
  return state;
}

export function transition(
  input: DarkHouseState,
  actorSeat: number,
  action: GameAction,
  context: TransitionContext,
): DarkHouseState {
  const state = advanceTimedState(input, context);
  const actor = requirePlayer(state, actorSeat);

  if (context.now < (state.notBefore ?? 0)) {
    throw new GameRuleError("ACTION_TOO_EARLY", "손전등 확인이 끝날 때까지 기다려 주세요.");
  }

  switch (action.type) {
    case "PLACE_INITIAL_TOKEN": {
      if (state.phase !== "INITIAL_PLACEMENT") throw new GameRuleError("INVALID_PHASE", "지금은 첫 방을 고를 때가 아닙니다.");
      if (actor.stack.length > 0) throw new GameRuleError("ALREADY_PLACED", "이미 첫 방을 골랐습니다.");
      moveTokenToStack(actor, action.tokenId);
      if (state.players.filter((player) => player.active).every((player) => player.stack.length === 1)) {
        state.phase = "TURN";
        state.activeSeat = state.starterSeat;
      }
      return state;
    }
    case "PLACE_TOKEN": {
      if (state.phase !== "TURN") throw new GameRuleError("INVALID_PHASE", "지금은 방을 놓을 수 없습니다.");
      if (state.activeSeat !== actorSeat) throw new GameRuleError("NOT_YOUR_TURN", "당신의 차례가 아닙니다.");
      moveTokenToStack(actor, action.tokenId);
      state.activeSeat = nextSeat(state, actorSeat);
      return state;
    }
    case "OPEN_BID": {
      if (state.phase !== "TURN") throw new GameRuleError("INVALID_PHASE", "지금은 입찰을 열 수 없습니다.");
      if (state.activeSeat !== actorSeat) throw new GameRuleError("NOT_YOUR_TURN", "당신의 차례가 아닙니다.");
      if (action.bid < 1 || action.bid > totalStacked(state)) throw new GameRuleError("INVALID_BID", "입찰 수가 범위를 벗어났습니다.");
      state.phase = "BIDDING";
      state.highBid = { amount: action.bid, bidderSeat: actorSeat };
      state.activeSeat = nextSeat(state, actorSeat, eligibleSeats(state));
      resolveBidIfComplete(state);
      return state;
    }
    case "RAISE_BID":
    case "USE_FLASHLIGHT_AND_RAISE": {
      if (state.phase !== "BIDDING") throw new GameRuleError("INVALID_PHASE", "지금은 입찰 중이 아닙니다.");
      if (state.activeSeat !== actorSeat) throw new GameRuleError("NOT_YOUR_TURN", "당신의 차례가 아닙니다.");
      if (action.bid <= (state.highBid?.amount ?? 0) || action.bid > totalStacked(state)) {
        throw new GameRuleError("INVALID_BID", "현재보다 높고 전체 방 수 이하로 불러야 합니다.");
      }
      if (action.type === "USE_FLASHLIGHT_AND_RAISE") {
        if (actor.flashlightUsed) throw new GameRuleError("FLASHLIGHT_USED", "손전등을 이미 사용했습니다.");
        const target = requirePlayer(state, action.targetSeat);
        const top = target.stack.at(-1);
        if (!top || target.seat === actorSeat) throw new GameRuleError("INVALID_TARGET", "볼 수 있는 상대 방이 없습니다.");
        actor.flashlightUsed = true;
        state.lastPeekBySeat[actorSeat] = { kind: top.kind, expiresAt: context.now + 3_000 };
        state.notBefore = context.now + 3_000;
      }
      state.highBid = { amount: action.bid, bidderSeat: actorSeat };
      state.activeSeat = nextSeat(state, actorSeat, eligibleSeats(state));
      resolveBidIfComplete(state);
      return state;
    }
    case "PASS": {
      if (state.phase !== "BIDDING") throw new GameRuleError("INVALID_PHASE", "지금은 포기할 수 없습니다.");
      if (state.activeSeat !== actorSeat) throw new GameRuleError("NOT_YOUR_TURN", "당신의 차례가 아닙니다.");
      actor.passed = true;
      if (!resolveBidIfComplete(state)) {
        state.activeSeat = nextSeat(state, actorSeat, eligibleSeats(state));
      }
      return state;
    }
    case "CHOOSE_REVEAL_TARGET": {
      if (state.phase !== "REVEAL_CHOICE") throw new GameRuleError("INVALID_PHASE", "지금은 공개할 수 없습니다.");
      if (state.challengerSeat !== actorSeat) throw new GameRuleError("NOT_YOUR_TURN", "도전자만 공개할 수 있습니다.");
      const ownUnrevealed = actor.stack.filter((token) => !state.revealedTokenIds.includes(token.id));
      if (ownUnrevealed.length > 0 && action.targetSeat !== actorSeat) {
        throw new GameRuleError("OWN_STACK_FIRST", "먼저 자신의 집부터 공개해야 합니다.");
      }
      const target = requirePlayer(state, action.targetSeat);
      const token = [...target.stack].reverse().find((candidate) => !state.revealedTokenIds.includes(candidate.id));
      if (!token) throw new GameRuleError("NO_TOKEN_TO_REVEAL", "공개할 방이 없습니다.");
      state.revealedTokenIds.push(token.id);
      state.revealCount += 1;
      state.phase = "REVEALING";
      state.currentReveal = {
        sequenceId: context.sequenceId ?? `${context.now}-${state.revealCount}`,
        seat: target.seat,
        tokenId: token.id,
        kind: token.kind,
        revealAt: context.now + 900,
        settleAt: context.now + 1_320,
      };
      return state;
    }
  }
}

export function legalActions(state: DarkHouseState, seat: number): GameAction["type"][] {
  const player = state.players.find((candidate) => candidate.seat === seat && candidate.active);
  if (!player) return [];
  if (state.phase === "INITIAL_PLACEMENT" && player.stack.length === 0) return ["PLACE_INITIAL_TOKEN"];
  if (state.phase === "TURN" && state.activeSeat === seat) {
    return player.hand.length > 0 ? ["PLACE_TOKEN", "OPEN_BID"] : ["OPEN_BID"];
  }
  if (state.phase === "BIDDING" && state.activeSeat === seat) {
    return player.flashlightUsed ? ["RAISE_BID", "PASS"] : ["RAISE_BID", "PASS", "USE_FLASHLIGHT_AND_RAISE"];
  }
  if (state.phase === "REVEAL_CHOICE" && state.challengerSeat === seat) return ["CHOOSE_REVEAL_TARGET"];
  return [];
}
