import type { DarkHouseState } from "@/modules/dark-house/domain/types";
import type { GameId } from "@/modules/game-catalog/games";
import type { PlayerRoomView, PublicRoomView } from "@/modules/room/contracts";
import { legalActions } from "@/modules/dark-house/domain/reducer";

type ProjectionContext = {
  code: string;
  gameId: GameId;
  version: number;
  now: number;
  status: "playing" | "finished";
  hostUserId: string;
  viewerUserId?: string;
  display?: boolean;
};

export function projectPublic(state: DarkHouseState, context: ProjectionContext): PublicRoomView {
  const roles: PublicRoomView["viewer"]["roles"] = [];
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  if (context.display) roles.push("DISPLAY");
  if (context.viewerUserId === context.hostUserId) roles.push("HOST");
  if (self) roles.push("PLAYER");

  const canAdmin = roles.includes("HOST");
  const reveal = state.currentReveal;
  const revealVisible = reveal && context.now >= reveal.revealAt;

  return {
    room: { code: context.code, gameId: context.gameId, status: context.status, version: context.version },
    serverNow: new Date(context.now).toISOString(),
    phase: state.phase,
    players: state.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      connected: player.connected,
      active: player.active,
      isHost: player.userId === context.hostUserId,
      tokenCount: player.hand.length + player.stack.length,
      keyCount: player.keyCount,
      flashlightUsed: player.flashlightUsed,
      passed: player.passed,
    })),
    stacks: state.players.map((player) => ({
      seat: player.seat,
      count: player.stack.length,
      revealed: player.stack
        .filter((token) => state.revealedTokenIds.includes(token.id))
        .map((token) => ({ kind: token.kind })),
    })),
    turnSeat: state.activeSeat,
    bid: state.highBid ? { ...state.highBid } : undefined,
    reveal: reveal
      ? {
          sequenceId: reveal.sequenceId,
          targetSeat: reveal.seat,
          revealAt: new Date(reveal.revealAt).toISOString(),
          settleAt: new Date(reveal.settleAt).toISOString(),
          kind: revealVisible ? reveal.kind : undefined,
        }
      : undefined,
    roundResult: state.roundResult ? { ...state.roundResult } : undefined,
    winnerSeat: state.winnerSeat,
    viewer: {
      roles,
      playerSeat: self?.seat,
      legalAdministrativeActions: canAdmin
        ? context.status === "finished"
          ? ["ROTATE_INVITE", "ROTATE_DISPLAY", "START_REMATCH"]
          : ["ROTATE_INVITE", "ROTATE_DISPLAY"]
        : [],
    },
  };
}

export function projectPlayer(state: DarkHouseState, context: ProjectionContext): PlayerRoomView {
  const publicView = projectPublic(state, context);
  const player = state.players.find((candidate) => candidate.userId === context.viewerUserId);
  const privacyLocked = ["REVEAL_CHOICE", "REVEALING", "ROUND_END", "GAME_OVER"].includes(state.phase);
  if (!player || privacyLocked) return { ...publicView, privacyLocked };

  const peek = state.lastPeekBySeat[player.seat];
  return {
    ...publicView,
    privacyLocked: false,
    self: {
      seat: player.seat,
      hand: player.hand.map((token) => ({ ...token })),
      ownStack: player.stack.map((token) => ({
        ...token,
        revealed: state.revealedTokenIds.includes(token.id),
      })),
      flashlightAvailable: !player.flashlightUsed,
      lastPeek: peek && context.now < peek.expiresAt
        ? { kind: peek.kind, expiresAt: new Date(peek.expiresAt).toISOString() }
        : undefined,
      removedTokenKind: player.removedTokenKind,
      legalActions: legalActions(state, player.seat),
    },
  };
}
