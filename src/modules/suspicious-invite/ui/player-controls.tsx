"use client";

import { useMemo, useState } from "react";
import type { SuspiciousInvitePlayerRoomView } from "@/modules/room/contracts";
import type { SuspiciousInviteAction } from "@/modules/suspicious-invite/domain/types";
import { CircleHelp, MessageSquareText, Vote } from "@/shared/ui/icons";

export function SuspiciousInvitePlayerControls({
  view,
  busy,
  onAction,
}: {
  view: SuspiciousInvitePlayerRoomView;
  busy: boolean;
  onAction: (action: SuspiciousInviteAction) => Promise<void>;
}) {
  const [clues, setClues] = useState(() => view.cluePrompts.map(() => ""));
  const legal = useMemo(() => new Set(view.self.legalActions), [view.self.legalActions]);
  const selfPlayer = view.players.find((player) => player.seat === view.self.seat);

  return (
    <section className="player-controls suspicious-controls">
      <div className={`role-card ${view.self.role === "STRANGER" ? "stranger-role" : "guest-role"}`}>
        <span>ROUND {view.round} · {view.category}</span>
        {view.self.role === "STRANGER" ? (
          <><CircleHelp size={38} /><h2>당신은 Stranger</h2><p>비밀 단어를 모릅니다. 다른 사람의 단서에 자연스럽게 섞이세요.</p></>
        ) : (
          <><MessageSquareText size={34} /><h2>{view.self.secretWord}</h2><p>당신은 Guest입니다. 단어를 직접 쓰지 말고 알아볼 만한 단서를 남기세요.</p></>
        )}
      </div>

      {legal.has("SUBMIT_CLUE") && (
        <div className="clue-form">
          {view.cluePrompts.map((prompt, index) => (
            <label key={prompt}>
              <span>{prompt}</span>
              <input
                value={clues[index] ?? ""}
                maxLength={24}
                placeholder="짧은 단서 입력"
                onChange={(event) => setClues((current) => current.map((clue, clueIndex) => clueIndex === index ? event.target.value : clue))}
              />
            </label>
          ))}
          <button className="primary-button" disabled={busy || clues.some((clue) => !clue.trim())} onClick={() => onAction({ type: "SUBMIT_CLUE", clues })}>
            <MessageSquareText size={19} /> 단서 몰래 제출하기
          </button>
        </div>
      )}

      {view.self.submittedClues && view.phase === "CLUE_SUBMISSION" && (
        <div className="private-submission"><span>내가 제출한 단서</span>{view.self.submittedClues.map((clue) => <strong key={clue}>{clue}</strong>)}</div>
      )}

      {legal.has("CAST_SUSPICION_VOTE") && (
        <div className="private-choice">
          <div><Vote size={24} /><h3>누가 Stranger일까요?</h3><p>투표는 모두 제출된 뒤 집계됩니다.</p></div>
          <div className="suspicion-targets">
            {view.players.filter((player) => player.seat !== view.self.seat).map((player) => (
              <button className="secondary-button" disabled={busy} key={player.seat} onClick={() => onAction({ type: "CAST_SUSPICION_VOTE", targetSeat: player.seat })}>
                {player.nickname}
              </button>
            ))}
          </div>
        </div>
      )}

      {legal.has("GUESS_WORD") && view.self.guessOptions && (
        <div className="private-choice">
          <div><CircleHelp size={24} /><h3>비밀 단어를 맞혀보세요</h3><p>한 번만 선택할 수 있습니다.</p></div>
          <div className="guess-options">
            {view.self.guessOptions.map((option) => (
              <button className="secondary-button" disabled={busy} key={option.id} onClick={() => onAction({ type: "GUESS_WORD", wordId: option.id })}>{option.word}</button>
            ))}
          </div>
        </div>
      )}

      {legal.has("CAST_END_VOTE") && (
        <div className="private-choice end-choice">
          <div><Vote size={24} /><h3>계속 초대할까요?</h3><p>과반이 종료를 선택하면 현재 점수로 승자를 정합니다.</p></div>
          <button className="primary-button" disabled={busy} onClick={() => onAction({ type: "CAST_END_VOTE", vote: "CONTINUE" })}>한 판 더</button>
          <button className="secondary-button" disabled={busy} onClick={() => onAction({ type: "CAST_END_VOTE", vote: "END" })}>오늘은 여기까지</button>
        </div>
      )}

      {!view.self.legalActions.length && (
        <p className="waiting-copy">{selfPlayer?.nickname}님의 선택은 완료되었습니다. 다른 플레이어를 기다리는 중입니다.</p>
      )}
    </section>
  );
}
