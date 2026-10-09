import { describe, expect, it } from "vitest";
import { connectedForestRules } from "../domain/content";
import { evaluateConnectedForest } from "../domain/simulator";
import { BALANCE_COHORTS, bootstrapGap, bootstrapSeatGap, createAgentSchedule, createBalanceCandidates, runBalanceCase } from "./balance-experiments";
import type { BalanceSample } from "./balance-experiments";

describe("balance experiment validity", () => {
  it("balances all cohort labels over seats and rejects cohorts that do not fit", () => {
    for (const size of [4, 5, 6]) for (const agents of Object.values(BALANCE_COHORTS)) {
      const schedule = createAgentSchedule(size, 1000, 70000, agents);
      expect(schedule.every((row) => new Set(row).size === agents.length)).toBe(true);
      for (let seat = 0; seat < size; seat += 1) {
        const counts = agents.map((agent) => schedule.filter((row) => row[seat] === agent).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
    }
    expect(() => createAgentSchedule(3, 10, 0, BALANCE_COHORTS.DIVERSE)).toThrow(/fit/);
  });
  it("reproduces the previous benchmark before any new rule or tool is enabled", () => {
    const rules = connectedForestRules("prototype-1");
    const old = evaluateConnectedForest({ playerCount: 4, runs: 12, seedBase: 70000, senderModel: "A_SHORTEST", rules });
    const current = runBalanceCase({ candidate: { id: "baseline", rules }, playerCount: 4, runs: 12, seedBase: 70000, sender: "A_SHORTEST" });
    for (const policy of BALANCE_COHORTS.CORE) expect(current.result.policy[policy]?.winRate).toBe(old.policyWinRates[policy as "STAY" | "WALK" | "MIXED"]);
    expect(current.result.freeRate).toBe(old.freeRate);
    expect(current.samples.reduce((sum, sample) => sum + sample.incoming.reduce((a, b) => a + b, 0), 0)).toBe(current.samples.reduce((sum, sample) => sum + sample.totalVisits, 0));
    expect(Object.values(current.result.policy).reduce((sum, policy) => sum + policy!.tieSplitWinRate * policy!.exposures, 0)).toBeCloseTo(12);
  });
  it("bootstraps policy rotation blocks instead of breaking their balanced assignment", () => {
    const agents = BALANCE_COHORTS.CORE;
    const samples: BalanceSample[] = Array.from({ length: 12 }, (_, index) => ({ seed: index, policies: [agents[index % 3], agents[(index + 1) % 3], agents[(index + 2) % 3]], winners: [true, false, false], score: [1, 0, 0], incoming: [1, 1, 1], sent: [1, 1, 1], free: [1, 1, 1], freeWalk: [0, 0, 0], visitPoints: [0, 0, 0], totalVisits: 3, farewell: 0, completedPaths: 0, pathPoints: 0, gold: 0, refresh: 0, restrictedSenders: 0 }));
    expect(bootstrapGap(samples, agents, 19, 100)).toEqual([0, 0]);
    expect(bootstrapGap(samples, agents, 19, 100)).toEqual(bootstrapGap(samples, agents, 19, 100));
    expect(bootstrapGap([], agents)).toEqual([0, 0]);
    expect(bootstrapSeatGap(samples, 3, 3, 19, 100)).toEqual([1, 1]);
    const symmetric = samples.map((sample, index) => ({ ...sample, winners: [0, 1, 2].map((seat) => seat === index % 3) }));
    expect(bootstrapSeatGap(symmetric, 3, 3, 19, 100)).toEqual([0, 0]);
    expect(bootstrapSeatGap([], 3, 3)).toEqual([0, 0]);
    expect(bootstrapSeatGap(samples.slice(0, 4), 3, 3, 19, 100)).toEqual(bootstrapSeatGap(samples.slice(0, 4), 3, 3, 19, 100));
  });
  it("covers unique reward and routing combinations without silently replacing prototype-1", () => {
    const candidates = createBalanceCandidates();
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(candidates.length);
    expect(new Set(candidates.map((candidate) => candidate.rules.visitRouting))).toEqual(new Set(["FREE", "ALTERNATE", "BALANCED_INCOMING"]));
    expect(candidates.some((candidate) => candidate.rules.visitorDiversityHearts === 2)).toBe(true);
    expect(connectedForestRules("prototype-1").visitRouting).toBeUndefined();
    expect(connectedForestRules("prototype-1").visitorDiversityHearts).toBeUndefined();
  });
});
