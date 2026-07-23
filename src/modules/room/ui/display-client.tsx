"use client";

import { useCallback, useEffect, useState } from "react";
import type { DarkHousePublicRoomView, PublicRoomView, SuspiciousInvitePublicRoomView } from "@/modules/room/contracts";
import { PublicBoard } from "@/modules/dark-house/ui/public-board";
import { SuspiciousInvitePublicBoard } from "@/modules/suspicious-invite/ui/public-board";

export function DisplayClient({ code }: { code: string }) {
  const [token, setToken] = useState("");
  const [view, setView] = useState<PublicRoomView>();
  const [error, setError] = useState("");

  useEffect(() => {
    const key = `in-my-house:display:${code}`;
    const fragment = window.location.hash.slice(1);
    if (fragment) window.sessionStorage.setItem(key, fragment);
    const restored = fragment || window.sessionStorage.getItem(key) || "";
    queueMicrotask(() => setToken(restored));
    window.history.replaceState(null, "", window.location.pathname);
  }, [code]);

  const load = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/rooms/${code}/view?mode=public`, {
      headers: { Authorization: `Display ${token}` },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) { setError(data.message ?? "공개 화면을 열 수 없습니다."); return; }
    setView(data);
    setError("");
  }, [code, token]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, view?.phase === "REVEALING" ? 500 : 2_000);
    return () => window.clearInterval(timer);
  }, [load, view?.phase]);
  useEffect(() => {
    if (!token) return;
    const beat = () => fetch(`/api/rooms/${code}/heartbeat`, { method: "POST", headers: { Authorization: `Display ${token}` } });
    const timer = window.setInterval(beat, 20_000);
    return () => window.clearInterval(timer);
  }, [code, token]);

  if (error) return <main className="room-loading"><p>{error}</p></main>;
  if (!view) return <main className="room-loading"><span className="loader" /><p>공개 화면을 준비하는 중…</p></main>;
  if (view.phase === "LOBBY") {
    return <main className="display-page"><section className="board display-lobby"><span className="room-code">ROOM {view.room.code}</span><h1>플레이어를 기다리는 중</h1><strong>{view.players.length}명 입장</strong></section></main>;
  }
  const isDarkHouse = (candidate: DarkHousePublicRoomView | SuspiciousInvitePublicRoomView): candidate is DarkHousePublicRoomView =>
    candidate.room.gameId === "dark-house";
  return (
    <main className="display-page">
      {isDarkHouse(view) ? <PublicBoard view={view} /> : <SuspiciousInvitePublicBoard view={view} />}
    </main>
  );
}
