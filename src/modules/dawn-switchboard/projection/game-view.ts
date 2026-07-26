import { legalActions } from "@/modules/dawn-switchboard/domain/reducer";
import type { SwitchboardState } from "@/modules/dawn-switchboard/domain/types";
import type {
  DawnSwitchboardPlayerRoomView,
  DawnSwitchboardPublicRoomView,
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

export function projectPublic(
  state: SwitchboardState,
  context: ProjectionContext,
): DawnSwitchboardPublicRoomView {
  const panel = state.panels[state.panelIndex];
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  const roles: DawnSwitchboardPublicRoomView["viewer"]["roles"] = [];
  if (context.display) roles.push("DISPLAY");
  if (context.viewerUserId === context.hostUserId) roles.push("HOST");
  if (self) roles.push("PLAYER");

  return {
    projection: "public",
    room: {
      code: context.code,
      gameId: "dawn-switchboard",
      status: context.status,
      version: context.version,
    },
    serverNow: new Date(context.now).toISOString(),
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt ? new Date(state.phaseEndsAt).toISOString() : undefined,
    deadlineAt: state.deadlineAt ? new Date(state.deadlineAt).toISOString() : undefined,
    viewer: {
      roles,
      playerSeat: self?.seat,
      legalAdministrativeActions: context.viewerUserId === context.hostUserId && state.phase === "GAME_OVER"
        ? ["START_REMATCH"]
        : [],
    },
    stage: state.panelIndex + 1,
    stageCount: state.panels.length,
    panel: {
      title: panel.title,
      difficulty: panel.difficulty,
      slotCount: panel.solutionModuleIds.length,
    },
    fusesRemaining: state.fusesRemaining,
    activeSeat: state.phase === "SOLVING" ? state.turnOrder[state.activeTurnIndex] : undefined,
    players: state.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      connected: context.connectedSeats.includes(player.seat),
      isHost: player.userId === context.hostUserId,
      ready: state.readySeats.includes(player.seat),
      active: state.phase === "SOLVING" && state.turnOrder[state.activeTurnIndex] === player.seat,
      clueCount: panel.cluesBySeat[player.seat]?.length ?? 0,
      cluesExposed: state.exposedClueSeats.includes(player.seat),
    })),
    modules: panel.modules.map((module) => ({ ...module })),
    lockedSequence: state.lockedModuleIds
      .map((moduleId) => panel.modules.find((module) => module.id === moduleId))
      .filter((module) => module !== undefined)
      .map((module) => ({ ...module })),
    rejectedModuleIds: [...state.rejectedModuleIds],
    exposedClues: state.exposedClueSeats.map((seat) => ({
      seat,
      entries: (panel.cluesBySeat[seat] ?? []).map((clue) => clue.text),
    })),
    lastAttempt: state.lastAttempt ? { ...state.lastAttempt } : undefined,
    result: state.result ? { ...state.result } : undefined,
  };
}

export function projectPlayer(
  state: SwitchboardState,
  context: ProjectionContext,
): DawnSwitchboardPlayerRoomView {
  const publicView = projectPublic(state, context);
  const self = state.players.find((player) => player.userId === context.viewerUserId);
  if (!self) throw new Error("Player projection requires a player viewer");
  const panel = state.panels[state.panelIndex];
  return {
    ...publicView,
    projection: "player",
    self: {
      seat: self.seat,
      ready: state.readySeats.includes(self.seat),
      clues: (panel.cluesBySeat[self.seat] ?? []).map((clue) => clue.text),
      legalActions: legalActions(state, self.seat, context.connectedSeats),
    },
  };
}
