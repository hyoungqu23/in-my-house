import { describe, expect, it } from "vitest";
import { scoreInn, validInnBoard } from "./rules";
import type { InnBoard, InnFurnitureKind, InnGuestKind } from "./types";
import { CAT2, rng, score as modelScore, valid as modelValid, positions } from "../../../../scripts/moonlit-inn/engine.mjs";

const kinds: InnGuestKind[] = ["rabbit", "phoenix", "cat", "cloud"];
const props: InnFurnitureKind[] = ["quilt", "stone", "basin", "wood"];
const balanced = { id: "balanced-1", base: [2, 2, 2, 2], catBonus: 1, woodCatBonus: 1, moonCap: 1 };
describe("moonlit inn scoring matches verified and pinned rule models", () => {
  it("agrees on 500 seeded legal boards including wet furniture, duplicate guests, and lobby guests", () => {
    const random = rng(20261009);
    for (let sample = 0; sample < 500; sample++) {
      let numeric;
      do {
        const g = Array.from({ length: 3 }, () => Math.floor(random() * 4));
        numeric = { g, f: Array.from({ length: 3 }, () => Math.floor(random() * 4)), gp: g.map(kind => { const cells = positions(kind); return cells[Math.floor(random() * cells.length)]; }), fp: Array.from({ length: 3 }, () => Math.floor(random() * 7) - 1) };
      } while (!modelValid(numeric));
      const board: InnBoard = { guests: numeric.g.map((kind, i) => ({ id: `g${i}`, kind: kinds[kind], position: numeric.gp[i] })), furniture: numeric.f.map((kind, i) => ({ id: `f${i}`, kind: props[kind], position: numeric.fp[i] })) };
      expect(validInnBoard(board)).toBe(true);
      for (const weather of ["roof", "garden"] as const) {
        expect(scoreInn(board, weather, "playtest-1").total).toBe(modelScore(numeric, weather, CAT2));
        expect(scoreInn(board, weather, "balanced-1").total).toBe(modelScore(numeric, weather, balanced));
      }
    }
  });
  it("uses the selected 2-star cat, not the old 1-star rule", () => {
    expect(scoreInn({ guests: [{ id: "cat", kind: "cat", position: 0 }], furniture: [] }, "garden").total).toBe(2);
  });
  it("gives cats a dry-bed bonus that stacks with a sleeping roommate only in balanced-1", () => {
    const board: InnBoard = { guests: [{ id: "r", kind: "rabbit", position: 0 }, { id: "c", kind: "cat", position: 0 }], furniture: [{ id: "w", kind: "wood", position: 0 }] };
    expect(scoreInn(board, "garden", "playtest-1").guests.find(g => g.id === "c")?.comfort).toBe(1);
    const cat = scoreInn(board, "garden", "balanced-1").guests.find(g => g.id === "c")!;
    expect(cat.base + cat.comfort).toBe(4);
    board.guests.push({ id: "d", kind: "cloud", position: 3 });
    expect(scoreInn(board, "garden", "balanced-1").guests.find(g => g.id === "c")?.comfort).toBe(1);
  });
  it("pins rabbit base and moon cap per match and keeps rabbit furniture bonuses non-stacking", () => {
    const board: InnBoard = { guests: [{ id: "r", kind: "rabbit", position: 0 }, { id: "c", kind: "cat", position: 0 }], furniture: [{ id: "w", kind: "wood", position: 0 }, { id: "q", kind: "quilt", position: 1 }] };
    const old = scoreInn(board, "roof", "playtest-1"), current = scoreInn(board, "roof", "balanced-1");
    expect(old.guests[0]).toMatchObject({ base: 3, comfort: 2 });
    expect(current.guests[0]).toMatchObject({ base: 2, comfort: 2 });
    expect(old.moon).toBe(2); expect(current.moon).toBe(1);
  });
});
