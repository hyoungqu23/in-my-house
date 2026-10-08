"use client";

import { Copy, ExternalLink, MonitorUp, RefreshCw, Share2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders, getBrowserSupabase } from "@/modules/auth/client";
import { PlayerControls } from "@/modules/dark-house/ui/player-controls";
import { PublicBoard } from "@/modules/dark-house/ui/public-board";
import { ConnectedForestPlayerControls } from "@/modules/connected-forest/ui/player-controls";
import type { ForestDraft } from "@/modules/connected-forest/ui/draft-options";
import { ConnectedForestPublicBoard } from "@/modules/connected-forest/ui/public-board";
import forestStyles from "@/modules/connected-forest/ui/game.module.css";
import { findGame } from "@/modules/game-catalog/games";
import { DawnSwitchboardPlayerControls } from "@/modules/dawn-switchboard/ui/player-controls";
import { DawnSwitchboardPublicBoard } from "@/modules/dawn-switchboard/ui/public-board";
import type { FootprintsRoomMark } from "@/modules/midnight-footprints/domain/types";
import { MidnightFootprintsPlayerControls } from "@/modules/midnight-footprints/ui/player-controls";
import { MidnightFootprintsPublicBoard } from "@/modules/midnight-footprints/ui/public-board";
import { RoomApiError, roomApiFetch } from "@/modules/room/client/room-api";
import type {
  DarkHousePlayerRoomView,
  DarkHousePublicRoomView,
  ConnectedForestPlayerRoomView,
  ConnectedForestPublicRoomView,
  DawnSwitchboardPlayerRoomView,
  DawnSwitchboardPublicRoomView,
  LobbyRoomView,
  MidnightFootprintsPlayerRoomView,
  MidnightFootprintsPublicRoomView,
  PlayerRoomView,
  RoomAction,
  RoomView,
  SuspiciousInvitePlayerRoomView,
  SuspiciousInvitePublicRoomView,
} from "@/modules/room/contracts";
import { SuspiciousInvitePlayerControls } from "@/modules/suspicious-invite/ui/player-controls";
import { SuspiciousInvitePublicBoard } from "@/modules/suspicious-invite/ui/public-board";
import { QrCode } from "@/shared/ui/qr-code";
import { createBrowserId } from "@/shared/browser/uuid";

type ViewMode = "private" | "public";
type RoomLinks = { code: string; joinUrl: string; displayUrl: string };

const isPlayerView = (view: RoomView): view is PlayerRoomView => view.projection === "player";
const isDarkHousePlayer = (view: PlayerRoomView): view is DarkHousePlayerRoomView => view.room.gameId === "dark-house";
const isSuspiciousPlayer = (view: PlayerRoomView): view is SuspiciousInvitePlayerRoomView => view.room.gameId === "suspicious-invite";
const isSwitchboardPlayer = (view: PlayerRoomView): view is DawnSwitchboardPlayerRoomView => view.room.gameId === "dawn-switchboard";
const isFootprintsPlayer = (view: PlayerRoomView): view is MidnightFootprintsPlayerRoomView => view.room.gameId === "midnight-footprints";
const isForestPlayer = (view: PlayerRoomView): view is ConnectedForestPlayerRoomView => view.room.gameId === "connected-forest";
type GamePublicView =
  | DarkHousePublicRoomView
  | SuspiciousInvitePublicRoomView
  | DawnSwitchboardPublicRoomView
  | MidnightFootprintsPublicRoomView
  | ConnectedForestPublicRoomView;
const isDarkHousePublic = (view: GamePublicView): view is DarkHousePublicRoomView => view.room.gameId === "dark-house";
const isSuspiciousPublic = (view: GamePublicView): view is SuspiciousInvitePublicRoomView => view.room.gameId === "suspicious-invite";
const isSwitchboardPublic = (view: GamePublicView): view is DawnSwitchboardPublicRoomView => view.room.gameId === "dawn-switchboard";
const isFootprintsPublic = (view: GamePublicView): view is MidnightFootprintsPublicRoomView => view.room.gameId === "midnight-footprints";
const isForestPublic = (view: GamePublicView): view is ConnectedForestPublicRoomView => view.room.gameId === "connected-forest";
const isForestView = (view: Exclude<RoomView, LobbyRoomView>): view is ConnectedForestPublicRoomView | ConnectedForestPlayerRoomView => view.room.gameId === "connected-forest";
const isDarkHouseView = (view: Exclude<RoomView, LobbyRoomView>): view is DarkHousePublicRoomView | DarkHousePlayerRoomView => view.room.gameId === "dark-house";
const isSuspiciousView = (view: Exclude<RoomView, LobbyRoomView>): view is SuspiciousInvitePublicRoomView | SuspiciousInvitePlayerRoomView => view.room.gameId === "suspicious-invite";
const isSwitchboardView = (view: Exclude<RoomView, LobbyRoomView>): view is DawnSwitchboardPublicRoomView | DawnSwitchboardPlayerRoomView => view.room.gameId === "dawn-switchboard";

type Drafts = {
  forest?: { key: string; value: ForestDraft };
};
const forestDraftKey = (view: ConnectedForestPlayerRoomView | ConnectedForestPublicRoomView) =>
  `${view.room.code}:${view.phaseKey}:${view.viewer.playerSeat}`;

function retainDrafts(drafts: Drafts, next: RoomView): Drafts {
  if (next.phase === "LOBBY" || next.phase === "GAME_OVER") return {};
  if (isForestView(next)) {
    return { forest: drafts.forest?.key === forestDraftKey(next)
      && !(next.projection === "player" && next.self.lockedPick) ? drafts.forest : undefined };
  }
  return {};
}

export function RoomClient({ code }: { code: string }) {
  const [mode, setMode] = useState<ViewMode>("private");
  const [view, setView] = useState<RoomView>();
  const [links, setLinks] = useState<RoomLinks>();
  const [viewError, setViewError] = useState("");
  const [actionError, setActionError] = useState("");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const modeRef = useRef<ViewMode>("private");
  const requestEpoch = useRef(0);
  const lastAccepted = useRef<{ code: string; version: number; serverNow: string } | undefined>(undefined);
  const lastPrivateActivity = useRef(0);

  const receiveView = useCallback((next: RoomView, requestedMode: ViewMode, epoch: number) => {
    if (epoch !== requestEpoch.current || requestedMode !== modeRef.current) return;
    const previous = lastAccepted.current;
    if (previous?.code === code && (next.room.version < previous.version
      || (next.room.version === previous.version && next.serverNow < previous.serverNow))) return;
    lastAccepted.current = { code, version: next.room.version, serverNow: next.serverNow };
    setView(next);
    setViewError("");
    setDrafts((current) => retainDrafts(current, next));
  }, [code]);

  const loadView = useCallback(async (requestedMode: ViewMode = modeRef.current) => {
    const epoch = requestEpoch.current;
    try {
      const next = await roomApiFetch<RoomView>(`/api/rooms/${code}/view?mode=${requestedMode}`);
      receiveView(next, requestedMode, epoch);
    } catch (cause) {
      if (epoch !== requestEpoch.current || requestedMode !== modeRef.current) return;
      setViewError(cause instanceof Error ? cause.message : "방 상태를 불러오지 못했습니다.");
      if (cause instanceof RoomApiError && [401, 404, 410].includes(cause.status)) {
        setView(undefined);
        setDrafts({});
      }
    }
  }, [code, receiveView]);

  useEffect(() => {
    const stored = window.localStorage.getItem(`in-my-house:links:${code}`);
    queueMicrotask(() => {
      if (stored) setLinks(JSON.parse(stored));
      lastPrivateActivity.current = Date.now();
      void loadView();
    });
    return () => { requestEpoch.current += 1; };
  }, [code, loadView]);

  const pollingPhase = view?.phase;
  useEffect(() => {
    const intervalMs = pollingPhase && ["REVEALING", "ROUND_INTRO", "CLUE_REVEAL", "ROUND_RESULT", "PANEL_RESULT", "SEASON_REVEAL"].includes(pollingPhase)
      ? 500
      : 1_500;
    const timer = window.setInterval(() => void loadView(mode), intervalMs);
    return () => window.clearInterval(timer);
  }, [loadView, mode, pollingPhase]);

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
      modeRef.current = "public";
      requestEpoch.current += 1;
      setView(undefined);
      setMode("public");
      void loadView("public");
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
  }, [mode, loadView]);

  async function switchMode(nextMode: ViewMode) {
    if (nextMode === mode) return;
    modeRef.current = nextMode;
    requestEpoch.current += 1;
    setView(undefined);
    setMode(nextMode);
    lastPrivateActivity.current = Date.now();
    await loadView(nextMode);
  }

  async function sendAction(action: RoomAction) {
    if (!view || busy) return;
    const epoch = requestEpoch.current;
    setBusy(true);
    setActionError("");
    try {
      const clientActionId = createBrowserId();
      let latest = view;
      let result: { projection: RoomView } | undefined;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          result = await roomApiFetch<{ projection: RoomView }>(`/api/rooms/${code}/actions`, {
            method: "POST",
            body: JSON.stringify({ clientActionId, expectedVersion: latest.room.version, action }),
          });
          break;
        } catch (cause) {
          const forestAction = ["LOCK_TERRAIN_PICK", "CHOOSE_SEASON_VISIT", "RESOLVE_VISIT"].includes(action.type);
          if (attempt === 3 || !forestAction || !(cause instanceof RoomApiError) || cause.code !== "STALE_VERSION"
            || latest.phase === "LOBBY" || !isForestView(latest)) throw cause;
          const fresh = await roomApiFetch<RoomView>(`/api/rooms/${code}/view?mode=private`);
          if (fresh.phase === "LOBBY" || !isForestView(fresh) || fresh.projection !== "player"
            || fresh.matchId !== latest.matchId
            || fresh.phaseKey !== latest.phaseKey
            || !fresh.self.legalActions.includes(action.type as "LOCK_TERRAIN_PICK" | "CHOOSE_SEASON_VISIT" | "RESOLVE_VISIT")
            || (action.type === "RESOLVE_VISIT" && fresh.self.currentVisit?.visitId !== action.visitId)) throw cause;
          latest = fresh;
        }
      }
      if (!result) throw new Error("선택을 보내지 못했습니다. 다시 시도해 주세요.");
      if (modeRef.current === "private" && epoch === requestEpoch.current) receiveView(result.projection, "private", epoch);
      else await loadView();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "행동을 처리하지 못했습니다.");
      await loadView();
    } finally {
      setBusy(false);
    }
  }

  async function saveFootprintsMarks(
    expectedPrivateRevision: number,
    roomMarks: Record<string, FootprintsRoomMark>,
  ) {
    setBusy(true);
    setActionError("");
    try {
      await roomApiFetch(`/api/rooms/${code}/room-marks`, {
        method: "PUT",
        body: JSON.stringify({ expectedPrivateRevision, roomMarks }),
      });
      await loadView();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "메모를 저장하지 못했습니다.");
      await loadView();
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!links) return;
    try {
      if (!navigator.clipboard?.writeText) { setManualCopy(true); return; }
      await navigator.clipboard.writeText(links.joinUrl);
      setCopied(true);
      setManualCopy(false);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setManualCopy(true);
    }
  }

  if (!view) {
    return (
      <main className="room-loading">
        <span className="loader" aria-hidden="true" />
        <p>{viewError || "집 안의 불을 확인하는 중…"}</p>
        {viewError && <button className="secondary-button" onClick={() => loadView()}><RefreshCw size={18} /> 다시 시도</button>}
      </main>
    );
  }

  const isHost = view.viewer.roles.includes("HOST");
  const playerView = isPlayerView(view) ? view : undefined;

  return (
    <main className={`room-page ${view.room.gameId === "connected-forest" ? forestStyles.roomPage : ""}`}>
      <nav className="mode-switcher" aria-label="화면 모드">
        <button className={mode === "private" ? "active" : ""} onClick={() => switchMode("private")} disabled={!view.viewer.roles.includes("PLAYER")}>
          내 화면
        </button>
        <button className={mode === "public" ? "active" : ""} onClick={() => switchMode("public")}>공개 화면</button>
      </nav>

      {view.phase === "LOBBY" ? (
        <Lobby view={view} links={links} isHost={isHost} busy={busy} copied={copied} manualCopy={manualCopy} onCopy={copyInvite} onStart={() => sendAction({ type: "START_GAME" })} />
      ) : mode === "private" && playerView ? (
        <div className="game-layout private-layout">
          {isForestPlayer(playerView) && <ConnectedForestPlayerControls view={playerView} busy={busy} onAction={sendAction}
            draft={drafts.forest?.key === forestDraftKey(playerView) ? drafts.forest.value : undefined}
            onDraftChange={(value) => { setDrafts((current) => ({ ...current, forest: { key: forestDraftKey(playerView), value } })); setActionError(""); }} />}
          {isDarkHousePlayer(playerView) && <PlayerControls view={playerView} busy={busy} onAction={sendAction} />}
          {isSuspiciousPlayer(playerView) && <SuspiciousInvitePlayerControls key={playerView.round} view={playerView} busy={busy} onAction={sendAction} />}
          {isSwitchboardPlayer(playerView) && <DawnSwitchboardPlayerControls key={playerView.stage} view={playerView} busy={busy} onAction={sendAction} />}
          {isFootprintsPlayer(playerView) && (
            <MidnightFootprintsPlayerControls
              key={`${playerView.matchNumber}:${playerView.round}:${playerView.self.role}`}
              view={playerView}
              busy={busy}
              onAction={sendAction}
              onSaveMarks={saveFootprintsMarks}
            />
          )}
          <MiniPublicSummary view={view} onOpen={() => switchMode("public")} />
        </div>
      ) : view.projection === "public" ? (
        <div className="game-layout">
          {isDarkHousePublic(view)
            ? <PublicBoard view={view} />
            : isSuspiciousPublic(view)
              ? <SuspiciousInvitePublicBoard view={view} />
              : isSwitchboardPublic(view)
                ? <DawnSwitchboardPublicBoard view={view} />
                : isFootprintsPublic(view)
                  ? <MidnightFootprintsPublicBoard view={view} />
                  : isForestPublic(view)
                    ? <ConnectedForestPublicBoard view={view} />
                    : null}
          {view.viewer.legalAdministrativeActions.includes("START_REMATCH") && (
            <button className="primary-button rematch-button" disabled={busy} onClick={() => sendAction({ type: "START_REMATCH" })}>같은 사람들과 다시 하기</button>
          )}
        </div>
      ) : null}

      {(actionError || viewError) && <div className="toast" role="alert"><span>{actionError || viewError}</span>
        {actionError && <button className="text-button" aria-label="오류 메시지 닫기" onClick={() => setActionError("")}>닫기</button>}
      </div>}
    </main>
  );
}

function Lobby({ view, links, isHost, busy, copied, manualCopy, onCopy, onStart }: {
  view: LobbyRoomView; links?: RoomLinks; isHost: boolean; busy: boolean; copied: boolean; manualCopy: boolean; onCopy: () => void; onStart: () => void;
}) {
  const isSuspicious = view.room.gameId === "suspicious-invite";
  const isSwitchboard = view.room.gameId === "dawn-switchboard";
  const isFootprints = view.room.gameId === "midnight-footprints";
  const isForest = view.room.gameId === "connected-forest";
  const minimumPlayers = findGame(view.room.gameId)!.minPlayers;
  const title = isForest ? "우리의 작은 숲을 시작해요" : isSuspicious
    ? "초대받지 않은 사람을 찾으세요"
    : isSwitchboard
      ? "새벽이 오기 전에 전력을 되찾으세요"
      : isFootprints
        ? "괴도와 경비, 단둘이 밤을 시작하세요"
      : "빈 방을 믿지 마세요";
  const lead = isForest ? "4–6명이 각자의 숲을 만들고 이웃과 동물을 주고받아요. 모두 모이면 첫 계절이 시작됩니다." : isSuspicious
    ? "모두 들어오면 호스트가 초대장을 공개합니다. 역할과 비밀 단어는 다른 사람에게 보여주지 마세요."
    : isSwitchboard
      ? "각자의 휴대폰에 서로 다른 회로 단서가 도착합니다. 화면은 숨기고 단서는 말로 공유하세요."
      : isFootprints
        ? "괴도는 비밀 입구를 고르고, 경비는 공개 흔적을 추적합니다. 개인 화면은 서로 보여주지 마세요."
      : "모두 들어오면 호스트가 불을 끕니다. 각자의 화면은 다른 사람에게 보여주지 마세요.";
  return (
    <div className="lobby-layout">
      <section className="lobby-stage">
        <div className="eyebrow"><span /> {isForest ? "OUR LITTLE FOREST" : isSuspicious ? "THE INVITATION IS WAITING" : isSwitchboard ? "THE GRID IS WAITING" : "THE HOUSE IS WAITING"}</div>
        <h1>{title}</h1>
        <p className="lobby-lead">{lead}</p>
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
          {Array.from({ length: Math.max(0, minimumPlayers - view.players.length) }, (_, index) => (
            <div className="lobby-player empty" key={`empty-${index}`}><UsersRound size={18} /><span>플레이어를 기다리는 중</span></div>
          ))}
        </div>
        {isHost ? (
          <button className="primary-button" disabled={busy || view.players.filter((player) => player.connected).length < minimumPlayers} onClick={onStart}>
            {busy ? "게임을 준비하는 중…" : view.players.length < minimumPlayers ? `${minimumPlayers - view.players.length}명 더 필요해요` : isForest ? "모두 준비됨 · 숲길 시작" : isSuspicious ? "모두 준비됨 · 초대장 공개" : isSwitchboard ? "모두 준비됨 · 배전반 열기" : isFootprints ? "두 사람 준비됨 · 야간 순찰 시작" : "모두 준비됨 · 게임 시작"}
          </button>
        ) : <p className="waiting-copy">호스트가 게임을 시작할 때까지 기다려 주세요.</p>}
      </section>

      {links && (
        <aside className="invite-panel">
          <div className="panel-heading"><Share2 size={19} /><h2>친구 초대</h2></div>
          <QrCode value={links.joinUrl} label="게임 참가 QR 코드" />
          <button className="secondary-button" onClick={onCopy}><Copy size={18} /> {copied ? "복사했습니다" : "초대 링크 복사"}</button>
          {manualCopy && <label className="manual-copy">링크를 길게 누르거나 선택해서 복사해 주세요.
            <input aria-label="직접 복사할 초대 링크" readOnly value={links.joinUrl} onFocus={(event) => event.currentTarget.select()} />
          </label>}
          <a className="text-link" href={links.displayUrl} target="_blank" rel="noreferrer"><MonitorUp size={17} /> TV용 공개 화면 열기 <ExternalLink size={14} /></a>
        </aside>
      )}
    </div>
  );
}

function MiniPublicSummary({ view, onOpen }: { view: Exclude<RoomView, LobbyRoomView>; onOpen: () => void }) {
  const summary = isForestView(view) ? `계절 ${view.seasonIndex + 1}/5 · 이웃의 숲 보기` : isDarkHouseView(view)
    ? view.bid ? `현재 ${view.bid.amount}개 선언` : "테이블 상황 보기"
    : isSuspiciousView(view)
      ? `ROUND ${view.round} · ${view.category}`
      : isSwitchboardView(view)
        ? `PANEL ${view.stage}/${view.stageCount} · 퓨즈 ${view.fusesRemaining}`
        : `MATCH ${view.matchNumber} · ROUND ${view.round}/2`;
  return (
    <button className="mini-public" onClick={onOpen}>
      <span>공개 보드</span>
      <strong>{summary}</strong>
      <span>탭해서 전환</span>
    </button>
  );
}
