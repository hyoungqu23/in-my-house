import { requireActor } from "@/modules/auth/server";
import { rotateToken } from "@/modules/room/room-service";
import { apiError } from "@/shared/http/request";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const actor = await requireActor(request);
    return Response.json(await rotateToken({ code, userId: actor.userId, kind: "display", origin: new URL(request.url).origin }));
  } catch (error) {
    return apiError(error);
  }
}
