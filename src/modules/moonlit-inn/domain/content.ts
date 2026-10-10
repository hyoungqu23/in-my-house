import type { InnFurnitureKind, InnGuestKind, InnRulesVersion, InnSetup } from "./types";

export const INN_CURRENT_RULES_VERSION: InnRulesVersion = "balanced-1";
const RULES = {
  "playtest-1": { rabbitBase: 3, catBase: 2, woodCatBonus: 0, moonCap: 2 },
  "balanced-1": { rabbitBase: 2, catBase: 2, woodCatBonus: 1, moonCap: 1 },
} as const;
export const innRules = (version: InnRulesVersion) => RULES[version];

export const INN_GUESTS: Record<InnGuestKind, { name: string; base: number; quote: string; rule: string; sprite: number }> = {
  rabbit: { name: "솜솜", base: 2, quote: "양옆 방은 비워주시면 좋겠어요.", rule: "같은 층 바닥 두 칸. 마른 담요가 있으면 +2.", sprite: 0 },
  phoenix: { name: "후추", base: 2, quote: "물건이 조금 뜨거워져도 괜찮나요?", rule: "마른 나무침대와는 못 자요. 비가 닿으면 해결. 돌침대 +2.", sprite: 2 },
  cat: { name: "모카", base: 2, quote: "침대는 천장에 붙여주세요.", rule: "천장 한 칸. 잠든 룸메이트 +1, 마른 나무침대 +1. 두 보너스를 함께 받아요.", sprite: 4 },
  cloud: { name: "보슬", base: 2, quote: "실내에서도 우산을 써도 될까요?", rule: "자기 방과 상하좌우에 비가 와요. 같은 방 대야 +2.", sprite: 6 },
};
export const INN_FURNITURE: Record<InnFurnitureKind, { name: string; rule: string; sprite: number }> = {
  quilt: { name: "누빔 담요", rule: "솜솜의 방에서 마르면 +2. 젖으면 보너스가 없어요.", sprite: 0 },
  stone: { name: "돌침대", rule: "후추의 방에 놓으면 +2.", sprite: 1 },
  basin: { name: "대야", rule: "보슬의 방에 놓으면 +2. 주변 비를 막지는 않아요.", sprite: 2 },
  wood: { name: "나무침대", rule: "마르면 솜솜·모카에게 +1. 솜솜은 담요와 중복 불가, 모카는 룸메이트와 합산해요.", sprite: 3 },
};
export function innGuestInfo(kind: InnGuestKind, version: InnRulesVersion) {
  const info = INN_GUESTS[kind], rules = innRules(version);
  return { ...info, base: kind === "rabbit" ? rules.rabbitBase : kind === "cat" ? rules.catBase : info.base,
    rule: kind === "cat" && !rules.woodCatBonus ? "천장 한 칸. 같은 방 바닥에도 잠든 손님이 있으면 +1." : info.rule };
}
export const INN_ROOMS = ["201", "202", "203", "101", "102", "103"] as const;
export const INN_REVEAL_MS = 6_000;
export const INN_FORFEIT_MS = 180_000;
export function createInnSetup(matchId: string, randomIndex: (max: number) => number, rulesVersion = INN_CURRENT_RULES_VERSION): InnSetup {
  function shuffled<T>(values: T[]) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const guests = shuffled((Object.keys(INN_GUESTS) as InnGuestKind[]).flatMap(kind => Array.from({ length: 4 }, () => kind)));
  const furniture = shuffled((Object.keys(INN_FURNITURE) as InnFurnitureKind[]).flatMap(kind => Array.from({ length: 4 }, () => kind)));
  return {
    matchId, rulesVersion, weather: randomIndex(2) === 0 ? "roof" : "garden",
    bundles: guests.slice(0, 12).map((kind, i) => ({
      id: `${matchId}-bundle-${i}`,
      guest: { id: `${matchId}-guest-${i}`, kind, position: -1 },
      furniture: { id: `${matchId}-furniture-${i}`, kind: furniture[i], position: -1 },
    })),
  };
}
