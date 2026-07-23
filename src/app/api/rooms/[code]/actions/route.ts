import { z } from "zod";
import { requireActor } from "@/modules/auth/server";
import type { ActionRequest } from "@/modules/room/contracts";
import { applyRoomAction } from "@/modules/room/room-service";
import { apiError, readJson } from "@/shared/http/request";

export const runtime = "nodejs";

const requestSchema = z.object({
  clientActionId: z.string().min(8).max(128),
  expectedVersion: z.number().int().nonnegative(),
  action: z.object({ type: z.string() }).passthrough(),
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const actor = await requireActor(request);
    const parsed = requestSchema.parse(await readJson(request));
    return Response.json(await applyRoomAction({ code, userId: actor.userId, request: parsed as ActionRequest }));
  } catch (error) {
    return apiError(error);
  }
}
