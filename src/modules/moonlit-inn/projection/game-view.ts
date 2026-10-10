import type { MoonlitInnPlayerRoomView, MoonlitInnPublicRoomView } from "@/modules/room/contracts";
import { legalInnActions } from "../domain/reducer";
import { scoreInn } from "../domain/rules";
import type { InnState } from "../domain/types";

type Context = { code: string; version: number; now: number; status: "playing" | "finished"; hostUserId: string; viewerUserId?: string; display?: boolean; connectedSeats: number[] };
export function projectInnPublic(state: InnState, context: Context): MoonlitInnPublicRoomView {
  const self = state.players.find(player => player.userId === context.viewerUserId);
  const host = context.hostUserId === context.viewerUserId;
  const night = ["INN_REVEAL", "INN_NIGHT", "GAME_OVER"].includes(state.phase);
  return {
    projection: "public", room: { code: context.code, gameId: "moonlit-inn", status: context.status, version: context.version },
    serverNow: new Date(context.now).toISOString(), phase: state.phase, phaseKey: state.phaseKey,
    rulesVersion: state.rulesVersion, draftRound: state.draftRound,
    weather: night ? state.weather : undefined, phaseEndsAt: state.phaseEndsAt === undefined ? undefined : new Date(state.phaseEndsAt).toISOString(),
    viewer: { roles: [...(context.display ? ["DISPLAY" as const] : []), ...(host ? ["HOST" as const] : []), ...(self ? ["PLAYER" as const] : [])], playerSeat: self?.seat, legalAdministrativeActions: host && state.phase === "GAME_OVER" ? ["START_REMATCH"] : [] },
    players: state.players.map(player => ({
      seat: player.seat, nickname: player.nickname, connected: context.connectedSeats.includes(player.seat), isHost: player.userId === context.hostUserId,
      guests: structuredClone(player.guests), furniture: structuredClone(player.furniture), revision: player.revision,
      ready: player.ready, actionsLeft: player.actionsLeft, traded: player.traded, picked: Boolean(player.pickedId),
      forecast: { roof: scoreInn(player, "roof", state.rulesVersion), garden: scoreInn(player, "garden", state.rulesVersion) }, score: night ? scoreInn(player, state.weather, state.rulesVersion) : undefined,
    })),
    offers: state.phase === "INN_NIGHT" ? structuredClone(state.offers) : [], trades: structuredClone(state.trades),
    pause: state.pause ? { disconnectedSeats: [...state.pause.disconnectedSeats], pausedAt: new Date(state.pause.pausedAt).toISOString(), forfeitClaimAt: new Date(state.pause.forfeitClaimAt).toISOString() } : undefined,
    result: state.result ? structuredClone(state.result) : undefined,
  };
}
export function projectInnPlayer(state: InnState, context: Context): MoonlitInnPlayerRoomView {
  const self = state.players.find(player => player.userId === context.viewerUserId);
  if (!self) throw new Error("Player projection requires a player viewer");
  return { ...projectInnPublic(state, context), projection: "player", self: {
    seat: self.seat, revision: self.revision, hand: state.phase === "INN_DRAFT" ? structuredClone(self.hand) : [],
    pickedId: self.pickedId, legalActions: legalInnActions(state, self.seat),
  } };
}
