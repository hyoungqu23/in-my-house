"use client";

import { AlertTriangle, Check, Clock3, Power, Radio, Star, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { DawnSwitchboardPublicRoomView } from "@/modules/room/contracts";
import { ModuleGlyph } from "./module-glyph";

const phaseCopy: Record<DawnSwitchboardPublicRoomView["phase"], string> = {
  BRIEFING: "각자의 비상 단서를 확인하세요",
  SOLVING: "올바른 회로 순서를 복구하세요",
  PANEL_RESULT: "배전반이 다시 살아납니다",
  GAME_OVER: "새벽의 복구 결과",
};

const difficultyCopy = {
  EASY: "초기 회로",
  MEDIUM: "중앙 회로",
  HARD: "주 전력망",
} as const;

function Countdown({ deadlineAt, serverNow }: { deadlineAt?: string; serverNow: string }) {
  const initial = deadlineAt && serverNow
    ? Math.max(0, new Date(deadlineAt).getTime() - new Date(serverNow).getTime())
    : undefined;
  const [remaining, setRemaining] = useState(initial);
  useEffect(() => {
    if (initial === undefined) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => current === undefined ? undefined : Math.max(0, current - 250));
    }, 250);
    return () => window.clearInterval(timer);
  }, [initial]);
  return <strong>{formatTime(remaining)}</strong>;
}

const formatTime = (milliseconds?: number) => {
  if (milliseconds === undefined) return "--:--";
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export function DawnSwitchboardPublicBoard({
  view,
}: {
  view: DawnSwitchboardPublicRoomView;
}) {
  const activePlayer = view.players.find((player) => player.seat === view.activeSeat);
  const attemptedModule = view.lastAttempt
    ? view.modules.find((module) => module.id === view.lastAttempt?.moduleId)
    : undefined;
  const completedStages = view.result?.completedPanels
    ?? (view.phase === "PANEL_RESULT" ? view.stage : view.stage - 1);

  return (
    <section className="board switchboard-board" aria-live="polite">
      <header className="board-header switchboard-header">
        <div>
          <span className="room-code">ROOM {view.room.code} · PANEL {view.stage}/{view.stageCount}</span>
          <h1>{view.result?.outcome === "RESTORED" ? "집 전체의 전력이 돌아왔습니다" : phaseCopy[view.phase]}</h1>
        </div>
        <div className="switchboard-status">
          <span><Clock3 size={16} /> 남은 시간 <Countdown key={view.deadlineAt ?? "pending"} deadlineAt={view.deadlineAt} serverNow={view.serverNow} /></span>
          <span><Zap size={16} /> 퓨즈 <strong>{view.fusesRemaining}</strong></span>
        </div>
      </header>

      <div className="panel-progress" aria-label={`배전반 ${view.stage}/${view.stageCount}`}>
        {Array.from({ length: view.stageCount }, (_, index) => (
          <i key={index} className={index < completedStages ? "complete" : ""} />
        ))}
      </div>

      <div className="switchboard-meta">
        <div><span>{difficultyCopy[view.panel.difficulty]}</span><strong>{view.panel.title}</strong></div>
        <div><span>CURRENT OPERATOR</span><strong>{activePlayer?.nickname ?? (view.phase === "BRIEFING" ? "준비 중" : "—")}</strong></div>
      </div>

      <div className="operator-strip">
        {view.players.map((player) => (
          <article key={player.seat} className={player.active ? "is-active" : ""}>
            <span>{String(player.seat).padStart(2, "0")}</span>
            <strong>{player.nickname}</strong>
            <small>
              {!player.connected ? "연결 끊김" : player.cluesExposed ? "단서 공개됨" : player.active ? "조작 중" : player.ready ? "준비 완료" : "단서 확인 중"}
            </small>
          </article>
        ))}
      </div>

      <div className="circuit-sequence">
        {Array.from({ length: view.panel.slotCount }, (_, index) => {
          const lockedModule = view.lockedSequence[index];
          return (
            <div className={`sequence-slot ${lockedModule ? "is-locked" : ""}`} key={index}>
              <span>{index + 1}</span>
              {lockedModule ? <ModuleGlyph module={lockedModule} size={34} /> : <Power size={25} />}
            </div>
          );
        })}
      </div>

      {view.phase === "BRIEFING" ? (
        <div className="switchboard-notice"><Radio size={24} /><strong>{view.players.filter((player) => player.ready).length} / {view.players.filter((player) => player.connected).length}</strong><span>연결된 전원이 준비하면 12분 카운트다운이 시작됩니다.</span></div>
      ) : (
        <div className="module-bank">
          {view.modules
            .filter((module) => !view.lockedSequence.some((locked) => locked.id === module.id))
            .map((module) => (
              <div className={view.rejectedModuleIds.includes(module.id) ? "is-rejected" : ""} key={module.id}>
                <ModuleGlyph module={module} />
                {view.rejectedModuleIds.includes(module.id) && <small>현재 칸 아님</small>}
              </div>
            ))}
        </div>
      )}

      {view.lastAttempt && attemptedModule && view.phase === "SOLVING" && (
        <div className={`switchboard-feedback ${view.lastAttempt.correct ? "success" : "danger"}`}>
          {view.lastAttempt.correct ? <Check size={22} /> : <AlertTriangle size={22} />}
          <strong>{attemptedModule.label}</strong>
          <span>{view.lastAttempt.correct ? "회로가 연결됐습니다." : "회로가 거부됐습니다. 퓨즈가 하나 줄었습니다."}</span>
        </div>
      )}

      {view.exposedClues.length > 0 && (
        <section className="emergency-manual">
          <h2><Radio size={20} /> 연결 끊긴 플레이어의 비상 단서</h2>
          {view.exposedClues.map(({ seat, entries }) => {
            const player = view.players.find((candidate) => candidate.seat === seat);
            return (
              <article key={seat}>
                <strong>{player?.nickname ?? `${seat}번 좌석`}</strong>
                {entries.map((entry) => <p key={entry}>{entry}</p>)}
              </article>
            );
          })}
        </section>
      )}

      {view.phase === "PANEL_RESULT" && (
        <div className="switchboard-result-panel"><Check size={34} /><strong>{view.panel.title} 복구 완료</strong><span>다음 배전반으로 전력을 넘기는 중…</span></div>
      )}

      {view.result && (
        <div className={`switchboard-result-panel final ${view.result.outcome === "RESTORED" ? "success" : "danger"}`}>
          {view.result.outcome === "RESTORED" ? <Power size={42} /> : <AlertTriangle size={42} />}
          <strong>
            {view.result.outcome === "RESTORED" ? "공동 승리" : view.result.outcome === "FUSES_BLOWN" ? "퓨즈가 모두 끊어졌습니다" : "복구 시간이 끝났습니다"}
          </strong>
          {view.result.stars && (
            <div className="restoration-stars" aria-label={`복구 등급 ${view.result.stars}성`}>
              {Array.from({ length: 3 }, (_, index) => <Star key={index} className={index < view.result!.stars! ? "earned" : ""} />)}
            </div>
          )}
          <span>복구한 배전반 {view.result.completedPanels}/{view.stageCount} · 남은 퓨즈 {view.result.fusesRemaining}</span>
        </div>
      )}
    </section>
  );
}
