import { z } from "zod";
const base = { phaseKey: z.string().min(1).max(200), revision: z.number().int().nonnegative() };
const id = z.string().min(1).max(128);
const offerId = z.string().min(1).max(256);
const position = z.number().int().min(-1).max(5);
const kind = z.enum(["guest", "furniture"]);
export const innActionSchemas = [
  z.object({ ...base, type: z.literal("INN_PICK"), bundleId: id.nullable() }).strict(),
  z.object({ ...base, type: z.literal("INN_MOVE"), kind, itemId: id, to: position }).strict(),
  z.object({ ...base, type: z.literal("INN_READY"), ready: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal("INN_OFFER"), targetSeat: z.number().int().positive(), kind, outgoingId: id, incomingId: id, receiveAt: position }).strict(),
  z.object({ ...base, type: z.literal("INN_ACCEPT"), offerId, receiveAt: position }).strict(),
  z.object({ ...base, type: z.literal("INN_DECLINE"), offerId }).strict(),
  z.object({ ...base, type: z.literal("INN_SKIP_REVEAL") }).strict(),
  z.object({ ...base, type: z.literal("INN_END_DISCONNECTED") }).strict(),
] as const;
