import Image from "next/image";
import type { MarketCardKind, MarketCategory } from "../domain/types";
import styles from "./game.module.css";

const sprites = { food: 0, goods: 1, fortune: 2, fun: 3, goblin: 4, fox: 5, rabbit: 6, ghost: 7 } as const;
export const MARKET_MERCHANTS = ["goblin", "fox", "rabbit", "ghost"] as const;
export const MARKET_MERCHANT_NAMES = ["도깨비", "구미호", "달토끼", "꼬마 유령"] as const;
const cardCharacters = { C: "fox", H: "rabbit", M: "goblin", W: "ghost" } as const;
// The generated atlas has unequal row heights; use its transparent gutters as boundaries.
const shopRows = [{ top: 0, height: 313 }, { top: 313, height: 314 }, { top: 627, height: 323 }, { top: 950, height: 281 }] as const;

export function MarketSprite({ kind, className = "" }: { kind: keyof typeof sprites; className?: string }) {
  const index = sprites[kind];
  return <span aria-hidden="true" className={`${styles.sprite} ${className}`} style={{ backgroundPosition: `${index % 4 / 3 * 100}% ${Math.floor(index / 4) * 100}%` }} />;
}
export function MarketMerchantArt({ index, className }: { index: number; className?: string }) {
  return <MarketSprite kind={MARKET_MERCHANTS[Math.max(0, index) % 4]} className={className} />;
}
export function MarketShopArt({ category, ownerIndex, className = "" }: { category: MarketCategory; ownerIndex?: number; className?: string }) {
  if (ownerIndex === undefined || ownerIndex < 0) return <MarketSprite kind={category} className={className} />;
  const merchant = ownerIndex % MARKET_MERCHANTS.length;
  const row = shopRows[merchant];
  return <span aria-hidden="true" data-merchant={MARKET_MERCHANTS[merchant]} className={`${styles.sprite} ${styles.ownedShopSprite} ${className}`} style={{ backgroundPosition: `${sprites[category] / 3 * 100}% ${row.top / (1231 - row.height) * 100}%`, backgroundSize: `400% ${1231 / row.height * 100}%`, aspectRatio: `${1277 / 4} / ${row.height}` }} />;
}
export function MarketCardArt({ kind }: { kind: MarketCardKind }) {
  return <MarketSprite kind={cardCharacters[kind]} className={styles.cardArt} />;
}
export function MarketArt() {
  return <Image src="/games/goblin-market/key-visual.png" alt="등불 켜진 작은 야시장에서 장사하는 도깨비, 여우, 달토끼와 꼬마 유령" width={1536} height={1024} sizes="(max-width: 700px) 90vw, 600px" />;
}
