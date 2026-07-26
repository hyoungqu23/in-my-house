import { describe, expect, it } from "vitest";
import { createMatchSetup } from "@/modules/dawn-switchboard/domain/content";
import { createInitialState } from "@/modules/dawn-switchboard/domain/reducer";
import { projectPlayer, projectPublic } from "./game-view";

const roster = [
  { seat: 1, userId: "u1", nickname: "민수" },
  { seat: 2, userId: "u2", nickname: "유진" },
  { seat: 3, userId: "u3", nickname: "하나" },
];
const setup = createMatchSetup({ seats: [1, 2, 3], randomIndex: () => 0 });
const state = createInitialState(roster, setup);
const context = {
  code: "ABC123",
  version: 1,
  now: 1_000,
  status: "playing" as const,
  hostUserId: "u1",
  connectedSeats: [1, 2, 3],
};

describe("dawn switchboard projections", () => {
  it("keeps the solution and private clue allocations out of public responses", () => {
    const publicJson = JSON.stringify(projectPublic(state, context));
    const playerJson = JSON.stringify(projectPlayer(state, { ...context, viewerUserId: "u1" }));
    const ownClue = setup.panels[0].cluesBySeat[1][0].text;
    const otherClue = setup.panels[0].cluesBySeat[2][0].text;

    expect(publicJson).not.toContain("solutionModuleIds");
    expect(publicJson).not.toContain("cluesBySeat");
    expect(publicJson).not.toContain(ownClue);
    expect(playerJson).toContain(ownClue);
    expect(playerJson).not.toContain(otherClue);
  });
});
