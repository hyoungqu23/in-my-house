import { describe, expect, it } from "vitest";
import { createMatchSetup } from "./content";
import {
  advanceTimedState,
  createInitialState,
  PANEL_RESULT_DURATION_MS,
  SWITCHBOARD_DURATION_MS,
  transition,
} from "./reducer";
import type { SwitchboardState } from "./types";

const roster = [
  { seat: 1, userId: "u1", nickname: "민수" },
  { seat: 2, userId: "u2", nickname: "유진" },
  { seat: 3, userId: "u3", nickname: "하나" },
];
const connected = [1, 2, 3];
const setup = () => createMatchSetup({ seats: connected, randomIndex: () => 0 });

const ready = () => {
  let state = createInitialState(roster, setup());
  state = transition(state, 1, { type: "MARK_READY" }, { now: 100, connectedSeats: connected });
  state = transition(state, 2, { type: "MARK_READY" }, { now: 200, connectedSeats: connected });
  return transition(state, 3, { type: "MARK_READY" }, { now: 300, connectedSeats: connected });
};

const solveCurrentPanel = (input: SwitchboardState, startAt: number) => {
  let state = input;
  const solution = state.panels[state.panelIndex].solutionModuleIds;
  solution.forEach((moduleId, index) => {
    const actorSeat = state.turnOrder[state.activeTurnIndex];
    state = transition(
      state,
      actorSeat,
      { type: "CONFIRM_MODULE", moduleId },
      { now: startAt + index, connectedSeats: connected },
    );
  });
  return state;
};

describe("dawn switchboard reducer", () => {
  it("waits for every connected player before starting the shared timer", () => {
    let state = createInitialState(roster, setup());
    state = transition(state, 1, { type: "MARK_READY" }, { now: 100, connectedSeats: connected });
    state = transition(state, 2, { type: "MARK_READY" }, { now: 200, connectedSeats: connected });
    expect(state.phase).toBe("BRIEFING");
    state = transition(state, 3, { type: "MARK_READY" }, { now: 300, connectedSeats: connected });
    expect(state.phase).toBe("SOLVING");
    expect(state.deadlineAt).toBe(300 + SWITCHBOARD_DURATION_MS);
  });

  it("locks a correct module, rotates the turn, and blocks a repeated wrong choice", () => {
    let state = ready();
    const firstSeat = state.turnOrder[state.activeTurnIndex];
    const correct = state.panels[0].solutionModuleIds[0];
    state = transition(state, firstSeat, { type: "CONFIRM_MODULE", moduleId: correct }, { now: 400, connectedSeats: connected });
    expect(state.lockedModuleIds).toEqual([correct]);
    expect(state.turnOrder[state.activeTurnIndex]).not.toBe(firstSeat);

    const actor = state.turnOrder[state.activeTurnIndex];
    const wrong = state.panels[0].modules.find((module) => !state.lockedModuleIds.includes(module.id)
      && module.id !== state.panels[0].solutionModuleIds[1])!.id;
    state = transition(state, actor, { type: "CONFIRM_MODULE", moduleId: wrong }, { now: 500, connectedSeats: connected });
    expect(state.fusesRemaining).toBe(2);
    const nextActor = state.turnOrder[state.activeTurnIndex];
    expect(() => transition(state, nextActor, { type: "CONFIRM_MODULE", moduleId: wrong }, { now: 600, connectedSeats: connected }))
      .toThrow(/이미 실패/);
  });

  it("moves through three panels and awards a shared restoration grade", () => {
    let state = solveCurrentPanel(ready(), 1_000);
    expect(state.phase).toBe("PANEL_RESULT");
    state = advanceTimedState(state, { now: 1_000 + 3 + PANEL_RESULT_DURATION_MS, connectedSeats: connected });
    state = solveCurrentPanel(state, 5_000);
    state = advanceTimedState(state, { now: 5_000 + 4 + PANEL_RESULT_DURATION_MS, connectedSeats: connected });
    state = solveCurrentPanel(state, 9_000);
    expect(state.phase).toBe("GAME_OVER");
    expect(state.result).toMatchObject({ outcome: "RESTORED", completedPanels: 3, stars: 3 });
  });

  it("loses on the third wrong attempt and when the deadline expires", () => {
    let state = ready();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const expected = state.panels[0].solutionModuleIds[0];
      const wrong = state.panels[0].modules
        .find((module) => module.id !== expected && !state.rejectedModuleIds.includes(module.id))!.id;
      state = transition(
        state,
        state.turnOrder[state.activeTurnIndex],
        { type: "CONFIRM_MODULE", moduleId: wrong },
        { now: 400 + attempt, connectedSeats: connected },
      );
    }
    expect(state.result?.outcome).toBe("FUSES_BLOWN");

    const timed = ready();
    const expired = advanceTimedState(timed, { now: timed.deadlineAt!, connectedSeats: connected });
    expect(expired.result?.outcome).toBe("TIME_EXPIRED");
  });

  it("exposes disconnected clues and skips that player's active turn", () => {
    let state = ready();
    const disconnectedSeat = state.turnOrder[state.activeTurnIndex];
    state = advanceTimedState(state, {
      now: 500,
      connectedSeats: connected.filter((seat) => seat !== disconnectedSeat),
    });
    expect(state.exposedClueSeats).toContain(disconnectedSeat);
    expect(state.turnOrder[state.activeTurnIndex]).not.toBe(disconnectedSeat);
  });
});
