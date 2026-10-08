"use client";

import { Heart, Leaf } from "lucide-react";
import type { ConnectedForestPlayerRoomView, ConnectedForestPublicRoomView } from "@/modules/room/contracts";
import { useServerClock } from "@/shared/ui/use-server-clock";
import { connectedForestRules } from "../domain/content";
import { ForestBoard } from "./forest-board";
import { FOREST_FRIENDS, ForestAnimalArt } from "./forest-art";
import styles from "./game.module.css";

export const FOREST_SEASONS = ["새싹", "꽃비", "초록", "단풍", "첫눈"];
export const FOREST_PHASE_LABELS = {
  SEASON_DRAFT: "지형을 고르고 숲을 꾸며요",
  SEASON_VISIT_SELECT: "이웃에게 놀러 갈 친구를 골라요",
  SEASON_VISIT_RESPOND: "놀러 온 친구를 맞이해요",
  SEASON_REVEAL: "이번 계절의 인사를 모아봐요",
  GAME_OVER: "다섯 계절의 숲이 완성됐어요",
};
type ForestView = ConnectedForestPublicRoomView | ConnectedForestPlayerRoomView;

export function ForestPhaseHeader({ view, deadline }: { view: ForestView; deadline?: string }) {
  const now = useServerClock(view.serverNow);
  const clock = view.pause ? Date.parse(view.pause.pausedAt) : now;
  const remaining = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - clock) / 1000)) : undefined;
  return <header className={styles.phaseHeader}>
    <div><span className={styles.eyebrow}>이어지는 숲길 · 계절 {view.seasonIndex + 1}/5</span><h1>{FOREST_SEASONS[view.seasonIndex]}의 작은 숲</h1><p>{FOREST_PHASE_LABELS[view.phase]}</p></div>
    <div className={styles.seasonStatus}>{view.phase === "SEASON_DRAFT" && <span>바구니 {view.pickIndex + 1}/3 · {view.passDirection === "LEFT" ? "← 왼쪽" : "오른쪽 →"}으로 전달</span>}{remaining !== undefined && <strong role="timer" aria-label="선택 남은 시간">{remaining}초</strong>}</div>
  </header>;
}

export function ForestPauseNotice({ view }: { view: ForestView }) {
  if (!view.pause) return null;
  const names = view.pause.disconnectedSeats.map((seat) => view.players.find((player) => player.seat === seat)?.nickname).join(", ");
  return <div className={styles.pause} role="status"><strong>{names}님의 연결을 기다리고 있어요.</strong><p>선택과 남은 시간은 보관했어요. 다시 들어오면 함께 이어갑니다.</p></div>;
}

export function ForestResult({ view }: { view: ForestView }) {
  if (!view.result) return null;
  if (view.result.forfeited) return <section className={styles.result}><h2>이번 산책은 여기까지</h2><p>연결이 돌아오지 않아 승자 없이 마쳤어요. 다시 모이면 새 숲을 시작할 수 있어요.</p></section>;
  const names = view.result.winnerSeats?.map((seat) => view.players.find((player) => player.seat === seat)?.nickname).join(", ");
  return <section className={styles.result} aria-label="최종 점수">
    <span className={styles.eyebrow}>다섯 계절의 작은 추억</span><h2>{names}님의 숲이 가장 다정했어요</h2><p>{(view.result.winnerSeats?.length ?? 0) > 1 ? "공동 승리" : "숲길의 주인공"}</p>
    <div className={styles.scoreTable}>{view.result.scores?.map((score) => <article key={score.seat}>
      <strong>{view.players.find((player) => player.seat === score.seat)?.nickname}</strong><span className={styles.total}><Heart size={17} /> {score.total}</span>
      <dl><div><dt>주민</dt><dd>{score.residentHearts}</dd></div><div><dt>방문객</dt><dd>{score.visitorHearts}</dd></div><div><dt>잎 <small>(숲길 {score.leafHeartsFromPaths})</small></dt><dd>{score.leafHearts}</dd></div><div><dt>다섯 빛깔</dt><dd>{score.balanceBonus}</dd></div></dl>
    </article>)}</div>
  </section>;
}

export function ForestPaths({ view }: { view: ForestView }) {
  const cap = connectedForestRules(view.rulesVersion).pathCap;
  return <section className={styles.paths} aria-label="공동 숲길"><h2>우리 사이의 오솔길</h2><div>
    {view.neighborPaths.map((path) => <article key={`${path.lowSeat}:${path.highSeat}`}>
      <span>{view.players.find((player) => player.seat === path.lowSeat)?.nickname} ↔ {view.players.find((player) => player.seat === path.highSeat)?.nickname}</span>
      <span className={styles.pathDots} aria-label={`숲길 ${path.length}/${cap}`}>{Array.from({ length: cap }, (_, index) => <i key={index} className={index < path.length ? styles.pathDone : ""}><Leaf size={15} /></i>)}</span>
    </article>)}
  </div></section>;
}

export function ForestVisitTimeline({ view }: { view: ForestView }) {
  if (view.seasonVisitResults.length === 0) return null;
  return <section className={styles.timeline} aria-label="이번 계절의 방문"><h2>이번 계절에 오간 인사</h2>{view.seasonVisitResults.map((visit) => <article key={visit.visitId}>
    <ForestAnimalArt species={visit.speciesId} decorative /><p><strong>{view.players.find((player) => player.seat === visit.sourceSeat)?.nickname}님의 {FOREST_FRIENDS[visit.speciesId].name}</strong><br />{view.players.find((player) => player.seat === visit.targetSeat)?.nickname}님과 {visit.choice === "STAY" ? "폭신한 숲에 머물렀어요" : visit.choice === "WALK" ? "오솔길을 함께 걸었어요" : "다음에 또 만나기로 했어요"}.</p>
  </article>)}</section>;
}

export function ConnectedForestPublicBoard({ view, display = false }: { view: ConnectedForestPublicRoomView; display?: boolean }) {
  const sorted = [...view.players].sort((first, second) => first.seat - second.seat);
  const index = sorted.findIndex((player) => player.seat === view.viewer.playerSeat);
  const nearby = index < 0 ? new Set<number>() : new Set([sorted[index].seat, sorted[(index - 1 + sorted.length) % sorted.length].seat, sorted[(index + 1) % sorted.length].seat]);
  const showAll = display || index < 0;
  return <section className={`${styles.game} ${display ? styles.display : ""}`}>
    <ForestPhaseHeader view={view} deadline={view.phaseEndsAt} /><ForestPauseNotice view={view} /><ForestResult view={view} />
    <div className={styles.publicForests}>{view.players.map((player) => <article className={`${styles.publicForest} ${!showAll && !nearby.has(player.seat) ? styles.distantForest : ""}`} key={player.seat}>
      <header><h2>{player.nickname}님의 숲</h2><span><Heart size={16} /> {player.score.total}</span></header>
      {(showAll || nearby.has(player.seat)) && <ForestBoard board={player.board} figures={player.figures} label={`${player.nickname}님의 공개 숲`} />}
      <footer><span>{view.phase === "GAME_OVER" ? "이번 산책을 마쳤어요" : player.connected ? view.phase === "SEASON_DRAFT" ? player.locked ? "선택을 잠갔어요" : "숲을 꾸미는 중" : view.phase === "SEASON_VISIT_SELECT" ? player.visitSelected ? "방문 준비 완료" : "친구를 고르는 중" : "함께 산책 중" : "연결을 기다려요"}</span><span>주민 {player.figures.filter((figure) => figure.kind === "RESIDENT").length} · 방문객 {player.figures.filter((figure) => figure.kind === "VISITOR").length}</span></footer>
      <p className={styles.scoreLine}>주민 {player.score.residentHearts} · 방문객 {player.score.visitorHearts} · 잎 {player.score.leafHearts} (숲길 {player.score.leafHeartsFromPaths}) · 균형 {player.score.balanceBonus}</p>
    </article>)}</div>
    <ForestPaths view={view} /><ForestVisitTimeline view={view} />
    <p className={styles.legend}>♥ 이웃 방문객 · 황금 도토리는 지형 색을 바꿀 수 있지만 동물의 자리가 되지는 않아요.</p>
  </section>;
}
