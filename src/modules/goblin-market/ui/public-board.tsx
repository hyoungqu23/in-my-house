"use client";

import type { CSSProperties } from "react";
import { Coins, Moon, Sparkles, Store, Ticket, Wind, ArrowUpRight, CloudMoon } from "lucide-react";
import type { GoblinMarketPlayerRoomView, GoblinMarketPublicRoomView } from "@/modules/room/contracts";
import { useServerClock } from "@/shared/ui/use-server-clock";
import { MARKET_CARDS, MARKET_CATEGORIES, MARKET_PHASE_NAMES, marketRules, marketTileName } from "../domain/content";
import { MarketCardArt, MarketMerchantArt } from "./market-art";
import { MarketShopFront } from "./shop-front";
import type { MarketSpecialKind } from "../domain/content";
import styles from "./game.module.css";

type View = GoblinMarketPublicRoomView | GoblinMarketPlayerRoomView;
const colors = ["#748e69", "#b56b47", "#8d79a5", "#587f9b"];
export const marketPlayerColor = (view: View, seat: number) => colors[Math.max(0, view.players.findIndex(player => player.seat === seat)) % 4];
function tilePosition(tile: number, size: number): CSSProperties {
  const side = (size + 4) / 4, edge = side - 1;
  if (tile <= edge) return { gridRow: side - tile, gridColumn: 1 };
  if (tile <= edge * 2) return { gridRow: 1, gridColumn: tile - edge + 1 };
  if (tile <= edge * 3) return { gridRow: tile - edge * 2 + 1, gridColumn: side };
  return { gridRow: side, gridColumn: edge * 4 - tile + 1 };
}
export function MarketTimer({ view }: { view: View }) {
  const now = useServerClock(view.serverNow);
  const left = view.phaseEndsAt ? Math.max(0, Math.ceil((Date.parse(view.phaseEndsAt) - now) / 1000)) : undefined;
  return left === undefined ? null : <span className={`${styles.timer} ${left <= 3 ? styles.timerSoon : ""}`} aria-label={`선택 시간 ${left}초`}><span>{left}<small>초</small></span><small>남은 시간</small></span>;
}
export function MarketLastDuel({ view }: { view: View }) {
  const duel = view.lastDuel;
  if (!duel) return null;
  const name = (seat: number) => view.players.find(player => player.seat === seat)?.nickname;
  return <section className={styles.duelResult} aria-label="최근 대결 결과" aria-live="polite">
    <span className={styles.kicker}>방금 장터에서는</span><h2>{duel.exchanged ? "간판이 바뀌었어요!" : duel.visitorCard === "C" ? "부적이 지켜줬어요" : "장난이 공개됐어요!"}</h2>
    <p>{marketTileName(duel.tile, view.rulesVersion)}</p>
    <div className={styles.duelCards}>{[{ seat: duel.visitorSeat, card: duel.visitorCard }, { seat: duel.ownerSeat, card: duel.ownerCard }].map((row, index) => <div key={row.seat}>
      {index > 0 && <span className={styles.versus} aria-hidden="true">vs</span>}
      {row.card ? <MarketCardArt kind={row.card} /> : <Moon size={30} />}
      <small>{name(row.seat)}</small><strong>{row.card ? MARKET_CARDS[row.card].name : "패스"}</strong>
    </div>)}</div>
    {duel.exchanged && <p>{marketTileName(duel.tile, view.rulesVersion)} ↔ {marketTileName(duel.targetTile!, view.rulesVersion)}</p>}
    <div className={styles.receipt}><Coins size={16} aria-hidden="true" /><strong>{name(duel.ownerSeat)}님에게 {duel.settled ? duel.paid : duel.due}엽전</strong></div>
    <small>{duel.exchanged ? `원래 요금 ${duel.originalRent}의 절반, 올림` : "방문 요금 정산"}{!duel.settled ? " · 정산 중" : duel.paid < duel.due ? " · 마지막 가게 보호 적용" : ""}</small>
  </section>;
}
function Dice({ value }: { value: number }) {
  const points: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <span className={styles.die} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} className={points[value].includes(i) ? styles.pip : ""} />)}</span>;
}
function SpecialArt({ kind }: { kind: MarketSpecialKind }) {
  const Icon = kind === "gate" ? Moon : kind === "market" ? Store : kind === "portal" ? ArrowUpRight : kind === "rest" ? CloudMoon : Ticket;
  return <span className={styles.specialArt}><Icon strokeWidth={1.4} aria-hidden="true" /></span>;
}
export function GoblinMarketPublicBoard({ view }: { view: View }) {
  const rules = marketRules(view.rulesVersion);
  const name = (seat: number) => view.players.find(player => player.seat === seat)?.nickname ?? "상인";
  const acting = view.actingSeats.map(name).join(" · ");
  return <section className={styles.market} style={{ "--night-count": rules.nights, "--night-mobile-columns": rules.nights === 12 ? 6 : 4 } as CSSProperties} data-testid="market-board">
    <header className={styles.heading}><div><span className={styles.kicker}><Moon size={13} /> 달이 뜨면 열리는 작은 장터</span><h1>도깨비 야시장</h1></div><MarketTimer view={view} /></header>
    <div className={styles.nightTrack} aria-label={`${view.night}번째 밤, 총 ${rules.nightsName} 밤`}>{Array.from({ length: rules.nights }, (_, i) => <span key={i} className={i + 1 === view.night ? styles.currentNight : i + 1 < view.night ? styles.pastNight : ""}><Moon size={12} aria-hidden="true" /><b>{i + 1}</b><small>밤</small></span>)}</div>
    <div className={styles.status} role="status"><span className={styles.statusDot} /><div><strong>{view.phase === "GAME_OVER" ? "오늘의 장사가 끝났어요" : `${acting || "두 상인"}님, ${MARKET_PHASE_NAMES[view.phase]}`}</strong><span>{view.phase === "GAME_OVER" ? "엽전과 가게를 세어볼까요?" : view.night === 1 ? "첫 밤은 개업 준비! 방문 요금과 장난 대결은 쉬어요." : "내 휴대폰에서 선택하고, 장터에서 함께 확인해요."}</span></div></div>
    <div className={styles.scene}>
      <div className={styles.boardFrame}>
        <div className={styles.boardScroll} tabIndex={0} role="region" aria-label="야시장 보드 스크롤">
          <div className={styles.board} style={{ "--board-side": (rules.size + 4) / 4, "--board-min": rules.size === 28 ? "780px" : "600px" } as CSSProperties} role="group" aria-label={`${rules.size}칸 야시장 보드`}>
            <div className={styles.center}>
              <div className={styles.centerPicture} aria-hidden="true" />
              <div className={styles.trendTicket}><span className={styles.kicker}>오늘의 장터 소식</span><strong>{MARKET_CATEGORIES[view.trend].trend}</strong><span>{MARKET_CATEGORIES[view.trend].name} 가게 방문 요금 +1</span>{view.nextTrend && <small>다음 밤엔 {MARKET_CATEGORIES[view.nextTrend].name} 가게가 인기래요</small>}</div>
              {view.lastRoll && <div className={styles.dice} aria-label={`최근 주사위 ${view.lastRoll.dice.join(", ")}`}><Dice value={view.lastRoll.dice[0]} /><Dice value={view.lastRoll.dice[1]} /></div>}
            </div>
            {Array.from({ length: rules.size }, (_, tile) => {
              const shop = view.shops.find(shop => shop.tile === tile), owner = shop?.ownerSeat;
              const ownerIndex = owner === null || owner === undefined ? undefined : view.players.findIndex(player => player.seat === owner);
              const special = rules.specials[tile];
              const onTile = view.players.filter(player => player.position === tile);
              const currentTile = view.players.find(player => player.seat === view.turnSeat)?.position === tile && view.phase !== "GAME_OVER";
              return <div key={tile} className={`${styles.tile} ${shop ? styles[shop.category] : styles.special} ${currentTile ? styles.currentTile : ""}`} style={{ ...tilePosition(tile, rules.size), ...(owner !== null && owner !== undefined ? { "--owner": marketPlayerColor(view, owner) } : {}) } as CSSProperties} aria-label={`${tile}번 ${marketTileName(tile, view.rulesVersion)}${shop ? ` · ${MARKET_CATEGORIES[shop.category].name} · ${owner === null ? "빈 가게" : `${name(owner!)}의 ${shop.level ? "증축 상점" : "노점"}`} · 요금 ${shop.rent}` : ""}`}>
                <span className={styles.tileNumber}>{String(tile).padStart(2, "0")}</span>
                {shop && <span className={styles.categoryMark} title={`${MARKET_CATEGORIES[shop.category].name} 가게`} aria-hidden="true">{MARKET_CATEGORIES[shop.category].symbol}</span>}
                {shop?.level === 1 && <span className={styles.upgraded} title="증축 상점"><Sparkles size={10} aria-hidden="true" /><span>증축</span></span>}
                {shop ? <MarketShopFront category={shop.category} level={shop.level} ownerIndex={ownerIndex} ownerName={owner === null ? undefined : name(owner!)} /> : <SpecialArt kind={special.kind} />}
                <strong>{marketTileName(tile, view.rulesVersion)}</strong>
                {shop ? <small className={styles.rent}>{owner === null ? "매입 6" : `${shop.rent}엽전`}</small> : <small>{special.kind === "gate" || special.kind === "rest" ? "+2엽전" : special.kind === "market" ? "가게 매입" : special.kind === "portal" ? "가게로 이동" : "카드 한 장"}</small>}
                {onTile.length > 0 && <span className={styles.tokens}>{onTile.map(player => <span key={player.seat} className={styles.pawn} style={{ "--merchant": marketPlayerColor(view, player.seat) } as CSSProperties} title={player.nickname} aria-label={`${player.nickname}의 말`}><MarketMerchantArt index={view.players.indexOf(player)} /><b>{view.players.indexOf(player) + 1}</b></span>)}</span>}
              </div>;
            })}
          </div>
        </div>
        <div className={styles.categoryLegend} aria-label="가게 업종 표시">{Object.entries(MARKET_CATEGORIES).map(([category, info]) => <span key={category} className={styles[category]}><i aria-hidden="true">{info.symbol}</i>{info.name}</span>)}</div>
        <p className={styles.boardHint}><Wind size={14} aria-hidden="true" /><span>지붕과 간판은 가게 주인 · 받침과 반짝임은 증축이에요.</span><span className={styles.scrollHint}>옆으로 밀어서 장터를 둘러보세요.</span></p>
      </div>
      <aside className={styles.merchantRail} aria-label="요괴 상인들의 장사 현황"><div className={styles.railHeading}><h2>오늘의 상인들</h2><span>{view.players.length}명의 작은 욕심</span></div>
        <div className={styles.scoreboard}>{view.order.map((seat, index) => {
          const player = view.players.find(player => player.seat === seat)!;
          return <div key={seat} className={seat === view.turnSeat && view.phase !== "GAME_OVER" ? styles.activePlayer : ""} style={{ "--merchant": marketPlayerColor(view, seat) } as CSSProperties}>
            <MarketMerchantArt index={view.players.indexOf(player)} className={styles.merchantPortrait} />
            <div className={styles.merchantInfo}><span className={styles.playerName}><i>{view.players.indexOf(player) + 1}</i><b>{player.nickname}</b></span><span className={styles.merchantMeta}>순서 {index + 1}{!player.connected ? " · 자리 비움" : seat === view.turnSeat && view.phase !== "GAME_OVER" ? " · 지금 장사 중" : " · 장사 준비 중"}</span><strong><Coins size={13} aria-hidden="true" />{player.cash}<small>엽전</small></strong><span className={styles.assets}>자산 {player.assets} · 카드 {player.handCount}장</span></div>
          </div>;
        })}</div>
        {view.duel && <div className={styles.duelNotice}><Ticket size={20} aria-hidden="true" /><strong>{name(view.duel.visitorSeat)} ↔ {name(view.duel.ownerSeat)}</strong><span>{marketTileName(view.duel.tile, view.rulesVersion)} · 요금 {view.duel.originalRent}엽전</span><small>{view.duel.committedSeats.length}/2명 선택 완료 · 함께 공개해요</small></div>}
        <MarketLastDuel view={view} />
      </aside>
    </div>
    {view.result && <section className={styles.results} aria-label="최종 자산"><Sparkles size={25} aria-hidden="true" /><span className={styles.kicker}>{rules.nightsName} 밤의 결산</span><h2>{view.result.winnerSeats.map(name).join(" · ")}{view.result.winnerSeats.length > 1 ? " 공동 우승!" : " 우승!"}</h2>{[...view.result.scores].sort((a, b) => b.total - a.total).map(row => <div key={row.seat}><MarketMerchantArt index={view.players.findIndex(player => player.seat === row.seat)} /><strong>{name(row.seat)}</strong><span>현금 {row.cash} · 가게 {row.shops}채</span><b>{row.total}엽전</b></div>)}</section>}
    <details className={styles.history}><summary>장터 소식 · 공개 기록</summary><ol>{[...view.log].reverse().map(event => <li key={event.id}><small>{event.night}밤</small>{event.text}</li>)}</ol><p>덱 {view.deckCount}장 · 버린 카드 {view.discard.map(kind => MARKET_CARDS[kind].name).join(", ") || "없음"}</p></details>
  </section>;
}
