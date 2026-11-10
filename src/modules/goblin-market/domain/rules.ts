import type { MarketCardKind, MarketPlayer, MarketShop, MarketState } from "./types";
import { marketRules } from "./content";

export const ownedShops = (state: Pick<MarketState, "shops">, seat: number) => state.shops.filter(shop => shop.ownerSeat === seat);
export const marketAssets = (state: Pick<MarketState, "shops">, player: Pick<MarketPlayer, "seat" | "cash">) =>
  player.cash + ownedShops(state, player.seat).reduce((sum, shop) => sum + (shop.level ? 10 : 6), 0);
export function marketRent(state: Pick<MarketState, "rulesVersion" | "shops" | "trends" | "night">, shop: MarketShop) {
  const monopoly = shop.ownerSeat !== null && state.shops.filter(other => other.category === shop.category && other.ownerSeat === shop.ownerSeat).length === marketRules(state.rulesVersion).monopolySize;
  return Math.min(6, (shop.level ? 4 : 2) + Number(monopoly) + Number(state.trends[state.night - 1] === shop.category));
}
/** R is captured before ownership changes. A successful contract ignores markup. */
export function marketDuelFee(rent: number, visitor: MarketCardKind | null, owner: MarketCardKind | null) {
  const exchanged = visitor === "C" && owner !== "W";
  return { exchanged, due: exchanged ? Math.ceil(rent / 2) : Math.max(0, Math.min(6, rent + (owner === "M" ? 2 : 0) - (visitor === "H" ? 2 : 0))) };
}
export const marketRefund = (shop: MarketShop) => shop.level ? 5 : 3;
