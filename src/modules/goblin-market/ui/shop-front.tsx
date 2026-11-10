"use client";

import { useEffect, useRef } from "react";
import type { MarketCategory } from "../domain/types";
import { MarketMerchantArt, MARKET_MERCHANT_NAMES, MarketShopArt } from "./market-art";
import styles from "./game.module.css";

export function MarketShopFront({ category, level, ownerIndex, ownerName }: {
  category: MarketCategory;
  level: 0 | 1;
  ownerIndex?: number;
  ownerName?: string;
}) {
  const previousOwner = useRef(ownerIndex);
  const building = useRef<HTMLSpanElement>(null);
  const sign = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const changed = previousOwner.current !== ownerIndex;
    previousOwner.current = ownerIndex;
    if (!changed || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rebuilding = building.current?.animate?.([
      { opacity: .25, transform: "translateY(3px) scale(.86)" },
      { opacity: 1, transform: "translateY(-2px) scale(1.04)", offset: .7 },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ], { duration: 560, easing: "ease-out" });
    const flipping = sign.current?.animate?.([
      { transform: "translate(-50%,35%) perspective(100px) rotateX(-90deg)", opacity: 0 },
      { transform: "translate(-50%,35%) perspective(100px) rotateX(12deg)", opacity: 1, offset: .7 },
      { transform: "translate(-50%,35%) perspective(100px) rotateX(0deg)", opacity: 1 },
    ], { duration: 680, easing: "ease-out" });
    return () => { rebuilding?.cancel(); flipping?.cancel(); };
  }, [ownerIndex]);

  const owned = ownerIndex !== undefined && ownerIndex >= 0;
  return <>
    <span ref={building} className={`${styles.shopArt} ${level ? styles.shopExpanded : ""}`} aria-hidden="true">
      {level === 1 && <span className={styles.shopFoundation} />}
      <MarketShopArt category={category} ownerIndex={ownerIndex} />
    </span>
    {owned && <span ref={sign} className={styles.ownerTag} title={`${ownerName}의 가게 · ${MARKET_MERCHANT_NAMES[ownerIndex % 4]} 간판`}>
      <MarketMerchantArt index={ownerIndex} className={styles.ownerCrest} /><span>주인 {ownerIndex + 1}</span>
    </span>}
  </>;
}
