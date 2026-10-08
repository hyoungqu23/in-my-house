import { legalActions } from "../domain/reducer";
import { forestLegalVisitTargetSeats, forestNeighborSeats, forestStayHearts, forestVisitOptions, legalForestPlacementHexIds, scoreForestPlayer } from "../domain/rules";
import { connectedForestRules } from "../domain/content";
import type { ConnectedForestState } from "../domain/types";
import type { ConnectedForestPlayerRoomView, ConnectedForestPublicRoomView } from "@/modules/room/contracts";

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
const timestamp = (value: number | undefined) => value === undefined ? undefined : new Date(value).toISOString();

export function projectPublic(state: ConnectedForestState, context: ProjectionContext): ConnectedForestPublicRoomView {
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  const isHost = context.viewerUserId === context.hostUserId;
  return {
    projection: "public",
    room: { code: context.code, gameId: "connected-forest", status: context.status, version: context.version },
    serverNow: new Date(context.now).toISOString(),
    phase: state.phase,
    rulesVersion: state.rulesVersion,
    seasonIndex: state.seasonIndex,
    pickIndex: state.pickIndex,
    passDirection: state.passDirection,
    phaseKey: state.phaseKey,
    phaseEndsAt: timestamp(state.phaseEndsAt),
    viewer: {
      roles: [...(context.display ? ["DISPLAY" as const] : []), ...(isHost ? ["HOST" as const] : []), ...(self ? ["PLAYER" as const] : [])],
      playerSeat: self?.seat,
      legalAdministrativeActions: isHost && state.phase === "GAME_OVER" ? ["START_REMATCH"] : [],
    },
    players: state.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      connected: context.connectedSeats.includes(player.seat),
      isHost: player.userId === context.hostUserId,
      board: structuredClone(player.board),
      figures: structuredClone(player.figures),
      score: scoreForestPlayer(state, player),
      locked: Boolean(state.draftSubmissions[player.seat]),
      visitSelected: Object.hasOwn(state.visitSelections, player.seat),
    })),
    neighborPaths: structuredClone(state.neighborPaths),
    seasonVisitResults: state.phase === "SEASON_REVEAL" || state.phase === "GAME_OVER" ? structuredClone(state.seasonVisitResults) : [],
    pause: state.pause ? {
      disconnectedSeats: [...state.pause.disconnectedSeats],
      pausedAt: new Date(state.pause.pausedAt).toISOString(),
      forfeitClaimAt: new Date(state.pause.forfeitClaimAt).toISOString(),
    } : undefined,
    result: state.result ? structuredClone(state.result) : undefined,
  };
}

export function projectPlayer(state: ConnectedForestState, context: ProjectionContext): ConnectedForestPlayerRoomView {
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  if (!self) throw new Error("Player projection requires a player viewer");
  const pick = state.draftSubmissions[self.seat];
  const queue = state.visitQueues[self.seat];
  const visit = state.phase === "SEASON_VISIT_RESPOND" ? queue?.visits[queue.currentIndex] : undefined;
  const options = visit ? forestVisitOptions(state, visit) : { stayHexIds: [], canWalk: false };
  const actions = legalActions(state, self.seat, context.connectedSeats).filter((action) => action !== "CLAIM_FORFEIT"
    || (state.pause && context.now >= state.pause.forfeitClaimAt && !state.pause.disconnectedSeats.includes(self.seat)));
  return {
    ...projectPublic(state, context),
    projection: "player",
    self: {
      seat: self.seat,
      hand: structuredClone(self.hand),
      activeAnimals: structuredClone(self.activeAnimals),
      goldenAcornAvailable: self.goldenAcornAvailable,
      animalRefreshAvailable: self.animalRefreshAvailable,
      welcomedThisSeason: self.welcomedThisSeason,
      legalActions: actions,
      legalPlacementHexIds: actions.includes("LOCK_TERRAIN_PICK") ? legalForestPlacementHexIds(self) : [],
      lockedPick: pick ? { cardId: pick.cardId, hexId: pick.hexId, useGoldenAcorn: pick.useGoldenAcorn, acornTerrain: pick.acornTerrain, refreshAnimalCardId: pick.refreshAnimalCardId, welcome: structuredClone(pick.welcome) } : undefined,
      neighborSeats: forestNeighborSeats(state, self.seat),
      visitTargetSeats: forestLegalVisitTargetSeats(state, self.seat),
      visitAnimalCardIds: self.figures.flatMap((figure) => figure.kind === "RESIDENT" && !figure.visited ? [figure.animalCardId] : []),
      visitSelection: structuredClone(state.visitSelections[self.seat]),
      currentVisit: visit ? structuredClone(visit) : undefined,
      visitQueueIndex: queue?.currentIndex ?? 0,
      visitQueueTotal: queue?.visits.length ?? 0,
      respondEndsAt: visit ? timestamp(queue!.currentDeadlineAt) : undefined,
      stayHexIds: [...options.stayHexIds],
      canWalk: options.canWalk,
      stayHearts: visit ? forestStayHearts(self, visit.speciesId, connectedForestRules(state.rulesVersion)) : undefined,
    },
  };
}
