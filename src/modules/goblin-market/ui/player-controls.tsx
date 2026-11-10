"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { MarketCardArt, MarketMerchantArt, MarketShopArt } from "./market-art";
import type { GoblinMarketPlayerRoomView, RoomAction } from "@/modules/room/contracts";
import { MARKET_CARDS, MARKET_PHASE_NAMES, marketRules, marketTileName } from "../domain/content";
import type { MarketCommand } from "../domain/types";
import { GoblinMarketPublicBoard, MarketTimer } from "./public-board";
import styles from "./game.module.css";

type ControlsProps = {view:GoblinMarketPlayerRoomView;busy:boolean;onAction:(action:RoomAction)=>void};
export function GoblinMarketPlayerControls(props: ControlsProps) {
  return <div className={styles.private} data-testid="market-controls">
    <MarketActionPanel key={props.view.phaseKey} {...props}/>
    <GoblinMarketPublicBoard view={props.view}/>
  </div>;
}
function MarketActionPanel({view,busy,onAction}: ControlsProps) {
  const rules=marketRules(view.rulesVersion);
  const [cardId,setCardId]=useState<string|null>(null);
  const [targetTile,setTargetTile]=useState<number|undefined>(undefined);
  const self=view.players.find(player=>player.seat===view.self.seat)!;
  const can=(type:MarketCommand["type"])=>!busy && view.self.legalActions.includes(type);
  const send=(command:MarketCommand)=>onAction({...command,phaseKey:view.phaseKey});
  const card=view.self.hand.find(card=>card.id===cardId);
  const owned=view.shops.filter(shop=>shop.ownerSeat===self.seat);
  const name=(seat:number)=>view.players.find(player=>player.seat===seat)?.nickname;
  const ownerIndex=(seat:number|null)=>seat===null ? undefined : view.players.findIndex(player=>player.seat===seat);
  const isDuel=view.phase==="MARKET_DUEL";
  const selectedTarget=targetTile ?? view.self.exchangeTiles[0];
  return <section className={styles.actionPanel}>
      <header className={styles.heading}><div className={styles.headingTitle}><MarketMerchantArt index={view.players.findIndex(player=>player.seat===self.seat)} className={styles.selfPortrait}/><div><span className={styles.kicker}>{self.nickname}님의 장사 · {view.night}/{rules.nights}밤</span><h1>{MARKET_PHASE_NAMES[view.phase]}</h1></div></div><MarketTimer view={view}/></header>
      <div className={styles.wallet}><span>내 엽전 <strong>{self.cash}</strong></span><span>총 자산 <strong>{self.assets}</strong></span><span>가게 <strong>{owned.length}채</strong></span></div>
      {view.phase==="GAME_OVER" ? <p>장사가 끝났어요. 아래에서 최종 자산과 우승자를 확인하세요.</p> : view.self.choice ? <div className={styles.locked} role="status"><strong>선택을 확정했어요</strong><p>{view.self.choice.cardId ? MARKET_CARDS[view.self.hand.find(card=>card.id===view.self.choice!.cardId)!.kind].name : "패스"}{view.self.choice.targetTile!==undefined ? ` · ${marketTileName(view.self.choice.targetTile, view.rulesVersion)}` : ""}</p><span>상대가 고르면 함께 공개됩니다.</span></div> : view.self.legalActions.length===0 ? <p className={styles.waiting}>{view.actingSeats.map(name).join(" · ")}님의 선택을 기다려요. 내 카드는 아래에서 미리 확인하세요.</p> : <>
        {can("MARKET_ROLL") && <><p>{view.night===1 ? "첫 밤에는 상대 가게에 들러도 요금을 내지 않아요." : "두 주사위를 굴려 장터를 돌아보세요."}</p><button className={styles.primary} onClick={()=>send({type:"MARKET_ROLL"})}>주사위 두 개 굴리기</button></>}
        {view.phase==="MARKET_BUY" && <><p>가게 한 채에 6엽전. 이후 4엽전으로 한 번 증축할 수 있어요.</p><div className={styles.options}>{view.self.buyTiles.map(tile=><button key={tile} disabled={!can("MARKET_BUY")} onClick={()=>send({type:"MARKET_BUY",tile})}><MarketShopArt category={view.shops.find(shop=>shop.tile===tile)!.category}/><strong>{marketTileName(tile, view.rulesVersion)}</strong><span>기본 노점 · 6엽전</span></button>)}</div><button className={styles.secondary} disabled={!can("MARKET_BUY")} onClick={()=>send({type:"MARKET_BUY",tile:null})}>매입하지 않고 지나가기</button></>}
        {view.phase==="MARKET_PORTAL" && <><p>어느 가게로 갈까요? 지름길 이동에는 달문 보너스가 없어요.</p><div className={styles.options}>{view.shops.map(shop=><button key={shop.tile} disabled={!can("MARKET_PORTAL")} onClick={()=>send({type:"MARKET_PORTAL",tile:shop.tile})}><MarketShopArt category={shop.category} ownerIndex={ownerIndex(shop.ownerSeat)}/><strong>{marketTileName(shop.tile, view.rulesVersion)}</strong><span>{shop.ownerSeat===null ? "빈 가게 · 매입 6" : `${name(shop.ownerSeat)} · 요금 ${view.night===1 || shop.ownerSeat===self.seat ? 0 : shop.rent}`}</span></button>)}</div></>}
        {view.phase==="MARKET_UPGRADE" && <><p>내 기본 노점 한 채를 4엽전에 증축해요. 방문 요금 2 → 4, 최종 가게 가치 6 → 10.</p><div className={styles.options}>{owned.filter(shop=>!shop.level).map(shop=><button key={shop.tile} disabled={!can("MARKET_UPGRADE")} onClick={()=>send({type:"MARKET_UPGRADE",tile:shop.tile})}><MarketShopArt category={shop.category} ownerIndex={ownerIndex(shop.ownerSeat)}/><strong>{marketTileName(shop.tile, view.rulesVersion)}</strong><span>증축 · 4엽전</span></button>)}</div><button className={styles.secondary} disabled={!can("MARKET_UPGRADE")} onClick={()=>send({type:"MARKET_UPGRADE",tile:null})}>증축 없이 턴 마치기</button></>}
        {view.phase==="MARKET_SETTLE" && <><p>{name(view.payment!.toSeat)}님에게 {view.payment!.due}엽전을 내야 해요. 마지막 가게는 지켜집니다.</p><div className={styles.options}>{owned.map(shop=><button key={shop.tile} disabled={!can("MARKET_SELL") || owned.length<=1} onClick={()=>send({type:"MARKET_SELL",tile:shop.tile})}><MarketShopArt category={shop.category} ownerIndex={ownerIndex(shop.ownerSeat)}/><strong>{marketTileName(shop.tile, view.rulesVersion)} 매각</strong><span>{shop.level ? 5 : 3}엽전 받기</span></button>)}</div></>}
        {isDuel && view.duel && <><p><strong>{marketTileName(view.duel.tile, view.rulesVersion)} · 원래 요금 {view.duel.originalRent}엽전</strong><br/>{view.duel.visitorSeat===self.seat ? "방문객: 둔갑 계약이나 흥정을 골라요." : "점주: 바가지나 부적으로 맞서요."} 서로 고르면 동시에 공개해요.</p></>}
        {view.phase==="MARKET_DISCARD" && <p>버릴 카드 한 장을 골라요. 남은 두 장으로 다음 장사를 준비합니다.</p>}
      </>}
      <section className={styles.hand} aria-label="내 비밀 장난 카드"><h2>내 비밀 장난 <small>{view.self.hand.length}장</small></h2><div className={styles.cardGrid}>{view.self.hand.map(item=>{const enabled=can("MARKET_DISCARD") || can("MARKET_DUEL") && view.self.legalCardIds.includes(item.id); const info=MARKET_CARDS[item.kind]; return <button key={item.id} className={`${styles.card} ${item.id===cardId ? styles.selectedCard : ""}`} aria-label={`${info.name} · ${info.role}`} aria-describedby={`${item.id}-description`} aria-pressed={item.id===cardId} disabled={!enabled} onClick={()=>setCardId(item.id)}>{item.id===cardId && <span className={styles.selectedBadge}><Check aria-hidden="true"/>선택</span>}<span className={styles.cardRole}>{info.role}</span><MarketCardArt kind={item.kind}/><span className={styles.cardEffect} aria-hidden="true">{info.symbol}</span><strong>{info.name}</strong><span className={styles.cardDescription} id={`${item.id}-description`}>{info.description}</span></button>;})}</div>{!view.self.hand.length && <p>지금은 손패가 없어요. 둘째 밤부터 매 밤 한 장씩 받아요.</p>}</section>
      {can("MARKET_DUEL") && <div className={styles.confirm}>
        {card?.kind==="C" && <label>바꿔줄 내 가게<select value={selectedTarget ?? ""} onChange={event=>setTargetTile(Number(event.target.value))}>{view.self.exchangeTiles.map(tile=><option key={tile} value={tile}>{marketTileName(tile, view.rulesVersion)}</option>)}</select><small>성공하면 이전 점주에게 {Math.ceil(view.duel!.originalRent/2)}엽전 정산 · 부적에 막히면 {view.duel!.originalRent}엽전</small></label>}
        <button className={styles.primary} disabled={!card || !view.self.legalCardIds.includes(card.id) || card.kind==="C" && selectedTarget===undefined} onClick={()=>send({type:"MARKET_DUEL",cardId:card!.id,...(card?.kind==="C" ? {targetTile:selectedTarget}: {})})}>이 장난 확정하기</button>
        <button className={styles.secondary} onClick={()=>send({type:"MARKET_DUEL",cardId:null})}>카드 아끼고 패스</button><small>확정한 선택은 바꿀 수 없어요. 시간 만료 시 미확정자만 패스합니다.</small>
      </div>}
      {can("MARKET_DISCARD") && <button className={styles.primary} disabled={!card} onClick={()=>send({type:"MARKET_DISCARD",cardId:card!.id})}>이 카드 버리고 두 장 남기기</button>}
      {view.viewer.legalAdministrativeActions.includes("START_REMATCH") && <button className={styles.primary} disabled={busy} onClick={()=>onAction({type:"START_REMATCH"})}>같은 사람들과 다시 하기</button>}
      <details className={styles.rules}><summary>처음이라면 · 장사 규칙 보기</summary><p>{rules.nightsName} 밤 동안 가게를 사고 키워요. 매 밤 밑천 3엽전, 순서는 매번 새 추첨. 첫 밤은 요금과 대결 없이 개업 준비를 합니다.</p><p>가게 6 · 증축 4 · 기본 요금 2/4. 같은 업종 {rules.monopolySize}채 완성과 오늘 유행은 각각 요금 +1, 최종 최대 6입니다.</p><p>둔갑 성공: 같은 단계 가게 교환 + 이전 점주에게 원래 요금 절반 지급(올림). 성공한 둔갑에는 바가지가 붙지 않아요. 부적에 막히면 교환 없이 원래 요금만 냅니다.</p><p>요금이 부족하면 가게를 매각하지만 마지막 한 채는 남겨요. 최종 자산은 현금 + 기본 가게당 6 + 증축 가게당 10. 동점은 공동 우승!</p></details>
    </section>;
}
