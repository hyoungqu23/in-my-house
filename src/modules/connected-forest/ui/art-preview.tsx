"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Heart, Leaf, RotateCcw } from "lucide-react";
import { FOREST_HEXES } from "../domain/content";
import type { ForestSpeciesId, ForestTerrainKind } from "../domain/types";
import { FOREST_FRIENDS, FOREST_TERRAIN_ART, ForestAnimalArt, ForestTerrainArt } from "./forest-art";
import styles from "./art-preview.module.css";

const initialTiles: Record<string, ForestTerrainKind> = {
  h00: "FLOWER", h01: "TREE", h02: "MUSHROOM", h03: "TREE", h04: "WATER",
  h05: "ROCK", h06: "WATER", h07: "TREE", h10: "MUSHROOM",
};
const terrainKinds = Object.keys(FOREST_TERRAIN_ART) as ForestTerrainKind[];
const speciesIds = Object.keys(FOREST_FRIENDS) as ForestSpeciesId[];
const residents: Record<string, ForestSpeciesId> = { h01: "squirrel", h04: "otter", h00: "rabbit" };

export function ForestArtPreview() {
  const [tiles, setTiles] = useState(initialTiles);
  const [terrain, setTerrain] = useState<ForestTerrainKind>("FLOWER");
  const [selectedHex, setSelectedHex] = useState<string>();
  const [friend, setFriend] = useState<ForestSpeciesId>("squirrel");
  const [visit, setVisit] = useState<"STAY" | "WALK">();
  const [message, setMessage] = useState("바구니에서 조각을 고르고, 점선 칸에 놓아보세요.");
  const canPlace = (id: string) => {
    if (tiles[id]) return false;
    const hex = FOREST_HEXES.find((cell) => cell.id === id)!;
    return FOREST_HEXES.some((other) => tiles[other.id]
      && (Math.abs(hex.q - other.q) + Math.abs(hex.r - other.r)
        + Math.abs(hex.q + hex.r - other.q - other.r)) === 2);
  };
  const reset = () => {
    setTiles(initialTiles); setSelectedHex(undefined); setVisit(undefined);
    setMessage("숲이 처음 모습으로 돌아왔어요. 다른 조각도 놓아보세요.");
  };

  return <main id="main-content" className={styles.page}>
    <div className={styles.previewNote}>일러스트와 배치를 살펴보는 미리보기입니다. 실제 경기는 연결 준비 중이에요.</div>
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="미리보기 탐색">
        <Link href="/" className={styles.back}><ArrowLeft size={17} /> 게임 목록</Link>
        <a className={styles.wordmark} href="#main-content"><ForestTerrainArt kind="MUSHROOM" decorative /> 이어지는 숲길</a>
        <a className={styles.catalogLink} href="#forest-friends">숲속 친구들 <ArrowRight size={15} /></a>
      </nav>

      <header className={styles.intro}>
        <div><p className={styles.eyebrow}>작은 조각으로 만드는, 우리만의 숲</p><h1>작은 숲에,<br /><span>반가운 발자국.</span></h1></div>
        <p className={styles.introText}>나무 한 그루, 꽃 한 송이.<br />숲이 자라면 친구들이 찾아와요.<br /><span>4–6명 · 함께 만드는 작은 풍경</span></p>
      </header>

      <div className={styles.gameLayout}>
        <section className={styles.forest} aria-labelledby="my-forest-heading">
          <div className={styles.forestTop}><div><span className={styles.eyebrow}>MY LITTLE FOREST</span><h2 id="my-forest-heading">나의 작은 숲</h2></div><span className={styles.season}><Leaf size={16} /> 초여름 풍경</span></div>
          <div className={styles.boardFrame}>
            <div className={styles.board} role="group" aria-label="19칸 숲 배치 미리보기">
              <span className={styles.landShadow} aria-hidden="true" />
              {FOREST_HEXES.map((hex) => {
                const tile = tiles[hex.id];
                const legal = canPlace(hex.id);
                const selected = selectedHex === hex.id;
                return <button key={hex.id} type="button"
                  className={`${styles.hex} ${tile ? styles.occupied : styles.empty} ${selected ? styles.selected : ""}`}
                  style={{ left: `${50 + (hex.q + hex.r / 2) * 18}%`, top: `${50 + hex.r * 16}%` }}
                  disabled={!legal} aria-pressed={selected}
                  aria-label={`${hex.id} ${tile ? FOREST_TERRAIN_ART[tile].name : legal ? "빈칸에 놓기" : "아직 놓을 수 없는 빈칸"}${residents[hex.id] ? `, ${FOREST_FRIENDS[residents[hex.id]].name}` : ""}`}
                  onClick={() => setSelectedHex(hex.id)}>
                  {tile ? <ForestTerrainArt kind={tile} decorative /> : <svg className={styles.emptyHex} viewBox="0 0 100 110" aria-hidden="true" focusable="false">
                    <path d="M50 6Q53 6 56 8L91 28Q95 30 95 35V75Q95 80 91 82L56 102Q50 106 44 102L9 82Q5 80 5 75V35Q5 30 9 28L44 8Q47 6 50 6Z" />
                    {selected ? <path className={styles.hexCheck} d="M36 55L46 65L65 44" /> : legal && <text x="50" y="64" textAnchor="middle">+</text>}
                  </svg>}
                  {residents[hex.id] && <ForestAnimalArt species={residents[hex.id]} decorative className={styles.resident} />}
                </button>;
              })}
            </div>
            <div className={styles.boardFooter}><span><i /> 점선 칸에 조각을 놓을 수 있어요</span><button type="button" onClick={reset} aria-label="미리보기 초기화"><RotateCcw size={15} /> 다시 꾸미기</button></div>
          </div>
          <div className={styles.basket}>
            <div className={styles.basketTitle}><h3>오늘의 숲 바구니</h3><span>마음에 드는 조각을 골라요</span></div>
            <div className={styles.terrainChoices} role="group" aria-label="지형 선택">
              {terrainKinds.map((kind) => <button type="button" key={kind} aria-pressed={terrain === kind} onClick={() => setTerrain(kind)} className={styles.terrainChoice}>
                <ForestTerrainArt kind={kind} decorative /><span>{FOREST_TERRAIN_ART[kind].name}</span>
                {terrain === kind && <Check size={15} className={styles.chosen} />}
              </button>)}
            </div>
            <div className={styles.placeRow}><p role="status" aria-live="polite">{message}</p><button className={styles.primary} type="button" disabled={!selectedHex} onClick={() => {
              if (!selectedHex || !canPlace(selectedHex)) return;
              setTiles({ ...tiles, [selectedHex]: terrain }); setSelectedHex(undefined);
              setMessage(`${FOREST_TERRAIN_ART[terrain].name} 조각을 놓았어요. 숲이 조금 더 자랐네요!`);
            }}>숲에 놓아보기 <ArrowRight size={17} /></button></div>
          </div>
        </section>

        <aside className={styles.side} aria-label="동물과 방문 미리보기">
          <article className={styles.animalCard} style={{ backgroundColor: FOREST_FRIENDS[friend].ground }}>
            <div className={styles.cardTop}><span>숲속의 작은 이웃</span><span className={styles.heart}><Heart size={15} fill="currentColor" /> 반가워!</span></div>
            <div className={styles.portrait}><span className={styles.portraitHalo} /><ForestAnimalArt species={friend} /><span className={styles.leafOne}><Leaf size={27} /></span><span className={styles.leafTwo}><Leaf size={18} /></span></div>
            <h2>{FOREST_FRIENDS[friend].name}</h2><p>{FOREST_FRIENDS[friend].note}</p>
            <div className={styles.cardStamp}><span>FOREST FRIENDS</span><span>{String(speciesIds.indexOf(friend) + 1).padStart(2, "0")} / 12</span></div>
          </article>
          <section className={styles.visit} aria-labelledby="visit-heading">
            <div className={styles.visitHeading}><ForestAnimalArt species="hedgehog" decorative /><div><span className={styles.eyebrow}>똑똑, 놀러 왔어요</span><h3 id="visit-heading">옆 숲의 고슴도치</h3></div></div>
            <p>우리 숲에서 쉬어 갈까요,<br />오솔길을 함께 걸을까요?</p>
            <div className={styles.visitChoices}>
              <button type="button" aria-pressed={visit === "STAY"} onClick={() => setVisit("STAY")}><Heart size={18} /> 우리 숲에 머물기</button>
              <button type="button" aria-pressed={visit === "WALK"} onClick={() => setVisit("WALK")}><Leaf size={18} /> 함께 산책하기</button>
            </div>
            <p className={styles.visitResult} role="status">{visit === "STAY" ? "폭신한 낙엽 자리를 내어줬어요." : visit === "WALK" ? "두 숲 사이에 작은 발자국이 이어져요." : "선택하면 인사를 미리 볼 수 있어요."}</p>
          </section>
        </aside>
      </div>

      <section id="forest-friends" className={styles.friends} aria-labelledby="friends-heading">
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>TWELVE LITTLE NEIGHBORS</span><h2 id="friends-heading">저마다의 다정함이 있어요.</h2></div><p>친구를 누르면 큰 그림으로 만날 수 있어요.</p></div>
        <div className={styles.friendGrid}>
          {speciesIds.map((species) => <button key={species} type="button" className={styles.friend} aria-pressed={friend === species} onClick={() => setFriend(species)} aria-label={`${FOREST_FRIENDS[species].name} 일러스트 선택`}>
            <span className={styles.friendCircle} style={{ backgroundColor: FOREST_FRIENDS[species].ground }}><ForestAnimalArt species={species} decorative /></span>
            <span>{FOREST_FRIENDS[species].name}</span><small>{friend === species ? "지금 보고 있어요" : "만나보기"}</small>
          </button>)}
        </div>
        <div className={styles.mobilePortrait} aria-live="polite"><ForestAnimalArt species={friend} /><p><strong>{FOREST_FRIENDS[friend].name}</strong><br />{FOREST_FRIENDS[friend].note}</p></div>
      </section>
      <footer className={styles.footer}><ForestTerrainArt kind="FLOWER" decorative /><p>작은 숲, 오래 기억할 하루.<br /><span>이어지는 숲길 · 일러스트 미리보기</span></p><a href="#main-content">맨 위로 ↑</a></footer>
    </div>
  </main>;
}
