import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyRoomAction, createRoom, getRoomView, heartbeat, joinRoom } from "./room-service";
import { getRoomRecord, resetMemoryStore, saveRoomRecord } from "./repository";
import type { ActionRequest, ConnectedForestPlayerRoomView } from "./contracts";
import { forestDraftOptions } from "../connected-forest/ui/draft-options";
import { scoreConnectedForest } from "../connected-forest/domain/rules";
import { connectedForestRules, CONNECTED_FOREST_CURRENT_RULES_VERSION } from "../connected-forest/domain/content";
import { createMatchSetup } from "../connected-forest/domain/content";
import { createInitialState } from "../connected-forest/domain/reducer";

beforeEach(() => resetMemoryStore());
async function setup(count = 4) {
  const room = await createRoom("u1", "http://localhost", "connected-forest", 1000);
  for (let seat = 1; seat <= count; seat += 1) await joinRoom({ code: room.code, joinToken: new URL(room.joinUrl).hash.slice(1), nickname: `숲친구${seat}`, userId: `u${seat}`, now: 1001 });
  return room;
}
const privateView = async (code: string, seat: number, now: number) =>
  await getRoomView({ code, userId: `u${seat}`, mode: "private", now }) as ConnectedForestPlayerRoomView;
async function act(code: string, seat: number, action: ActionRequest["action"], now: number, id?: string) {
  const view = await getRoomView({ code, userId: `u${seat}`, mode: "private", now });
  return applyRoomAction({ code, userId: `u${seat}`, now, request: { clientActionId: id ?? `action-${view.room.version}-${seat}`, expectedVersion: view.room.version, action } });
}

describe("connected forest room integration", () => {
  it.each(["prototype-1", "balanced-1"] as const)("starts new matches with balanced-2 and preserves existing %s matches", async (historicalVersion) => {
    const room = await setup();
    await act(room.code, 1, { type: "START_GAME" }, 1002);
    expect((await privateView(room.code, 1, 1003)).rulesVersion).toBe("balanced-2");
    const record = (await getRoomRecord(room.code))!;
    record.game = { type: "connected-forest", state: createInitialState(record.players.map(({ seat, userId, nickname }) => ({ seat, userId, nickname })), createMatchSetup({ seats: record.players.map((player) => player.seat), rulesVersion: historicalVersion, randomIndex: () => 0 }), 1004) };
    await saveRoomRecord(record, record.storageRevision);
    const old = await privateView(room.code, 1, 1005);
    expect(old.rulesVersion).toBe(historicalVersion);
    expect(connectedForestRules(old.rulesVersion).walkReceiverLeaves).toBe(historicalVersion === "prototype-1" ? 3 : 2);
    expect(old.self.visitTargetSeats).toEqual(old.self.neighborSeats);
  });
  it("enforces 4–6 players and host-only starts without exposing private fields to display clients", async () => {
    const room = await setup(3);
    await expect(act(room.code, 1, { type: "START_GAME" }, 1002)).rejects.toThrow(/4명/);
    await expect(act(room.code, 2, { type: "START_GAME" }, 1002)).rejects.toThrow(/호스트/);
    for (let seat = 4; seat <= 6; seat += 1) await joinRoom({ code: room.code, joinToken: new URL(room.joinUrl).hash.slice(1), nickname: `숲친구${seat}`, userId: `u${seat}`, now: 1003 });
    await expect(joinRoom({ code: room.code, joinToken: new URL(room.joinUrl).hash.slice(1), nickname: "일곱친구", userId: "u7", now: 1003 })).rejects.toThrow(/가득/);
    await act(room.code, 1, { type: "START_GAME" }, 1004);
    const display = await getRoomView({ code: room.code, displayToken: new URL(room.displayUrl).hash.slice(1), mode: "private", now: 1005 });
    expect(display.projection).toBe("public");
    expect(JSON.stringify(display)).not.toContain('"hand"');
    expect(JSON.stringify(display)).not.toContain('"activeAnimals"');
    await expect(getRoomView({ code: room.code, userId: "observer", mode: "private", now: 1005 })).rejects.toThrow(/권한/);
    await expect(act(room.code, 1, { type: "MARK_READY" }, 1005)).rejects.toThrow(/이 게임/);
  });

  for (const count of [4, 5, 6]) it(`finishes ${count} players through all five seasons and starts a fresh rematch`, async () => {
    const room = await setup(count);
    let now = 1002;
    await act(room.code, 1, { type: "START_GAME" }, now);
    const phaseSeen = new Set<string>();
    let steps = 0;
    while (steps++ < 250) {
      for (let seat = 1; seat <= count; seat += 1) await heartbeat({ code: room.code, userId: `u${seat}`, now });
      const first = await privateView(room.code, 1, now);
      phaseSeen.add(first.phase);
      if (first.phase === "GAME_OVER") break;
      if (first.phase === "SEASON_REVEAL") { now = Date.parse(first.phaseEndsAt!); continue; }
      for (let seat = 1; seat <= count; seat += 1) {
        const view = await privateView(room.code, seat, now);
        if (view.self.legalActions.includes("LOCK_TERRAIN_PICK")) {
          const candidates = view.self.hand.flatMap((card) => view.self.legalPlacementHexIds.map((hexId) => {
            const draft = { cardId: card.id, hexId, useGoldenAcorn: false };
            return { draft, choices: forestDraftOptions(view, draft).choices };
          })).sort((a, b) => b.choices.length - a.choices.length);
          const { draft, choices } = candidates[0];
          await act(room.code, seat, { type: "LOCK_TERRAIN_PICK", ...draft, welcome: choices[0] }, now);
        } else if (view.self.legalActions.includes("CHOOSE_SEASON_VISIT")) {
          await act(room.code, seat, { type: "CHOOSE_SEASON_VISIT", animalCardId: view.self.visitAnimalCardIds[0], targetSeat: view.self.visitTargetSeats[0] }, now);
        } else if (view.self.legalActions.includes("RESOLVE_VISIT")) {
          const stay = view.self.stayHexIds[0];
          await act(room.code, seat, { type: "RESOLVE_VISIT", visitId: view.self.currentVisit!.visitId, choice: stay ? "STAY" : "WALK", targetHexId: stay }, now);
        }
      }
      now += 10;
    }
    expect(steps).toBeLessThan(250);
    const final = await privateView(room.code, 1, now);
    expect(final.phase).toBe("GAME_OVER");
    expect(final.result?.forfeited).toBe(false);
    expect(final.result?.scores).toHaveLength(count);
    for (const player of final.players) expect(player.board.filter((cell) => cell.terrain || cell.acornTerrain)).toHaveLength(15);
    const record = await getRoomRecord(room.code);
    if (record!.game!.type !== "connected-forest") throw new Error("Expected forest state");
    expect(final.result).toEqual({ forfeited: false, ...scoreConnectedForest(record!.game!.state) });
    expect(phaseSeen.has("SEASON_DRAFT")).toBe(true);
    expect(phaseSeen.has("SEASON_REVEAL")).toBe(true);
    await act(room.code, 1, { type: "START_REMATCH" }, now + 1);
    const fresh = await privateView(room.code, 1, now + 2);
    expect(fresh.phase).toBe("SEASON_DRAFT");
    expect(fresh.seasonIndex).toBe(0);
    expect(fresh.self.hand).toHaveLength(3);
    expect(fresh.players.every((player) => player.figures.length === 0 && player.score.total === 0)).toBe(true);
  });

  it("keeps locks private, rejects stale submissions and applies duplicate IDs only once", async () => {
    const room = await setup();
    await act(room.code, 1, { type: "START_GAME" }, 1002);
    const first = await privateView(room.code, 1, 1003);
    const request: ActionRequest = { clientActionId: "locked-pick-unique", expectedVersion: first.room.version, action: { type: "LOCK_TERRAIN_PICK", cardId: first.self.hand[0].id, hexId: "h00", useGoldenAcorn: true, acornTerrain: "WATER", refreshAnimalCardId: first.self.activeAnimals[0].id } };
    await applyRoomAction({ code: room.code, userId: "u1", request, now: 1003 });
    const second = await privateView(room.code, 2, 1003);
    expect(second.players[0].board.every((cell) => !cell.terrain)).toBe(true);
    expect(JSON.stringify(second)).not.toContain(first.self.hand[0].id);
    const duplicate = await applyRoomAction({ code: room.code, userId: "u1", request, now: 1004 });
    expect(duplicate.alreadyApplied).toBe(true);
    await expect(applyRoomAction({ code: room.code, userId: "u2", request: { clientActionId: "stale-second-pick", expectedVersion: first.room.version, action: { type: "LOCK_TERRAIN_PICK", cardId: second.self.hand[0].id, hexId: "h00", useGoldenAcorn: false } }, now: 1004 })).rejects.toThrow(/상태가 바뀌/);
    for (const seat of [2, 3, 4]) {
      const view = await privateView(room.code, seat, 1005);
      await act(room.code, seat, { type: "LOCK_TERRAIN_PICK", cardId: view.self.hand[0].id, hexId: "h00", useGoldenAcorn: false }, 1005);
    }
    const after = await privateView(room.code, 1, 1006);
    expect(after.pickIndex).toBe(1);
    expect(after.self.goldenAcornAvailable).toBe(false);
    expect(after.self.animalRefreshAvailable).toBe(false);
    expect(after.players[0].board[0].acornTerrain).toBe("WATER");
  });

  it("pauses for missing input, preserves remaining time on reconnection and ends without a winner", async () => {
    const room = await setup();
    await act(room.code, 1, { type: "START_GAME" }, 1002);
    const started = await privateView(room.code, 1, 1003);
    for (const seat of [1, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: 46002 });
    const paused = await privateView(room.code, 1, 46002);
    expect(paused.pause?.disconnectedSeats).toEqual([2]);
    for (const seat of [1, 2, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: 56002 });
    const resumed = await privateView(room.code, 2, 56002);
    expect(resumed.pause).toBeUndefined();
    expect(Date.parse(resumed.phaseEndsAt!)).toBe(Date.parse(started.phaseEndsAt!) + 10000);
    for (const seat of [1, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: 102000 });
    const again = await privateView(room.code, 1, 102000);
    expect(again.pause).toBeDefined();
    const claimAt = Date.parse(again.pause!.forfeitClaimAt);
    for (const seat of [1, 3, 4]) await heartbeat({ code: room.code, userId: `u${seat}`, now: claimAt });
    await act(room.code, 1, { type: "CLAIM_FORFEIT" }, claimAt);
    const ended = await privateView(room.code, 1, claimAt);
    expect(ended.result).toEqual({ forfeited: true });
    expect(ended.room.status).toBe("finished");
    await expect(act(room.code, 1, { type: "START_REMATCH" }, claimAt + 1)).rejects.toThrow(/4–6/);
    // Reconnecting preserves the original roster, so a four-player rematch is possible.
    await heartbeat({ code: room.code, userId: "u2", now: claimAt + 2 });
    await act(room.code, 1, { type: "START_REMATCH" }, claimAt + 3);
    expect((await privateView(room.code, 1, claimAt + 3)).phase).toBe("SEASON_DRAFT");
  });

  for (const choice of ["STAY", "WALK"] as const) it(`routes ${choice} visits and exposes only the recipient's valid destinations`, async () => {
    const room = await setup();
    await act(room.code, 1, { type: "START_GAME" }, 1002);
    const record = (await getRoomRecord(room.code))!;
    if (record.game?.type !== "connected-forest") throw new Error("Expected forest state");
    const state = record.game.state;
    const animal = state.players[0].activeAnimals.shift()!;
    state.players[0].board[0].terrain = animal.visitorTerrain;
    state.players[0].figures.push({ kind: "RESIDENT", figureId: "fixture-resident", animalCardId: animal.id, speciesId: animal.speciesId, hexId: "h00", visited: true });
    state.players[1].board[0].terrain = animal.visitorTerrain;
    state.phase = "SEASON_VISIT_RESPOND";
    state.phaseEndsAt = undefined;
    state.visitQueues = { 2: { visits: [{ visitId: "fixture-visit", animalCardId: animal.id, speciesId: animal.speciesId, visitorTerrain: animal.visitorTerrain, sourceSeat: 1, targetSeat: 2 }], currentIndex: 0, currentDeadlineAt: 21000 } };
    await saveRoomRecord(record, record.storageRevision);
    const target = await privateView(room.code, 2, 1003);
    expect(target.self.stayHexIds).toEqual(["h00"]);
    expect(target.self.canWalk).toBe(true);
    await expect(act(room.code, 3, { type: "RESOLVE_VISIT", visitId: "fixture-visit", choice, targetHexId: choice === "STAY" ? "h00" : undefined }, 1003)).rejects.toThrow(/응답/);
    await act(room.code, 2, { type: "RESOLVE_VISIT", visitId: "fixture-visit", choice, targetHexId: choice === "STAY" ? "h00" : undefined }, 1004);
    const settled = await privateView(room.code, 2, 1004);
    if (choice === "STAY") {
      expect(settled.players[1].figures[0].kind).toBe("VISITOR");
      expect(settled.players[1].score.visitorHearts).toBe(2);
    } else {
      expect(settled.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)?.length).toBe(1);
      expect(settled.players[1].score.leafHearts).toBe(connectedForestRules(CONNECTED_FOREST_CURRENT_RULES_VERSION).walkReceiverLeaves);
      expect(settled.players[1].score.leafHeartsFromPaths).toBe(connectedForestRules(CONNECTED_FOREST_CURRENT_RULES_VERSION).walkReceiverLeaves);
    }
    expect(settled.players[0].score.leafHearts).toBe(1);
    expect(settled.seasonVisitResults[0].choice).toBe(choice);
  });
});
