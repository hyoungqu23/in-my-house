import { describe, expect, it } from "vitest";
import { advanceTimedState, createInitialState, transition } from "@/modules/suspicious-invite/domain/reducer";
import type { RoundSetup } from "@/modules/suspicious-invite/domain/types";
import { projectPlayer, projectPublic } from "./game-view";

const roster = [
  { seat: 1, userId: "u1", nickname: "민수" },
  { seat: 2, userId: "u2", nickname: "유진" },
  { seat: 3, userId: "u3", nickname: "하나" },
];

const setup: RoundSetup = {
  wordId: "food-gimbap",
  word: "김밥",
  category: "음식",
  strangerSeat: 2,
  guessOptions: [
    { id: "food-gimbap", word: "김밥" },
    { id: "food-chicken", word: "치킨" },
    { id: "food-tteokbokki", word: "떡볶이" },
    { id: "food-bibimbap", word: "비빔밥" },
  ],
  cluePrompts: ["색은?", "언제?"],
};

const context = {
  code: "ABC123",
  version: 1,
  now: 2_100,
  status: "playing" as const,
  hostUserId: "u1",
  connectedSeats: [1, 2, 3],
};

describe("suspicious invite projections", () => {
  it("keeps the word, Stranger seat, clues, and individual votes out of public responses", () => {
    let state = advanceTimedState(createInitialState(roster, setup, 0), 2_000);
    state = transition(state, 1, { type: "SUBMIT_CLUE", clues: ["하얀색", "소풍"] }, { now: 2_100, nextRound: setup });
    const publicJson = JSON.stringify(projectPublic(state, context));
    const guestJson = JSON.stringify(projectPlayer(state, { ...context, viewerUserId: "u1" }));
    const strangerJson = JSON.stringify(projectPlayer(state, { ...context, viewerUserId: "u2" }));

    expect(publicJson).not.toContain("김밥");
    expect(publicJson).not.toContain("하얀색");
    expect(publicJson).not.toContain("strangerSeat");
    expect(publicJson).not.toContain("suspicionVotesBySeat");
    expect(guestJson).toContain("김밥");
    expect(strangerJson).not.toContain("김밥");
  });
});
