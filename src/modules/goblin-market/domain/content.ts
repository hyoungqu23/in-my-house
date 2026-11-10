import type { MarketCardKind, MarketCategory, MarketPhase, MarketRulesVersion } from "./types";

export const MARKET_CATEGORIES: Record<MarketCategory, { name: string; trend: string; symbol: string }> = {
  food: { name: "먹거리", trend: "귀신 회식날", symbol: "♨" },
  goods: { name: "잡화", trend: "장만하는 밤", symbol: "⚒" },
  fortune: { name: "점술", trend: "소원이 많은 밤", symbol: "✦" },
  fun: { name: "놀거리", trend: "밤샘 축제", symbol: "☾" },
};
export const MARKET_CARDS: Record<MarketCardKind, { name: string; role: "방문객" | "점주"; symbol: string; description: string }> = {
  C: { name: "둔갑 계약", role: "방문객", symbol: "⇄", description: "같은 단계 가게를 맞바꾸고, 이전 점주에게 원래 요금의 절반을 냅니다. 홀수는 올림." },
  H: { name: "흥정", role: "방문객", symbol: "−2", description: "이번 방문 요금을 2엽전 깎습니다." },
  M: { name: "바가지", role: "점주", symbol: "+2", description: "이번 방문 요금에 2엽전을 더합니다. 둔갑이 성공하면 추가 요금은 없습니다." },
  W: { name: "부적", role: "점주", symbol: "◇", description: "둔갑 계약을 막고 원래 요금을 받습니다. 흥정에는 효과가 없습니다." },
};
export const MARKET_SHOPS_V1 = [
  { tile: 1, category: "food", name: "달토끼 떡집" }, { tile: 2, category: "food", name: "구미호 주막" },
  { tile: 4, category: "goods", name: "도깨비 대장간" }, { tile: 6, category: "goods", name: "둔갑 의상실" },
  { tile: 7, category: "food", name: "불도깨비 꼬치집" }, { tile: 9, category: "fortune", name: "달그림자 점집" },
  { tile: 11, category: "fortune", name: "꿈 수선소" }, { tile: 12, category: "goods", name: "만물 보따리" },
  { tile: 14, category: "fun", name: "귀신 사진관" }, { tile: 16, category: "fun", name: "도깨비 씨름장" },
  { tile: 17, category: "fortune", name: "부적 공방" }, { tile: 19, category: "fun", name: "그림자 극장" },
] as const;
export const MARKET_SHOPS_V2 = [
  { tile: 1, category: "food", name: "달토끼 떡집" }, { tile: 2, category: "goods", name: "도깨비 대장간" },
  { tile: 4, category: "fortune", name: "달그림자 점집" }, { tile: 5, category: "fun", name: "귀신 사진관" },
  { tile: 8, category: "food", name: "구미호 주막" }, { tile: 9, category: "goods", name: "둔갑 의상실" },
  { tile: 11, category: "fortune", name: "꿈 수선소" }, { tile: 12, category: "fun", name: "도깨비 씨름장" },
  { tile: 15, category: "food", name: "불도깨비 꼬치집" }, { tile: 16, category: "goods", name: "만물 보따리" },
  { tile: 18, category: "fortune", name: "부적 공방" }, { tile: 19, category: "fun", name: "그림자 극장" },
  { tile: 22, category: "food", name: "이슬 한과방" }, { tile: 23, category: "goods", name: "별실 공방" },
  { tile: 25, category: "fortune", name: "소원 등불집" }, { tile: 26, category: "fun", name: "반딧불 놀이방" },
] as const;

export type MarketSpecialKind = "gate" | "rumor" | "market" | "portal" | "rest";
const specialInfo = {
  gate: { name: "달문", symbol: "☽" }, rumor: { name: "소문 골목", symbol: "▤" },
  market: { name: "만물장터", symbol: "⚑" }, portal: { name: "도깨비 지름길", symbol: "↗" },
  rest: { name: "낮잠 정자", symbol: "☁" },
} as const;
function specials(positions: Record<MarketSpecialKind, readonly number[]>) {
  return Object.fromEntries(Object.entries(positions).flatMap(([kind, tiles]) => tiles.map(tile => [tile, { ...specialInfo[kind as MarketSpecialKind], kind: kind as MarketSpecialKind }]))) as Record<number, { name: string; symbol: string; kind: MarketSpecialKind }>;
}
type DecisionPhase = Exclude<MarketPhase, "GAME_OVER">;
export const MARKET_RULE_SETS = {
  "mvp-1": {
    size: 20, nights: 8, nightsName: "여덟", monopolySize: 3, gates: [0, 5, 10, 15], shops: MARKET_SHOPS_V1,
    specials: specials({ gate: [0], rumor: [3, 8, 13, 18], market: [5], portal: [10], rest: [15] }),
    timeLimits: { MARKET_ROLL: 5000, MARKET_BUY: 10000, MARKET_PORTAL: 10000, MARKET_DUEL: 8000, MARKET_DISCARD: 5000, MARKET_SETTLE: 10000, MARKET_UPGRADE: 5000 } satisfies Record<DecisionPhase, number>,
  },
  "mvp-2": {
    size: 28, nights: 12, nightsName: "열두", monopolySize: 4, gates: [0, 7, 14, 21], shops: MARKET_SHOPS_V2,
    specials: specials({ gate: [0], rumor: [3, 6, 10, 13, 17, 24], market: [7, 20], portal: [14, 27], rest: [21] }),
    timeLimits: { MARKET_ROLL: 5000, MARKET_BUY: 15000, MARKET_PORTAL: 15000, MARKET_DUEL: 15000, MARKET_DISCARD: 8000, MARKET_SETTLE: 15000, MARKET_UPGRADE: 10000 } satisfies Record<DecisionPhase, number>,
  },
} as const;
export const MARKET_CURRENT_RULES_VERSION: MarketRulesVersion = "mvp-2";
export const marketRules = (version: MarketRulesVersion) => MARKET_RULE_SETS[version];
export const MARKET_SHOPS = MARKET_SHOPS_V2;
export const marketTileName = (tile: number, version: MarketRulesVersion = MARKET_CURRENT_RULES_VERSION) => {
  const rules = marketRules(version);
  return rules.shops.find(shop => shop.tile === tile)?.name ?? rules.specials[tile]?.name ?? "장터";
};
export const MARKET_PHASE_NAMES = {
  MARKET_ROLL: "주사위 굴리기", MARKET_DISCARD: "카드 두 장 남기기", MARKET_BUY: "가게 들이기",
  MARKET_PORTAL: "지름길 고르기", MARKET_DUEL: "비밀 장난 대결", MARKET_SETTLE: "방문 요금 정산",
  MARKET_UPGRADE: "가게 증축하기", GAME_OVER: "장터 마감",
} as const;
