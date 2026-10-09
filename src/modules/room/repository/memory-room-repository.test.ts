import { beforeEach, expect, it } from "vitest";
import { MemoryRoomRepository } from "./memory-room-repository";
import { createRoomCandidate } from "./room-secrets";

const repository = new MemoryRoomRepository();
beforeEach(() => repository.reset());

it("isolates uncommitted changes and rejects a stale roster update after a heartbeat", async () => {
  const { room } = createRoomCandidate("host", "dark-house", 0);
  room.players = [{ seat: 1, userId: "host", nickname: "호스트", nicknameNormalized: "호스트", lastSeenAt: 0 }];
  await repository.insert(room);
  const removal = (await repository.find(room.code))!;
  const heartbeat = (await repository.find(room.code))!;
  removal.players = [];
  expect((await repository.find(room.code))!.players).toHaveLength(1);
  heartbeat.players[0].lastSeenAt = 200;
  expect(await repository.commit(heartbeat, 0)).toBe(true);
  expect(await repository.commit(removal, 0)).toBe(false);
  const saved = (await repository.find(room.code))!;
  expect(saved.storageRevision).toBe(1);
  expect(saved.players[0].lastSeenAt).toBe(200);
});
