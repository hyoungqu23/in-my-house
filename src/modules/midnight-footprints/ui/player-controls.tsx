"use client";

import {
  Check,
  DoorOpen,
  Footprints,
  Gem,
  MapPin,
  Shield,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  FootprintsAction,
  FootprintsRoomMark,
} from "../domain/types";
import type { MidnightFootprintsPlayerRoomView } from "@/modules/room/contracts";

const markCopy: Record<FootprintsRoomMark, string> = {
  UNKNOWN: "미확인",
  LIKELY: "유력",
  EXCLUDED: "제외",
};

const nextMark: Record<FootprintsRoomMark, FootprintsRoomMark> = {
  UNKNOWN: "LIKELY",
  LIKELY: "EXCLUDED",
  EXCLUDED: "UNKNOWN",
};

export function MidnightFootprintsPlayerControls({
  view,
  busy,
  onAction,
  onSaveMarks,
}: {
  view: MidnightFootprintsPlayerRoomView;
  busy: boolean;
  onAction: (action: FootprintsAction) => Promise<void>;
  onSaveMarks: (
    revision: number,
    marks: Record<string, FootprintsRoomMark>,
  ) => Promise<void>;
}) {
  const legal = useMemo(() => new Set(view.self.legalActions), [view.self.legalActions]);
  const [marks, setMarks] = useState<Record<string, FootprintsRoomMark>>(
    view.self.roomMarks ?? {},
  );
  const roomName = (roomId: string) =>
    view.layout.rooms.find((room) => room.id === roomId)?.name ?? roomId;
  const currentTarget = view.layout.targets.find(
    (target) => target.roomId === view.self.currentRoomId,
  );

  return (
    <section className="player-controls footprints-controls">
      <div className="control-heading">
        <div>
          <span className="room-code">ROUND {view.round}/2 · PRIVATE</span>
          <h2>{view.self.role === "INTRUDER" ? "괴도의 밤" : "경비의 순찰"}</h2>
        </div>
        <span className={`footprints-role ${view.self.role.toLowerCase()}`}>
          {view.self.role === "INTRUDER" ? <Footprints size={16} /> : <Shield size={16} />}
          {view.self.role === "INTRUDER" ? "괴도" : "경비"}
        </span>
      </div>

      {view.phase === "ROUND_SETUP" && (
        <>
          {view.self.role === "INTRUDER" && (
            <div className="entry-selector">
              <DoorOpen size={23} />
              <h3>비밀 입구를 고르세요</h3>
              <div>
                {view.self.entryRoomIds?.map((roomId) => (
                  <button
                    className={view.self.initialEntryRoomId === roomId ? "selected" : ""}
                    disabled={busy}
                    key={roomId}
                    onClick={() => onAction({ type: "SELECT_ENTRY", roomId })}
                  >
                    {roomName(roomId)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {legal.has("MARK_READY") ? (
            <button
              className="primary-button footprints-ready"
              disabled={busy || (
                view.self.role === "INTRUDER" && !view.self.initialEntryRoomId
              )}
              onClick={() => onAction({ type: "MARK_READY" })}
            >
              <Check size={18} /> 역할 확인 · 준비 완료
            </button>
          ) : (
            <p className="waiting-copy">준비 완료. 상대를 기다리고 있습니다.</p>
          )}
        </>
      )}

      {view.self.role === "INTRUDER" && view.phase !== "ROUND_SETUP" && (
        <div className="intruder-dashboard">
          <div className="secret-location">
            <MapPin size={23} />
            <span>현재 위치</span>
            <strong>{view.self.currentRoomId ? roomName(view.self.currentRoomId) : "진입 전"}</strong>
            <small>잠복 {view.self.hideRemaining}/2 · {view.self.stolenTargetId ? "목표물 확보" : "빈손"}</small>
          </div>

          {legal.has("MOVE_INTRUDER") && (
            <div className="private-choice">
              <h3>인접 방으로 이동</h3>
              <div className="footprints-action-grid">
                {view.self.legalMoveRoomIds?.map((roomId) => (
                  <button
                    disabled={busy}
                    key={roomId}
                    onClick={() => onAction({ type: "MOVE_INTRUDER", roomId })}
                  >
                    {roomName(roomId)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {legal.has("STEAL") && currentTarget && (
            <button
              className="primary-button steal-button"
              disabled={busy}
              onClick={() => onAction({ type: "STEAL", targetId: currentTarget.id })}
            >
              <Gem size={18} /> {currentTarget.name} 훔치기 · {currentTarget.value}점
            </button>
          )}
          {legal.has("HIDE") && (
            <button
              className="secondary-button hide-button"
              disabled={busy}
              onClick={() => onAction({ type: "HIDE" })}
            >
              제자리에서 잠복하기
            </button>
          )}
          {view.phase === "GUARD_TURN" && (
            <p className="waiting-copy">경비가 이동하고 수색하는 중입니다.</p>
          )}
        </div>
      )}

      {view.self.role === "GUARD" && view.phase !== "ROUND_SETUP" && (
        <>
          {legal.has("MOVE_AND_SEARCH") && (
            <div className="private-choice">
              <h3>이동 후 최종 방 수색</h3>
              <div className="guard-paths">
                {view.self.legalGuardPaths?.map((path) => (
                  <button
                    disabled={busy}
                    key={path.join(":") || "stay"}
                    onClick={() => onAction({ type: "MOVE_AND_SEARCH", path })}
                  >
                    {path.length === 0
                      ? `${roomName(view.guardRoomId)} 제자리 수색`
                      : path.map(roomName).join(" → ")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {legal.has("BLOCK_PASSAGE") && (
            <div className="private-choice">
              <h3>이동·수색 대신 통로 봉쇄</h3>
              <div className="guard-paths">
                {view.self.blockablePassages?.map((passage) => (
                  <button
                    disabled={busy}
                    key={passage.join(":")}
                    onClick={() => onAction({ type: "BLOCK_PASSAGE", passage })}
                  >
                    {passage.map(roomName).join(" ↔ ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="room-notes">
            <div><MapPin size={19} /><h3>내 추리 메모</h3><span>턴을 소비하지 않음</span></div>
            <div className="room-mark-grid">
              {view.layout.rooms.map((room) => {
                const mark = marks[room.id] ?? "UNKNOWN";
                return (
                  <button
                    className={`mark-${mark.toLowerCase()}`}
                    key={room.id}
                    onClick={() => setMarks((current) => ({
                      ...current,
                      [room.id]: nextMark[mark],
                    }))}
                  >
                    <strong>{room.name}</strong>
                    <span>{markCopy[mark]}</span>
                  </button>
                );
              })}
            </div>
            <button
              className="secondary-button save-marks"
              disabled={busy}
              onClick={() => onSaveMarks(view.self.privateStateRevision ?? 0, marks)}
            >
              메모 저장
            </button>
          </div>
          {view.phase === "INTRUDER_TURN" && (
            <p className="waiting-copy">괴도가 움직이는 동안 메모를 정리할 수 있습니다.</p>
          )}
        </>
      )}

      {legal.has("ACK_ROUND_RESULT") && (
        <button
          className="primary-button footprints-ready"
          disabled={busy}
          onClick={() => onAction({ type: "ACK_ROUND_RESULT" })}
        >
          다음 라운드로
        </button>
      )}

      {legal.has("CAST_REMATCH_VOTE") && (
        <div className="rematch-votes">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => onAction({ type: "CAST_REMATCH_VOTE", vote: "REMATCH" })}
          >
            한 판 더
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onAction({ type: "CAST_REMATCH_VOTE", vote: "END" })}
          >
            오늘은 여기까지
          </button>
        </div>
      )}

      {legal.has("CLAIM_FORFEIT") && (
        <button
          className="secondary-button danger-text"
          disabled={busy}
          onClick={() => onAction({ type: "CLAIM_FORFEIT" })}
        >
          연결 해제 기권 종료 청구
        </button>
      )}
    </section>
  );
}
