import { z } from "zod";
import { requireActor } from "@/modules/auth/server";
import { applyRoomAction } from "@/modules/room/room-service";
import { apiError, readJson } from "@/shared/http/request";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START_GAME") }).strict(),
  z.object({ type: z.literal("START_REMATCH") }).strict(),
  z.object({ type: z.literal("PLACE_INITIAL_TOKEN"), tokenId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("PLACE_TOKEN"), tokenId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("OPEN_BID"), bid: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("RAISE_BID"), bid: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("PASS") }).strict(),
  z.object({ type: z.literal("USE_FLASHLIGHT_AND_RAISE"), targetSeat: z.number().int().positive(), bid: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("CHOOSE_REVEAL_TARGET"), targetSeat: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("SUBMIT_CLUE"), clues: z.array(z.string().max(64)).min(1).max(2) }).strict(),
  z.object({ type: z.literal("CAST_SUSPICION_VOTE"), targetSeat: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("GUESS_WORD"), wordId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("CAST_END_VOTE"), vote: z.enum(["CONTINUE", "END"]) }).strict(),
]);

const requestSchema = z.object({
  clientActionId: z.string().min(8).max(128),
  expectedVersion: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const actor = await requireActor(request);
    const parsed = requestSchema.parse(await readJson(request));
    return Response.json(await applyRoomAction({ code, userId: actor.userId, request: parsed }));
  } catch (error) {
    return apiError(error);
  }
}
