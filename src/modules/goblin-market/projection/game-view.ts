import type { GoblinMarketPlayerRoomView, GoblinMarketPublicRoomView } from "@/modules/room/contracts";
import { legalMarketActions, marketActingSeats, marketTurnSeat } from "../domain/reducer";
import { marketRules } from "../domain/content";
import { marketAssets, marketRent, ownedShops } from "../domain/rules";
import type { MarketState } from "../domain/types";

type Context = { code: string; version: number; now: number; status: "playing" | "finished"; hostUserId: string; viewerUserId?: string; display?: boolean; connectedSeats: number[] };
export function projectMarketPublic(state: MarketState, context: Context): GoblinMarketPublicRoomView {
  const self = state.players.find(player => player.userId === context.viewerUserId), host = context.hostUserId === context.viewerUserId;
  return {
    projection: "public", room: { code: context.code, gameId: "goblin-market", status: context.status, version: context.version },
    serverNow: new Date(context.now).toISOString(), phase: state.phase, phaseKey: state.phaseKey, rulesVersion: state.rulesVersion,
    boardSize: marketRules(state.rulesVersion).size, nights: marketRules(state.rulesVersion).nights, monopolySize: marketRules(state.rulesVersion).monopolySize,
    phaseEndsAt: state.phaseEndsAt === undefined ? undefined : new Date(state.phaseEndsAt).toISOString(),
    night: state.night, turnSeat: marketTurnSeat(state), order: [...state.order], actingSeats: marketActingSeats(state),
    trend: state.trends[state.night - 1], nextTrend: state.trends[state.night],
    viewer: { roles: [...(context.display ? ["DISPLAY" as const] : []), ...(host ? ["HOST" as const] : []), ...(self ? ["PLAYER" as const] : [])], playerSeat: self?.seat, legalAdministrativeActions: host && state.phase === "GAME_OVER" ? ["START_REMATCH"] : [] },
    players: state.players.map(player => ({ seat: player.seat, nickname: player.nickname, cash: player.cash, position: player.position,
      assets: marketAssets(state, player), handCount: player.hand.length, connected: context.connectedSeats.includes(player.seat), isHost: player.userId === context.hostUserId })),
    shops: state.shops.map(shop => ({ ...shop, rent: marketRent(state, shop) })),
    discard: state.discard.map(card => card.kind), deckCount: state.deck.length,
    duel: state.duel ? { visitorSeat: state.duel.visitorSeat, ownerSeat: state.duel.ownerSeat, tile: state.duel.tile, originalRent: state.duel.originalRent, committedSeats: Object.keys(state.duel.choices).map(Number) } : undefined,
    payment: state.payment ? { ...state.payment } : undefined,
    lastRoll: state.lastRoll ? structuredClone(state.lastRoll) : undefined,
    lastDuel: state.lastDuel ? { ...state.lastDuel } : undefined,
    log: state.log.map(event => ({ ...event })), result: state.result ? structuredClone(state.result) : undefined,
  };
}
export function projectMarketPlayer(state: MarketState, context: Context): GoblinMarketPlayerRoomView {
  const player = state.players.find(player => player.userId === context.viewerUserId);
  if (!player) throw new Error("Player projection requires a player viewer");
  const duel = state.duel, visitor = duel?.visitorSeat === player.seat;
  const visited = state.shops.find(shop => shop.tile === duel?.tile);
  const exchangeTiles = visitor && visited ? ownedShops(state, player.seat).filter(shop => shop.level === visited.level).map(shop => shop.tile) : [];
  return { ...projectMarketPublic(state, context), projection: "player", self: {
    seat: player.seat, hand: player.hand.map(card => ({ ...card })),
    legalActions: legalMarketActions(state, player.seat), exchangeTiles,
    legalCardIds: state.phase === "MARKET_DUEL" && legalMarketActions(state, player.seat).length ? player.hand.filter(card => visitor ? card.kind === "H" || card.kind === "C" && exchangeTiles.length > 0 : card.kind === "W" || card.kind === "M").map(card => card.id) : [],
    buyTiles: state.phase === "MARKET_BUY" && marketTurnSeat(state) === player.seat ? [...state.buyTiles] : [],
    choice: state.phase === "MARKET_DUEL" && duel?.choices[player.seat] ? { ...duel.choices[player.seat] } : undefined,
  } };
}
