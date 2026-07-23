import { requireActor } from "@/modules/auth/server";
import { getRoomView } from "@/modules/room/room-service";
import { apiError, displayTokenFrom } from "@/shared/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "private" ? "private" : "public";
    const displayToken = displayTokenFrom(request);
    const actor = displayToken ? undefined : await requireActor(request);
    const view = await getRoomView({ code, userId: actor?.userId, displayToken, mode });
    return Response.json(view, {
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    return apiError(error);
  }
}
