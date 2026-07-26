import { legalActions } from "../domain/reducer";
import type {
  FootprintsPrivatePlayerState,
  FootprintsRoundResult,
  FootprintsState,
} from "../domain/types";
import type {
  MidnightFootprintsPlayerRoomView,
  MidnightFootprintsPublicRoomView,
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

const passageKey = (passage: readonly [string, string]) =>
  [...passage].sort().join(":");

const activeSeat = (state: FootprintsState) => {
  if (state.phase === "INTRUDER_TURN") return state.intruderSeat;
  if (state.phase === "GUARD_TURN") return state.guardSeat;
  return undefined;
};

const publicRoundResult = (
  result: FootprintsRoundResult,
): Omit<FootprintsRoundResult, "path"> => ({
  round: result.round,
  intruderSeat: result.intruderSeat,
  guardSeat: result.guardSeat,
  outcome: result.outcome,
  completedActions: result.completedActions,
  targetId: result.targetId,
  targetValue: result.targetValue,
});

export function projectPublic(
  state: FootprintsState,
  context: ProjectionContext,
): MidnightFootprintsPublicRoomView {
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  const roles: MidnightFootprintsPublicRoomView["viewer"]["roles"] = [];
  if (context.display) roles.push("DISPLAY");
  if (context.viewerUserId === context.hostUserId) roles.push("HOST");
  if (self) roles.push("PLAYER");
  const canRevealPaths = ["MATCH_RESULT", "GAME_OVER"].includes(state.phase)
    && state.roundResults.length === 2;

  return {
    projection: "public",
    room: {
      code: context.code,
      gameId: "midnight-footprints",
      status: context.status,
      version: context.version,
    },
    serverNow: new Date(context.now).toISOString(),
    phase: state.phase,
    viewer: {
      roles,
      playerSeat: self?.seat,
      legalAdministrativeActions: roles.includes("HOST")
        ? ["ROTATE_INVITE", "ROTATE_DISPLAY"]
        : [],
    },
    matchNumber: state.matchNumber,
    round: state.round,
    activeSeat: activeSeat(state),
    actionStartedAt: new Date(state.actionStartedAt).toISOString(),
    players: state.players.map((player) => {
      const record = state.sessionRecords.find((candidate) => candidate.seat === player.seat)!;
      return {
        seat: player.seat,
        nickname: player.nickname,
        connected: context.connectedSeats.includes(player.seat),
        isHost: player.userId === context.hostUserId,
        role: player.seat === state.intruderSeat ? "INTRUDER" as const : "GUARD" as const,
        ready: state.readySeats.includes(player.seat),
        record: {
          wins: record.wins,
          draws: record.draws,
          losses: record.losses,
        },
      };
    }),
    layout: structuredClone(state.layout),
    guardRoomId: state.guardRoomId,
    blocksRemaining: state.blocksRemaining,
    activeBlock: state.activeBlock ? structuredClone(state.activeBlock) : undefined,
    traceHistory: structuredClone(state.traceHistory),
    failedSearches: structuredClone(state.failedSearches),
    roundResults: state.roundResults.map(publicRoundResult),
    revealedPaths: canRevealPaths
      ? state.roundResults.map((result) => ({
          round: result.round,
          intruderSeat: result.intruderSeat,
          path: [...result.path],
        }))
      : undefined,
    pause: state.pause
      ? {
          disconnectedSeats: [...state.pause.disconnectedSeats],
          pausedAt: new Date(state.pause.pausedAt).toISOString(),
          forfeitClaimAt: new Date(state.pause.forfeitClaimAt).toISOString(),
        }
      : undefined,
    rematchVoteCount: state.rematchVotes.length,
    matchWinnerSeat: state.matchResult?.winnerSeat,
    forfeitWinnerSeat: state.forfeitWinnerSeat,
  };
}

const legalIntruderMoves = (state: FootprintsState) =>
  state.layout.passages.flatMap(([first, second]) => {
    if (first !== state.intruderRoomId && second !== state.intruderRoomId) return [];
    const destination = first === state.intruderRoomId ? second : first;
    const blocked = state.activeBlock
      && passageKey(state.activeBlock.passage) === passageKey([first, second]);
    return destination === state.guardRoomId || blocked ? [] : [destination];
  });

const guardPaths = (state: FootprintsState) => {
  const paths: string[][] = [[]];
  const walk = (roomId: string, path: string[]) => {
    if (path.length === 2) return;
    for (const passage of state.layout.passages) {
      const [first, second] = passage;
      if (first !== roomId && second !== roomId) continue;
      if (
        state.activeBlock
        && passageKey(state.activeBlock.passage) === passageKey(passage)
      ) continue;
      const next = first === roomId ? second : first;
      if (path.includes(next) || next === state.guardRoomId) continue;
      const nextPath = [...path, next];
      paths.push(nextPath);
      walk(next, nextPath);
    }
  };
  walk(state.guardRoomId, []);
  return paths;
};

export function projectPlayer(
  state: FootprintsState,
  context: ProjectionContext,
  privateState: FootprintsPrivatePlayerState = { revision: 0, roomMarks: {} },
): MidnightFootprintsPlayerRoomView {
  const publicView = projectPublic(state, context);
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  if (!self) throw new Error("Player projection requires a player viewer");
  const isIntruder = self.seat === state.intruderSeat;
  const ownVote = state.rematchVotes.find((vote) => vote.seat === self.seat)?.vote;
  return {
    ...publicView,
    projection: "player",
    self: isIntruder
      ? {
          seat: self.seat,
          role: "INTRUDER",
          ready: state.readySeats.includes(self.seat),
          legalActions: legalActions(state, self.seat, context.connectedSeats),
          ownRematchVote: ownVote,
          entryRoomIds: [...state.layout.entranceRoomIds],
          currentRoomId: state.intruderRoomId,
          initialEntryRoomId: state.initialEntryRoomId ?? state.selectedEntryRoomId,
          legalMoveRoomIds: legalIntruderMoves(state),
          hideRemaining: state.hideRemaining,
          stolenTargetId: state.stolenTargetId,
          path: [...state.intruderPath],
        }
      : {
          seat: self.seat,
          role: "GUARD",
          ready: state.readySeats.includes(self.seat),
          legalActions: legalActions(state, self.seat, context.connectedSeats),
          ownRematchVote: ownVote,
          privateStateRevision: privateState.revision,
          roomMarks: { ...privateState.roomMarks },
          legalGuardPaths: guardPaths(state),
          blockablePassages: state.layout.passages
            .filter(([first, second]) =>
              first === state.guardRoomId || second === state.guardRoomId
            )
            .map((passage) => [...passage] as [string, string]),
        },
  };
}
