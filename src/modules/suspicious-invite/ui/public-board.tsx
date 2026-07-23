import type { SuspiciousInvitePublicRoomView } from "@/modules/room/contracts";
import { CircleHelp, MessageSquareText, UsersRound, Vote } from "@/shared/ui/icons";

const phaseLabels: Record<SuspiciousInvitePublicRoomView["phase"], string> = {
  ROUND_INTRO: "새 초대장이 도착했습니다",
  CLUE_SUBMISSION: "모두 단서를 적는 중",
  CLUE_REVEAL: "단서를 공개합니다",
  DISCUSSION: "누가 모르는 척하고 있을까요?",
  VOTING: "가장 수상한 사람을 지목하세요",
  STRANGER_GUESS: "Stranger의 마지막 추측",
  ROUND_RESULT: "이번 초대의 진실",
  END_VOTE: "한 판 더 이어갈까요?",
  GAME_OVER: "오늘의 초대가 끝났습니다",
};

const outcomeCopy = {
  STRANGER_ESCAPED: "Stranger가 의심을 피했습니다",
  STRANGER_GUESSED: "Stranger가 비밀 단어를 맞혔습니다",
  GUESTS_CAUGHT: "Guest들이 Stranger를 붙잡았습니다",
} as const;

export function SuspiciousInvitePublicBoard({ view }: { view: SuspiciousInvitePublicRoomView }) {
  const stranger = view.lastRound
    ? view.players.find((player) => player.seat === view.lastRound?.strangerSeat)
    : undefined;
  const accused = view.accusedSeat
    ? view.players.find((player) => player.seat === view.accusedSeat)
    : undefined;
  const winners = view.players.filter((player) => view.winnerSeats?.includes(player.seat));
  const seconds = view.phaseEndsAt
    ? Math.max(0, Math.ceil((new Date(view.phaseEndsAt).getTime() - new Date(view.serverNow).getTime()) / 1_000))
    : undefined;

  return (
    <section className="board suspicious-board" aria-live="polite">
      <header className="board-header suspicious-header">
        <div>
          <span className="room-code">ROOM {view.room.code} · ROUND {view.round}</span>
          <h1>{winners.length > 0 ? `${winners.map((player) => player.nickname).join(", ")} 승리` : phaseLabels[view.phase]}</h1>
        </div>
        <div className="category-ticket"><span>CATEGORY</span><strong>{view.category}</strong></div>
      </header>

      <div className="score-strip">
        {view.players.map((player) => (
          <article key={player.seat} className={view.accusedSeat === player.seat ? "is-accused" : ""}>
            <span>{String(player.seat).padStart(2, "0")}</span>
            <strong>{player.nickname}</strong>
            <b>{player.score}점</b>
            {!player.connected && <i>연결 끊김</i>}
          </article>
        ))}
      </div>

      {view.phase === "ROUND_INTRO" && (
        <div className="suspicious-stage intro-stage"><CircleHelp size={48} /><p>각자 휴대폰에서 이번 라운드의 역할을 확인하세요.</p></div>
      )}

      {view.phase === "CLUE_SUBMISSION" && (
        <div className="suspicious-stage progress-stage">
          <MessageSquareText size={34} />
          <strong>{view.submittedCount.clues} / {view.players.length}</strong>
          <p>제출된 단서는 모두 준비될 때까지 공개되지 않습니다.</p>
        </div>
      )}

      {view.clues && (
        <div className="clue-board">
          {view.clues.map((clue) => {
            const player = view.players.find((candidate) => candidate.seat === clue.seat);
            return (
              <article key={clue.seat}>
                <span>{String(clue.seat).padStart(2, "0")} · {player?.nickname}</span>
                {clue.entries.map((entry, index) => (
                  <p key={index}><small>{view.cluePrompts[index]}</small><strong>{entry}</strong></p>
                ))}
              </article>
            );
          })}
        </div>
      )}

      {view.phase === "DISCUSSION" && (
        <div className="discussion-banner"><UsersRound size={24} /><strong>{seconds ?? 0}초</strong><span>서로의 단서를 이야기하세요</span></div>
      )}

      {view.phase === "VOTING" && (
        <div className="suspicious-stage progress-stage"><Vote size={34} /><strong>{view.submittedCount.suspicionVotes} / {view.players.length}</strong><p>투표 내용은 모두 제출될 때까지 비밀입니다.</p></div>
      )}

      {view.phase === "STRANGER_GUESS" && accused && (
        <div className="stranger-banner"><CircleHelp size={32} /><strong>{accused.nickname}님이 Stranger였습니다</strong><p>비밀 단어를 맞히면 아직 역전할 수 있습니다.</p></div>
      )}

      {view.lastRound && (
        <div className="round-truth">
          <span>{outcomeCopy[view.lastRound.outcome]}</span>
          <strong>비밀 단어 · {view.lastRound.word}</strong>
          <p>Stranger는 <b>{stranger?.nickname}</b>님이었습니다.</p>
          <div className="vote-tally">
            {view.players.map((player) => (
              <span key={player.seat}>{player.nickname} <b>{view.lastRound?.suspicionCounts[player.seat] ?? 0}표</b></span>
            ))}
          </div>
        </div>
      )}

      {view.phase === "END_VOTE" && (
        <div className="end-vote-progress"><Vote size={22} /><span>종료 투표 {view.submittedCount.endVotes} / {view.players.length}</span></div>
      )}
    </section>
  );
}
