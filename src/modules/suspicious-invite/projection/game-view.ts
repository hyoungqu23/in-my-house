import { legalActions } from "@/modules/suspicious-invite/domain/reducer";
import type { SuspiciousInviteState } from "@/modules/suspicious-invite/domain/types";
import type {
  SuspiciousInvitePlayerRoomView,
  SuspiciousInvitePublicRoomView,
} from "@/modules/room/contracts";

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

const cluesArePublic = (state: SuspiciousInviteState) =>
  !["ROUND_INTRO", "CLUE_SUBMISSION"].includes(state.phase);

export function projectPublic(
  state: SuspiciousInviteState,
  context: ProjectionContext,
): SuspiciousInvitePublicRoomView {
  const roles: SuspiciousInvitePublicRoomView["viewer"]["roles"] = [];
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  if (context.display) roles.push("DISPLAY");
  if (context.viewerUserId === context.hostUserId) roles.push("HOST");
  if (self) roles.push("PLAYER");

  return {
    projection: "public",
    room: {
      code: context.code,
      gameId: "suspicious-invite",
      status: context.status,
      version: context.version,
    },
    serverNow: new Date(context.now).toISOString(),
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt ? new Date(state.phaseEndsAt).toISOString() : undefined,
    round: state.round,
    category: state.setup.category,
    cluePrompts: [...state.setup.cluePrompts],
    players: state.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      connected: context.connectedSeats.includes(player.seat),
      isHost: player.userId === context.hostUserId,
      score: player.score,
    })),
    clues: cluesArePublic(state)
      ? state.players.map((player) => ({
          seat: player.seat,
          entries: [...(state.cluesBySeat[player.seat] ?? [])],
        }))
      : undefined,
    accusedSeat: state.phase === "STRANGER_GUESS"
      ? state.setup.strangerSeat
      : state.lastRound?.accusedSeat,
    submittedCount: {
      clues: Object.keys(state.cluesBySeat).length,
      suspicionVotes: Object.keys(state.suspicionVotesBySeat).length,
      endVotes: Object.keys(state.endVotesBySeat).length,
    },
    lastRound: state.lastRound ? structuredClone(state.lastRound) : undefined,
    winnerSeats: state.winnerSeats ? [...state.winnerSeats] : undefined,
    viewer: {
      roles,
      playerSeat: self?.seat,
      legalAdministrativeActions: roles.includes("HOST")
        ? context.status === "finished"
          ? ["ROTATE_INVITE", "ROTATE_DISPLAY", "START_REMATCH"]
          : ["ROTATE_INVITE", "ROTATE_DISPLAY"]
        : [],
    },
  };
}

export function projectPlayer(
  state: SuspiciousInviteState,
  context: ProjectionContext,
): SuspiciousInvitePlayerRoomView {
  const publicView = projectPublic(state, context);
  const player = state.players.find((candidate) => candidate.userId === context.viewerUserId);
  if (!player) throw new Error("Player projection requires a player viewer");
  const isStranger = player.seat === state.setup.strangerSeat;
  return {
    ...publicView,
    projection: "player",
    self: {
      seat: player.seat,
      role: isStranger ? "STRANGER" : "GUEST",
      secretWord: isStranger ? undefined : state.setup.word,
      guessOptions: isStranger && state.phase === "STRANGER_GUESS"
        ? state.setup.guessOptions.map((option) => ({ ...option }))
        : undefined,
      submittedClues: state.cluesBySeat[player.seat]
        ? [...state.cluesBySeat[player.seat]]
        : undefined,
      legalActions: legalActions(state, player.seat),
    },
  };
}
