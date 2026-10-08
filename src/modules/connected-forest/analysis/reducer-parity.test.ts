import { afterEach, describe, expect, it, vi } from "vitest";
import * as content from "../domain/content";
import { advanceTimedState, createInitialState, transition } from "../domain/reducer";
import { scoreConnectedForest } from "../domain/rules";
import { createSeededRandom, simulateConnectedForestGame } from "../domain/simulator";
import type { ConnectedForestRules } from "../domain/types";

afterEach(() => vi.restoreAllMocks());
describe("experiment model vs authoritative reducer", () => {
  it("replays the registered balanced rule through production without mocking the rule lookup", () => {
    for (const version of ["balanced-1", "balanced-2"] as const) for (const count of [4, 5, 6] as const) for (const order of ["SEAT", "REVERSE", "SHUFFLED"] as const) for (const seed of [987651, 987652, 987653]) {
      const rules = content.connectedForestRules(version);
      const random = createSeededRandom(seed);
      const seats = Array.from({ length: count }, (_, index) => index + 1);
      const setup = content.createMatchSetup({ seats, rulesVersion: version, randomIndex: (max) => Math.floor(random() * max) });
      const game = simulateConnectedForestGame({ playerCount: count, seed, setup, rules, useTools: true, agentPolicies: seats.map((_, index) => (["STAY", "WALK", "ADAPTIVE"] as const)[index % 3]), responseOrder: order, captureTrace: true });
      let state = createInitialState(seats.map((seat) => ({ seat, userId: `sim-${seat}`, nickname: `P${seat}` })), setup, 0);
      for (const event of game.trace!) state = event.action ? transition(state, event.actorSeat!, event.action, { now: event.now, connectedSeats: seats }) : advanceTimedState(state, { now: event.now, connectedSeats: seats });
      expect(state.phase).toBe("GAME_OVER");
      expect(state.players).toEqual(game.state.players);
      expect(state.result).toEqual({ forfeited: false, ...scoreConnectedForest(game.state, rules) });
    }
  }, 15000);
  it("replays full actions, tools, routing, automatic farewells and results for all player counts", () => {
    const base = content.connectedForestRules("prototype-1");
    const variants: ConnectedForestRules[] = [base, { ...base, stayReceiverHearts: 1, walkReceiverLeaves: 2, pathCompletionReceiverLeaves: 1, pathCompletionSenderLeaves: 1, visitRouting: "ALTERNATE", visitorDiversityHearts: 1 }, { ...base, stayReceiverHearts: 1, walkReceiverLeaves: 2, pathCompletionReceiverLeaves: 1, pathCompletionSenderLeaves: 1, visitRouting: "ALTERNATE", visitorDiversityHearts: 1, pathCap: 4 }, { ...base, stayReceiverHearts: 1, walkReceiverLeaves: 2, pathCompletionReceiverLeaves: 2, pathCompletionSenderLeaves: 2, visitRouting: "ALTERNATE", visitorDiversityHearts: 1, pathCap: 4, visitTieBreak: "SEASON_DIRECTION" }, { ...base, visitRouting: "BALANCED_INCOMING", visitorDiversityHearts: 2 }];
    const lookup = vi.spyOn(content, "connectedForestRules");
    for (const rules of variants) {
      lookup.mockReturnValue(rules);
      for (const count of [4, 5, 6] as const) for (const order of ["SEAT", "REVERSE", "SHUFFLED"] as const) for (const seed of [70027, 90001, 314170]) {
        const random = createSeededRandom(seed);
        const seats = Array.from({ length: count }, (_, index) => index + 1);
        const setup = content.createMatchSetup({ seats, randomIndex: (max) => Math.floor(random() * max) });
        const game = simulateConnectedForestGame({ playerCount: count, seed, rules, setup, useTools: true, agentPolicies: seats.map((_, index) => (["STAY", "WALK", "ADAPTIVE"] as const)[index % 3]), responseOrder: order, captureTrace: true });
        let state = createInitialState(seats.map((seat) => ({ seat, userId: `sim-${seat}`, nickname: `P${seat}` })), setup, 0);
        for (const event of game.trace!) state = event.action ? transition(state, event.actorSeat!, event.action, { now: event.now, connectedSeats: seats }) : advanceTimedState(state, { now: event.now, connectedSeats: seats });
        const label = `${rules.visitRouting ?? "FREE"}/${count}/${order}/${seed}`;
        expect(state.phase, label).toBe("GAME_OVER");
        expect(state.players, label).toEqual(game.state.players);
        expect(state.neighborPaths, label).toEqual(game.state.neighborPaths);
        expect(state.visitLedger, label).toEqual(game.state.visitLedger);
        expect(state.result, label).toEqual({ forfeited: false, ...scoreConnectedForest(game.state, rules) });
      }
    }
  }, 30000);
});
