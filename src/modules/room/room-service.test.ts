import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MidnightFootprintsPlayerRoomView } from "./contracts";

vi.mock("server-only", () => ({}));

import {
  applyRoomAction,
  createRoom,
  getRoomView,
  joinRoom,
  setFootprintsRoomMarks,
} from "./room-service";
import { resetMemoryStore } from "./repository";

const tokenFrom = (url: string) => new URL(url).hash.slice(1);

describe("room service", () => {
  beforeEach(() => resetMemoryStore());

  it("allocates exactly six seats and rejects the seventh", async () => {
    const created = await createRoom("host", "http://localhost", "dark-house", 1_000);
    const token = tokenFrom(created.joinUrl);
    for (let index = 1; index <= 6; index += 1) {
      const joined = await joinRoom({ code: created.code, joinToken: token, nickname: `손님${index}`, userId: `u${index}`, now: 1_001 });
      expect(joined.seat).toBe(index);
    }
    await expect(joinRoom({ code: created.code, joinToken: token, nickname: "일곱째", userId: "u7", now: 1_002 })).rejects.toThrow(/가득/);
  });

  it("applies duplicate action IDs once and returns the original version", async () => {
    const created = await createRoom("host", "http://localhost", "dark-house", 1_000);
    const token = tokenFrom(created.joinUrl);
    await Promise.all(["host", "u2", "u3"].map((userId, index) =>
      joinRoom({ code: created.code, joinToken: token, nickname: `참가자${index + 1}`, userId, now: 1_001 }),
    ));
    const request = { clientActionId: "action-start-0001", expectedVersion: 3, action: { type: "START_GAME" as const } };
    const first = await applyRoomAction({ code: created.code, userId: "host", request, now: 1_002 });
    const duplicate = await applyRoomAction({ code: created.code, userId: "host", request, now: 1_003 });
    expect(first.alreadyApplied).toBe(false);
    expect(duplicate.alreadyApplied).toBe(true);
    expect(duplicate.originalAppliedVersion).toBe(first.currentVersion);
  });

  it("persists the selected game and starts suspicious invite with one private Stranger", async () => {
    const created = await createRoom("host", "http://localhost", "dark-house", 1_000);
    expect(created.gameId).toBe("dark-house");
    const lobby = await getRoomView({
      code: created.code,
      userId: "host",
      mode: "public",
      now: 1_001,
    });
    expect(lobby.room.gameId).toBe("dark-house");

    const suspicious = await createRoom("host", "http://localhost", "suspicious-invite", 2_000);
    const token = tokenFrom(suspicious.joinUrl);
    await Promise.all(["host", "u2", "u3"].map((userId, index) =>
      joinRoom({ code: suspicious.code, joinToken: token, nickname: `초대손님${index + 1}`, userId, now: 2_001 }),
    ));
    await applyRoomAction({
      code: suspicious.code,
      userId: "host",
      request: { clientActionId: "start-suspicious", expectedVersion: 3, action: { type: "START_GAME" } },
      now: 2_002,
    });
    const privateViews = await Promise.all(["host", "u2", "u3"].map((userId) =>
      getRoomView({ code: suspicious.code, userId, mode: "private", now: 4_002 }),
    ));
    const roles = privateViews.map((view) =>
      view.projection === "player" && view.self && "role" in view.self ? view.self.role : undefined,
    );
    expect(roles.filter((role) => role === "STRANGER")).toHaveLength(1);
    expect(roles.filter((role) => role === "GUEST")).toHaveLength(2);

    const publicView = await getRoomView({ code: suspicious.code, userId: "host", mode: "public", now: 4_002 });
    expect(publicView.room.gameId).toBe("suspicious-invite");
    expect(JSON.stringify(publicView)).not.toContain("strangerSeat");
  });

  it("starts dawn switchboard without leaking solutions or other players' clues", async () => {
    const created = await createRoom("host", "http://localhost", "dawn-switchboard", 3_000);
    const token = tokenFrom(created.joinUrl);
    await Promise.all(["host", "u2", "u3"].map((userId, index) =>
      joinRoom({ code: created.code, joinToken: token, nickname: `수리공${index + 1}`, userId, now: 3_001 }),
    ));
    await applyRoomAction({
      code: created.code,
      userId: "host",
      request: { clientActionId: "start-switchboard", expectedVersion: 3, action: { type: "START_GAME" } },
      now: 3_002,
    });

    const hostView = await getRoomView({
      code: created.code,
      userId: "host",
      mode: "private",
      now: 3_003,
    });
    const publicView = await getRoomView({
      code: created.code,
      userId: "host",
      mode: "public",
      now: 3_003,
    });
    expect(hostView.room.gameId).toBe("dawn-switchboard");
    expect(hostView.phase).toBe("BRIEFING");
    expect(JSON.stringify(publicView)).not.toContain("solutionModuleIds");
    expect(JSON.stringify(publicView)).not.toContain("cluesBySeat");
    if (
      hostView.projection !== "player"
      || !hostView.self
      || !("clues" in hostView.self)
    ) {
      throw new Error("Expected switchboard player projection");
    }
    expect(hostView.self.clues.length).toBeGreaterThan(0);
    expect(hostView.self.legalActions).toContain("MARK_READY");

    await applyRoomAction({
      code: created.code,
      userId: "host",
      request: { clientActionId: "ready-host", expectedVersion: 4, action: { type: "MARK_READY" } },
      now: 3_004,
    });
    await applyRoomAction({
      code: created.code,
      userId: "u2",
      request: { clientActionId: "ready-u2", expectedVersion: 5, action: { type: "MARK_READY" } },
      now: 3_005,
    });
    const readyResult = await applyRoomAction({
      code: created.code,
      userId: "u3",
      request: { clientActionId: "ready-u3", expectedVersion: 6, action: { type: "MARK_READY" } },
      now: 3_006,
    });
    expect(readyResult.projection.phase).toBe("SOLVING");
  });

  it("keeps guard notes on a private revision without changing the room version", async () => {
    const created = await createRoom("host", "http://localhost", "midnight-footprints", 4_000);
    const token = tokenFrom(created.joinUrl);
    await joinRoom({
      code: created.code,
      joinToken: token,
      nickname: "달빛괴도",
      userId: "host",
      now: 4_001,
    });
    await joinRoom({
      code: created.code,
      joinToken: token,
      nickname: "야간경비",
      userId: "u2",
      now: 4_001,
    });
    await expect(joinRoom({
      code: created.code,
      joinToken: token,
      nickname: "구경꾼",
      userId: "u3",
      now: 4_001,
    })).rejects.toThrow(/가득/);

    await applyRoomAction({
      code: created.code,
      userId: "host",
      request: {
        clientActionId: "start-footprints",
        expectedVersion: 2,
        action: { type: "START_GAME" },
      },
      now: 4_002,
    });
    const playerViews = await Promise.all(["host", "u2"].map((userId) =>
      getRoomView({
        code: created.code,
        userId,
        mode: "private",
        now: 4_002,
      }),
    ));
    const footprintsViews = playerViews.map((view) => {
      if (
        view.projection !== "player"
        || view.room.gameId !== "midnight-footprints"
      ) {
        throw new Error("Expected footprints player projection");
      }
      return view as MidnightFootprintsPlayerRoomView;
    });
    const intruderIndex = footprintsViews.findIndex(
      (view) => view.self.role === "INTRUDER",
    );
    const intruderUserId = ["host", "u2"][intruderIndex];
    const guardUserId = ["host", "u2"][1 - intruderIndex];
    const entryRoomId = footprintsViews[intruderIndex].self.entryRoomIds![0];

    await applyRoomAction({
      code: created.code,
      userId: intruderUserId,
      request: {
        clientActionId: "entry-footprints",
        expectedVersion: 3,
        action: { type: "SELECT_ENTRY", roomId: entryRoomId },
      },
      now: 4_003,
    });
    await applyRoomAction({
      code: created.code,
      userId: intruderUserId,
      request: {
        clientActionId: "ready-intruder",
        expectedVersion: 4,
        action: { type: "MARK_READY" },
      },
      now: 4_004,
    });
    await applyRoomAction({
      code: created.code,
      userId: guardUserId,
      request: {
        clientActionId: "ready-guard",
        expectedVersion: 5,
        action: { type: "MARK_READY" },
      },
      now: 4_005,
    });

    const noteResult = await setFootprintsRoomMarks({
      code: created.code,
      userId: guardUserId,
      expectedPrivateRevision: 0,
      roomMarks: { study: "LIKELY", bathroom: "EXCLUDED" },
      now: 4_006,
    });
    expect(noteResult).toEqual({ privateRevision: 1, roomVersion: 6 });

    await applyRoomAction({
      code: created.code,
      userId: guardUserId,
      request: {
        clientActionId: "guard-search",
        expectedVersion: 6,
        action: { type: "MOVE_AND_SEARCH", path: [] },
      },
      now: 4_007,
    });
    const privateView = await getRoomView({
      code: created.code,
      userId: guardUserId,
      mode: "private",
      now: 4_008,
    });
    if (
      privateView.projection !== "player"
      || privateView.room.gameId !== "midnight-footprints"
    ) {
      throw new Error("Expected footprints player projection");
    }
    expect(privateView.room.version).toBe(7);
    expect(privateView.self).toMatchObject({
      privateStateRevision: 1,
      roomMarks: { study: "LIKELY", bathroom: "EXCLUDED" },
    });
  });
});
