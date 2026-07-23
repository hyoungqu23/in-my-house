import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyRoomAction, createRoom, joinRoom } from "./room-service";
import { resetMemoryStore } from "./repository";

const tokenFrom = (url: string) => new URL(url).hash.slice(1);

describe("room service", () => {
  beforeEach(() => resetMemoryStore());

  it("allocates exactly six seats and rejects the seventh", async () => {
    const created = await createRoom("host", "http://localhost", 1_000);
    const token = tokenFrom(created.joinUrl);
    for (let index = 1; index <= 6; index += 1) {
      const joined = await joinRoom({ code: created.code, joinToken: token, nickname: `손님${index}`, userId: `u${index}`, now: 1_001 });
      expect(joined.seat).toBe(index);
    }
    await expect(joinRoom({ code: created.code, joinToken: token, nickname: "일곱째", userId: "u7", now: 1_002 })).rejects.toThrow(/가득/);
  });

  it("applies duplicate action IDs once and returns the original version", async () => {
    const created = await createRoom("host", "http://localhost", 1_000);
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
});
