import type { DarkHouseState } from "@/modules/dark-house/domain/types";
import type { DarkHousePlayerRoomView, DarkHousePublicRoomView } from "@/modules/room/contracts";
import { legalActions } from "@/modules/dark-house/domain/reducer";

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

export function projectPublic(state: DarkHouseState, context: ProjectionContext): DarkHousePublicRoomView {
  const roles: DarkHousePublicRoomView["viewer"]["roles"] = [];
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  if (context.display) roles.push("DISPLAY");
  if (context.viewerUserId === context.hostUserId) roles.push("HOST");
  if (self) roles.push("PLAYER");

  const canAdmin = roles.includes("HOST");
  const reveal = state.currentReveal;
  const revealVisible = reveal && context.now >= reveal.revealAt;

  return {
    projection: "public",
    room: { code: context.code, gameId: "dark-house", status: context.status, version: context.version },
    serverNow: new Date(context.now).toISOString(),
    phase: state.phase,
    players: state.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      connected: context.connectedSeats.includes(player.seat),
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

export function projectPlayer(state: DarkHouseState, context: ProjectionContext): DarkHousePlayerRoomView {
  const publicView = projectPublic(state, context);
  const player = state.players.find((candidate) => candidate.userId === context.viewerUserId);
  const privacyLocked = ["REVEAL_CHOICE", "REVEALING", "ROUND_END", "GAME_OVER"].includes(state.phase);
  if (!player || privacyLocked) return { ...publicView, projection: "player", privacyLocked };

  const peek = state.lastPeekBySeat[player.seat];
  return {
    ...publicView,
    projection: "player",
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
