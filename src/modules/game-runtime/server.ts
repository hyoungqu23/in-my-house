import "server-only";

import { randomInt } from "node:crypto";
import {
  advanceTimedState as advanceDarkHouse,
  createInitialState as createDarkHouse,
  transition as transitionDarkHouse,
} from "@/modules/dark-house/domain/reducer";
import type { DarkHouseState, GameAction as DarkHouseAction } from "@/modules/dark-house/domain/types";
import { createMatchSetup } from "@/modules/dawn-switchboard/domain/content";
import {
  advanceTimedState as advanceSwitchboard,
  createInitialState as createSwitchboard,
  transition as transitionSwitchboard,
} from "@/modules/dawn-switchboard/domain/reducer";
import type { SwitchboardAction } from "@/modules/dawn-switchboard/domain/types";
import { createMatchSetup as createFootprintsSetup } from "@/modules/midnight-footprints/domain/content";
import {
  advanceTimedState as advanceFootprints,
  createInitialState as createFootprints,
  transition as transitionFootprints,
} from "@/modules/midnight-footprints/domain/reducer";
import type {
  FootprintsAction,
  FootprintsPrivatePlayerState,
} from "@/modules/midnight-footprints/domain/types";
import {
  projectPlayer as projectFootprintsPlayer,
  projectPublic as projectFootprintsPublic,
} from "@/modules/midnight-footprints/projection/game-view";
import {
  projectPlayer as projectSwitchboardPlayer,
  projectPublic as projectSwitchboardPublic,
} from "@/modules/dawn-switchboard/projection/game-view";
import {
  projectPlayer as projectDarkHousePlayer,
  projectPublic as projectDarkHousePublic,
} from "@/modules/dark-house/projection/game-view";
import type { GameId } from "@/modules/game-catalog/games";
import type { StoredGame } from "@/modules/game-runtime/types";
import type { PlayerRoomView, PublicRoomView, RoomAction } from "@/modules/room/contracts";
import { createRoundSetup } from "@/modules/suspicious-invite/domain/content";
import {
  advanceTimedState as advanceSuspiciousInvite,
  createInitialState as createSuspiciousInvite,
  transition as transitionSuspiciousInvite,
} from "@/modules/suspicious-invite/domain/reducer";
import type { SuspiciousInviteAction } from "@/modules/suspicious-invite/domain/types";
import {
  projectPlayer as projectSuspiciousPlayer,
  projectPublic as projectSuspiciousPublic,
} from "@/modules/suspicious-invite/projection/game-view";
import { DomainError as GameRuleError } from "@/shared/errors/domain-error";

type RosterPlayer = { seat: number; userId: string; nickname: string };

type ProjectionContext = {
  code: string;
  version: number;
  now: number;
  status: "playing" | "finished";
  hostUserId: string;
  viewerUserId?: string;
  display?: boolean;
  connectedSeats: number[];
};

type GameAction = Exclude<RoomAction, { type: "START_GAME" | "START_REMATCH" }>;

const darkHouseActionTypes = new Set<DarkHouseAction["type"]>([
  "PLACE_INITIAL_TOKEN",
  "PLACE_TOKEN",
  "OPEN_BID",
  "RAISE_BID",
  "PASS",
  "USE_FLASHLIGHT_AND_RAISE",
  "CHOOSE_REVEAL_TARGET",
]);

const suspiciousActionTypes = new Set<SuspiciousInviteAction["type"]>([
  "SUBMIT_CLUE",
  "CAST_SUSPICION_VOTE",
  "GUESS_WORD",
  "CAST_END_VOTE",
]);

const switchboardActionTypes = new Set<SwitchboardAction["type"]>([
  "MARK_READY",
  "CONFIRM_MODULE",
]);

const footprintsActionTypes = new Set<FootprintsAction["type"]>([
  "SELECT_ENTRY",
  "MARK_READY",
  "MOVE_INTRUDER",
  "HIDE",
  "STEAL",
  "MOVE_AND_SEARCH",
  "BLOCK_PASSAGE",
  "ACK_ROUND_RESULT",
  "CAST_REMATCH_VOTE",
  "CLAIM_FORFEIT",
]);

const isDarkHouseAction = (action: GameAction): action is DarkHouseAction =>
  darkHouseActionTypes.has(action.type as DarkHouseAction["type"]);

const isSuspiciousAction = (action: GameAction): action is SuspiciousInviteAction =>
  suspiciousActionTypes.has(action.type as SuspiciousInviteAction["type"]);

const isSwitchboardAction = (action: GameAction): action is SwitchboardAction =>
  switchboardActionTypes.has(action.type as SwitchboardAction["type"]);

const isFootprintsAction = (action: GameAction): action is FootprintsAction =>
  footprintsActionTypes.has(action.type as FootprintsAction["type"]);

const assertNever = (value: never): never => {
  throw new GameRuleError("GAME_NOT_FOUND", `지원하지 않는 게임입니다: ${String(value)}`);
};

const randomRemovalId = (state: DarkHouseState) => {
  const challenger = state.players.find((player) => player.seat === state.challengerSeat);
  const candidates = challenger ? [...challenger.hand, ...challenger.stack] : [];
  return candidates.length > 0 ? candidates[randomInt(candidates.length)].id : undefined;
};

const suspiciousSetup = (seats: number[], usedWordIds: string[]) =>
  createRoundSetup({ seats, usedWordIds, randomIndex: (maxExclusive) => randomInt(maxExclusive) });

export function createGame(
  gameId: GameId,
  roster: RosterPlayer[],
  now: number,
  previousGame?: StoredGame,
): StoredGame {
  switch (gameId) {
    case "dark-house":
      return { type: gameId, state: createDarkHouse(roster) };
    case "suspicious-invite": {
      const setup = suspiciousSetup(roster.map((player) => player.seat), []);
      return { type: gameId, state: createSuspiciousInvite(roster, setup, now) };
    }
    case "dawn-switchboard": {
      const excludedPuzzleIds = previousGame?.type === "dawn-switchboard"
        ? previousGame.state.panels.map((panel) => panel.id)
        : [];
      const setup = createMatchSetup({
        seats: roster.map((player) => player.seat),
        excludedPuzzleIds,
        randomIndex: (maxExclusive) => randomInt(maxExclusive),
      });
      return { type: gameId, state: createSwitchboard(roster, setup) };
    }
    case "midnight-footprints": {
      const seats = roster.map((player) => player.seat);
      const roleOrder = randomInt(2) === 0 ? seats : [...seats].reverse();
      const setup = createFootprintsSetup({
        seats: roleOrder,
        previousLayoutId: previousGame?.type === "midnight-footprints"
          ? previousGame.state.layout.id
          : undefined,
        randomIndex: (maxExclusive) => randomInt(maxExclusive),
      });
      return { type: gameId, state: createFootprints(roster, setup, now) };
    }
    default:
      return assertNever(gameId);
  }
}

export function advanceGame(
  game: StoredGame,
  context: { now: number; connectedSeats: number[] },
): StoredGame {
  switch (game.type) {
    case "dark-house":
      return {
        ...game,
        state: advanceDarkHouse(game.state, {
          now: context.now,
          randomRemovalTokenId: randomRemovalId(game.state),
        }),
      };
    case "suspicious-invite":
      return { ...game, state: advanceSuspiciousInvite(game.state, context.now) };
    case "dawn-switchboard":
      return { ...game, state: advanceSwitchboard(game.state, context) };
    case "midnight-footprints":
      return { ...game, state: advanceFootprints(game.state, context) };
    default:
      return assertNever(game);
  }
}

export function transitionGame(
  game: StoredGame,
  actorSeat: number,
  action: GameAction,
  context: { now: number; sequenceId: string; connectedSeats: number[] },
): StoredGame {
  if (game.type === "dark-house") {
    if (!isDarkHouseAction(action)) throw new GameRuleError("INVALID_GAME_ACTION", "이 게임에서 사용할 수 없는 행동입니다.");
    return {
      ...game,
      state: transitionDarkHouse(game.state, actorSeat, action, {
        ...context,
        randomRemovalTokenId: randomRemovalId(game.state),
      }),
    };
  }
  if (game.type === "suspicious-invite") {
    if (!isSuspiciousAction(action)) throw new GameRuleError("INVALID_GAME_ACTION", "이 게임에서 사용할 수 없는 행동입니다.");
    const nextRound = suspiciousSetup(
      game.state.players.map((player) => player.seat),
      game.state.usedWordIds,
    );
    return {
      ...game,
      state: transitionSuspiciousInvite(game.state, actorSeat, action, {
        now: context.now,
        nextRound,
      }),
    };
  }
  if (game.type === "dawn-switchboard") {
    if (!isSwitchboardAction(action)) throw new GameRuleError("INVALID_GAME_ACTION", "이 게임에서 사용할 수 없는 행동입니다.");
    return {
      ...game,
      state: transitionSwitchboard(game.state, actorSeat, action, {
        now: context.now,
        connectedSeats: context.connectedSeats,
      }),
    };
  }
  if (!isFootprintsAction(action)) throw new GameRuleError("INVALID_GAME_ACTION", "이 게임에서 사용할 수 없는 행동입니다.");
  const otherSeat = game.state.players.find(
    (player) => player.seat !== game.state.startingIntruderSeat,
  )!.seat;
  const nextMatchSetup = createFootprintsSetup({
    seats: [otherSeat, game.state.startingIntruderSeat],
    previousLayoutId: game.state.layout.id,
    randomIndex: (maxExclusive) => randomInt(maxExclusive),
  });
  return {
    ...game,
    state: transitionFootprints(game.state, actorSeat, action, {
      now: context.now,
      connectedSeats: context.connectedSeats,
      nextMatchSetup,
    }),
  };
}

export function projectGamePublic(game: StoredGame, context: ProjectionContext): PublicRoomView {
  switch (game.type) {
    case "dark-house":
      return projectDarkHousePublic(game.state, context);
    case "suspicious-invite":
      return projectSuspiciousPublic(game.state, context);
    case "dawn-switchboard":
      return projectSwitchboardPublic(game.state, context);
    case "midnight-footprints":
      return projectFootprintsPublic(game.state, context);
    default:
      return assertNever(game);
  }
}

export function projectGamePlayer(
  game: StoredGame,
  context: ProjectionContext,
  privateState?: FootprintsPrivatePlayerState,
): PlayerRoomView {
  switch (game.type) {
    case "dark-house":
      return projectDarkHousePlayer(game.state, context);
    case "suspicious-invite":
      return projectSuspiciousPlayer(game.state, context);
    case "dawn-switchboard":
      return projectSwitchboardPlayer(game.state, context);
    case "midnight-footprints":
      return projectFootprintsPlayer(game.state, context, privateState);
    default:
      return assertNever(game);
  }
}

export const isGameOver = (game: StoredGame) => game.state.phase === "GAME_OVER";
