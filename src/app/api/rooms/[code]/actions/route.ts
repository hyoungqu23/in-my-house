import { z } from "zod";
import { innActionSchemas } from "@/modules/moonlit-inn/domain/action-schema";
import { FOREST_ANIMAL_CARDS } from "@/modules/connected-forest/domain/content";
import { requireActor } from "@/modules/auth/server";
import { applyRoomAction } from "@/modules/room/room-service";
import { apiError, readJson } from "@/shared/http/request";

export const runtime = "nodejs";

const forestAnimalId = z.enum(FOREST_ANIMAL_CARDS.map((card) => card.id));

const actionSchema = z.discriminatedUnion("type", [
  ...innActionSchemas,
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
  z.object({ type: z.literal("MARK_READY") }).strict(),
  z.object({ type: z.literal("CONFIRM_MODULE"), moduleId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("SELECT_ENTRY"), roomId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("MOVE_INTRUDER"), roomId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("HIDE") }).strict(),
  z.object({ type: z.literal("STEAL"), targetId: z.enum(["silver-coins", "starlight-necklace", "golden-cat"]) }).strict(),
  z.object({ type: z.literal("MOVE_AND_SEARCH"), path: z.array(z.string().min(1).max(128)).max(2) }).strict(),
  z.object({
    type: z.literal("BLOCK_PASSAGE"),
    passage: z.tuple([z.string().min(1).max(128), z.string().min(1).max(128)]),
  }).strict(),
  z.object({ type: z.literal("ACK_ROUND_RESULT") }).strict(),
  z.object({ type: z.literal("CAST_REMATCH_VOTE"), vote: z.enum(["REMATCH", "END"]) }).strict(),
  z.object({ type: z.literal("CLAIM_FORFEIT") }).strict(),
  z.object({
    type: z.literal("LOCK_TERRAIN_PICK"),
    cardId: z.string().min(1).max(128),
    hexId: z.string().min(1).max(128),
    useGoldenAcorn: z.boolean(),
    acornTerrain: z.enum(["TREE", "WATER", "FLOWER", "ROCK", "MUSHROOM"]).optional(),
    refreshAnimalCardId: forestAnimalId.optional(),
    welcome: z.object({
      animalCardId: forestAnimalId,
      originHexId: z.string().min(1).max(128),
      rotation: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      residentHexId: z.string().min(1).max(128),
    }).strict().optional(),
  }).strict(),
  z.object({
    type: z.literal("CHOOSE_SEASON_VISIT"),
    animalCardId: forestAnimalId,
    targetSeat: z.number().int().positive(),
  }).strict(),
  z.object({ type: z.literal("RESOLVE_VISIT"), visitId: z.string().min(1).max(128), choice: z.enum(["STAY", "WALK"]), targetHexId: z.string().min(1).max(128).optional() }).strict(),
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
