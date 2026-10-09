"use client";

import { getAuthHeaders } from "@/modules/auth/client";

export class RoomApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "RoomApiError";
  }
}

export async function roomApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = await getAuthHeaders();
  Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new RoomApiError(data.code ?? "REQUEST_FAILED", response.status, data.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}
