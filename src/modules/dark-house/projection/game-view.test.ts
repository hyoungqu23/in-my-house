import { describe, expect, it } from "vitest";
import { createInitialState, transition } from "@/modules/dark-house/domain/reducer";
import { projectPlayer, projectPublic } from "./game-view";

const roster = [
  { seat: 1, userId: "u1", nickname: "민수" },
  { seat: 2, userId: "u2", nickname: "유진" },
  { seat: 3, userId: "u3", nickname: "하나" },
];

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
