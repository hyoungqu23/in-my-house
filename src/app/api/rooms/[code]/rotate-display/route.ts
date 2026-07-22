import { requireActor } from "@/server/auth";
import { apiError } from "@/server/http";
import { rotateToken } from "@/server/room-service";

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
