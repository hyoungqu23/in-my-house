"use client";

import { Check, LockKeyhole, Radio, ToggleLeft } from "lucide-react";
import { useMemo } from "react";
import type { SwitchboardAction } from "@/modules/dawn-switchboard/domain/types";
import type { DawnSwitchboardPlayerRoomView } from "@/modules/room/contracts";
import { ModuleGlyph } from "./module-glyph";

export function DawnSwitchboardPlayerControls({
  view,
  busy,
  onAction,
}: {
  view: DawnSwitchboardPlayerRoomView;
  busy: boolean;
  onAction: (action: SwitchboardAction) => Promise<void>;
}) {
  const legal = useMemo(() => new Set(view.self.legalActions), [view.self.legalActions]);
  const activePlayer = view.players.find((player) => player.seat === view.activeSeat);
  const availableModules = view.modules.filter(
    (module) => !view.lockedSequence.some((locked) => locked.id === module.id),
  );

  return (
    <section className="player-controls switchboard-controls">
      <div className="control-heading">
        <div><span className="room-code">PANEL {view.stage}/{view.stageCount}</span><h2>내 비상 단서</h2></div>
        <span className="flash-status available"><LockKeyhole size={15} /> 내 화면 전용</span>
      </div>

      <div className="communication-rule">
        <Radio size={21} />
        <p><strong>말로 자유롭게 공유하세요.</strong> 문구를 읽어도 되지만 휴대폰 화면은 서로 보여주지 않는 것이 권장 규칙입니다.</p>
      </div>

      <div className="private-clues">
        {view.self.clues.map((clue, index) => (
          <article key={clue}>
            <span>CLUE {String(index + 1).padStart(2, "0")}</span>
            <strong>{clue}</strong>
          </article>
        ))}
      </div>

      {legal.has("MARK_READY") && (
        <button className="primary-button ready-switchboard" disabled={busy} onClick={() => onAction({ type: "MARK_READY" })}>
          <Check size={19} /> 단서를 확인했습니다
        </button>
      )}

      {view.phase === "BRIEFING" && view.self.ready && (
        <p className="waiting-copy">준비 완료. 다른 플레이어가 단서를 확인하고 있습니다.</p>
      )}

      {legal.has("CONFIRM_MODULE") && (
        <div className="switch-selector">
          <div><ToggleLeft size={24} /><h3>다음 스위치를 확정하세요</h3><p>팀과 충분히 이야기한 뒤 하나를 선택하세요. 선택 즉시 판정됩니다.</p></div>
          <div className="switch-options">
            {availableModules.map((module) => {
              const rejected = view.rejectedModuleIds.includes(module.id);
              return (
                <button
                  className={rejected ? "is-rejected" : ""}
                  disabled={busy || rejected}
                  key={module.id}
                  onClick={() => onAction({ type: "CONFIRM_MODULE", moduleId: module.id })}
                >
                  <ModuleGlyph module={module} size={28} />
                  {rejected && <small>현재 칸에서 실패</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view.phase === "SOLVING" && !legal.has("CONFIRM_MODULE") && (
        <p className="waiting-copy"><strong>{activePlayer?.nickname}</strong>님이 다음 스위치를 조작합니다. 내 단서를 말로 전달하세요.</p>
      )}

      {view.phase === "PANEL_RESULT" && (
        <p className="waiting-copy">배전반 복구 성공. 다음 단서를 준비하는 중입니다.</p>
      )}

      {view.phase === "GAME_OVER" && (
        <p className="waiting-copy">{view.result?.outcome === "RESTORED" ? "집의 전력을 되찾았습니다!" : "공개 화면에서 최종 결과를 확인하세요."}</p>
      )}
    </section>
  );
}
