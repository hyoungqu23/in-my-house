import { describe, expect, it } from "vitest";
import {
  CONNECTED_FOREST_RULES_BY_VERSION,
  CONNECTED_FOREST_CURRENT_RULES_VERSION,
  FOREST_ANIMAL_CARDS,
  FOREST_HEXES,
  FOREST_TERRAIN_CARDS,
  FOREST_TERRAINS,
  connectedForestRules,
  createMatchSetup,
} from "./content";

describe("connected forest content", () => {
  it("defines the complete board, terrain deck, animal deck, and prototype rules", () => {
    expect(FOREST_HEXES).toHaveLength(19);
    expect(new Set(FOREST_HEXES.map((hex) => hex.id))).toHaveProperty("size", 19);
    expect(FOREST_TERRAIN_CARDS).toHaveLength(90);
    for (const terrain of FOREST_TERRAINS) {
      expect(FOREST_TERRAIN_CARDS.filter((card) => card.kind === terrain)).toHaveLength(18);
    }
    expect(FOREST_ANIMAL_CARDS).toHaveLength(48);
    expect(new Set(FOREST_ANIMAL_CARDS.map((card) => card.id))).toHaveProperty("size", 48);
    expect(Object.keys(CONNECTED_FOREST_RULES_BY_VERSION)).toEqual(["prototype-1", "balanced-1", "balanced-2"]);
    expect(connectedForestRules("prototype-1")).toMatchObject({
      stayReceiverHearts: 2,
      walkReceiverLeaves: 3,
      pathCap: 3,
    });
  });

  it("registers the validated balance values while keeping historical setups explicit", () => {
    expect(CONNECTED_FOREST_CURRENT_RULES_VERSION).toBe("balanced-2");
    expect(connectedForestRules("balanced-1")).toMatchObject({ stayReceiverHearts: 1, visitorDiversityHearts: 1, visitorDiversityCap: 2, walkReceiverLeaves: 2, pathCompletionReceiverLeaves: 1, pathCompletionSenderLeaves: 1, pathCap: 4, visitRouting: "ALTERNATE" });
    expect(createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0, rulesVersion: "balanced-1" }).rulesVersion).toBe("balanced-1");
    expect(createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0 }).rulesVersion).toBe("prototype-1");
    expect(connectedForestRules("balanced-1").visitTieBreak).toBe("LOW_SEAT");
    expect(connectedForestRules("balanced-2")).toEqual({ ...connectedForestRules("balanced-1"), version: "balanced-2", visitTieBreak: "SEASON_DIRECTION" });
  });

  it.each([4, 5, 6])("creates a deterministic balanced setup for %i players", (count) => {
    const seats = Array.from({ length: count }, (_, index) => count - index);
    const first = createMatchSetup({ seats, randomIndex: () => 0 });
    const second = createMatchSetup({ seats, randomIndex: () => 0 });
    expect(first).toEqual(second);
    expect(first.seats).toEqual([...seats].sort((a, b) => a - b));
    expect(first.terrainDeck).toHaveLength(count * 15);
    expect(first.animalDeck).toHaveLength(48);
    for (const terrain of FOREST_TERRAINS) {
      expect(first.terrainDeck.filter((card) => card.kind === terrain)).toHaveLength(count * 3);
    }
  });

  it("rejects invalid rosters, random indexes, and rules versions", () => {
    expect(() => createMatchSetup({ seats: [1, 2, 3], randomIndex: () => 0 })).toThrow(/4–6명/);
    expect(() => createMatchSetup({ seats: [1, 2, 3, 4, 5, 6, 7], randomIndex: () => 0 }))
      .toThrow(/4–6명/);
    expect(() => createMatchSetup({ seats: [1, 1, 2, 3], randomIndex: () => 0 }))
      .toThrow(/좌석/);
    expect(() => createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => -1 }))
      .toThrow(/난수/);
    expect(() => connectedForestRules("future-rules")).toThrow(/규칙 버전/);
  });
});
