import { z } from "zod";
import { requireActor } from "@/server/auth";
import { apiError, readJson } from "@/server/http";
import { joinRoom } from "@/server/room-service";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(4).max(12),
  joinToken: z.string().min(16).max(128),
  nickname: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const body = schema.parse(await readJson(request));
    return Response.json(await joinRoom({ ...body, userId: actor.userId }));
  } catch (error) {
    return apiError(error);
  }
}
