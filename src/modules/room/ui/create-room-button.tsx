"use client";

import { useState } from "react";
import type { GameId } from "@/modules/game-catalog/games";
import { roomApiFetch } from "@/modules/room/client/room-api";
import { DoorClosed } from "@/shared/ui/icons";

type RoomResponse = { code: string; gameId: GameId; joinUrl: string; displayUrl: string };

export function CreateRoomButton({ gameId, label }: { gameId: GameId; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setLoading(true);
    setError("");
    try {
      const room = await roomApiFetch<RoomResponse>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ gameId }),
      });
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
        {loading ? "방을 여는 중…" : label}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
