import { z } from "zod";
const base = { phaseKey: z.string().min(1).max(200) };
const tile = z.number().int().min(0).max(27);
const cardId = z.string().min(1).max(128);
export const marketActionSchemas = [
  z.object({ ...base, type: z.literal("MARKET_ROLL") }).strict(),
  z.object({ ...base, type: z.literal("MARKET_BUY"), tile: tile.nullable() }).strict(),
  z.object({ ...base, type: z.literal("MARKET_PORTAL"), tile }).strict(),
  z.object({ ...base, type: z.literal("MARKET_DUEL"), cardId: cardId.nullable(), targetTile: tile.optional() }).strict(),
  z.object({ ...base, type: z.literal("MARKET_DISCARD"), cardId }).strict(),
  z.object({ ...base, type: z.literal("MARKET_SELL"), tile }).strict(),
  z.object({ ...base, type: z.literal("MARKET_UPGRADE"), tile: tile.nullable() }).strict(),
] as const;
