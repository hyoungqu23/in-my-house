"use client";

import { FOREST_HEXES } from "../domain/content";
import { rotateForestCoordinate } from "../domain/rules";
import type { ForestAnimalCard, ForestBoardCell, ForestFigure } from "../domain/types";
import { FOREST_FRIENDS, FOREST_TERRAIN_ART, ForestAnimalArt, ForestTerrainArt } from "./forest-art";
import styles from "./game.module.css";

export function ForestBoard({ board, figures, label, legalHexIds = [], selectedHexId, highlightedHexIds = [], previewHexId, onSelect }: {
  board: ForestBoardCell[];
  figures: ForestFigure[];
  label: string;
  legalHexIds?: string[];
  selectedHexId?: string;
  highlightedHexIds?: string[];
  previewHexId?: string;
  onSelect?: (hexId: string) => void;
}) {
  return <div className={styles.board} role="group" aria-label={label}>
    <span className={styles.boardGround} aria-hidden="true" />
    {FOREST_HEXES.map((hex, index) => {
      const cell = board.find((candidate) => candidate.hexId === hex.id);
      const terrain = cell?.acornTerrain ?? cell?.terrain;
      const figure = figures.find((candidate) => candidate.hexId === hex.id);
      const legal = legalHexIds.includes(hex.id);
      const selected = selectedHexId === hex.id;
      const className = `${styles.hex} ${terrain ? styles.filledHex : styles.emptyHex} ${selected ? styles.selectedHex : ""} ${highlightedHexIds.includes(hex.id) ? styles.patternHex : ""} ${previewHexId === hex.id ? styles.previewHex : ""}`;
      const style = { left: `${50 + (hex.q + hex.r / 2) * 19}%`, top: `${47 + hex.r * 17}%` };
      const description = `숲 칸 ${index + 1} · ${terrain ? FOREST_TERRAIN_ART[terrain].name : "빈칸"}${figure ? ` · ${FOREST_FRIENDS[figure.speciesId].name}` : ""}`;
      const artwork = <>
        {terrain ? <ForestTerrainArt kind={terrain} decorative /> : <svg viewBox="0 0 100 110" aria-hidden="true" focusable="false">
          <path d="M50 6L94 30V80L50 104L6 80V30Z" /><text x="50" y="64" textAnchor="middle">{legal ? "+" : ""}</text>
        </svg>}
        {cell?.acornTerrain && <span className={styles.acornMark} aria-label="황금 도토리">✦</span>}
        {figure && <><ForestAnimalArt className={styles.figure} species={figure.speciesId} decorative />{figure.kind === "VISITOR" && <span className={styles.visitorMark} aria-label="이웃 방문객">♥</span>}</>}
      </>;
      return onSelect ? <button type="button" key={hex.id} data-hex-id={hex.id} aria-label={description} aria-pressed={selected} disabled={!legal} className={className} style={style} onClick={() => onSelect(hex.id)}>{artwork}</button>
        : <div key={hex.id} role="img" aria-label={description} className={className} style={style}>{artwork}</div>;
    })}
  </div>;
}

export function ForestPatternArt({ card, rotation = 0 }: { card: ForestAnimalCard; rotation?: number }) {
  const coordinates = card.cells.map((cell) => {
    const rotated = rotateForestCoordinate(cell.q, cell.r, rotation);
    return { ...cell, x: rotated.q + rotated.r / 2, y: rotated.r };
  });
  const minX = Math.min(...coordinates.map((cell) => cell.x));
  const maxX = Math.max(...coordinates.map((cell) => cell.x));
  const minY = Math.min(...coordinates.map((cell) => cell.y));
  const maxY = Math.max(...coordinates.map((cell) => cell.y));
  const width = 74 / (maxX - minX + 1);
  return <div className={styles.pattern} role="img" aria-label={`서식지 모양: ${card.cells.map((cell) => FOREST_TERRAIN_ART[cell.terrain].name).join(" · ")}`}>
    {coordinates.map((cell, index) => <span key={index} style={{ width: `${width}%`, left: `${50 + (cell.x - (minX + maxX) / 2) * width}%`, top: `${42 + (cell.y - (minY + maxY) / 2) * 25}%` }}><ForestTerrainArt kind={cell.terrain} decorative /></span>)}
  </div>;
}
