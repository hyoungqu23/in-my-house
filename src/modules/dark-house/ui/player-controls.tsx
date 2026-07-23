"use client";

import { useMemo, useState } from "react";
import type { GameAction } from "@/modules/dark-house/domain/types";
import type { PlayerRoomView } from "@/modules/room/contracts";
import { Ghost, Zap } from "@/shared/ui/icons";

export function PlayerControls({
  view,
  onAction,
  busy,
}: {
  view: PlayerRoomView;
  onAction: (action: GameAction) => Promise<void>;
  busy: boolean;
}) {
  const self = view.self;
  const [bid, setBid] = useState((view.bid?.amount ?? 0) + 1);
  const [flashTarget, setFlashTarget] = useState<number>();
  const legal = useMemo(() => new Set(self?.legalActions ?? []), [self?.legalActions]);
  const nextBid = Math.max(bid, (view.bid?.amount ?? 0) + 1);

  if (view.privacyLocked || !self) {
    const canChooseReveal = view.phase === "REVEAL_CHOICE" && view.turnSeat === view.viewer.playerSeat;
    return (
      <section className="privacy-lock">
        <span className="lock-light" />
        <h2>공개 화면을 보세요</h2>
        <p>도전이 끝날 때까지 모든 비밀 패를 가렸습니다.</p>
        {canChooseReveal && (
          <div className="locked-targets">
            <h3>다음으로 열 집을 고르세요</h3>
            <div className="target-grid">
              {view.players.filter((player) => {
                const stack = view.stacks.find((item) => item.seat === player.seat);
                return (stack?.count ?? 0) > (stack?.revealed.length ?? 0);
              }).map((player) => (
                <button className="secondary-button" key={player.seat} disabled={busy} onClick={() => onAction({ type: "CHOOSE_REVEAL_TARGET", targetSeat: player.seat })}>
                  {player.seat === view.viewer.playerSeat ? "내 집 먼저" : `${player.nickname}의 집`}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  const tokenButton = (token: typeof self.hand[number], initial: boolean) => (
    <button
      key={token.id}
      className={`hand-token ${token.kind === "GHOST" ? "is-ghost" : ""}`}
      disabled={busy}
      onClick={() => onAction({ type: initial ? "PLACE_INITIAL_TOKEN" : "PLACE_TOKEN", tokenId: token.id })}
    >
      {token.kind === "GHOST" ? <Ghost size={28} /> : <span className="empty-room-mark" />}
      <span>{token.kind === "GHOST" ? "유령" : "빈 방"}</span>
    </button>
  );

  return (
    <section className="player-controls">
      <div className="control-heading">
        <div>
          <span className="eyebrow"><span /> PRIVATE · SEAT {self.seat}</span>
          <h2>나만 보는 방</h2>
        </div>
        <span className={`flash-status ${self.flashlightAvailable ? "available" : ""}`}>
          <Zap size={17} /> {self.flashlightAvailable ? "손전등 있음" : "손전등 사용함"}
        </span>
      </div>

      {self.lastPeek && (
        <div className="peek-result" role="status">
          <Zap size={22} /> 손전등 너머에는 <strong>{self.lastPeek.kind === "GHOST" ? "유령" : "빈 방"}</strong>
        </div>
      )}

      {(legal.has("PLACE_INITIAL_TOKEN") || legal.has("PLACE_TOKEN")) && (
        <div>
          <h3>{legal.has("PLACE_INITIAL_TOKEN") ? "모두 몰래 첫 방을 고릅니다" : "방 하나를 더 놓을 수 있습니다"}</h3>
          <div className="hand-grid">
            {self.hand.map((token) => tokenButton(token, legal.has("PLACE_INITIAL_TOKEN")))}
          </div>
        </div>
      )}

      {legal.has("OPEN_BID") && (
        <BidControl
          label="빈 방을 몇 개까지 찾을 수 있나요?"
          bid={bid}
          setBid={setBid}
          max={view.stacks.reduce((sum, stack) => sum + stack.count, 0)}
          busy={busy}
          onSubmit={(value) => onAction({ type: "OPEN_BID", bid: value })}
        />
      )}

      {legal.has("RAISE_BID") && (
        <div className="action-stack">
          <BidControl
            label={`현재 ${view.bid?.amount ?? 0}보다 높게 부르세요`}
            bid={bid}
            setBid={setBid}
            min={(view.bid?.amount ?? 0) + 1}
            max={view.stacks.reduce((sum, stack) => sum + stack.count, 0)}
            busy={busy}
            onSubmit={(value) => onAction({ type: "RAISE_BID", bid: value })}
          />
          {legal.has("USE_FLASHLIGHT_AND_RAISE") && (
            <div className="flashlight-action">
              <label htmlFor="flash-target">손전등으로 엿볼 집</label>
              <select id="flash-target" value={flashTarget ?? ""} onChange={(event) => setFlashTarget(Number(event.target.value))}>
                <option value="">집 선택</option>
                {view.players.filter((player) => player.seat !== self.seat && (view.stacks.find((stack) => stack.seat === player.seat)?.count ?? 0) > 0).map((player) => (
                  <option key={player.seat} value={player.seat}>{player.nickname}</option>
                ))}
              </select>
              <button className="secondary-button flashlight-button" disabled={busy || !flashTarget} onClick={() => flashTarget && onAction({ type: "USE_FLASHLIGHT_AND_RAISE", targetSeat: flashTarget, bid: nextBid })}>
                <Zap size={19} /> 몰래 보고 {nextBid} 부르기
              </button>
            </div>
          )}
          <button className="text-button danger-text" disabled={busy} onClick={() => onAction({ type: "PASS" })}>이번 입찰에서 물러나기</button>
        </div>
      )}

      {legal.has("CHOOSE_REVEAL_TARGET") && (
        <div>
          <h3>어느 집의 문을 열까요?</h3>
          <div className="target-grid">
            {view.players.filter((player) => (view.stacks.find((stack) => stack.seat === player.seat)?.count ?? 0) > (view.stacks.find((stack) => stack.seat === player.seat)?.revealed.length ?? 0)).map((player) => (
              <button className="secondary-button" key={player.seat} disabled={busy} onClick={() => onAction({ type: "CHOOSE_REVEAL_TARGET", targetSeat: player.seat })}>
                {player.seat === self.seat ? "내 집 먼저" : `${player.nickname}의 집`}
              </button>
            ))}
          </div>
        </div>
      )}

      {!self.legalActions.length && <p className="waiting-copy">다른 플레이어의 선택을 기다리는 중입니다.</p>}
    </section>
  );
}

function BidControl({ label, bid, setBid, min = 1, max, busy, onSubmit }: {
  label: string; bid: number; setBid: (value: number) => void; min?: number; max: number; busy: boolean; onSubmit: (value: number) => void;
}) {
  const safeBid = Math.min(Math.max(bid, min), Math.max(max, min));
  return (
    <div className="bid-control">
      <label htmlFor="bid-amount">{label}</label>
      <div className="bid-stepper">
        <button type="button" aria-label="입찰 수 줄이기" disabled={busy || safeBid <= min} onClick={() => setBid(safeBid - 1)}>−</button>
        <input id="bid-amount" inputMode="numeric" type="number" min={min} max={max} value={safeBid} onChange={(event) => setBid(Number(event.target.value))} />
        <button type="button" aria-label="입찰 수 늘리기" disabled={busy || safeBid >= max} onClick={() => setBid(safeBid + 1)}>+</button>
      </div>
      <button className="primary-button" disabled={busy || max < min} onClick={() => onSubmit(safeBid)}>{busy ? "확인 중…" : `${safeBid} 부르기`}</button>
    </div>
  );
}
