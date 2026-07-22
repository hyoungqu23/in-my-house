"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-auth";
import { DoorClosed } from "./icons";

type RoomResponse = { code: string; joinUrl: string; displayUrl: string };

export function CreateRoomButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setLoading(true);
    setError("");
    try {
      const room = await apiFetch<RoomResponse>("/api/rooms", { method: "POST" });
      window.localStorage.setItem(`in-my-house:links:${room.code}`, JSON.stringify(room));
      window.location.assign(room.joinUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "방을 만들지 못했습니다.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="primary-button" onClick={create} disabled={loading}>
        <DoorClosed size={20} aria-hidden="true" />
        {loading ? "불을 끄는 중…" : "불을 끄고 시작하기"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
