import { describe, expect, it } from "vitest";
import { advanceTimedState, createInitialState, transition } from "./reducer";
import type { RoundSetup, SuspiciousInviteState } from "./types";

const roster = [
  { seat: 1, userId: "u1", nickname: "민수" },
  { seat: 2, userId: "u2", nickname: "유진" },
  { seat: 3, userId: "u3", nickname: "하나" },
];

const setup = (strangerSeat: number, wordId = "food-gimbap"): RoundSetup => ({
  wordId,
  word: wordId === "food-gimbap" ? "김밥" : "치킨",
  category: "음식",
  strangerSeat,
  guessOptions: [
    { id: "food-gimbap", word: "김밥" },
    { id: "food-chicken", word: "치킨" },
    { id: "food-tteokbokki", word: "떡볶이" },
    { id: "food-bibimbap", word: "비빔밥" },
  ],
  cluePrompts: ["색은?", "언제?"],
});

const submitClues = (state: SuspiciousInviteState) => {
  let next = transition(state, 1, { type: "SUBMIT_CLUE", clues: ["하얀색", "소풍"] }, { now: 2_100, nextRound: setup(2) });
  next = transition(next, 2, { type: "SUBMIT_CLUE", clues: ["동그란", "점심"] }, { now: 2_200, nextRound: setup(2) });
  return transition(next, 3, { type: "SUBMIT_CLUE", clues: ["검은색", "야외"] }, { now: 2_300, nextRound: setup(2) });
};

const reachVoting = () => {
  const initial = advanceTimedState(createInitialState(roster, setup(2), 0), 2_000);
  return advanceTimedState(submitClues(initial), 49_800);
};

describe("suspicious invite reducer", () => {
  it("reveals clues only after everyone submits and advances through discussion", () => {
    const state = submitClues(advanceTimedState(createInitialState(roster, setup(2), 0), 2_000));
    expect(state.phase).toBe("CLUE_REVEAL");
    expect(advanceTimedState(state, 4_800).phase).toBe("DISCUSSION");
    expect(advanceTimedState(state, 49_800).phase).toBe("VOTING");
  });

  it("lets the Stranger score when the vote has no unique target", () => {
    let state = reachVoting();
    state = transition(state, 1, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_000, nextRound: setup(3) });
    state = transition(state, 2, { type: "CAST_SUSPICION_VOTE", targetSeat: 3 }, { now: 50_100, nextRound: setup(3) });
    state = transition(state, 3, { type: "CAST_SUSPICION_VOTE", targetSeat: 1 }, { now: 50_200, nextRound: setup(3) });
    expect(state.lastRound?.outcome).toBe("STRANGER_ESCAPED");
    expect(state.players.find((player) => player.seat === 2)?.score).toBe(2);
  });

  it("awards correct Guests when the caught Stranger guesses incorrectly", () => {
    let state = reachVoting();
    state = transition(state, 1, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_000, nextRound: setup(3) });
    state = transition(state, 2, { type: "CAST_SUSPICION_VOTE", targetSeat: 1 }, { now: 50_100, nextRound: setup(3) });
    state = transition(state, 3, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_200, nextRound: setup(3) });
    expect(state.phase).toBe("STRANGER_GUESS");
    state = transition(state, 2, { type: "GUESS_WORD", wordId: "food-chicken" }, { now: 50_300, nextRound: setup(3) });
    expect(state.lastRound?.outcome).toBe("GUESTS_CAUGHT");
    expect(state.players.map((player) => player.score)).toEqual([1, 0, 1]);
  });

  it("starts another round without forcing Stranger rotation when the end vote lacks a majority", () => {
    let state = reachVoting();
    const repeatedStranger = setup(2, "food-chicken");
    state = transition(state, 1, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_000, nextRound: repeatedStranger });
    state = transition(state, 2, { type: "CAST_SUSPICION_VOTE", targetSeat: 1 }, { now: 50_100, nextRound: repeatedStranger });
    state = transition(state, 3, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_200, nextRound: repeatedStranger });
    state = transition(state, 2, { type: "GUESS_WORD", wordId: "food-chicken" }, { now: 50_300, nextRound: repeatedStranger });
    state = advanceTimedState(state, 54_300);
    state = transition(state, 1, { type: "CAST_END_VOTE", vote: "CONTINUE" }, { now: 54_400, nextRound: repeatedStranger });
    state = transition(state, 2, { type: "CAST_END_VOTE", vote: "END" }, { now: 54_500, nextRound: repeatedStranger });
    state = transition(state, 3, { type: "CAST_END_VOTE", vote: "CONTINUE" }, { now: 54_600, nextRound: repeatedStranger });

    expect(state.phase).toBe("ROUND_INTRO");
    expect(state.round).toBe(2);
    expect(state.setup.strangerSeat).toBe(2);
    expect(state.players.map((player) => player.score)).toEqual([1, 0, 1]);
  });

  it("continues until a majority votes to end, then allows tied winners", () => {
    let state = reachVoting();
    state = transition(state, 1, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_000, nextRound: setup(3) });
    state = transition(state, 2, { type: "CAST_SUSPICION_VOTE", targetSeat: 1 }, { now: 50_100, nextRound: setup(3) });
    state = transition(state, 3, { type: "CAST_SUSPICION_VOTE", targetSeat: 2 }, { now: 50_200, nextRound: setup(3) });
    state = transition(state, 2, { type: "GUESS_WORD", wordId: "food-chicken" }, { now: 50_300, nextRound: setup(3) });
    state = advanceTimedState(state, 54_300);
    state = transition(state, 1, { type: "CAST_END_VOTE", vote: "END" }, { now: 54_400, nextRound: setup(3) });
    state = transition(state, 2, { type: "CAST_END_VOTE", vote: "CONTINUE" }, { now: 54_500, nextRound: setup(3) });
    state = transition(state, 3, { type: "CAST_END_VOTE", vote: "END" }, { now: 54_600, nextRound: setup(3) });
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerSeats).toEqual([1, 3]);
  });
});
