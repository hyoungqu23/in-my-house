import { requireActor } from "@/server/auth";
import { apiError } from "@/server/http";
import { createRoom } from "@/server/room-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const requestOrigin = request.headers.get("origin");
    let origin = new URL(request.url).origin;
    if (requestOrigin) {
      const candidate = new URL(requestOrigin);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") origin = candidate.origin;
    }
    return Response.json(await createRoom(actor.userId, origin), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
