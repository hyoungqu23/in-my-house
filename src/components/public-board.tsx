import { Ghost, KeyRound, Zap } from "./icons";
import { PublicRoomView } from "@/features/dark-house/types";

const phaseLabels: Record<string, string> = {
  LOBBY: "사람들이 모이는 중",
  INITIAL_PLACEMENT: "첫 번째 방을 고르는 중",
  TURN: "방을 더 놓거나 입찰하세요",
  BIDDING: "숫자를 올리거나 물러나세요",
  REVEAL_CHOICE: "도전자가 방문할 집을 고릅니다",
  REVEALING: "문이 열립니다",
  ROUND_END: "이번 밤의 결과",
  GAME_OVER: "새벽이 밝았습니다",
};

export function PublicBoard({ view }: { view: PublicRoomView }) {
  const winner = view.players.find((player) => player.seat === view.winnerSeat);
  return (
    <section className="board" aria-live="polite">
      <header className="board-header">
        <div>
          <span className="room-code">ROOM {view.room.code}</span>
          <h1>{winner ? `${winner.nickname}의 승리` : phaseLabels[view.phase] ?? view.phase}</h1>
        </div>
        {view.bid && (
          <div className="bid-display">
            <span>현재 선언</span>
            <strong>{view.bid.amount}</strong>
          </div>
        )}
      </header>

      <div className="houses-grid">
        {view.players.map((player) => {
          const stack = view.stacks.find((item) => item.seat === player.seat);
          const isTurn = view.turnSeat === player.seat;
          return (
            <article className={`house-card ${isTurn ? "is-turn" : ""} ${!player.active ? "is-out" : ""}`} key={player.seat}>
              <div className="house-name-row">
                <span className="seat-number">{String(player.seat).padStart(2, "0")}</span>
                <h2>{player.nickname}</h2>
                {player.isHost && <span className="host-badge">HOST</span>}
              </div>
              <div className="door-stack" aria-label={`${player.nickname}의 놓인 방 ${stack?.count ?? 0}개`}>
                {Array.from({ length: stack?.count ?? 0 }, (_, index) => {
                  const revealed = stack?.revealed[index];
                  return (
                    <span className={`door-token ${revealed?.kind === "GHOST" ? "ghost-token" : ""}`} key={index}>
                      {revealed?.kind === "GHOST" && <Ghost size={22} aria-label="유령" />}
                    </span>
                  );
                })}
                {(stack?.count ?? 0) === 0 && <span className="empty-stack">아직 조용함</span>}
              </div>
              <footer>
                <span><KeyRound size={15} /> 열쇠 {player.keyCount}/2</span>
                <span><Zap size={15} /> {player.flashlightUsed ? "사용함" : "사용 가능"}</span>
              </footer>
              {!player.connected && <div className="connection-badge">연결 끊김</div>}
              {player.passed && <div className="passed-badge">이번 입찰 포기</div>}
            </article>
          );
        })}
      </div>

      {view.reveal && (
        <div className={`reveal-banner ${view.reveal.kind === "GHOST" ? "ghost-reveal" : ""}`}>
          {view.reveal.kind === "GHOST" ? <Ghost size={30} /> : <span className="flash-disc" />}
          <strong>{view.reveal.kind === "GHOST" ? "유령이 숨어 있었습니다" : view.reveal.kind === "EMPTY" ? "빈 방입니다" : "문을 여는 중…"}</strong>
        </div>
      )}
      {view.roundResult && !view.reveal && (
        <div className={`result-banner ${view.roundResult.outcome === "GHOST" ? "danger" : "success"}`}>
          {view.roundResult.outcome === "SUCCESS" ? "도전 성공 · 열쇠를 얻었습니다" : "도전 실패 · 방 하나를 잃습니다"}
        </div>
      )}
    </section>
  );
}
