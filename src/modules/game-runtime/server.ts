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

const isDarkHouseAction = (action: GameAction): action is DarkHouseAction =>
  darkHouseActionTypes.has(action.type as DarkHouseAction["type"]);

const isSuspiciousAction = (action: GameAction): action is SuspiciousInviteAction =>
  suspiciousActionTypes.has(action.type as SuspiciousInviteAction["type"]);

const isSwitchboardAction = (action: GameAction): action is SwitchboardAction =>
  switchboardActionTypes.has(action.type as SwitchboardAction["type"]);

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
  if (gameId === "dark-house") return { type: gameId, state: createDarkHouse(roster) };
  if (gameId === "suspicious-invite") {
    const setup = suspiciousSetup(roster.map((player) => player.seat), []);
    return { type: gameId, state: createSuspiciousInvite(roster, setup, now) };
  }
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

export function advanceGame(
  game: StoredGame,
  context: { now: number; connectedSeats: number[] },
): StoredGame {
  if (game.type === "dark-house") {
    return {
      ...game,
      state: advanceDarkHouse(game.state, {
        now: context.now,
        randomRemovalTokenId: randomRemovalId(game.state),
      }),
    };
  }
  if (game.type === "suspicious-invite") {
    return { ...game, state: advanceSuspiciousInvite(game.state, context.now) };
  }
  return { ...game, state: advanceSwitchboard(game.state, context) };
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
  if (!isSwitchboardAction(action)) throw new GameRuleError("INVALID_GAME_ACTION", "이 게임에서 사용할 수 없는 행동입니다.");
  return {
    ...game,
    state: transitionSwitchboard(game.state, actorSeat, action, {
      now: context.now,
      connectedSeats: context.connectedSeats,
    }),
  };
}

export function projectGamePublic(game: StoredGame, context: ProjectionContext): PublicRoomView {
  if (game.type === "dark-house") return projectDarkHousePublic(game.state, context);
  if (game.type === "suspicious-invite") return projectSuspiciousPublic(game.state, context);
  return projectSwitchboardPublic(game.state, context);
}

export function projectGamePlayer(game: StoredGame, context: ProjectionContext): PlayerRoomView {
  if (game.type === "dark-house") return projectDarkHousePlayer(game.state, context);
  if (game.type === "suspicious-invite") return projectSuspiciousPlayer(game.state, context);
  return projectSwitchboardPlayer(game.state, context);
}

export const isGameOver = (game: StoredGame) => game.state.phase === "GAME_OVER";
