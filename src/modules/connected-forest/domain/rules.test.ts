import { describe, expect, it } from "vitest";
import {
  FOREST_ANIMAL_CARDS,
  FOREST_HEXES,
  FOREST_TERRAIN_CARDS,
  createMatchSetup,
} from "./content";
import {
  areForestHexesAdjacent,
  assertConnectedForestState,
  createForestBoard,
  createForestNeighborPaths,
  forestAnimal,
  forestAnimalCardForResident,
  forestFiguresByHex,
  forestHexDistance,
  forestNeighborSeats,
  forestPathBetween,
  forestPathKey,
  forestPatternHexes,
  forestTerrainAt,
  forestVisitOptions,
  forestWelcomeChoices,
  isForestHabitatMatch,
  isValidForestWelcome,
  legalForestPlacementHexIds,
  placeForestTerrain,
  rotateForestCoordinate,
  scoreConnectedForest,
  scoreForestPlayer,
} from "./rules";
import { createInitialState } from "./reducer";
import type { ForestPlayer } from "./types";

const roster = [1, 2, 3, 4].map((seat) => ({
  seat,
  userId: `u${seat}`,
  nickname: `p${seat}`,
}));

const player = (): ForestPlayer => ({
  ...roster[0],
  board: createForestBoard(),
  hand: [],
  activeAnimals: [],
  figures: [],
  leaves: 0,
  leavesFromPaths: 0,
  goldenAcornAvailable: true,
  animalRefreshAvailable: true,
  welcomedThisSeason: false,
});

describe("connected forest rules", () => {
  it("handles hex distance, adjacency, and six rotations", () => {
    expect(forestHexDistance("h00")).toBe(0);
    expect(forestHexDistance("h18")).toBe(2);
    expect(forestHexDistance("missing")).toBe(Number.POSITIVE_INFINITY);
    expect(areForestHexesAdjacent("h00", "h01")).toBe(true);
    expect(areForestHexesAdjacent("h00", "h18")).toBe(false);
    expect(areForestHexesAdjacent("missing", "h00")).toBe(false);
    let coordinate = { q: 1, r: 0 };
    for (let turn = 0; turn < 6; turn += 1) {
      coordinate = rotateForestCoordinate(coordinate.q, coordinate.r, 1);
    }
    expect(coordinate).toEqual({ q: 1, r: 0 });
    expect(rotateForestCoordinate(1, 0, -1)).toEqual({ q: 1, r: -1 });
  });

  it("places a connected terrain graph and treats an acorn as a bound wildcard", () => {
    const state = player();
    expect(legalForestPlacementHexIds(state)).toEqual(["h00"]);
    placeForestTerrain(state, FOREST_TERRAIN_CARDS[0], "h00");
    expect(forestTerrainAt(state.board[0])).toBe("TREE");
    expect(legalForestPlacementHexIds(state)).toEqual(expect.arrayContaining([
      "h01", "h02", "h03", "h04", "h05", "h06",
    ]));
    placeForestTerrain(state, FOREST_TERRAIN_CARDS.find((card) => card.kind === "WATER")!, "h01", "FLOWER");
    expect(state.board.find((cell) => cell.hexId === "h01")).toMatchObject({ acornTerrain: "FLOWER" });
    expect(() => placeForestTerrain(state, FOREST_TERRAIN_CARDS[0], "h18")).toThrow(/놓을 수 없는/);
  });

  it("matches rotated habitats and keeps figure occupancy separate from terrain reuse", () => {
    const state = player();
    const card = forestAnimal("squirrel-bend3")!;
    state.activeAnimals = [card];
    for (const [hexId, terrain] of [["h00", "TREE"], ["h06", "MUSHROOM"], ["h04", "ROCK"]] as const) {
      const cell = state.board.find((candidate) => candidate.hexId === hexId)!;
      cell.terrain = terrain;
    }
    expect(isForestHabitatMatch(state, card, "h00", 0)).toBe(true);
    expect(isForestHabitatMatch(state, card, "h00", 7)).toBe(false);
    expect(forestPatternHexes(card, "missing", 0)).toEqual([]);
    const choices = forestWelcomeChoices(state, card);
    expect(choices.length).toBeGreaterThan(0);
    expect(isValidForestWelcome(state, choices[0])).toBe(true);
    expect(isValidForestWelcome(state, {
      ...choices[0],
      animalCardId: "otter-line3",
    })).toBe(false);
    state.figures.push({
      kind: "RESIDENT",
      figureId: "r1",
      animalCardId: card.id,
      speciesId: card.speciesId,
      hexId: choices[0].residentHexId,
      visited: false,
    });
    expect(forestFiguresByHex(state).get(choices[0].residentHexId)?.figureId).toBe("r1");
    expect(isValidForestWelcome(state, choices[0])).toBe(false);
  });

  it("derives circular neighbors, paths, visit choices, scores, and tie breakers", () => {
    const setup = createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0 });
    const state = createInitialState(roster, setup, 0);
    expect(createForestNeighborPaths([1, 2, 3, 4])).toHaveLength(4);
    expect(forestNeighborSeats(state, 1)).toEqual([2, 4]);
    expect(forestNeighborSeats(state, 99)).toEqual([]);
    expect(forestPathKey(4, 1)).toBe("1:4");
    expect(forestPathBetween(state, 1, 4)).toMatchObject({ lowSeat: 1, highSeat: 4 });

    const source = state.players[0];
    const receiver = state.players[1];
    receiver.board.find((cell) => cell.hexId === "h00")!.terrain = "TREE";
    const visit = {
      visitId: "v-0-1",
      animalCardId: "squirrel-line3" as const,
      speciesId: "squirrel" as const,
      visitorTerrain: "TREE" as const,
      sourceSeat: source.seat,
      targetSeat: receiver.seat,
    };
    expect(forestVisitOptions(state, visit)).toEqual({ stayHexIds: ["h00"], canWalk: true });
    expect(forestVisitOptions(state, { ...visit, targetSeat: 99 })).toEqual({
      stayHexIds: [],
      canWalk: false,
    });
    source.figures.push({
      kind: "RESIDENT",
      figureId: "resident-1-squirrel-line3",
      animalCardId: "squirrel-line3",
      speciesId: "squirrel",
      hexId: "h00",
      visited: true,
    });
    source.board[0].terrain = "TREE";
    receiver.figures.push({
      kind: "VISITOR",
      figureId: "visitor-v-0-1",
      visitId: "v-0-1",
      speciesId: "squirrel",
      hexId: "h00",
      sourceSeat: 1,
    });
    source.leaves = 2;
    source.leavesFromPaths = 1;
    expect(scoreForestPlayer(state, source)).toMatchObject({
      residentHearts: 3,
      leafHearts: 2,
      total: 5,
    });
    expect(forestAnimalCardForResident(receiver.figures[0])).toBeUndefined();
    expect(scoreConnectedForest(state).winnerSeats.length).toBeGreaterThan(0);

    for (const [index, terrain] of ["TREE", "WATER", "FLOWER", "ROCK", "MUSHROOM"].entries()) {
      source.board[index * 2].terrain = terrain as typeof source.board[number]["terrain"];
      source.board[index * 2 + 1].terrain = terrain as typeof source.board[number]["terrain"];
    }
    expect(scoreForestPlayer(state, source).balanceBonus).toBe(5);
  });

  it("detects corrupted card, board, figure, path, and phase state", () => {
    const setup = createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0 });
    const valid = createInitialState(roster, setup, 0);
    expect(() => assertConnectedForestState(valid)).not.toThrow();

    const missingTerrain = structuredClone(valid);
    missingTerrain.terrainDeck.pop();
    expect(() => assertConnectedForestState(missingTerrain)).toThrow(/지형 카드/);

    const badPlayers = structuredClone(valid);
    badPlayers.players[1].seat = 1;
    expect(() => assertConnectedForestState(badPlayers)).toThrow(/플레이어/);

    const missingAnimal = structuredClone(valid);
    missingAnimal.animalDeck.pop();
    expect(() => assertConnectedForestState(missingAnimal)).toThrow(/동물 카드/);

    const badBoard = structuredClone(valid);
    badBoard.players[0].board.pop();
    expect(() => assertConnectedForestState(badBoard)).toThrow(/보드/);

    const badFigure = structuredClone(valid);
    badFigure.players[0].figures.push({
      kind: "VISITOR",
      figureId: "bad",
      visitId: "bad",
      speciesId: "squirrel",
      hexId: "h00",
      sourceSeat: 2,
    });
    expect(() => assertConnectedForestState(badFigure)).toThrow(/피규어/);

    const duplicateFigure = structuredClone(valid);
    duplicateFigure.players[0].board[0].terrain = "TREE";
    duplicateFigure.players[0].figures.push(
      {
        kind: "VISITOR",
        figureId: "same",
        visitId: "v1",
        speciesId: "squirrel",
        hexId: "h00",
        sourceSeat: 2,
      },
      {
        kind: "VISITOR",
        figureId: "same",
        visitId: "v2",
        speciesId: "squirrel",
        hexId: "h00",
        sourceSeat: 2,
      },
    );
    expect(() => assertConnectedForestState(duplicateFigure)).toThrow(/중복/);

    const badPath = structuredClone(valid);
    badPath.neighborPaths.push(structuredClone(badPath.neighborPaths[0]));
    expect(() => assertConnectedForestState(badPath)).toThrow(/숲길/);

    const longPath = structuredClone(valid);
    longPath.neighborPaths[0].length = 4 as 3;
    expect(() => assertConnectedForestState(longPath)).toThrow(/길이/);

    const badDeadline = structuredClone(valid);
    badDeadline.phase = "SEASON_VISIT_RESPOND";
    expect(() => assertConnectedForestState(badDeadline)).toThrow(/공용 마감/);
  });

  it("keeps all animal patterns inside the radius-two board in at least one rotation", () => {
    for (const card of FOREST_ANIMAL_CARDS) {
      const placements = FOREST_HEXES.flatMap((hex) =>
        Array.from({ length: 6 }, (_, rotation) => forestPatternHexes(card, hex.id, rotation)))
        .filter((pattern) => pattern.length === card.cells.length && pattern.every(Boolean));
      expect(placements.length, card.id).toBeGreaterThan(0);
    }
  });
});
