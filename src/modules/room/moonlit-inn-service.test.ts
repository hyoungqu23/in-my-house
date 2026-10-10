import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyRoomAction, createRoom, getRoomView, heartbeat, joinRoom } from "./room-service";
import { getRoomRecord, resetMemoryStore, saveRoomRecord } from "./repository";
import type { ActionRequest, MoonlitInnPlayerRoomView } from "./contracts";
import type { InnCommand } from "../moonlit-inn/domain/types";

beforeEach(() => resetMemoryStore());
async function setup(count = 4) {
  const room = await createRoom("u1", "http://localhost", "moonlit-inn", 1000);
  for (let seat = 1; seat <= count; seat++) await joinRoom({ code: room.code, joinToken: new URL(room.joinUrl).hash.slice(1), nickname: `여관${seat}`, userId: `u${seat}`, now: 1001 });
  return room;
}
const view = async (code: string, seat = 1, now = 1002) => await getRoomView({ code, userId: `u${seat}`, mode: "private", now }) as MoonlitInnPlayerRoomView;
async function act(code: string, seat: number, command: InnCommand | { type: "START_GAME" | "START_REMATCH" }, now = 1002) {
  const current = await view(code, seat, now);
  const action = command.type === "START_GAME" || command.type === "START_REMATCH" ? command : { ...command, phaseKey: current.phaseKey, revision: current.self.revision };
  return applyRoomAction({ code, userId: `u${seat}`, now, request: { clientActionId: `act-${current.room.version}-${seat}`, expectedVersion: current.room.version, action } });
}
it("connects catalog limits, authorization, a complete match, display privacy and rematch", async () => {
  const room = await setup(3);
  await expect(act(room.code, 1, { type: "START_GAME" })).rejects.toThrow(/4명/);
  await joinRoom({ code: room.code, joinToken: new URL(room.joinUrl).hash.slice(1), nickname: "여관4", userId: "u4", now: 1001 });
  await expect(joinRoom({ code: room.code, joinToken: new URL(room.joinUrl).hash.slice(1), nickname: "여관5", userId: "u5", now: 1001 })).rejects.toThrow(/가득/);
  await expect(act(room.code, 2, { type: "START_GAME" })).rejects.toThrow(/호스트/);
  await act(room.code, 1, { type: "START_GAME" });
  const first = await view(room.code);
  expect(first.rulesVersion).toBe("balanced-1");
  const pub = await getRoomView({ code: room.code, displayToken: new URL(room.displayUrl).hash.slice(1), mode: "private", now: 1002 });
  expect(pub.projection).toBe("public");
  expect(JSON.stringify(pub)).not.toContain('"hand"');
  expect(JSON.stringify(pub)).not.toContain('"weather"');
  await expect(getRoomView({ code: room.code, userId: "stranger", mode: "private", now: 1002 })).rejects.toThrow(/권한/);
  for (let round = 0; round < 2; round++) for (const seat of [1, 2, 3, 4]) {
    const current = await view(room.code, seat);
    await act(room.code, seat, { type: "INN_PICK", bundleId: current.self.hand[0].id });
  }
  expect((await view(room.code)).phase).toBe("INN_ARRANGE");
  for (const seat of [1, 2, 3, 4]) await act(room.code, seat, { type: "INN_READY", ready: true });
  await act(room.code, 1, { type: "INN_SKIP_REVEAL" });
  for (const seat of [1, 2, 3, 4]) await act(room.code, seat, { type: "INN_READY", ready: true });
  const ended = await view(room.code);
  expect(ended.room.status).toBe("finished");
  expect(ended.result?.scores).toHaveLength(4);
  expect(ended.result?.winnerSeats.length).toBeGreaterThan(0);
  await act(room.code, 1, { type: "START_REMATCH" });
  const rematch = await view(room.code);
  expect(rematch.phase).toBe("INN_DRAFT");
  expect(rematch.phaseKey).not.toBe(first.phaseKey);
  expect(rematch.players.every(p => p.guests.length === 0)).toBe(true);
});
it("applies retried selections once and rejects concurrent stale versions", async () => {
  const room = await setup(); await act(room.code, 1, { type: "START_GAME" });
  const first = await view(room.code);
  const request: ActionRequest = { clientActionId: "once-only-inn", expectedVersion: first.room.version, action: { type: "INN_PICK", phaseKey: first.phaseKey, revision: first.self.revision, bundleId: first.self.hand[0].id } };
  await applyRoomAction({ code: room.code, userId: "u1", now: 1002, request });
  expect((await applyRoomAction({ code: room.code, userId: "u1", now: 1002, request })).alreadyApplied).toBe(true);
  await expect(applyRoomAction({ code: room.code, userId: "u2", now: 1002, request: { ...request, clientActionId: "stale-other-inn" } })).rejects.toThrow(/바뀌/);
});
it("handles concurrent acceptance atomically and persists ownership", async () => {
  const room = await setup(); await act(room.code, 1, { type: "START_GAME" });
  const record = (await getRoomRecord(room.code))!;
  if (record.game?.type !== "moonlit-inn") throw new Error("Expected inn");
  const state = record.game.state;
  state.phase = "INN_NIGHT"; state.phaseKey = "test-night";
  state.players.forEach((player, i) => { player.hand = []; player.guests = [{ id: `g${i}`, kind: "cat", position: 0 }]; player.furniture = [{ id: `f${i}`, kind: i === 0 ? "quilt" : "stone", position: 0 }]; });
  await saveRoomRecord(record, record.storageRevision);
  await act(room.code, 1, { type: "INN_OFFER", targetSeat: 2, kind: "furniture", outgoingId: "f0", incomingId: "f1", receiveAt: 0 });
  const receiver = await view(room.code, 2);
  const action: ActionRequest["action"] = { type: "INN_ACCEPT", phaseKey: receiver.phaseKey, revision: receiver.self.revision, offerId: receiver.offers[0].id, receiveAt: 0 };
  const results = await Promise.allSettled(["accept-inn-a", "accept-inn-b"].map(clientActionId => applyRoomAction({ code: room.code, userId: "u2", now: 1002, request: { clientActionId, expectedVersion: receiver.room.version, action } })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const after = await view(room.code);
  expect(after.players[0].furniture[0].id).toBe("f1");
  expect(after.players[1].furniture[0].id).toBe("f0");
  expect(after.players.slice(0, 2).map(p => p.actionsLeft)).toEqual([1, 1]);
  expect(after.trades).toHaveLength(1);
});
it("restores saved selections after a disconnect and enforces four-player rematches", async () => {
  const room = await setup(); await act(room.code, 1, { type: "START_GAME" });
  const initial = await view(room.code);
  await act(room.code, 1, { type: "INN_PICK", bundleId: initial.self.hand[0].id });
  for (const seat of [1, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: 47000 });
  const paused = await view(room.code, 1, 47000);
  expect(paused.pause?.disconnectedSeats).toEqual([2]);
  expect(paused.self.pickedId).toBe(initial.self.hand[0].id);
  for (const seat of [1, 2, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: 48000 });
  expect((await view(room.code, 1, 48000)).pause).toBeUndefined();
  for (const seat of [1, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: 100000 });
  const lostAgain = await view(room.code, 1, 100000);
  const endAt = Date.parse(lostAgain.pause!.forfeitClaimAt);
  for (const seat of [1, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: endAt });
  await act(room.code, 1, { type: "INN_END_DISCONNECTED" }, endAt);
  expect((await view(room.code, 1, endAt)).result?.cancelled).toBe(true);
  await expect(act(room.code, 1, { type: "START_REMATCH" }, endAt + 1)).rejects.toThrow(/4명/);
  await heartbeat({ code: room.code, userId: "u2", now: endAt + 2 });
  await act(room.code, 1, { type: "START_REMATCH" }, endAt + 3);
  expect((await view(room.code, 1, endAt + 3)).self.hand).toHaveLength(3);
});
