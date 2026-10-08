import { describe, expect, it, vi } from "vitest";
import { connectedForestRules } from "./content";
import golden from "./fixtures/python-golden.json";
import { forestAnimal, scoreConnectedForest } from "./rules";
import {
  FOREST_SENDER_MODELS,
  FOREST_SIMULATION_RULES,
  createSeededRandom,
  createForestPolicySchedule,
  evaluateConnectedForest,
  forestWinRateSpread,
  runConnectedForestSimulationCli,
  simulateConnectedForestGame,
  sweepConnectedForest,
} from "./simulator";
import type { ForestGoldenPlacement } from "./simulator";

describe("connected forest simulator", () => {
  it.each([4, 5, 6] as const)("balances each policy across every seat in %i-player sweeps", (size) => {
    for (const runs of [30, 1000]) {
      const schedule = createForestPolicySchedule(size, runs);
      expect(schedule).toEqual(createForestPolicySchedule(size, runs));
      expect(schedule).toHaveLength(runs);
      expect(schedule.every((policies) => new Set(policies).size === 3)).toBe(true);
      for (let seat = 0; seat < size; seat += 1) {
        const counts = ["STAY", "WALK", "MIXED"].map((policy) =>
          schedule.filter((policies) => policies[seat] === policy).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
    }
    expect(createForestPolicySchedule(size, 30, 80000)).not.toEqual(createForestPolicySchedule(size, 30));
  });

  it("applies candidate reward settings to the common winner calculation", () => {
    const rules = { ...connectedForestRules("prototype-1"), stayReceiverHearts: 4 };
    const game = simulateConnectedForestGame({
      playerCount: 4, seed: 70027, rules,
      policies: ["STAY", "WALK", "MIXED", "WALK"], senderModel: "C_NEARLY_DONE",
    });
    const scored = scoreConnectedForest(game.state, rules);
    expect(game.scores).toEqual(scored.scores.map((score) => score.total));
    expect(game.winnerSeats).toEqual(scored.winnerSeats);
    expect(game.scores[0]).toBe(42);
  });
  it("uses the domain tie breakers instead of counting every top score as a win", () => {
    const game = simulateConnectedForestGame({
      playerCount: 4, seed: 70027,
      policies: ["STAY", "WALK", "MIXED", "WALK"], senderModel: "C_NEARLY_DONE",
    });
    expect(game.scores).toEqual([34, 34, 23, 19]);
    expect(scoreConnectedForest(game.state).winnerSeats).toEqual([1]);
    expect(game.winnerSeats).toEqual([1]);
  });

  it("uses a deterministic seeded random source", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(first()).toBeGreaterThanOrEqual(0);
    expect(first()).toBeLessThan(1);
  });

  it.each([4, 5, 6] as const)("simulates a complete %i-player game", (playerCount) => {
    const game = simulateConnectedForestGame({
      playerCount,
      seed: 70_000 + playerCount,
      policies: Array.from({ length: playerCount }, (_, index) =>
        (["STAY", "WALK", "MIXED"] as const)[index % 3]),
      senderModel: FOREST_SENDER_MODELS[playerCount - 4],
    });
    expect(game.state.players).toHaveLength(playerCount);
    expect(game.state.terrainDeck).toHaveLength(0);
    expect(game.state.terrainDiscard).toHaveLength(playerCount * 15);
    expect(game.state.players.every((player) =>
      player.board.filter((cell) => cell.terrain || cell.acornTerrain).length === 15)).toBe(true);
    expect(game.scores).toHaveLength(playerCount);
    expect(game.winnerSeats.length).toBeGreaterThan(0);
  });

  it("reports bounded policy and choice metrics for every sender model", () => {
    for (const senderModel of FOREST_SENDER_MODELS) {
      const result = evaluateConnectedForest({
        runs: 2,
        playerCount: 4,
        senderModel,
        seedBase: 80_000,
      });
      expect(result.playerCount).toBe(4);
      for (const rate of Object.values(result.policyWinRates)) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
      for (const rate of [
        result.freeRate,
        result.freeWalkRate,
        result.walkRate,
        result.forcedStayRate,
        result.forcedWalkRate,
        result.farewellRate,
        result.pathScoreShare,
      ]) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
  });

  it("sweeps injected reward configurations and calculates the worst sender gap", () => {
    const rules = {
      ...connectedForestRules("prototype-1"),
      name: "test-rules",
      stayReceiverHearts: 3,
    };
    const rows = sweepConnectedForest({
      runs: 1,
      rules: [rules],
      senderModels: ["A_SHORTEST", "B_RANDOM"],
      seedBase: 90_000,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("test-rules");
    expect(rows[0].worst).toBe(Math.max(...Object.values(rows[0].gaps)));
    expect(forestWinRateSpread([])).toBe(0);
  });

  it("prints a small CLI report without running the full grid", () => {
    const original = process.argv;
    process.argv = ["node", "simulator", "--runs", "1", "--seed", "91000", "--sender=A_SHORTEST"];
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const rows = runConnectedForestSimulationCli();
      expect(rows).toHaveLength(2);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("worst"));
    } finally {
      process.argv = original;
      log.mockRestore();
    }
  });

  it("exposes all seven documented reward candidates", () => {
    expect(FOREST_SIMULATION_RULES).toHaveLength(7);
    expect(FOREST_SIMULATION_RULES.some((rules) => rules.pathCap === 2)).toBe(true);
  });

  it("replays the Python golden corpus from explicit decks and sender targets", () => {
    const senderNames = {
      "A최단": "A_SHORTEST",
      "B무작위": "B_RANDOM",
      "C완성임박": "C_NEARLY_DONE",
    } as const;
    for (const testCase of golden.cases) {
      const playerCount = testCase.playerCount as 4 | 5 | 6;
      const game = simulateConnectedForestGame({
        playerCount,
        seed: testCase.seed,
        policies: testCase.policies as Array<"STAY" | "WALK" | "MIXED">,
        senderModel: senderNames[testCase.senderModel as keyof typeof senderNames],
        senderTargets: [...testCase.senderTargets],
        placementChoices: [...testCase.placementChoices] as ForestGoldenPlacement[],
        setup: {
          rulesVersion: "prototype-1",
          seats: Array.from({ length: playerCount }, (_, index) => index + 1),
          terrainDeck: testCase.terrainDeck as Array<{
            id: string;
            kind: "TREE" | "WATER" | "FLOWER" | "ROCK" | "MUSHROOM";
          }>,
          animalDeck: testCase.animalDeck.map((id) => forestAnimal(id)!),
        },
      });
      expect(
        game.state.players.flatMap((player) =>
          player.figures.filter((figure) => figure.kind === "RESIDENT")).length,
        `${testCase.name} resident count`,
      ).toBe(testCase.placementChoices.filter((choice) => choice.welcomeAnimalCardId).length);
      expect(game.stats, testCase.name).toEqual({
        stay: testCase.stats.stay ?? 0,
        walk: testCase.stats.walk ?? 0,
        farewell: testCase.stats.waved ?? 0,
        free: testCase.stats.free ?? 0,
        freeWalk: testCase.stats.free_walk ?? 0,
        forcedStay: testCase.stats.forced_stay ?? 0,
        forcedWalk: testCase.stats.forced_walk ?? 0,
        completedPaths: testCase.stats.done ?? 0,
      });
      expect(game.scores, testCase.name).toEqual(testCase.scores);
      expect(game.winnerSeats, testCase.name).toEqual(testCase.winnerSeats);
    }
  });
});
