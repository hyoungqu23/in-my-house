import { describe, expect, it } from "vitest";
import { connectedForestRules, createMatchSetup } from "./content";
import { createInitialState } from "./reducer";
import { forestLegalVisitTargetSeats, forestStayHearts, scoreForestPlayer } from "./rules";
import { simulateConnectedForestGame } from "./simulator";

const initial = () => createInitialState([1, 2, 3, 4].map((seat) => ({ seat, userId: `u${seat}`, nickname: `친구${seat}` })), createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0 }), 0);
const base = connectedForestRules("prototype-1");
describe("experimental balance contracts", () => {
  it("keeps free routing and both targets before committed history exists", () => {
    const state = initial();
    expect(forestLegalVisitTargetSeats(state, 1, base)).toEqual([2, 4]);
    expect(forestLegalVisitTargetSeats(state, 1, { ...base, visitRouting: "FREE" })).toEqual([2, 4]);
    state.visitLedger = undefined;
    expect(forestLegalVisitTargetSeats(state, 1, { ...base, visitRouting: "ALTERNATE" })).toEqual([2, 4]);
    expect(forestLegalVisitTargetSeats(state, 99, { ...base, visitRouting: "ALTERNATE" })).toEqual([]);
  });
  it("alternates a sender's visits without using other senders or pending choices", () => {
    const state = initial();
    state.visitLedger = [{ seasonIndex: 0, sourceSeat: 1, targetSeat: 2 }, { seasonIndex: 0, sourceSeat: 3, targetSeat: 4 }];
    expect(forestLegalVisitTargetSeats(state, 1, { ...base, visitRouting: "ALTERNATE" })).toEqual([4]);
    expect(forestLegalVisitTargetSeats(state, 1, { ...base, visitRouting: "BALANCED_INCOMING" })).toEqual([2, 4]);
    state.visitLedger.push({ seasonIndex: 1, sourceSeat: 1, targetSeat: 4 });
    expect(forestLegalVisitTargetSeats(state, 1, { ...base, visitRouting: "ALTERNATE" })).toEqual([2, 4]);
    expect(forestLegalVisitTargetSeats(state, 1, { ...base, visitRouting: "BALANCED_INCOMING" })).toEqual([2]);
  });
  it("can rotate tied preferences around the ring without favoring numeric seat one", () => {
    const state = initial();
    const rules = { ...base, visitTieBreak: "SEASON_DIRECTION" as const };
    expect([1, 2, 3, 4].map((seat) => forestLegalVisitTargetSeats(state, seat, rules)[0])).toEqual([4, 1, 2, 3]);
    state.passDirection = "RIGHT";
    expect([1, 2, 3, 4].map((seat) => forestLegalVisitTargetSeats(state, seat, rules)[0])).toEqual([2, 3, 4, 1]);
    expect(forestLegalVisitTargetSeats(state, 99, rules)).toEqual([]);
  });
  it("awards diversity once per visitor species and scores through the shared selector", () => {
    const state = initial();
    const player = state.players[0];
    const rules = { ...base, visitorDiversityHearts: 1 };
    expect(forestStayHearts(player, "squirrel", base)).toBe(2);
    expect(forestStayHearts(player, "squirrel", rules)).toBe(3);
    player.figures = [{ kind: "VISITOR", figureId: "a", visitId: "a", sourceSeat: 2, speciesId: "squirrel", hexId: "h00" }, { kind: "VISITOR", figureId: "b", visitId: "b", sourceSeat: 4, speciesId: "squirrel", hexId: "h01" }];
    expect(forestStayHearts(player, "squirrel", rules)).toBe(2);
    expect(forestStayHearts(player, "otter", rules)).toBe(3);
    expect(scoreForestPlayer(state, player, rules).visitorHearts).toBe(5);
    player.figures.push({ kind: "VISITOR", figureId: "c", visitId: "c", sourceSeat: 2, speciesId: "otter", hexId: "h02" });
    expect(scoreForestPlayer(state, player, rules).visitorHearts).toBe(8);
    const capped = { ...rules, visitorDiversityCap: 1 };
    expect(scoreForestPlayer(state, player, capped).visitorHearts).toBe(7);
    expect(forestStayHearts(player, "rabbit", capped)).toBe(2);
  });
  it("includes acorns, refreshes, adaptive choices and arbitrary response timing without losing cards", () => {
    for (const responseOrder of ["SEAT", "REVERSE", "SHUFFLED"] as const) {
      const result = simulateConnectedForestGame({ playerCount: 4, seed: 90001, useTools: true, rules: { ...base, visitRouting: "ALTERNATE", visitorDiversityHearts: 1 }, agentPolicies: ["STAY", "WALK", "ADAPTIVE", "IMMEDIATE"], responseOrder });
      expect(result.state.terrainDiscard).toHaveLength(60);
      expect(result.state.players.every((player) => player.board.filter((cell) => cell.terrain || cell.acornTerrain).length === 15)).toBe(true);
      expect(result.diagnostics.goldenAcornsUsed).toBeLessThanOrEqual(4);
      expect(result.diagnostics.refreshesUsed).toBeLessThanOrEqual(4);
      expect(result.diagnostics.goldenAcornsUsed).toBeGreaterThan(0);
      expect(result.diagnostics.refreshesUsed).toBeGreaterThan(0);
      expect(result.diagnostics.incomingVisits.reduce((a, b) => a + b, 0)).toBe(result.stats.stay + result.stats.walk + result.stats.farewell);
      expect(result.stats.free + result.stats.forcedStay + result.stats.forcedWalk + result.stats.farewell).toBe(result.diagnostics.incomingVisits.reduce((a, b) => a + b, 0));
      expect(result.diagnostics.freeWalkChoices.every((value, index) => value <= result.diagnostics.freeChoices[index])).toBe(true);
    }
  });
});
