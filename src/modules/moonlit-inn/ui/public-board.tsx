import type { MoonlitInnPlayerRoomView, MoonlitInnPublicRoomView } from "@/modules/room/contracts";
import { INN_CURRENT_RULES_VERSION, INN_GUESTS, innRules } from "../domain/content";
import type { InnRulesVersion } from "../domain/types";
import { InnBoard } from "./inn-board";
import styles from "./game.module.css";

export const innPhaseTitle = (phase: MoonlitInnPublicRoomView["phase"]) => ({ INN_DRAFT: "오늘의 손님을 골라요", INN_ARRANGE: "보름달이 뜨기 전에", INN_REVEAL: "손님들의 비밀이 깨어나요", INN_NIGHT: "모두에게 잠자리를", GAME_OVER: "잘 자요, 손님들" })[phase];
export function InnScoreDetails({ player, rulesVersion = INN_CURRENT_RULES_VERSION }: { player: MoonlitInnPublicRoomView["players"][number]; rulesVersion?: InnRulesVersion }) {
  if (!player.score) return <div className={styles.forecast}><span>지붕 달빛 <strong>{player.forecast.roof.total}별</strong></span><span>정원 안개 <strong>{player.forecast.garden.total}별</strong></span></div>;
  return <div className={styles.scoreDetails}>
    {player.score.guests.map(row => <div key={row.id}><strong>{INN_GUESTS[player.guests.find(guest => guest.id === row.id)!.kind].name}</strong><span>{row.base + row.comfort}별</span><small>{row.reason}</small></div>)}
    <div><strong>달빛 보너스</strong><span>+{player.score.moon}</span><small>해당 층의 잠든 손님마다 +1, 여관 최대 +{innRules(rulesVersion).moonCap}</small></div>
    <p>합계 <strong>{player.score.total}별</strong></p>
  </div>;
}
export function MoonlitInnPublicBoard({ view, display = false }: { view: MoonlitInnPublicRoomView | MoonlitInnPlayerRoomView; display?: boolean }) {
  const night = view.weather !== undefined;
  return <section className={`${styles.game} ${display ? styles.display : ""} ${view.phase === "INN_REVEAL" ? styles.reveal : ""}`} data-testid="inn-public">
    <header className={styles.header}><div><span className={styles.eyebrow}>보름달 여관 · 네 사람의 하룻밤</span><h1>{innPhaseTitle(view.phase)}</h1></div><span className={styles.moon}>{night ? view.weather === "roof" ? "지붕 달빛" : "정원 안개" : "두 가지 달빛 예보"}</span></header>
    {view.pause && <p className={styles.notice} role="status">친구가 다시 연결할 때까지 기다리고 있어요. 배치와 선택은 그대로 남아 있어요.</p>}
    {view.phase === "INN_DRAFT" && <p className={styles.hint}>꾸러미 {view.draftRound + 1}/3 · {view.players.filter(p => p.picked).length}/4명 선택 · 고르지 않은 꾸러미는 왼쪽으로</p>}
    {view.phase === "INN_REVEAL" && <p className={styles.notice} role="status">작았던 손님들이 본모습으로 변하고 있어요. 곧 정리와 교환을 시작합니다.</p>}
    {view.result && <section className={styles.result} aria-label="최종 점수"><h2>{view.result.cancelled ? "다음 보름달에 다시 만나요" : `${view.players.filter(p => view.result!.winnerSeats.includes(p.seat)).map(p => p.nickname).join(" · ")}${view.result.winnerSeats.length > 1 ? " 공동 우승" : " 우승"}`}</h2><p>{view.result.cancelled ? "연결이 돌아오지 않아 승자 없이 마쳤어요." : "잠든 손님과 특별한 부탁, 오늘의 달빛을 함께 정산했어요."}</p></section>}
    <div className={styles.publicInns}>{view.players.map(player => <article key={player.seat} className={styles.publicInn}><header><h2>{player.nickname}의 여관</h2><span>{player.score ? `${player.score.total}별` : player.picked ? "선택 완료" : "준비 중"}</span></header><InnBoard board={player} night={night} label={`${player.nickname}님의 공개 여관`} score={player.score} /><footer><span>{player.connected ? player.ready ? "준비 완료" : "연결됨" : "연결 끊김"}</span>{view.phase === "INN_NIGHT" && <span>정리권 {player.actionsLeft}장 · {player.traded ? "교환 완료" : "교환 가능"}</span>}</footer>{view.phase === "GAME_OVER" && !view.result?.cancelled && <InnScoreDetails player={player} rulesVersion={view.rulesVersion} />}</article>)}</div>
    {view.offers.length > 0 && <div className={styles.tradeLog}><h2>이웃의 제안</h2>{view.offers.map(offer => <p key={offer.id}>{view.players.find(p => p.seat === offer.fromSeat)?.nickname} → {view.players.find(p => p.seat === offer.toSeat)?.nickname} · {offer.kind === "guest" ? "손님" : "가구"} 교환을 기다려요</p>)}</div>}
    {view.trades.length > 0 && <div className={styles.tradeLog}><h2>오늘 오간 인사</h2>{view.trades.map((trade, index) => <p key={index}>{view.players.find(p => p.seat === trade.fromSeat)?.nickname} ↔ {view.players.find(p => p.seat === trade.toSeat)?.nickname} · {trade.fromName}와 {trade.toName}</p>)}</div>}
  </section>;
}
