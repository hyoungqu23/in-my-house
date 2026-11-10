export type MarketCardKind = "C" | "H" | "M" | "W";
export type MarketRulesVersion = "mvp-1" | "mvp-2";
export type MarketCard = { id: string; kind: MarketCardKind };
export type MarketCategory = "food" | "goods" | "fortune" | "fun";
export type MarketPhase = "MARKET_ROLL" | "MARKET_DISCARD" | "MARKET_BUY" | "MARKET_PORTAL" | "MARKET_DUEL" | "MARKET_SETTLE" | "MARKET_UPGRADE" | "GAME_OVER";
export type MarketPlayer = { seat: number; userId: string; nickname: string; cash: number; position: number; hand: MarketCard[] };
export type MarketShop = { tile: number; category: MarketCategory; ownerSeat: number | null; level: 0 | 1 };
export type MarketChoice = { cardId: string | null; targetTile?: number };
export type MarketDuel = { visitorSeat: number; ownerSeat: number; tile: number; originalRent: number; choices: Record<number, MarketChoice> };
export type MarketDuelResult = {
  visitorSeat: number; ownerSeat: number; tile: number; originalRent: number;
  visitorCard: MarketCardKind | null; ownerCard: MarketCardKind | null;
  exchanged: boolean; targetTile?: number; due: number; paid: number; settled: boolean;
};
export type MarketResult = { scores: Array<{ seat: number; cash: number; shops: number; total: number }>; winnerSeats: number[] };
export type MarketState = {
  rulesVersion: MarketRulesVersion; matchId: string; step: number; phaseKey: string; phase: MarketPhase; phaseEndsAt?: number;
  night: number; turnIndex: number; order: number[]; trends: MarketCategory[];
  players: MarketPlayer[]; shops: MarketShop[]; deck: MarketCard[]; discard: MarketCard[];
  discardQueue: number[]; discardThen: "ROLL" | "UPGRADE";
  buyTiles: number[]; duel?: MarketDuel;
  payment?: { fromSeat: number; toSeat: number; due: number };
  lastRoll?: { seat: number; dice: [number, number]; from: number; to: number };
  lastDuel?: MarketDuelResult;
  log: Array<{ id: number; night: number; text: string }>;
  result?: MarketResult;
};
export type MarketAction = { phaseKey: string } & (
  | { type: "MARKET_ROLL" }
  | { type: "MARKET_BUY"; tile: number | null }
  | { type: "MARKET_PORTAL"; tile: number }
  | { type: "MARKET_DUEL"; cardId: string | null; targetTile?: number }
  | { type: "MARKET_DISCARD"; cardId: string }
  | { type: "MARKET_SELL"; tile: number }
  | { type: "MARKET_UPGRADE"; tile: number | null }
);
export type MarketCommand = { [K in MarketAction["type"]]: Omit<Extract<MarketAction, { type: K }>, "phaseKey"> }[MarketAction["type"]];
export type MarketContext = { now: number; randomIndex: (max: number) => number; connectedSeats?: number[] };
