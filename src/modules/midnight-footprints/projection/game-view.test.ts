import { describe, expect, it } from "vitest";
import { createMatchSetup } from "../domain/content";
import { createInitialState, transition } from "../domain/reducer";
import { projectPlayer, projectPublic } from "./game-view";

const roster = [
  { seat: 1, userId: "u1", nickname: "괴도" },
  { seat: 2, userId: "u2", nickname: "경비" },
];
const context = {
  code: "NIGHT1",
  version: 4,
  now: 1_000,
  status: "playing" as const,
  hostUserId: "u1",
  connectedSeats: [1, 2],
};

const activeState = () => {
  const setup = createMatchSetup({ seats: [1, 2], randomIndex: () => 0 });
  let state = createInitialState(roster, setup, 100);
  state = transition(state, 1, { type: "SELECT_ENTRY", roomId: "study" }, {
    now: 110,
    connectedSeats: [1, 2],
  });
  state = transition(state, 1, { type: "MARK_READY" }, {
    now: 120,
    connectedSeats: [1, 2],
  });
  state = transition(state, 2, { type: "MARK_READY" }, {
    now: 130,
    connectedSeats: [1, 2],
  });
  return transition(state, 2, { type: "MOVE_AND_SEARCH", path: [] }, {
    now: 140,
    connectedSeats: [1, 2],
  });
};

describe("midnight footprints projections", () => {
  it("shows the intruder only their own location and the guard only their notes", () => {
    const state = activeState();
    const publicView = projectPublic(state, context);
    const intruderView = projectPlayer(state, {
      ...context,
      viewerUserId: "u1",
    });
    const guardView = projectPlayer(
      state,
      { ...context, viewerUserId: "u2" },
      {
        revision: 3,
        roomMarks: {
          study: "LIKELY",
          bathroom: "EXCLUDED",
        },
      },
    );

    expect(publicView).not.toHaveProperty("intruderRoomId");
    expect(publicView).not.toHaveProperty("initialEntryRoomId");
    expect(publicView.revealedPaths).toBeUndefined();
    expect(intruderView.self).toMatchObject({
      role: "INTRUDER",
      currentRoomId: "study",
      initialEntryRoomId: "study",
      path: ["study"],
    });
    expect(guardView.self).toMatchObject({
      role: "GUARD",
      privateStateRevision: 3,
      roomMarks: {
        study: "LIKELY",
        bathroom: "EXCLUDED",
      },
    });
    expect(guardView.self).not.toHaveProperty("currentRoomId");
    expect(JSON.stringify(publicView)).not.toContain("roomMarks");
  });

  it("reveals both paths only after the match and keeps individual rematch votes private", () => {
    const active = activeState();
    const firstResult = {
      round: 1 as const,
      intruderSeat: 1,
      guardSeat: 2,
      outcome: "CAUGHT" as const,
      completedActions: 3,
      path: ["study", "bathroom", "laundry"],
    };
    const secondResult = {
      round: 2 as const,
      intruderSeat: 2,
      guardSeat: 1,
      outcome: "TIMEOUT" as const,
      completedActions: 10,
      path: ["bedroom", "living-room", "laundry"],
    };
    const state = {
      ...active,
      phase: "MATCH_RESULT" as const,
      round: 2 as const,
      roundResults: [firstResult, secondResult],
      matchResult: {
        winnerSeat: 2,
        roundResults: [firstResult, secondResult] as [typeof firstResult, typeof secondResult],
      },
      rematchVotes: [{ seat: 1, vote: "REMATCH" as const }],
    };

    const publicView = projectPublic(state, context);
    const firstPlayer = projectPlayer(state, { ...context, viewerUserId: "u1" });
    const secondPlayer = projectPlayer(state, { ...context, viewerUserId: "u2" });
    expect(publicView.revealedPaths).toEqual([
      { round: 1, intruderSeat: 1, path: firstResult.path },
      { round: 2, intruderSeat: 2, path: secondResult.path },
    ]);
    expect(publicView.rematchVoteCount).toBe(1);
    expect(JSON.stringify(publicView)).not.toContain("REMATCH");
    expect(firstPlayer.self.ownRematchVote).toBe("REMATCH");
    expect(secondPlayer.self.ownRematchVote).toBeUndefined();
  });
});
