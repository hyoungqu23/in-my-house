import { z } from "zod";
import { requireActor } from "@/modules/auth/server";
import { GAME_IDS } from "@/modules/game-catalog/games";
import { createRoom } from "@/modules/room/room-service";
import { apiError, readJson } from "@/shared/http/request";

export const runtime = "nodejs";

const requestSchema = z.object({
  gameId: z.enum(GAME_IDS),
});

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const { gameId } = requestSchema.parse(await readJson(request));
    const requestOrigin = request.headers.get("origin");
    let origin = new URL(request.url).origin;
    if (requestOrigin) {
      const candidate = new URL(requestOrigin);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") origin = candidate.origin;
    }
    return Response.json(await createRoom(actor.userId, origin, gameId), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
