import { describe, expect, it } from "vitest";
import { advanceTimedState, createInitialState, transition } from "./reducer";
import { projectPlayer, projectPublic } from "./projection";

const roster = [
  { seat: 1, userId: "u1", nickname: "민수" },
  { seat: 2, userId: "u2", nickname: "유진" },
  { seat: 3, userId: "u3", nickname: "하나" },
];

describe("dark house reducer", () => {
  it("moves from simultaneous placement to the starter turn", () => {
    let state = createInitialState(roster);
    state = transition(state, 2, { type: "PLACE_INITIAL_TOKEN", tokenId: "2-ghost" }, { now: 1 });
    state = transition(state, 1, { type: "PLACE_INITIAL_TOKEN", tokenId: "1-empty-1" }, { now: 2 });
    expect(state.phase).toBe("INITIAL_PLACEMENT");
    state = transition(state, 3, { type: "PLACE_INITIAL_TOKEN", tokenId: "3-empty-1" }, { now: 3 });
    expect(state.phase).toBe("TURN");
    expect(state.activeSeat).toBe(1);
  });

  it("reveals the challenger's house first and resolves a ghost failure", () => {
    let state = createInitialState(roster);
    state = transition(state, 1, { type: "PLACE_INITIAL_TOKEN", tokenId: "1-empty-1" }, { now: 1 });
    state = transition(state, 2, { type: "PLACE_INITIAL_TOKEN", tokenId: "2-ghost" }, { now: 2 });
    state = transition(state, 3, { type: "PLACE_INITIAL_TOKEN", tokenId: "3-empty-1" }, { now: 3 });
    state = transition(state, 1, { type: "OPEN_BID", bid: 3 }, { now: 4 });
    expect(state.phase).toBe("REVEAL_CHOICE");
    expect(() => transition(state, 1, { type: "CHOOSE_REVEAL_TARGET", targetSeat: 2 }, { now: 5 })).toThrow(/자신의 집/);
    state = transition(state, 1, { type: "CHOOSE_REVEAL_TARGET", targetSeat: 1 }, { now: 5, sequenceId: "r1" });
    expect(state.phase).toBe("REVEALING");
    state = advanceTimedState(state, { now: 1_400 });
    expect(state.phase).toBe("REVEAL_CHOICE");
    state = transition(state, 1, { type: "CHOOSE_REVEAL_TARGET", targetSeat: 2 }, { now: 1_401, sequenceId: "r2" });
    state = advanceTimedState(state, { now: 3_000, randomRemovalTokenId: "1-empty-2" });
    expect(state.phase).toBe("ROUND_END");
    expect(state.roundResult).toEqual({ outcome: "GHOST", actorSeat: 1, ghostOwnerSeat: 2 });
    expect(state.players[0].hand.some((token) => token.id === "1-empty-2")).toBe(false);
  });
});

describe("role projections", () => {
  it("never sends opponent token identities in public or player projections", () => {
    let state = createInitialState(roster);
    state = transition(state, 1, { type: "PLACE_INITIAL_TOKEN", tokenId: "1-empty-1" }, { now: 1 });
    state = transition(state, 2, { type: "PLACE_INITIAL_TOKEN", tokenId: "2-ghost" }, { now: 2 });
    state = transition(state, 3, { type: "PLACE_INITIAL_TOKEN", tokenId: "3-empty-1" }, { now: 3 });
    const context = { code: "ABC123", version: 4, now: 10, status: "playing" as const, hostUserId: "u1" };
    const publicJson = JSON.stringify(projectPublic(state, context));
    const playerJson = JSON.stringify(projectPlayer(state, { ...context, viewerUserId: "u1" }));

    expect(publicJson).not.toContain("2-ghost");
    expect(publicJson).not.toContain("3-empty-1");
    expect(playerJson).toContain("1-empty-1");
    expect(playerJson).not.toContain("2-ghost");
    expect(playerJson).not.toContain("3-empty-1");
  });
});
