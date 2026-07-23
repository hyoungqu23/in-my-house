import { z } from "zod";
import { requireActor } from "@/modules/auth/server";
import { joinRoom } from "@/modules/room/room-service";
import { apiError, readJson } from "@/shared/http/request";

export const runtime = "nodejs";

const schema = z.object({
  joinToken: z.string().min(16).max(128),
  nickname: z.string().min(1).max(64),
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const actor = await requireActor(request);
    const body = schema.parse(await readJson(request));
    return Response.json(await joinRoom({ ...body, code, userId: actor.userId }));
  } catch (error) {
    return apiError(error);
  }
}
