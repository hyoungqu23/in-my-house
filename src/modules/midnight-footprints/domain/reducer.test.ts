import { describe, expect, it } from "vitest";
import { createMatchSetup } from "./content";
import {
  advanceTimedState,
  createInitialState,
  FORFEIT_CLAIM_DELAY_MS,
  transition,
} from "./reducer";

const roster = [
  { seat: 1, userId: "u1", nickname: "괴도" },
  { seat: 2, userId: "u2", nickname: "경비" },
];
const connectedSeats = [1, 2];
const context = (now: number) => ({ now, connectedSeats });

const startRound = () => {
  const setup = createMatchSetup({ seats: connectedSeats, randomIndex: () => 0 });
  let state = createInitialState(roster, setup, 100);
  state = transition(state, 1, { type: "SELECT_ENTRY", roomId: "study" }, context(110));
  state = transition(state, 1, { type: "MARK_READY" }, context(120));
  return transition(state, 2, { type: "MARK_READY" }, context(130));
};

const searchInPlace = (state: ReturnType<typeof startRound>, now: number) =>
  transition(state, 2, { type: "MOVE_AND_SEARCH", path: [] }, context(now));

const escapeFirstRound = () => {
  let state = startRound();
  state = searchInPlace(state, 200);
  state = transition(state, 1, { type: "MOVE_INTRUDER", roomId: "bathroom" }, context(210));
  state = searchInPlace(state, 220);
  state = transition(state, 1, { type: "MOVE_INTRUDER", roomId: "laundry" }, context(230));
  state = searchInPlace(state, 240);
  state = transition(state, 1, { type: "STEAL", targetId: "silver-coins" }, context(250));
  state = searchInPlace(state, 260);
  return transition(state, 1, { type: "MOVE_INTRUDER", roomId: "living-room" }, context(270));
};

const finishTwoRoundMatch = () => {
  let state = escapeFirstRound();
  state = transition(state, 1, { type: "ACK_ROUND_RESULT" }, context(300));
  state = transition(state, 2, { type: "ACK_ROUND_RESULT" }, context(310));
  state = transition(state, 2, { type: "SELECT_ENTRY", roomId: "study" }, context(320));
  state = transition(state, 1, { type: "MARK_READY" }, context(330));
  state = transition(state, 2, { type: "MARK_READY" }, context(340));
  state = transition(
    state,
    1,
    { type: "MOVE_AND_SEARCH", path: ["central-hall", "study"] },
    context(350),
  );
  state = transition(state, 1, { type: "ACK_ROUND_RESULT" }, context(360));
  return transition(state, 2, { type: "ACK_ROUND_RESULT" }, context(370));
};

describe("midnight footprints reducer", () => {
  it("runs an entry, alternating traces, a theft alarm, and an immediate escape", () => {
    let state = startRound();
    expect(state).toMatchObject({
      phase: "GUARD_TURN",
      turnNumber: 1,
      intruderRoomId: "study",
      traceHistory: [{ turn: 1, kind: "ZONE", zone: "WEST" }],
    });

    state = searchInPlace(state, 200);
    state = transition(state, 1, { type: "MOVE_INTRUDER", roomId: "bathroom" }, context(210));
    expect(state.traceHistory.at(-1)).toEqual({ turn: 2, kind: "FLOOR", floor: "TILE" });

    state = searchInPlace(state, 220);
    state = transition(state, 1, { type: "MOVE_INTRUDER", roomId: "laundry" }, context(230));
    expect(state.traceHistory.at(-1)).toEqual({ turn: 3, kind: "ZONE", zone: "EAST" });

    state = searchInPlace(state, 240);
    state = transition(state, 1, { type: "STEAL", targetId: "silver-coins" }, context(250));
    expect(state.traceHistory.at(-1)).toEqual({
      turn: 4,
      kind: "ALARM",
      targetId: "silver-coins",
      roomId: "laundry",
    });

    state = searchInPlace(state, 260);
    state = transition(state, 1, { type: "MOVE_INTRUDER", roomId: "living-room" }, context(270));
    expect(state.phase).toBe("ROUND_RESULT");
    expect(state.traceHistory).toHaveLength(4);
    expect(state.roundResults[0]).toMatchObject({
      outcome: "ESCAPED",
      intruderSeat: 1,
      completedActions: 5,
      targetId: "silver-coins",
      targetValue: 2,
    });
  });

  it("keeps a blocked passage through the next intruder and guard actions", () => {
    let state = startRound();
    state = transition(
      state,
      2,
      { type: "BLOCK_PASSAGE", passage: ["kitchen", "laundry"] },
      context(200),
    );
    expect(state).toMatchObject({
      phase: "INTRUDER_TURN",
      blocksRemaining: 1,
      activeBlock: {
        passage: ["kitchen", "laundry"],
        expiresAfterIntruderAction: 2,
      },
    });

    state = transition(state, 1, { type: "MOVE_INTRUDER", roomId: "bathroom" }, context(210));
    expect(() =>
      transition(
        state,
        2,
        { type: "MOVE_AND_SEARCH", path: ["laundry"] },
        context(220),
      ),
    ).toThrow(/봉쇄/);

    state = transition(state, 2, { type: "MOVE_AND_SEARCH", path: [] }, context(230));
    expect(state.activeBlock).toBeUndefined();
    expect(state.phase).toBe("INTRUDER_TURN");
  });

  it("limits hiding to twice and times out immediately after action ten", () => {
    let hidden = searchInPlace(startRound(), 200);
    hidden = transition(hidden, 1, { type: "HIDE" }, context(210));
    hidden = searchInPlace(hidden, 220);
    hidden = transition(hidden, 1, { type: "HIDE" }, context(230));
    hidden = searchInPlace(hidden, 240);
    expect(() => transition(hidden, 1, { type: "HIDE" }, context(250)))
      .toThrow(/잠복/);

    let timedOut = startRound();
    for (let turn = 2; turn <= 10; turn += 1) {
      timedOut = searchInPlace(timedOut, 300 + turn * 10);
      timedOut = transition(
        timedOut,
        1,
        {
          type: "MOVE_INTRUDER",
          roomId: turn % 2 === 0 ? "bathroom" : "study",
        },
        context(305 + turn * 10),
      );
    }
    expect(timedOut.phase).toBe("ROUND_RESULT");
    expect(timedOut.traceHistory).toHaveLength(9);
    expect(timedOut.roundResults[0]).toMatchObject({
      outcome: "TIMEOUT",
      completedActions: 10,
    });
  });

  it("swaps roles for round two and scores the match after both acknowledgements", () => {
    let state = escapeFirstRound();
    state = transition(state, 1, { type: "ACK_ROUND_RESULT" }, context(300));
    state = transition(state, 2, { type: "ACK_ROUND_RESULT" }, context(310));
    expect(state).toMatchObject({
      phase: "ROUND_SETUP",
      round: 2,
      intruderSeat: 2,
      guardSeat: 1,
      turnNumber: 0,
      hideRemaining: 2,
      blocksRemaining: 2,
    });

    state = transition(state, 2, { type: "SELECT_ENTRY", roomId: "study" }, context(320));
    state = transition(state, 1, { type: "MARK_READY" }, context(330));
    state = transition(state, 2, { type: "MARK_READY" }, context(340));
    state = transition(
      state,
      1,
      { type: "MOVE_AND_SEARCH", path: ["central-hall", "study"] },
      context(350),
    );
    expect(state.roundResults[1]).toMatchObject({
      outcome: "CAUGHT",
      intruderSeat: 2,
      completedActions: 1,
    });

    state = transition(state, 1, { type: "ACK_ROUND_RESULT" }, context(360));
    state = transition(state, 2, { type: "ACK_ROUND_RESULT" }, context(370));
    expect(state.phase).toBe("MATCH_RESULT");
    expect(state.matchResult?.winnerSeat).toBe(1);
    expect(state.sessionRecords).toEqual([
      { seat: 1, wins: 1, draws: 0, losses: 0 },
      { seat: 2, wins: 0, draws: 0, losses: 1 },
    ]);
  });

  it("starts a voted rematch on a new layout with the starting roles reversed", () => {
    let state = finishTwoRoundMatch();
    state = transition(
      state,
      1,
      { type: "CAST_REMATCH_VOTE", vote: "REMATCH" },
      context(400),
    );
    expect(state.phase).toBe("MATCH_RESULT");
    expect(state.rematchVotes).toEqual([{ seat: 1, vote: "REMATCH" }]);

    const nextMatchSetup = createMatchSetup({
      seats: [2, 1],
      previousLayoutId: state.layout.id,
      randomIndex: () => 0,
    });
    state = transition(
      state,
      2,
      { type: "CAST_REMATCH_VOTE", vote: "REMATCH" },
      { ...context(410), nextMatchSetup },
    );
    expect(state).toMatchObject({
      phase: "ROUND_SETUP",
      matchNumber: 2,
      round: 1,
      intruderSeat: 2,
      guardSeat: 1,
    });
    expect(state.layout.id).not.toBe("open-gallery");
    expect(state.sessionRecords[0]).toMatchObject({ seat: 1, wins: 1 });
  });

  it("declares an enclosure before the expiring block is removed", () => {
    const setup = createMatchSetup({ seats: connectedSeats, randomIndex: () => 2 });
    let state = createInitialState(roster, setup, 100);
    state = {
      ...state,
      phase: "GUARD_TURN",
      turnNumber: 3,
      initialEntryRoomId: "kitchen",
      intruderRoomId: "central-hall",
      guardRoomId: "workshop",
      intruderPath: ["kitchen", "laundry", "central-hall"],
      hideRemaining: 0,
      activeBlock: {
        passage: ["central-hall", "workshop"],
        expiresAfterIntruderAction: 3,
      },
    };

    state = transition(
      state,
      2,
      { type: "MOVE_AND_SEARCH", path: ["study"] },
      context(200),
    );
    expect(state.phase).toBe("ROUND_RESULT");
    expect(state.roundResults[0]).toMatchObject({
      outcome: "ENCLOSED",
      completedActions: 3,
    });
  });

  it("pauses on disconnect, resumes its thought clock, and allows a delayed forfeit", () => {
    const active = startRound();
    let paused = advanceTimedState(active, {
      now: 1_000,
      connectedSeats: [1],
    });
    expect(paused.pause).toEqual({
      disconnectedSeats: [2],
      pausedAt: 1_000,
      forfeitClaimAt: 1_000 + FORFEIT_CLAIM_DELAY_MS,
    });
    expect(() =>
      transition(paused, 1, { type: "MOVE_AND_SEARCH", path: [] }, {
        now: 1_100,
        connectedSeats: [1],
      }),
    ).toThrow(/일시정지/);
    expect(() =>
      transition(paused, 1, { type: "CLAIM_FORFEIT" }, {
        now: 1_000 + FORFEIT_CLAIM_DELAY_MS - 1,
        connectedSeats: [1],
      }),
    ).toThrow(/3분/);

    const resumed = advanceTimedState(paused, {
      now: 2_000,
      connectedSeats,
    });
    expect(resumed.pause).toBeUndefined();
    expect(resumed.actionStartedAt).toBe(active.actionStartedAt + 1_000);

    paused = advanceTimedState(active, { now: 3_000, connectedSeats: [1] });
    const forfeited = transition(paused, 1, { type: "CLAIM_FORFEIT" }, {
      now: 3_000 + FORFEIT_CLAIM_DELAY_MS,
      connectedSeats: [1],
    });
    expect(forfeited).toMatchObject({
      phase: "GAME_OVER",
      forfeitWinnerSeat: 1,
    });
  });
});
