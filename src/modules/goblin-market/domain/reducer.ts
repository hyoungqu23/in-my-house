import { DomainError } from "@/shared/errors/domain-error";
import { MARKET_CARDS, MARKET_CURRENT_RULES_VERSION, marketRules, marketTileName } from "./content";
import { marketAssets, marketDuelFee, marketRefund, marketRent, ownedShops } from "./rules";
import type { MarketAction, MarketCard, MarketCategory, MarketChoice, MarketContext, MarketPhase, MarketRulesVersion, MarketState } from "./types";

function fail(code: string, message: string): never { throw new DomainError(code, message); }
function shuffle<T>(items: readonly T[], randomIndex: MarketContext["randomIndex"]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function phase(state: MarketState, next: MarketPhase, now: number) {
  state.phase = next; state.step++; state.phaseKey = `${state.matchId}:${state.step}`;
  state.phaseEndsAt = next === "GAME_OVER" ? undefined : now + marketRules(state.rulesVersion).timeLimits[next];
}
function log(state: MarketState, text: string) {
  state.log.push({ id: (state.log.at(-1)?.id ?? 0) + 1, night: state.night, text });
  state.log = state.log.slice(-80);
}
const playerAt = (state: MarketState, seat: number) => state.players.find(player => player.seat === seat)!;
export const marketTurnSeat = (state: Pick<MarketState, "order" | "turnIndex">) => state.order[state.turnIndex] ?? state.order[state.order.length - 1];
export function marketActingSeats(state: MarketState): number[] {
  if (state.phase === "GAME_OVER") return [];
  if (state.phase === "MARKET_DISCARD") return state.discardQueue.slice(0, 1);
  if (state.phase === "MARKET_DUEL") return [state.duel!.visitorSeat, state.duel!.ownerSeat].filter(seat => !state.duel!.choices[seat]);
  return [marketTurnSeat(state)];
}
export function legalMarketActions(state: MarketState, seat: number): MarketAction["type"][] {
  if (!marketActingSeats(state).includes(seat)) return [];
  return [state.phase === "MARKET_SETTLE" ? "MARKET_SELL" : state.phase as Exclude<MarketAction["type"], "MARKET_SELL">];
}
function draw(state: MarketState, seat: number, context: MarketContext) {
  if (!state.deck.length) { state.deck = shuffle(state.discard, context.randomIndex); state.discard = []; }
  const card = state.deck.shift();
  if (card) playerAt(state, seat).hand.push(card);
}
function finish(state: MarketState, now: number) {
  const scores = state.players.map(player => ({ seat: player.seat, cash: player.cash, shops: ownedShops(state, player.seat).length, total: marketAssets(state, player) }));
  const high = Math.max(...scores.map(score => score.total));
  state.result = { scores, winnerSeats: scores.filter(score => score.total === high).map(score => score.seat) };
  log(state, `${marketRules(state.rulesVersion).nightsName} 밤의 장사가 끝났습니다. 남은 엽전과 가게를 정산합니다.`);
  phase(state, "GAME_OVER", now);
}
function startNight(state: MarketState, context: MarketContext) {
  state.order = shuffle(state.players.map(player => player.seat), context.randomIndex); state.turnIndex = 0;
  for (const player of state.players) player.cash += 3;
  log(state, `${state.night}번째 밤. 모두 밑천 3엽전을 받고 장사 순서를 새로 뽑았습니다.${state.night === 1 ? " 오늘은 개업 준비: 방문 요금과 대결이 없습니다." : ""}`);
  // All cards are dealt before any player can discard into the shared pile.
  if (state.night > 1) for (const seat of state.order) draw(state, seat, context);
  state.discardQueue = state.order.filter(seat => playerAt(state, seat).hand.length > 2);
  state.discardThen = "ROLL";
  phase(state, state.discardQueue.length ? "MARKET_DISCARD" : "MARKET_ROLL", context.now);
}
function endTurn(state: MarketState, context: MarketContext) {
  state.buyTiles = []; state.duel = undefined; state.payment = undefined;
  state.turnIndex++;
  if (state.turnIndex < state.order.length) phase(state, "MARKET_ROLL", context.now);
  else if (state.night === marketRules(state.rulesVersion).nights) finish(state, context.now);
  else { state.night++; startNight(state, context); }
}
function upgrade(state: MarketState, context: MarketContext) {
  const seat = marketTurnSeat(state);
  if (playerAt(state, seat).cash >= 4 && ownedShops(state, seat).some(shop => !shop.level)) phase(state, "MARKET_UPGRADE", context.now);
  else endTurn(state, context);
}
function drawOnTile(state: MarketState, context: MarketContext) {
  const seat = marketTurnSeat(state); draw(state, seat, context);
  log(state, `${playerAt(state, seat).nickname}님이 장난 카드를 받았습니다.`);
  if (playerAt(state, seat).hand.length > 2) {
    state.discardQueue = [seat]; state.discardThen = "UPGRADE"; phase(state, "MARKET_DISCARD", context.now);
  } else upgrade(state, context);
}
function arrive(state: MarketState, context: MarketContext) {
  const seat = marketTurnSeat(state), player = playerAt(state, seat);
  const shop = state.shops.find(shop => shop.tile === player.position);
  if (shop) {
    if (shop.ownerSeat === null && player.cash >= 6) { state.buyTiles = [shop.tile]; phase(state, "MARKET_BUY", context.now); }
    else if (shop.ownerSeat !== null && shop.ownerSeat !== seat && state.night > 1) {
      state.duel = { visitorSeat: seat, ownerSeat: shop.ownerSeat, tile: shop.tile, originalRent: marketRent(state, shop), choices: {} };
      phase(state, "MARKET_DUEL", context.now);
    } else upgrade(state, context);
    return;
  }
  switch (marketRules(state.rulesVersion).specials[player.position]?.kind) {
    case "rumor": drawOnTile(state, context); return;
    case "market": {
      const empty = state.shops.filter(shop => shop.ownerSeat === null);
      if (!empty.length) drawOnTile(state, context);
      else if (player.cash >= 6) { state.buyTiles = empty.map(shop => shop.tile); phase(state, "MARKET_BUY", context.now); }
      else upgrade(state, context);
      return;
    }
    case "portal": phase(state, "MARKET_PORTAL", context.now); return;
    case "rest": player.cash += 2; log(state, `${player.nickname}님이 낮잠 정자에서 2엽전을 받았습니다.`); break;
  }
  upgrade(state, context);
}
function roll(state: MarketState, context: MarketContext) {
  const player = playerAt(state, marketTurnSeat(state));
  const dice: [number, number] = [context.randomIndex(6) + 1, context.randomIndex(6) + 1];
  const size = marketRules(state.rulesVersion).size;
  const from = player.position, distance = dice[0] + dice[1]; player.position = (from + distance) % size;
  if (from + distance >= size) player.cash += 2;
  state.lastRoll = { seat: player.seat, dice, from, to: player.position };
  log(state, `${player.nickname}님: ${dice.join(" + ")} → ${marketTileName(player.position, state.rulesVersion)}${from + distance >= size ? " · 달문 보너스 2엽전" : ""}`);
  arrive(state, context);
}
function completePayment(state: MarketState, context: MarketContext) {
  const payment = state.payment!, visitor = playerAt(state, payment.fromSeat), owner = playerAt(state, payment.toSeat);
  const paid = Math.min(visitor.cash, payment.due);
  visitor.cash -= paid; owner.cash += paid;
  if (state.lastDuel) { state.lastDuel.paid = paid; state.lastDuel.settled = true; }
  log(state, `${visitor.nickname}님 → ${owner.nickname}님 ${paid}엽전 정산${paid < payment.due ? ` · 마지막 가게 보호로 ${payment.due - paid}엽전 면제` : ""}`);
  state.payment = undefined; state.duel = undefined; upgrade(state, context);
}
function sell(state: MarketState, tile: number, context: MarketContext) {
  const seat = marketTurnSeat(state), player = playerAt(state, seat);
  const owned = ownedShops(state, seat), shop = owned.find(shop => shop.tile === tile);
  if (!shop || owned.length <= 1) fail("LAST_SHOP_PROTECTED", "마지막 가게 한 채는 남겨야 합니다.");
  const refund = marketRefund(shop); player.cash += refund; shop.ownerSeat = null; shop.level = 0;
  log(state, `${player.nickname}님이 ${marketTileName(tile, state.rulesVersion)}을 ${refund}엽전에 매각했습니다.`);
  if (player.cash >= state.payment!.due || ownedShops(state, seat).length === 1) completePayment(state, context);
}
function resolveDuel(state: MarketState, context: MarketContext) {
  const duel = state.duel!, visitor = playerAt(state, duel.visitorSeat), owner = playerAt(state, duel.ownerSeat);
  const vc = duel.choices[visitor.seat], oc = duel.choices[owner.seat];
  function consume(seat: number, choice: MarketChoice) {
    const player = playerAt(state, seat);
    const card = player.hand.find(card => card.id === choice.cardId);
    if (card) { player.hand = player.hand.filter(candidate => candidate.id !== card.id); state.discard.push(card); }
    return card?.kind ?? null;
  }
  const visitorCard = consume(visitor.seat, vc), ownerCard = consume(owner.seat, oc);
  const { exchanged, due } = marketDuelFee(duel.originalRent, visitorCard, ownerCard);
  if (exchanged) {
    const visited = state.shops.find(shop => shop.tile === duel.tile)!;
    const offered = state.shops.find(shop => shop.tile === vc.targetTile)!;
    visited.ownerSeat = visitor.seat; offered.ownerSeat = owner.seat;
  }
  state.lastDuel = { visitorSeat: visitor.seat, ownerSeat: owner.seat, tile: duel.tile, originalRent: duel.originalRent, visitorCard, ownerCard, exchanged, targetTile: vc.targetTile, due, paid: 0, settled: false };
  log(state, `${visitor.nickname}님 ${visitorCard ? MARKET_CARDS[visitorCard].name : "패스"} / ${owner.nickname}님 ${ownerCard ? MARKET_CARDS[ownerCard].name : "패스"}${exchanged ? ` · ${marketTileName(duel.tile, state.rulesVersion)} ↔ ${marketTileName(vc.targetTile!, state.rulesVersion)}` : visitorCard === "C" ? " · 부적에 막혔습니다" : ""}`);
  state.payment = { fromSeat: visitor.seat, toSeat: owner.seat, due };
  if (visitor.cash >= due || ownedShops(state, visitor.seat).length === 1) completePayment(state, context);
  else phase(state, "MARKET_SETTLE", context.now);
}
function discardCard(state: MarketState, cardId: string, context: MarketContext) {
  const player = playerAt(state, state.discardQueue[0]);
  const card = player.hand.find(card => card.id === cardId) ?? fail("CARD_NOT_IN_HAND", "내 손패에서 버릴 카드를 골라주세요.");
  player.hand = player.hand.filter(candidate => candidate.id !== card.id); state.discard.push(card);
  log(state, `${player.nickname}님이 ${MARKET_CARDS[card.kind].name}을 버렸습니다.`);
  if (player.hand.length <= 2) state.discardQueue.shift();
  if (state.discardQueue.length) phase(state, "MARKET_DISCARD", context.now);
  else if (state.discardThen === "ROLL") phase(state, "MARKET_ROLL", context.now);
  else upgrade(state, context);
}
export function createMarketState(roster: Array<{ seat: number; userId: string; nickname: string }>, matchId: string, context: MarketContext, rulesVersion: MarketRulesVersion = MARKET_CURRENT_RULES_VERSION): MarketState {
  if (roster.length < 3 || roster.length > 4 || new Set(roster.map(player => player.seat)).size !== roster.length || new Set(roster.map(player => player.userId)).size !== roster.length) fail("INVALID_PLAYER_COUNT", "도깨비 야시장은 3–4명이 함께합니다.");
  const cards: MarketCard[] = (["C", "H", "M", "W"] as const).flatMap(kind => Array.from({ length: 6 }, (_, i) => ({ id: `${matchId}:${kind}${i}`, kind })));
  const rules = marketRules(rulesVersion);
  const categories: MarketCategory[] = ["food", "goods", "fortune", "fun"];
  const state: MarketState = {
    rulesVersion, matchId, step: 0, phaseKey: "", phase: "MARKET_ROLL", night: 1, turnIndex: 0, order: [],
    trends: Array.from({ length: Math.ceil(rules.nights / 4) }, () => shuffle(categories, context.randomIndex)).flat().slice(0, rules.nights),
    players: [], shops: rules.shops.map(shop => ({ tile: shop.tile, category: shop.category, ownerSeat: null, level: 0 })),
    deck: shuffle(cards, context.randomIndex), discard: [], discardQueue: [], discardThen: "ROLL", buyTiles: [], log: [],
  };
  const start = rules.gates[context.randomIndex(rules.gates.length)];
  const starters = shuffle(state.shops.map(shop => shop.tile), context.randomIndex);
  state.players = roster.map((player, index) => { state.shops.find(shop => shop.tile === starters[index])!.ownerSeat = player.seat; return { ...player, cash: 16, position: start, hand: [] }; });
  for (const player of state.players) { draw(state, player.seat, context); draw(state, player.seat, context); }
  startNight(state, context); return state;
}
/** One expired decision is processed per observation; reconnecting never skips an entire unseen night. */
export function advanceMarket(input: MarketState, context: MarketContext): MarketState {
  if (input.phaseEndsAt === undefined || context.now < input.phaseEndsAt || input.phase === "GAME_OVER") return input;
  const state = structuredClone(input);
  switch (state.phase) {
    case "MARKET_ROLL": roll(state, context); break;
    case "MARKET_BUY": state.buyTiles = []; upgrade(state, context); break;
    case "MARKET_PORTAL": playerAt(state, marketTurnSeat(state)).position = 1; arrive(state, context); break;
    case "MARKET_DISCARD": discardCard(state, playerAt(state, state.discardQueue[0]).hand[0].id, context); break;
    case "MARKET_DUEL":
      for (const seat of [state.duel!.visitorSeat, state.duel!.ownerSeat]) state.duel!.choices[seat] ??= { cardId: null };
      resolveDuel(state, context); break;
    case "MARKET_SETTLE": {
      while (state.payment && ownedShops(state, marketTurnSeat(state)).length > 1) {
        const cheapest = ownedShops(state, marketTurnSeat(state)).sort((a, b) => marketRefund(a) - marketRefund(b) || a.tile - b.tile)[0];
        sell(state, cheapest.tile, context);
      }
      break;
    }
    case "MARKET_UPGRADE": endTurn(state, context); break;
  }
  return state;
}
export function transitionMarket(input: MarketState, seat: number, action: MarketAction, context: MarketContext): MarketState {
  const state = structuredClone(input);
  if (action.phaseKey !== state.phaseKey || (state.phaseEndsAt !== undefined && context.now >= state.phaseEndsAt)) fail("STALE_MARKET_ACTION", "장터의 차례가 바뀌었습니다. 현재 화면에서 다시 골라주세요.");
  if (!state.players.some(player => player.seat === seat) || context.connectedSeats && !context.connectedSeats.includes(seat)) fail("UNAUTHORIZED", "다시 연결한 뒤 선택해 주세요.");
  if (!legalMarketActions(state, seat).includes(action.type)) fail("INVALID_PHASE", "지금은 이 선택을 할 수 없습니다.");
  const player = playerAt(state, seat);
  switch (action.type) {
    case "MARKET_ROLL": roll(state, context); break;
    case "MARKET_BUY": {
      if (action.tile !== null) {
        const shop = state.shops.find(shop => shop.tile === action.tile);
        if (!shop || shop.ownerSeat !== null || !state.buyTiles.includes(shop.tile) || player.cash < 6) fail("INVALID_PURCHASE", "살 수 있는 빈 가게를 골라주세요.");
        player.cash -= 6; shop.ownerSeat = seat; log(state, `${player.nickname}님이 ${marketTileName(shop.tile, state.rulesVersion)}을 샀습니다.`);
      }
      state.buyTiles = []; upgrade(state, context); break;
    }
    case "MARKET_PORTAL": {
      if (!state.shops.some(shop => shop.tile === action.tile)) fail("INVALID_TARGET", "가게 칸으로 이동해 주세요.");
      player.position = action.tile; log(state, `${player.nickname}님이 지름길로 ${marketTileName(action.tile, state.rulesVersion)}에 도착했습니다.`); arrive(state, context); break;
    }
    case "MARKET_DISCARD": discardCard(state, action.cardId, context); break;
    case "MARKET_UPGRADE": {
      if (action.tile !== null) {
        const shop = ownedShops(state, seat).find(shop => shop.tile === action.tile && !shop.level);
        if (!shop || player.cash < 4) fail("INVALID_UPGRADE", "증축할 내 기본 가게와 4엽전이 필요합니다.");
        player.cash -= 4; shop.level = 1; log(state, `${player.nickname}님이 ${marketTileName(shop.tile, state.rulesVersion)}을 증축했습니다.`);
      }
      endTurn(state, context); break;
    }
    case "MARKET_SELL": sell(state, action.tile, context); break;
    case "MARKET_DUEL": {
      const duel = state.duel!, card = player.hand.find(card => card.id === action.cardId);
      if (action.cardId !== null && !card) fail("CARD_NOT_IN_HAND", "내 손패에서 골라주세요.");
      const visiting = seat === duel.visitorSeat;
      if (card && !(visiting ? ["C", "H"] : ["M", "W"]).includes(card.kind)) fail("INVALID_CARD_ROLE", "지금 역할에 맞는 카드를 골라주세요.");
      if (card?.kind === "C") {
        const offered = ownedShops(state, seat).find(shop => shop.tile === action.targetTile);
        const visited = state.shops.find(shop => shop.tile === duel.tile)!;
        if (!offered || offered.level !== visited.level) fail("INVALID_EXCHANGE", "같은 증축 단계인 내 가게를 골라주세요.");
      } else if (action.targetTile !== undefined) fail("INVALID_EXCHANGE", "교환 대상은 둔갑 계약에만 고를 수 있습니다.");
      duel.choices[seat] = { cardId: action.cardId, ...(card?.kind === "C" ? { targetTile: action.targetTile } : {}) };
      if (duel.choices[duel.visitorSeat] && duel.choices[duel.ownerSeat]) resolveDuel(state, context);
      break;
    }
  }
  return state;
}
