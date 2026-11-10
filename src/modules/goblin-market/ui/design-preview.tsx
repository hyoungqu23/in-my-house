"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { RoomAction } from "@/modules/room/contracts";
import { createMarketState, transitionMarket } from "../domain/reducer";
import { marketRent } from "../domain/rules";
import type { MarketAction, MarketCardKind, MarketState } from "../domain/types";
import { projectMarketPlayer, projectMarketPublic } from "../projection/game-view";
import { GoblinMarketPlayerControls } from "./player-controls";
import { GoblinMarketPublicBoard } from "./public-board";
import styles from "./game.module.css";

type Scenario = "board" | "hand" | "result";
const context = { now: 1000, randomIndex: () => 0 };
const projectionContext = { code: "PREVIEW", version: 1, now: 1000, status: "playing" as const, hostUserId: "demo1", viewerUserId: "demo1", connectedSeats: [1, 2, 3, 4] };
function previewState(): MarketState {
  const names = ["도깨비상인", "여우상인", "달토끼상인", "유령상인"];
  const state = createMarketState(names.map((nickname, i) => ({ seat: i + 1, userId: `demo${i + 1}`, nickname })), "design-preview", context);
  const owners = [2, 1, 1, null, 3, 4, null, 2, 4, 3, null, 1, 2, 4, 3, 1];
  state.shops.forEach((shop, i) => { shop.ownerSeat = owners[i]; shop.level = [1, 4, 12].includes(shop.tile) ? 1 : 0; });
  const pool = [...state.deck, ...state.players.flatMap(player => player.hand)];
  const hands: MarketCardKind[][] = [["C", "H"], ["M", "W"], ["H", "W"], ["C", "M"]];
  state.players.forEach((player, i) => {
    player.cash = [17, 23, 12, 20][i]; player.position = [1, 8, 21, 11][i];
    player.hand = hands[i].map(kind => pool.splice(pool.findIndex(card => card.kind === kind), 1)[0]);
  });
  state.deck = pool; state.order = [1, 3, 2, 4]; state.turnIndex = 0; state.night = 3;
  state.trends[2] = "food"; state.trends[3] = "fortune";
  state.phase = "MARKET_DUEL"; state.phaseEndsAt = undefined;
  state.duel = { visitorSeat: 1, ownerSeat: 2, tile: 1, originalRent: marketRent(state, state.shops[0]), choices: {} };
  state.lastRoll = { seat: 1, dice: [4, 3], from: 22, to: 1 };
  state.log = [{ id: 1, night: 3, text: "도깨비상인님이 여우상인의 달토끼 떡집에 도착했어요. 어떤 장난을 걸어볼까요?" }];
  return state;
}
function reveal(state: MarketState) {
  const owner = state.players[1];
  return transitionMarket(state, owner.seat, { type: "MARKET_DUEL", phaseKey: state.phaseKey, cardId: owner.hand.find(card => card.kind === "M")!.id }, context);
}
export function MarketDesignPreview() {
  const [scenario, setScenario] = useState<Scenario>("board");
  const [state, setState] = useState(previewState);
  const [error, setError] = useState("");
  function changeScenario(next: Scenario) {
    let sample = previewState();
    if (next === "result") {
      sample = transitionMarket(sample, 1, { type: "MARKET_DUEL", phaseKey: sample.phaseKey, cardId: sample.players[0].hand[0].id, targetTile: 4 }, context);
      sample = reveal(sample);
    }
    sample.phaseEndsAt = undefined;
    setState(sample); setScenario(next); setError("");
  }
  function onAction(action: RoomAction) {
    if (!("phaseKey" in action) || !action.type.startsWith("MARKET_")) return;
    try {
      let next = transitionMarket(state, 1, action as MarketAction, context);
      if (next.phase === "MARKET_DUEL" && next.duel?.choices[1] && !next.duel.choices[2]) next = reveal(next);
      next.phaseEndsAt = undefined;
      setState(next); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "다시 골라주세요."); }
  }
  return <main className={styles.previewPage}>
    <div className={styles.previewShell}>
      <nav className={styles.previewNav} aria-label="미리보기 탐색"><Link href="/"><ArrowLeft size={15} /> 게임 목록</Link><div className={styles.previewTabs} aria-label="미리보기 장면">
        {([{ id: "board", name: "장터 보드" }, { id: "hand", name: "카드 골라보기" }, { id: "result", name: "대결 결과" }] as const).map(item => <button key={item.id} aria-pressed={scenario === item.id} onClick={() => changeScenario(item.id)}>{item.name}</button>)}
      </div></nav>
      <p className={styles.previewNote}>디자인 미리보기 · 예시 상인들과 카드 선택을 살펴보세요. 실제 경기는 홈에서 3–4명이 함께 시작해요.</p>
      {error && <p role="alert" className={styles.previewNote}>{error}</p>}
      {scenario === "hand" ? <GoblinMarketPlayerControls view={projectMarketPlayer(state, projectionContext)} busy={false} onAction={onAction} /> : <GoblinMarketPublicBoard view={projectMarketPublic(state, projectionContext)} />}
    </div>
  </main>;
}
