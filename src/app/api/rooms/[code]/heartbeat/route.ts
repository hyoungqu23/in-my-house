import { requireActor } from "@/modules/auth/server";
import { heartbeat } from "@/modules/room/room-service";
import { apiError, displayTokenFrom } from "@/shared/http/request";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const displayToken = displayTokenFrom(request);
    const actor = displayToken ? undefined : await requireActor(request);
    return Response.json(await heartbeat({ code, userId: actor?.userId, displayToken }));
  } catch (error) {
    return apiError(error);
  }
}
