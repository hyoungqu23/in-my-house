"use client";
import { useState } from "react";
import type { MoonlitInnPlayerRoomView } from "@/modules/room/contracts";
import { INN_FURNITURE, INN_GUESTS, INN_ROOMS } from "../domain/content";
import { receiveInnItem, scoreInn } from "../domain/rules";
import type { InnCommand, InnFurniture, InnGuest, InnItemKind, InnOffer } from "../domain/types";
import styles from "./game.module.css";

type Props = { view: MoonlitInnPlayerRoomView; busy: boolean; onAction: (action: InnCommand) => void };
const itemName = (item: InnGuest | InnFurniture) => item.kind in INN_GUESTS ? INN_GUESTS[item.kind as keyof typeof INN_GUESTS].name : INN_FURNITURE[item.kind as keyof typeof INN_FURNITURE].name;
const items = (player: MoonlitInnPlayerRoomView["players"][number], kind: InnItemKind) => kind === "guest" ? player.guests : player.furniture;
const placeName = (p: number, kind: InnItemKind) => p < 0 ? kind === "guest" ? "현관 대기석" : "수납함" : `${INN_ROOMS[p]}호`;

function ReceivedOffer({ view, busy, onAction, offer }: Props & { offer: InnOffer }) {
  const [chosen, setChosen] = useState("");
  const self = view.players.find(player => player.seat === view.self.seat)!;
  const sender = view.players.find(player => player.seat === offer.fromSeat)!;
  const incoming = items(sender, offer.kind).find(item => item.id === offer.outgoingId);
  const outgoing = items(self, offer.kind).find(item => item.id === offer.incomingId);
  if (!incoming || !outgoing) return null;
  const destinations = [0, 1, 2, 3, 4, 5, -1].filter(p => receiveInnItem(self, offer.kind, outgoing.id, incoming, p));
  const destination = chosen !== "" && destinations.includes(Number(chosen)) ? Number(chosen) : destinations[0];
  const preview = receiveInnItem(self, offer.kind, outgoing.id, incoming, destination)!;
  return <article className={styles.offer} data-testid="inn-offer">
    <strong>{sender.nickname}님의 제안</strong><p>내 {itemName(outgoing)} ↔ 이웃의 {itemName(incoming)}</p>
    <label>받을 자리<select aria-label={`${sender.nickname}의 제안 받을 자리`} value={destination} onChange={event => setChosen(event.target.value)}>{destinations.map(p => <option key={p} value={p}>{placeName(p, offer.kind)}</option>)}</select></label>
    <p className={styles.hint}>교환 직후 내 별점 {self.score!.total} → {scoreInn(preview, view.weather!, view.rulesVersion).total} · 내 정리권 1장 사용</p>
    <div className={styles.buttonRow}><button className={styles.primary} disabled={busy || !view.self.legalActions.includes("INN_ACCEPT")} onClick={() => onAction({ type: "INN_ACCEPT", offerId: offer.id, receiveAt: destination })}>이 자리로 교환 수락</button><button disabled={busy} onClick={() => onAction({ type: "INN_DECLINE", offerId: offer.id })}>거절</button></div>
  </article>;
}
export function InnTradePanel({ view, busy, onAction }: Props) {
  const [targetSeat, setTargetSeat] = useState("");
  const [kind, setKind] = useState<InnItemKind>("furniture");
  const [outgoingId, setOutgoingId] = useState("");
  const [incomingId, setIncomingId] = useState("");
  const [chosen, setChosen] = useState("");
  const self = view.players.find(player => player.seat === view.self.seat)!;
  const targets = view.players.filter(player => player.seat !== self.seat && !player.ready && !player.traded && player.actionsLeft > 0);
  const target = targets.find(player => player.seat === Number(targetSeat)) ?? targets[0];
  const outgoingItems = items(self, kind), incomingItems = target ? items(target, kind) : [];
  const outgoing = outgoingItems.find(item => item.id === outgoingId) ?? outgoingItems[0];
  const incoming = incomingItems.find(item => item.id === incomingId) ?? incomingItems[0];
  const destinations = incoming && outgoing ? [0, 1, 2, 3, 4, 5, -1].filter(p => receiveInnItem(self, kind, outgoing.id, incoming, p)) : [];
  const destination = chosen !== "" && destinations.includes(Number(chosen)) ? Number(chosen) : destinations[0];
  const preview = incoming && outgoing ? receiveInnItem(self, kind, outgoing.id, incoming, destination) : undefined;
  const canOffer = view.self.legalActions.includes("INN_OFFER") && Boolean(target && outgoing && incoming && preview);
  const sent = view.offers.find(offer => offer.fromSeat === self.seat);
  return <section className={styles.tradePanel} aria-label="이웃과 교환">
    <h2>이웃과 잠자리를 바꿔볼까요?</h2><p className={styles.hint}>손님끼리 또는 가구끼리 1:1 교환. 둘 다 정리권 1장씩, 한 밤에 한 번이에요.</p>
    {view.offers.filter(offer => offer.toSeat === self.seat).map(offer => <ReceivedOffer key={offer.id} view={view} busy={busy} onAction={onAction} offer={offer} />)}
    {sent && <div className={styles.notice}>제안을 보냈어요. {view.players.find(player => player.seat === sent.toSeat)?.nickname}님이 받을 자리를 고르고 있어요.<button disabled={busy} onClick={() => onAction({ type: "INN_DECLINE", offerId: sent.id })}>제안 취소</button></div>}
    {self.traded ? <p className={styles.notice}>오늘의 교환을 마쳤어요. 남은 정리권으로 잠자리를 마무리해 주세요.</p> : self.actionsLeft === 0 ? <p className={styles.hint}>정리권을 모두 사용했어요.</p> : <details open={Boolean(sent)}>
      <summary>교환 제안 만들기</summary>
      {target ? <div className={styles.tradeFields}>
        <label>이웃 여관<select aria-label="이웃 여관" value={target.seat} onChange={event => { setTargetSeat(event.target.value); setIncomingId(""); setChosen(""); }}>{targets.map(player => <option key={player.seat} value={player.seat}>{player.nickname}</option>)}</select></label>
        <label>교환 종류<select aria-label="교환 종류" value={kind} onChange={event => { setKind(event.target.value as InnItemKind); setOutgoingId(""); setIncomingId(""); setChosen(""); }}><option value="furniture">가구</option><option value="guest">손님</option></select></label>
        <label>내가 보낼 것<select aria-label="내가 보낼 것" value={outgoing?.id ?? ""} onChange={event => { setOutgoingId(event.target.value); setChosen(""); }}>{outgoingItems.map(item => <option key={item.id} value={item.id}>{itemName(item)} · {placeName(item.position, kind)}</option>)}</select></label>
        <label>이웃에게 받을 것<select aria-label="이웃에게 받을 것" value={incoming?.id ?? ""} onChange={event => { setIncomingId(event.target.value); setChosen(""); }}>{incomingItems.map(item => <option key={item.id} value={item.id}>{itemName(item)} · {placeName(item.position, kind)}</option>)}</select></label>
        <label>내 여관에 받을 자리<select aria-label="내 여관에 받을 자리" value={destination} onChange={event => setChosen(event.target.value)}>{destinations.map(p => <option key={p} value={p}>{placeName(p, kind)}</option>)}</select></label>
        <p className={styles.hint}>교환 직후 내 별점 {self.score!.total} → {preview ? scoreInn(preview, view.weather!, view.rulesVersion).total : "—"}. 상대가 수락하기 전까지 정리권은 그대로예요.</p>
        <button className={styles.primary} disabled={busy || !canOffer} onClick={() => onAction({ type: "INN_OFFER", targetSeat: target.seat, kind, outgoingId: outgoing.id, incomingId: incoming.id, receiveAt: destination })}>{sent ? "새 제안으로 바꾸기" : "이 교환 제안하기"}</button>
      </div> : <p className={styles.hint}>지금 교환할 수 있는 이웃이 없어요. 내 여관을 정리하고 마칠 수 있어요.</p>}
    </details>}
    <p className={styles.hint}>제안 뒤 어느 한쪽이 배치를 바꾸거나 준비를 마치면 제안이 만료돼요.</p>
  </section>;
}
