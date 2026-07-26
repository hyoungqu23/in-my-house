"use client";

import {
  AlarmClock,
  DoorOpen,
  Footprints,
  Gem,
  Shield,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MidnightFootprintsPublicRoomView } from "@/modules/room/contracts";

const phaseCopy: Record<MidnightFootprintsPublicRoomView["phase"], string> = {
  ROUND_SETUP: "야간 순찰을 준비하세요",
  INTRUDER_TURN: "괴도가 어둠 속에서 움직입니다",
  GUARD_TURN: "경비가 흔적을 추적합니다",
  ROUND_RESULT: "이번 잠입의 결과",
  MATCH_RESULT: "두 번의 잠입이 끝났습니다",
  GAME_OVER: "오늘 밤의 대결 종료",
};

const traceCopy = (
  trace: MidnightFootprintsPublicRoomView["traceHistory"][number],
) => {
  if (trace.kind === "ZONE") {
    return `${trace.zone === "WEST" ? "서쪽" : trace.zone === "CENTER" ? "중앙" : "동쪽"} 구역`;
  }
  if (trace.kind === "FLOOR") {
    return `${trace.floor === "WOOD" ? "나무" : trace.floor === "CARPET" ? "카펫" : "타일"} 바닥`;
  }
  return `${trace.roomId}의 ${trace.targetId} 도난 경보`;
};

function ThoughtClock({
  actionStartedAt,
  serverNow,
}: {
  actionStartedAt: string;
  serverNow: string;
}) {
  const initial = Math.max(
    0,
    new Date(serverNow).getTime() - new Date(actionStartedAt).getTime(),
  );
  const [elapsed, setElapsed] = useState(initial);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1_000), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.floor(elapsed / 1_000);
  return <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong>;
}

export function MidnightFootprintsPublicBoard({
  view,
}: {
  view: MidnightFootprintsPublicRoomView;
}) {
  const activePlayer = view.players.find((player) => player.seat === view.activeSeat);
  const winner = view.players.find(
    (player) => player.seat === (view.matchWinnerSeat ?? view.forfeitWinnerSeat),
  );
  const latestResult = view.roundResults.at(-1);

  return (
    <section className="board footprints-board" aria-live="polite">
      <header className="board-header footprints-header">
        <div>
          <span className="room-code">
            ROOM {view.room.code} · MATCH {view.matchNumber} · ROUND {view.round}/2
          </span>
          <h1>{winner ? `${winner.nickname}의 승리` : phaseCopy[view.phase]}</h1>
        </div>
        <div className="footprints-clock">
          <Timer size={17} />
          <span>{activePlayer ? `${activePlayer.nickname} 생각 중` : "현재 경과"}</span>
          <ThoughtClock actionStartedAt={view.actionStartedAt} serverNow={view.serverNow} />
        </div>
      </header>

      <div className="duel-strip">
        {view.players.map((player) => (
          <article className={player.seat === view.activeSeat ? "is-active" : ""} key={player.seat}>
            {player.role === "INTRUDER" ? <Footprints size={20} /> : <Shield size={20} />}
            <div>
              <strong>{player.nickname}</strong>
              <span>{player.role === "INTRUDER" ? "괴도" : "경비"} · {player.record.wins}승 {player.record.draws}무 {player.record.losses}패</span>
            </div>
            <i className={player.connected ? "online" : "offline"}>
              {player.connected ? (player.ready ? "준비" : "접속") : "끊김"}
            </i>
          </article>
        ))}
      </div>

      {view.pause && (
        <div className="footprints-alert">
          <AlarmClock size={21} />
          <strong>연결을 기다리는 중</strong>
          <span>게임과 생각 시간이 잠시 멈췄습니다.</span>
        </div>
      )}

      <div className="footprints-main">
        <div>
          <div className="map-heading">
            <div><span>NIGHT MAP</span><h2>{view.layout.name}</h2></div>
            <span>봉쇄 {view.blocksRemaining}/2</span>
          </div>
          <div className="footprints-map">
            {view.layout.rooms.map((room) => {
              const target = view.layout.targets.find((candidate) => candidate.roomId === room.id);
              const isEntrance = view.layout.entranceRoomIds.includes(room.id);
              const isGuard = view.guardRoomId === room.id;
              return (
                <article
                  className={[
                    "map-room",
                    isEntrance ? "is-entrance" : "",
                    isGuard ? "is-guard" : "",
                  ].join(" ")}
                  key={room.id}
                >
                  <span>{room.zone} · {room.floor}</span>
                  <strong>{room.name}</strong>
                  <div>
                    {isEntrance && <DoorOpen size={15} aria-label="출입구" />}
                    {isGuard && <Shield size={16} aria-label="경비 위치" />}
                    {target && <Gem size={15} aria-label={`${target.value}점 목표물`} />}
                  </div>
                  {target && <small>{target.name} · {target.value}점</small>}
                </article>
              );
            })}
          </div>
          <div className="passage-list" aria-label="연결 통로">
            {view.layout.passages.map(([first, second]) => {
              const blocked = view.activeBlock
                && new Set(view.activeBlock.passage).has(first)
                && new Set(view.activeBlock.passage).has(second);
              return (
                <span className={blocked ? "is-blocked" : ""} key={`${first}:${second}`}>
                  {first} ↔ {second}
                </span>
              );
            })}
          </div>
        </div>

        <aside className="trace-panel">
          <div><Footprints size={19} /><h2>공개 흔적</h2></div>
          {view.traceHistory.length === 0 ? (
            <p>입장이 확정되면 첫 구역 흔적이 나타납니다.</p>
          ) : (
            <ol>
              {view.traceHistory.map((trace) => (
                <li className={trace.kind === "ALARM" ? "is-alarm" : ""} key={trace.turn}>
                  <span>TURN {trace.turn}</span>
                  <strong>{traceCopy(trace)}</strong>
                </li>
              ))}
            </ol>
          )}
          {view.failedSearches.length > 0 && (
            <div className="empty-searches">
              <span>빈 방 수색</span>
              {view.failedSearches.map((search, index) => (
                <strong key={`${search.turn}:${search.roomId}:${index}`}>
                  T{search.turn} · {search.roomId}
                </strong>
              ))}
            </div>
          )}
        </aside>
      </div>

      {latestResult && view.phase === "ROUND_RESULT" && (
        <div className={`footprints-result ${latestResult.outcome === "ESCAPED" ? "success" : "danger"}`}>
          <strong>
            {latestResult.outcome === "ESCAPED"
              ? `${latestResult.targetValue}점 목표물과 함께 탈출`
              : latestResult.outcome === "CAUGHT"
                ? "경비의 수색으로 체포"
                : latestResult.outcome === "ENCLOSED"
                  ? "통로에서 포위"
                  : "10턴 시간 초과"}
          </strong>
          <span>침입자 행동 {latestResult.completedActions}회</span>
        </div>
      )}

      {view.revealedPaths && (
        <div className="revealed-paths">
          <h2>두 괴도의 전체 경로</h2>
          {view.revealedPaths.map((entry) => (
            <p key={entry.round}>
              <strong>ROUND {entry.round}</strong>
              <span>{entry.path.join(" → ")}</span>
            </p>
          ))}
          {view.phase === "MATCH_RESULT" && (
            <small>재경기 투표 {view.rematchVoteCount}/2 제출</small>
          )}
        </div>
      )}
    </section>
  );
}
