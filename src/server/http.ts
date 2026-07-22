import "server-only";

import { GameRuleError } from "@/features/dark-house/types";

const statuses: Record<string, number> = {
  ROOM_NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  AUTH_NOT_CONFIGURED: 503,
  ROOM_FULL: 409,
  GAME_ALREADY_STARTED: 409,
  MIN_PLAYERS: 409,
  NICKNAME_TAKEN: 409,
  ACTION_ID_REUSED: 409,
  STALE_VERSION: 409,
  ACTION_TOO_EARLY: 409,
  ROOM_EXPIRED: 410,
  INVALID_PHASE: 422,
  NOT_YOUR_TURN: 403,
};

export function apiError(error: unknown) {
  if (error instanceof GameRuleError) {
    return Response.json({ code: error.code, message: error.message }, { status: statuses[error.code] ?? 422 });
  }
  console.error("request_failed", error instanceof Error ? error.message : "unknown");
  return Response.json({ code: "INTERNAL_ERROR", message: "잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new GameRuleError("INVALID_CONTENT_TYPE", "JSON 요청이 필요합니다.");
  }
  const text = await request.text();
  if (text.length > 16_384) throw new GameRuleError("REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
  return JSON.parse(text) as T;
}

export function displayTokenFrom(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Display ") ? value.slice("Display ".length) : undefined;
}
