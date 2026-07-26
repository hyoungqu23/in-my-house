import { z } from "zod";
import { requireActor } from "@/modules/auth/server";
import { setFootprintsRoomMarks } from "@/modules/room/room-service";
import { apiError, readJson } from "@/shared/http/request";

export const runtime = "nodejs";

const schema = z.object({
  expectedPrivateRevision: z.number().int().nonnegative(),
  roomMarks: z.record(
    z.string().min(1).max(128),
    z.enum(["LIKELY", "EXCLUDED", "UNKNOWN"]),
  ),
}).strict();

export async function PUT(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const actor = await requireActor(request);
    const body = schema.parse(await readJson(request));
    return Response.json(await setFootprintsRoomMarks({
      code,
      userId: actor.userId,
      ...body,
    }));
  } catch (error) {
    return apiError(error);
  }
}
