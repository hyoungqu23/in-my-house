"use client";
import { useState } from "react";
import type { MoonlitInnPlayerRoomView } from "@/modules/room/contracts";
import { useServerClock } from "@/shared/ui/use-server-clock";
import { INN_FURNITURE, INN_GUESTS, INN_ROOMS, innGuestInfo, innRules } from "../domain/content";
import { moveInnItem } from "../domain/rules";
import type { InnAction, InnCommand, InnGuestKind, InnItemKind } from "../domain/types";
import { InnGuestArt, InnFurnitureArt } from "./art";
import { InnBoard } from "./inn-board";
import { InnScoreDetails, innPhaseTitle, MoonlitInnPublicBoard } from "./public-board";
import { InnTradePanel } from "./trade-panel";
import styles from "./game.module.css";

export function MoonlitInnPlayerControls({ view, busy, onAction }: { view: MoonlitInnPlayerRoomView; busy: boolean; onAction: (action: InnAction) => Promise<void> }) {
  const [picked, setPicked] = useState("");
  const [selected, setSelected] = useState<{ kind: InnItemKind; id: string }>();
  const [showNight, setShowNight] = useState(false);
  const now = useServerClock(view.serverNow);
  const self = view.players.find(player => player.seat === view.self.seat)!;
  const night = view.weather !== undefined;
  const guestInfo = (kind: InnGuestKind) => innGuestInfo(kind, view.rulesVersion);
  const rules = innRules(view.rulesVersion);
  const send = (action: InnCommand) => onAction({ ...action, phaseKey: view.phaseKey, revision: view.self.revision });
  const canMove = !busy && view.self.legalActions.includes("INN_MOVE");
  const selectedItem = selected && (selected.kind === "guest" ? self.guests : self.furniture).find(item => item.id === selected.id);
  const legalRooms = canMove && selected && selectedItem ? [0, 1, 2, 3, 4, 5, -1].filter(p => moveInnItem(self, selected.kind, selected.id, p)) : [];
  const place = (to: number) => { if (!selected || !selectedItem) return; void send({ type: "INN_MOVE", kind: selected.kind, itemId: selected.id, to }); setSelected(undefined); };
  if (view.phase === "GAME_OVER") return <><MoonlitInnPublicBoard view={view} /><p className={styles.finishHint}>호스트는 공개 화면에서 같은 사람들과 다시 시작할 수 있어요.</p></>;
  return <section className={`${styles.game} ${view.phase === "INN_REVEAL" ? styles.reveal : ""}`} data-testid="inn-controls">
    <header className={styles.header}><div><span className={styles.eyebrow}>보름달 여관 · {self.nickname}의 하루</span><h1>{innPhaseTitle(view.phase)}</h1></div><span className={styles.moon}>{night ? view.weather === "roof" ? "지붕 달빛" : "정원 안개" : "지붕 달빛 / 정원 안개"}</span></header>
    {view.pause ? <div className={styles.notice} role="status"><strong>친구가 다시 연결할 때까지 기다려요</strong><p>손패와 배치는 저장되어 있어요. 새로고침해도 이어집니다.</p><button disabled={busy || now < Date.parse(view.pause.forfeitClaimAt)} onClick={() => void send({ type: "INN_END_DISCONNECTED" })}>{now < Date.parse(view.pause.forfeitClaimAt) ? `${Math.ceil((Date.parse(view.pause.forfeitClaimAt) - now) / 1000)}초 뒤 승자 없이 마칠 수 있어요` : "연결이 끊긴 게임 마치기"}</button></div> : null}
    {view.phase === "INN_DRAFT" && <section className={styles.draft} aria-label="내 여행 꾸러미">
      <div className={styles.sectionTitle}><h2>꾸러미 {view.draftRound + 1}/3</h2><button aria-pressed={showNight} onClick={() => setShowNight(!showNight)}>{showNight ? "낮 모습 보기" : "밤 모습 미리 보기"}</button></div>
      <p className={styles.hint}>손님과 가구를 함께 골라요. 남은 꾸러미는 왼쪽 이웃에게, 마지막 한 개는 자동으로 받아요.</p>
      <div className={styles.draftCards}>{view.self.hand.map(bundle => <button key={bundle.id} data-bundle-id={bundle.id} aria-pressed={(view.self.pickedId ?? picked) === bundle.id} disabled={busy || Boolean(view.pause)} onClick={() => setPicked(bundle.id)}>
        <div className={styles.bundleArt}><InnGuestArt kind={bundle.guest.kind} night={showNight} /><InnFurnitureArt kind={bundle.furniture.kind} /></div>
        <div><strong>{INN_GUESTS[bundle.guest.kind].name}</strong><span>{INN_FURNITURE[bundle.furniture.kind].name}와 함께</span><p>{guestInfo(bundle.guest.kind).rule}</p><small>잠들면 기본 {guestInfo(bundle.guest.kind).base}별</small></div>
      </button>)}</div>
      {view.self.pickedId ? <div className={styles.notice} role="status">선택했어요. 모두 고르면 함께 공개합니다. ({view.players.filter(player => player.picked).length}/4)<button disabled={busy || Boolean(view.pause)} onClick={() => void send({ type: "INN_PICK", bundleId: null })}>선택 취소</button></div> : <button className={styles.primary} disabled={busy || Boolean(view.pause) || !view.self.hand.some(bundle => bundle.id === picked)} onClick={() => { void send({ type: "INN_PICK", bundleId: picked }); setPicked(""); }}>이 손님 맞이하기</button>}
    </section>}
    {view.phase === "INN_REVEAL" && <div className={styles.notice} role="status"><strong>작은 손님들의 본모습을 보세요.</strong><p>잠시 뒤 정리권 두 장으로 이동하거나 이웃과 교환할 수 있어요.</p><button disabled={busy || Boolean(view.pause)} onClick={() => void send({ type: "INN_SKIP_REVEAL" })}>변신 연출 건너뛰기</button></div>}
    <div className={styles.ownInn}>
      <div className={styles.sectionTitle}><h2>나의 작은 여관</h2><span>{view.phase === "INN_NIGHT" ? `정리권 ${self.actionsLeft}/2` : "낮에는 자유 배치"}</span></div>
      <InnBoard board={self} label="내 여관 배치" night={night || showNight} score={self.score ?? self.forecast.roof} legalRooms={legalRooms} onPlace={canMove && selectedItem ? place : undefined} />
      <p className={styles.hint}>{selectedItem ? "테두리가 표시된 방을 눌러 놓아주세요. 가구끼리는 자리를 바꿀 수 있어요." : view.phase === "INN_NIGHT" ? "손님이나 가구를 고르고 방을 탭하세요. 한 번 옮길 때 정리권 1장을 써요." : "아래에서 손님이나 가구를 고른 뒤 방을 탭해 주세요. 토끼는 나란한 두 칸이 필요해요."}</p>
      {selectedItem && <div className={styles.buttonRow}><button disabled={!legalRooms.includes(-1)} onClick={() => place(-1)}>{selected?.kind === "guest" ? "현관 대기석으로" : "수납함으로"}</button><button onClick={() => setSelected(undefined)}>선택 해제</button></div>}
      <div className={styles.inventory} aria-label="내 손님">{self.guests.map(guest => <button key={guest.id} data-item-id={guest.id} disabled={!canMove} aria-pressed={selected?.id === guest.id} onClick={() => setSelected({ kind: "guest", id: guest.id })}><InnGuestArt kind={guest.kind} night={night || showNight} /><strong>{INN_GUESTS[guest.kind].name}</strong><small>{guest.position < 0 ? "현관 대기" : `${INN_ROOMS[guest.position]}호${guest.kind === "cat" ? " 천장" : ""}`}</small></button>)}</div>
      <div className={styles.inventory} aria-label="내 가구">{self.furniture.map(furniture => <button key={furniture.id} data-item-id={furniture.id} disabled={!canMove} aria-pressed={selected?.id === furniture.id} onClick={() => setSelected({ kind: "furniture", id: furniture.id })}><InnFurnitureArt kind={furniture.kind} /><strong>{INN_FURNITURE[furniture.kind].name}</strong><small>{furniture.position < 0 ? "수납함" : `${INN_ROOMS[furniture.position]}호`}</small></button>)}</div>
      <InnScoreDetails player={self} rulesVersion={view.rulesVersion} />
    </div>
    {view.phase === "INN_NIGHT" && !view.pause && !self.ready && <InnTradePanel view={view} busy={busy} onAction={action => void send(action)} />}
    {view.self.legalActions.includes("INN_READY") && <div className={styles.readyArea}><p>{view.players.filter(player => player.ready).length}/4명 준비 완료{view.phase === "INN_ARRANGE" ? " · 모두 준비되면 보름달이 떠요" : " · 모두 마치면 별점을 정산해요"}</p><button className={styles.primary} disabled={busy} onClick={() => void send({ type: "INN_READY", ready: !self.ready })}>{self.ready ? "조금 더 정리할게요" : view.phase === "INN_ARRANGE" ? "보름달 맞을 준비 완료" : "오늘의 잠자리 확정"}</button>{self.ready && <p className={styles.hint}>다른 여관이 마무리하는 중이에요.</p>}</div>}
    <details className={styles.rules}><summary>여관 주인의 작은 안내서</summary><p>네 명이 한 번의 밤을 보냅니다. 손님·가구 꾸러미를 두 번 고르고 마지막 하나를 받아요. 잠든 손님의 기본 별과 부탁 보너스, 달빛 보너스를 합쳐 가장 높은 여관이 우승해요. 동점은 공동 우승입니다.</p>{(Object.keys(INN_GUESTS) as InnGuestKind[]).map(guestInfo).map(guest => <p key={guest.name}><strong>{guest.name} · 기본 {guest.base}별</strong><br />{guest.rule}</p>)}<p>밤에는 정리권 두 장. 이동이나 가구 자리 교환은 한 장, 이웃과 교환하면 양쪽 한 장씩 씁니다. 현관 손님은 0별이고, 수납함의 가구는 효과가 없어요. 잠들지 못하면 모든 보너스도 0입니다.</p><p>{rules.woodCatBonus ? "마른 나무침대는 솜솜·모카에게 +1. 솜솜은 담요와 중복하지 않고, 모카는 룸메이트 보너스와 함께 받아요." : "나무침대는 솜솜에게만 +1. 담요 +2와 겹쳐 받지 않아요."} 거래는 손님끼리 또는 가구끼리 한 번, 양쪽이 동의해야 성립해요.</p><p>지붕 달빛은 위층, 정원 안개는 아래층 손님에게 +1. 두 예보 중 하나가 보름달에 확정되며, 여관마다 최대 +{rules.moonCap}예요. 색뿐 아니라 ‘젖음’ 표시와 점수 이유를 확인해 주세요.</p></details>
  </section>;
}
