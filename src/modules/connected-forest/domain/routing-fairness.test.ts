import { afterEach, describe, expect, it, vi } from "vitest";
import * as content from "./content";
import { advanceTimedState, createInitialState } from "./reducer";
import type { ConnectedForestRules } from "./types";

afterEach(() => vi.restoreAllMocks());

function timeoutTargets(count: number, direction: "LEFT" | "RIGHT", rules?: ConnectedForestRules, reversedRoster = false) {
  const seats = Array.from({ length: count }, (_, index) => index + 1);
  const setup = content.createMatchSetup({ seats, rulesVersion: content.CONNECTED_FOREST_CURRENT_RULES_VERSION, randomIndex: () => 0 });
  const state = createInitialState(seats.map((seat) => ({ seat, userId: `u${seat}`, nickname: `친구${seat}` })), setup, 0);
  if (rules) vi.spyOn(content, "connectedForestRules").mockReturnValue(rules);
  state.passDirection = direction;
  state.phase = "SEASON_VISIT_SELECT";
  state.phaseEndsAt = 1000;
  for (const player of state.players) {
    const animal = player.activeAnimals.shift()!;
    player.board[0].terrain = animal.visitorTerrain;
    player.figures.push({ kind: "RESIDENT", figureId: `resident-${player.seat}`, animalCardId: animal.id, speciesId: animal.speciesId, hexId: "h00", visited: false });
  }
  if (reversedRoster) state.players.reverse();
  const next = advanceTimedState(state, { now: 1000, connectedSeats: seats });
  expect(next.visitLedger).toHaveLength(count);
  return seats.map((seat) => next.visitLedger!.filter((visit) => visit.targetSeat === seat).length);
}

describe("automatic visit seat fairness", () => {
  it.each([4, 5, 6])("does not privilege low seat numbers on equal paths with %i players", (count) => {
    for (const direction of ["LEFT", "RIGHT"] as const) for (const reversedRoster of [false, true]) {
      expect(timeoutTargets(count, direction, undefined, reversedRoster)).toEqual(Array(count).fill(1));
    }
  });
  it.each([4, 5, 6])("season-direction tie breaking distributes equal-path visits with %i players", (count) => {
    const rules = { ...content.connectedForestRules(content.CONNECTED_FOREST_CURRENT_RULES_VERSION), visitTieBreak: "SEASON_DIRECTION" as const };
    for (const direction of ["LEFT", "RIGHT"] as const) {
      expect(timeoutTargets(count, direction, rules)).toEqual(Array(count).fill(1));
    }
  });
  it.each([4, 5, 6])("preserves the low-seat control independently of processing order with %i players", (count) => {
    const rules = content.connectedForestRules("balanced-1");
    const expected = [2, 2, ...Array(count - 4).fill(1), 0, 0];
    expect(timeoutTargets(count, "LEFT", rules)).toEqual(expected);
    expect(timeoutTargets(count, "RIGHT", rules, true)).toEqual(expected);
  });
});
