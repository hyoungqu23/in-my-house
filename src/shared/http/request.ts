import "server-only";

import { ZodError } from "zod";
import { DomainError } from "@/shared/errors/domain-error";

const statuses: Record<string, number> = {
  ROOM_NOT_FOUND: 404,
  GAME_NOT_FOUND: 404,
  GAME_NOT_AVAILABLE: 409,
  UNAUTHORIZED: 401,
  AUTH_NOT_CONFIGURED: 503,
  ROOM_FULL: 409,
  GAME_ALREADY_STARTED: 409,
  MIN_PLAYERS: 409,
  NICKNAME_TAKEN: 409,
  ACTION_ID_REUSED: 409,
  STALE_VERSION: 409,
  ACTION_TOO_EARLY: 409,
  GAME_PAUSED: 409,
  ROOM_EXPIRED: 410,
  INVALID_PHASE: 422,
  NOT_YOUR_TURN: 403,
};

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json({ code: "INVALID_REQUEST", message: "요청 형식이 올바르지 않습니다." }, { status: 422 });
  }
  if (error instanceof DomainError) {
    return Response.json({ code: error.code, message: error.message }, { status: statuses[error.code] ?? 422 });
  }
  console.error("request_failed", error instanceof Error ? error.message : "unknown");
  return Response.json({ code: "INTERNAL_ERROR", message: "잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new DomainError("INVALID_CONTENT_TYPE", "JSON 요청이 필요합니다.");
  }
  const text = await request.text();
  if (text.length > 16_384) throw new DomainError("REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DomainError("INVALID_JSON", "올바른 JSON 요청이 필요합니다.");
  }
}

export function displayTokenFrom(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Display ") ? value.slice("Display ".length) : undefined;
}
