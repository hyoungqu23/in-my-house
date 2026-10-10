import { describe, expect, it } from "vitest";
import { createInnSetup, INN_FORFEIT_MS, INN_REVEAL_MS } from "./content";
import { advanceInn, createInnState, transitionInn } from "./reducer";
import { receiveInnItem, scoreInn, validInnBoard } from "./rules";
import type { InnCommand, InnState } from "./types";
import { projectInnPlayer, projectInnPublic } from "../projection/game-view";
import { innActionSchemas } from "./action-schema";
import { z } from "zod";

const seats = [1, 2, 3, 4];
const roster = seats.map(seat => ({ seat, userId: `u${seat}`, nickname: `주인${seat}` }));
const fresh = () => createInnState(roster, createInnSetup("test-match", () => 0));
function act(state: InnState, seat: number, action: InnCommand, now = 1000) {
  return transitionInn(state, seat, { ...action, phaseKey: state.phaseKey, revision: state.players.find(p => p.seat === seat)!.revision }, { now, connectedSeats: seats, sequenceId: `offer-${seat}-${state.players[seat - 1].revision}` });
}
function drafted() {
  let state = fresh();
  for (let round = 0; round < 2; round++) for (const seat of seats) state = act(state, seat, { type: "INN_PICK", bundleId: state.players[seat - 1].hand[0].id });
  return state;
}
function nightFixture() {
  const state = drafted(); state.phase = "INN_NIGHT"; state.phaseKey = "test-match:INN_NIGHT:2"; state.weather = "garden";
  state.players[0].guests = [{ id: "g-a", kind: "rabbit", position: 0 }];
  state.players[0].furniture = [{ id: "f-a", kind: "stone", position: 0 }];
  state.players[1].guests = [{ id: "g-b", kind: "phoenix", position: 3 }];
  state.players[1].furniture = [{ id: "f-b", kind: "quilt", position: 3 }];
  return state;
}

describe("moonlit inn round and privacy", () => {
  it("starts new games with balanced-1 while stored playtest-1 projections preserve their rules", () => {
    expect(fresh().rulesVersion).toBe("balanced-1");
    const state = nightFixture(); state.rulesVersion = "playtest-1";
    const context = { code: "ROOM", version: 1, now: 1000, status: "playing" as const, hostUserId: "u1", connectedSeats: seats };
    const old = projectInnPlayer(state, { ...context, viewerUserId: "u1" });
    expect(old.rulesVersion).toBe("playtest-1");
    expect(old.players[0].score?.guests[0].base).toBe(3);
    expect(state.rulesVersion).toBe("playtest-1");
  });
  it("requires exactly four players and conserves the twelve unique bundles", () => {
    for (const count of [3, 5]) expect(() => createInnState(Array.from({ length: count }, (_, i) => ({ seat: i + 1, userId: `u${i}`, nickname: "손님" })), createInnSetup("match", () => 0))).toThrow(/4명/);
    const initial = fresh();
    const ids = initial.players.flatMap(p => p.hand.map(c => c.guest.id));
    const state = drafted();
    expect(state.phase).toBe("INN_ARRANGE");
    expect(state.players.every(p => p.guests.length === 3 && p.furniture.length === 3 && p.hand.length === 0 && validInnBoard(p))).toBe(true);
    expect(state.players.flatMap(p => p.guests.map(g => g.id)).sort()).toEqual(ids.sort());
  });
  it("passes only unselected cards left, supports cancellation, and keeps them private", () => {
    let state = fresh();
    const context = { code: "ROOM", version: 1, now: 1000, status: "playing" as const, hostUserId: "u1", connectedSeats: seats };
    const original = structuredClone(state);
    state = act(state, 1, { type: "INN_PICK", bundleId: state.players[0].hand[0].id });
    expect(original.players[0].pickedId).toBeUndefined();
    const selectedId = state.players[0].pickedId!;
    const pub = projectInnPublic(state, { ...context, display: true });
    expect(pub.players[0].picked).toBe(true);
    expect(JSON.stringify(pub)).not.toContain(selectedId);
    expect(JSON.stringify(pub)).not.toContain('"hand"');
    expect(JSON.stringify(pub)).not.toContain('"weather"');
    expect(JSON.stringify(pub)).not.toContain('"userId"');
    const second = projectInnPlayer(state, { ...context, viewerUserId: "u2" });
    expect(JSON.stringify(second)).not.toContain(selectedId);
    expect(second.self.hand).toEqual(original.players[1].hand);
    state = act(state, 1, { type: "INN_PICK", bundleId: null });
    expect(state.players[0].pickedId).toBeUndefined();
    for (const seat of seats) state = act(state, seat, { type: "INN_PICK", bundleId: state.players[seat - 1].hand[0].id });
    expect(state.players[1].hand).toEqual(original.players[0].hand.slice(1));
    expect(() => act(state, 1, { type: "INN_PICK", bundleId: selectedId })).toThrow(/꾸러미/);
  });
  it("finishes after one night, allows tied winners, and rejects stale phase actions", () => {
    let state = drafted();
    const old = state.phaseKey;
    for (const seat of seats) state = act(state, seat, { type: "INN_READY", ready: true });
    expect(state.phase).toBe("INN_REVEAL");
    expect(state.phaseEndsAt).toBe(1000 + INN_REVEAL_MS);
    state = advanceInn(state, { now: state.phaseEndsAt!, connectedSeats: seats });
    expect(state.phase).toBe("INN_NIGHT");
    expect(() => transitionInn(state, 1, { type: "INN_READY", ready: true, phaseKey: old, revision: state.players[0].revision }, { now: 7000, connectedSeats: seats })).toThrow(/바뀌/);
    for (const player of state.players) { player.guests.forEach(g => { g.position = -1; }); }
    for (const seat of seats) state = act(state, seat, { type: "INN_READY", ready: true }, 7001);
    expect(state.result?.winnerSeats).toEqual(seats);
    expect(state.phase).toBe("GAME_OVER");
    expect(state.result?.scores).toHaveLength(4);
    expect(() => act(state, 1, { type: "INN_READY", ready: false }, 7002)).toThrow(/지금/);
  });
  it("preserves choices and remaining reveal time through disconnects", () => {
    let state = drafted();
    for (const seat of seats) state = act(state, seat, { type: "INN_READY", ready: true });
    const players = structuredClone(state.players);
    state = advanceInn(state, { now: 2000, connectedSeats: [1, 3, 4] });
    expect(state.pause?.disconnectedSeats).toEqual([2]);
    expect(() => transitionInn(state, 1, { type: "INN_END_DISCONNECTED", phaseKey: state.phaseKey, revision: state.players[0].revision }, { now: 3000, connectedSeats: [1, 3, 4] })).toThrow(/기다려/);
    const resumed = advanceInn(state, { now: 20_000, connectedSeats: seats });
    expect(resumed.phaseEndsAt).toBe(25_000);
    expect(resumed.players).toEqual(players);
    const ended = transitionInn(state, 1, { type: "INN_END_DISCONNECTED", phaseKey: state.phaseKey, revision: state.players[0].revision }, { now: 2000 + INN_FORFEIT_MS, connectedSeats: [1, 3, 4] });
    expect(ended.result).toEqual({ cancelled: true, winnerSeats: [], scores: [] });
  });
});

describe("moonlit inn moves and atomic trades", () => {
  it("uses one night action for storage swaps; rejects invalid or zero-cost repeated moves", () => {
    let state = nightFixture();
    state.players[0].furniture.push({ id: "stored", kind: "quilt", position: -1 });
    state = act(state, 1, { type: "INN_MOVE", kind: "furniture", itemId: "stored", to: 0 });
    expect(state.players[0].furniture.map(f => f.position)).toEqual([-1, 0]);
    expect(state.players[0].actionsLeft).toBe(1);
    expect(() => act(state, 1, { type: "INN_MOVE", kind: "furniture", itemId: "stored", to: 0 })).toThrow(/자리/);
    expect(() => act(state, 1, { type: "INN_MOVE", kind: "guest", itemId: "g-a", to: 2 })).toThrow(/자리/);
    state = act(state, 1, { type: "INN_MOVE", kind: "guest", itemId: "g-a", to: 3 });
    expect(state.players[0].actionsLeft).toBe(0);
    expect(() => act(state, 1, { type: "INN_MOVE", kind: "guest", itemId: "g-a", to: 0 })).toThrow(/지금/);
  });
  it("exchanges both items and charges both parties once; requires the intended recipient", () => {
    let state = nightFixture();
    const before = structuredClone(state);
    state = act(state, 1, { type: "INN_OFFER", targetSeat: 2, kind: "furniture", outgoingId: "f-a", incomingId: "f-b", receiveAt: 0 });
    const id = state.offers[0].id;
    expect(state.players[0].actionsLeft).toBe(2);
    expect(() => act(state, 3, { type: "INN_ACCEPT", offerId: id, receiveAt: 0 })).toThrow(/만료/);
    state = act(state, 2, { type: "INN_ACCEPT", offerId: id, receiveAt: 3 });
    expect(state.players[0].furniture[0].id).toBe("f-b");
    expect(state.players[1].furniture[0].id).toBe("f-a");
    expect(state.players.slice(0, 2).every(p => p.actionsLeft === 1 && p.traded)).toBe(true);
    expect(state.offers).toEqual([]);
    expect(state.trades).toHaveLength(1);
    expect(state.players.flatMap(p => p.furniture.map(f => f.id)).sort()).toEqual(before.players.flatMap(p => p.furniture.map(f => f.id)).sort());
    expect(scoreInn(state.players[0], state.weather).total).toBeGreaterThan(scoreInn(before.players[0], state.weather).total);
    expect(() => act(state, 2, { type: "INN_ACCEPT", offerId: id, receiveAt: 3 })).toThrow();
  });
  it.each([1, 2])("expires offers when participant %i changes their board", seat => {
    let state = nightFixture();
    state = act(state, 1, { type: "INN_OFFER", targetSeat: 2, kind: "furniture", outgoingId: "f-a", incomingId: "f-b", receiveAt: 0 });
    const id = state.offers[0].id;
    state = act(state, seat, { type: "INN_MOVE", kind: "furniture", itemId: seat === 1 ? "f-a" : "f-b", to: -1 });
    expect(state.offers).toEqual([]);
    expect(() => act(state, 2, { type: "INN_ACCEPT", offerId: id, receiveAt: 3 })).toThrow(/만료/);
  });
  it("rejects impossible receive positions without mutating either party", () => {
    let state = nightFixture();
    state = act(state, 1, { type: "INN_OFFER", targetSeat: 2, kind: "guest", outgoingId: "g-a", incomingId: "g-b", receiveAt: 0 });
    const before = structuredClone(state);
    expect(() => act(state, 2, { type: "INN_ACCEPT", offerId: state.offers[0].id, receiveAt: 2 })).toThrow(/자리/);
    expect(state).toEqual(before);
    expect(receiveInnItem(state.players[1], "guest", "g-b", state.players[0].guests[0], 3)).toBeDefined();
  });
  it("bounds and strictly validates API actions", () => {
    const schema = z.discriminatedUnion("type", innActionSchemas);
    const action = { type: "INN_MOVE", phaseKey: "match:night", revision: 1, kind: "guest", itemId: "g-a", to: 2 };
    expect(schema.safeParse(action).success).toBe(true);
    for (const invalid of [{ ...action, to: 6 }, { ...action, to: 1.5 }, { ...action, extra: "inject" }, { ...action, revision: -1 }]) expect(schema.safeParse(invalid).success).toBe(false);
  });
  it("namespaces proposal IDs when different players reuse a client request ID", () => {
    let state = nightFixture();
    for (const seat of [1, 3]) {
      const player = state.players[seat - 1];
      state = transitionInn(state, seat, { type: "INN_OFFER", phaseKey: state.phaseKey, revision: player.revision, targetSeat: 2, kind: "furniture", outgoingId: player.furniture[0].id, incomingId: "f-b", receiveAt: -1 }, { now: 1000, connectedSeats: seats, sequenceId: "shared-client-request-id" });
    }
    expect(state.offers).toHaveLength(2);
    expect(new Set(state.offers.map(offer => offer.id)).size).toBe(2);
    const own = state.offers.find(offer => offer.fromSeat === 3)!;
    state = act(state, 3, { type: "INN_DECLINE", offerId: own.id });
    expect(state.offers.map(offer => offer.fromSeat)).toEqual([1]);
  });
});
