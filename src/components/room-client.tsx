"use client";

import { Copy, ExternalLink, MonitorUp, RefreshCw, Share2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameAction, PlayerRoomView, PublicRoomView } from "@/features/dark-house/types";
import { apiFetch, getAuthHeaders, getBrowserSupabase } from "@/lib/client-auth";
import { PlayerControls } from "./player-controls";
import { PublicBoard } from "./public-board";
import { QrCode } from "./qr-code";

type ViewMode = "private" | "public";
type RoomLinks = { code: string; joinUrl: string; displayUrl: string };

function isPlayerView(view: PublicRoomView): view is PlayerRoomView {
  return "privacyLocked" in view;
}

export function RoomClient({ code }: { code: string }) {
  const [mode, setMode] = useState<ViewMode>("private");
  const [view, setView] = useState<PublicRoomView>();
  const [links, setLinks] = useState<RoomLinks>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastPrivateActivity = useRef(0);

  const loadView = useCallback(async (requestedMode: ViewMode = mode) => {
    try {
      const next = await apiFetch<PublicRoomView>(`/api/rooms/${code}/view?mode=${requestedMode}`);
      setView(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "방 상태를 불러오지 못했습니다.");
    }
  }, [code, mode]);

  useEffect(() => {
    const stored = window.localStorage.getItem(`in-my-house:links:${code}`);
    queueMicrotask(() => {
      if (stored) setLinks(JSON.parse(stored));
      lastPrivateActivity.current = Date.now();
      void loadView(mode);
    });
  }, [code, loadView, mode]);

  useEffect(() => {
    const intervalMs = view?.phase === "REVEALING" ? 500 : 1_500;
    const timer = window.setInterval(() => void loadView(mode), intervalMs);
    return () => window.clearInterval(timer);
  }, [loadView, mode, view?.phase]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`room-events:${code}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_events", filter: `room_code=eq.${code}` }, () => {
        void loadView(mode);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [code, loadView, mode]);

  useEffect(() => {
    const heartbeat = async () => {
      try {
        const headers = await getAuthHeaders();
        await fetch(`/api/rooms/${code}/heartbeat`, { method: "POST", headers });
      } catch { /* polling reports recoverable errors */ }
    };
    void heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    return () => window.clearInterval(timer);
  }, [code]);

  useEffect(() => {
    const hideSecrets = () => {
      if (mode !== "private") return;
      setView(undefined);
      setMode("public");
    };
    const onVisibility = () => document.hidden && hideSecrets();
    const onActivity = () => { lastPrivateActivity.current = Date.now(); };
    const inactivity = window.setInterval(() => {
      if (mode === "private" && Date.now() - lastPrivateActivity.current >= 15_000) hideSecrets();
    }, 1_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.clearInterval(inactivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [mode]);

  async function switchMode(nextMode: ViewMode) {
    if (nextMode === mode) return;
    setView(undefined);
    setMode(nextMode);
    lastPrivateActivity.current = Date.now();
    await loadView(nextMode);
  }

  async function sendAction(action: GameAction | { type: "START_GAME" } | { type: "START_REMATCH" }) {
    if (!view) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ projection: PublicRoomView }>(`/api/rooms/${code}/actions`, {
        method: "POST",
        body: JSON.stringify({
          clientActionId: crypto.randomUUID(),
          expectedVersion: view.room.version,
          action,
        }),
      });
      setView(result.projection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "행동을 처리하지 못했습니다.");
      await loadView(mode);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!links) return;
    await navigator.clipboard.writeText(links.joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  if (!view) {
    return (
      <main className="room-loading">
        <span className="loader" aria-hidden="true" />
        <p>{error || "집 안의 불을 확인하는 중…"}</p>
        {error && <button className="secondary-button" onClick={() => loadView(mode)}><RefreshCw size={18} /> 다시 시도</button>}
      </main>
    );
  }

  const isHost = view.viewer.roles.includes("HOST");
  const playerView = isPlayerView(view) ? view : undefined;

  return (
    <main className="room-page">
      <nav className="mode-switcher" aria-label="화면 모드">
        <button className={mode === "private" ? "active" : ""} onClick={() => switchMode("private")} disabled={!view.viewer.roles.includes("PLAYER")}>
          내 화면
        </button>
        <button className={mode === "public" ? "active" : ""} onClick={() => switchMode("public")}>공개 화면</button>
      </nav>

      {view.phase === "LOBBY" ? (
        <Lobby view={view} links={links} isHost={isHost} busy={busy} copied={copied} onCopy={copyInvite} onStart={() => sendAction({ type: "START_GAME" })} />
      ) : mode === "private" && playerView ? (
        <div className="game-layout private-layout">
          <PlayerControls view={playerView} busy={busy} onAction={sendAction} />
          <MiniPublicSummary view={view} onOpen={() => switchMode("public")} />
        </div>
      ) : (
        <div className="game-layout">
          <PublicBoard view={view} />
          {view.phase === "GAME_OVER" && isHost && (
            <button className="primary-button rematch-button" disabled={busy} onClick={() => sendAction({ type: "START_REMATCH" })}>같은 사람들과 다시 하기</button>
          )}
        </div>
      )}

      {error && <div className="toast" role="alert">{error}</div>}
    </main>
  );
}

function Lobby({ view, links, isHost, busy, copied, onCopy, onStart }: {
  view: PublicRoomView; links?: RoomLinks; isHost: boolean; busy: boolean; copied: boolean; onCopy: () => void; onStart: () => void;
}) {
  return (
    <div className="lobby-layout">
      <section className="lobby-stage">
        <div className="eyebrow"><span /> THE HOUSE IS WAITING</div>
        <h1>빈 방을 믿지 마세요</h1>
        <p className="lobby-lead">모두 들어오면 호스트가 불을 끕니다. 각자의 화면은 다른 사람에게 보여주지 마세요.</p>
        <div className="lobby-code-block">
          <span>ROOM CODE</span>
          <strong>{view.room.code}</strong>
        </div>
        <div className="players-list">
          {view.players.map((player) => (
            <div className="lobby-player" key={player.seat}>
              <span className="player-index">{String(player.seat).padStart(2, "0")}</span>
              <strong>{player.nickname}</strong>
              <span className={player.connected ? "online" : "offline"}>{player.connected ? "준비됨" : "연결 끊김"}</span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 3 - view.players.length) }, (_, index) => (
            <div className="lobby-player empty" key={`empty-${index}`}><UsersRound size={18} /><span>플레이어를 기다리는 중</span></div>
          ))}
        </div>
        {isHost ? (
          <button className="primary-button" disabled={busy || view.players.filter((player) => player.connected).length < 3} onClick={onStart}>
            {busy ? "문을 잠그는 중…" : view.players.length < 3 ? `${3 - view.players.length}명 더 필요해요` : "모두 준비됨 · 게임 시작"}
          </button>
        ) : <p className="waiting-copy">호스트가 게임을 시작할 때까지 기다려 주세요.</p>}
      </section>

      {links && (
        <aside className="invite-panel">
          <div className="panel-heading"><Share2 size={19} /><h2>친구 초대</h2></div>
          <QrCode value={links.joinUrl} label="게임 참가 QR 코드" />
          <button className="secondary-button" onClick={onCopy}><Copy size={18} /> {copied ? "복사했습니다" : "초대 링크 복사"}</button>
          <a className="text-link" href={links.displayUrl} target="_blank" rel="noreferrer"><MonitorUp size={17} /> TV용 공개 화면 열기 <ExternalLink size={14} /></a>
        </aside>
      )}
    </div>
  );
}

function MiniPublicSummary({ view, onOpen }: { view: PublicRoomView; onOpen: () => void }) {
  return (
    <button className="mini-public" onClick={onOpen}>
      <span>공개 보드</span>
      <strong>{view.bid ? `현재 ${view.bid.amount}개 선언` : "테이블 상황 보기"}</strong>
      <span>탭해서 전환</span>
    </button>
  );
}
