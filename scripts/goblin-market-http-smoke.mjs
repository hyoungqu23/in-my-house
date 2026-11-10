import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run against a local memory-store dev server. All identities and rooms are synthetic.
const origin = process.argv[2] ?? "http://127.0.0.1:3000";
const server = new URL(origin);
assert(["127.0.0.1", "localhost"].includes(server.hostname), "Use a local development server");
async function run(count) {
  const devices = Array.from({ length: count }, () => randomUUID());
  async function request(path, seat = 1, body, displayToken) {
    const response = await fetch(new URL(path, origin), {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(displayToken ? { Authorization: `Display ${displayToken}` } : { "X-Device-Id": devices[seat - 1] }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    assert(response.ok, `${response.status}: ${JSON.stringify(data)}`);
    return data;
  }
  const room = await request("/api/rooms", 1, { gameId: "goblin-market" });
  const token = new URL(room.joinUrl).hash.slice(1), displayToken = new URL(room.displayUrl).hash.slice(1);
  for (let seat = 1; seat <= count; seat++) await request(`/api/rooms/${room.code}/join`, seat, { joinToken: token, nickname: `검증상인${seat}` });
  const view = (seat = 1) => request(`/api/rooms/${room.code}/view?mode=private`, seat);
  async function action(seat, current, command) {
    return request(`/api/rooms/${room.code}/actions`, seat, { clientActionId: randomUUID(), expectedVersion: current.room.version, action: command });
  }
  await action(1, await view(), { type: "START_GAME" });
  let current = await view(), steps = 0;
  const initialKey = current.phaseKey;
  while (current.phase !== "GAME_OVER" && steps++ < 500) {
    if (steps % 15 === 0) for (let seat = 1; seat <= count; seat++) await request(`/api/rooms/${room.code}/heartbeat`, seat, {});
    const seat = current.actingSeats[0]; current = await view(seat);
    // A timed decision may have progressed between observers.
    if (!current.self.legalActions.length) { current = await view(); continue; }
    const owned = current.shops.filter(shop => shop.ownerSeat === seat);
    let command;
    switch (current.phase) {
      case "MARKET_ROLL": command = { type: "MARKET_ROLL" }; break;
      case "MARKET_BUY": command = { type: "MARKET_BUY", tile: current.self.buyTiles[0] }; break;
      case "MARKET_PORTAL": command = { type: "MARKET_PORTAL", tile: current.shops.find(shop => shop.ownerSeat !== seat)?.tile ?? 1 }; break;
      case "MARKET_DISCARD": command = { type: "MARKET_DISCARD", cardId: current.self.hand[0].id }; break;
      case "MARKET_UPGRADE": command = { type: "MARKET_UPGRADE", tile: owned.find(shop => !shop.level).tile }; break;
      case "MARKET_SETTLE": command = { type: "MARKET_SELL", tile: owned[0].tile }; break;
      case "MARKET_DUEL": {
        const card = current.self.hand.find(card => current.self.legalCardIds.includes(card.id));
        command = { type: "MARKET_DUEL", cardId: card?.id ?? null, ...(card?.kind === "C" ? { targetTile: current.self.exchangeTiles[0] } : {}) }; break;
      }
      default: throw new Error(`Unknown phase: ${current.phase}`);
    }
    await action(seat, current, { ...command, phaseKey: current.phaseKey });
    const publicView = await request(`/api/rooms/${room.code}/view?mode=private`, 1, undefined, displayToken);
    assert.equal(publicView.projection, "public");
    assert(!/"(hand|deck|choices|userId|trends)":/.test(JSON.stringify(publicView)));
    current = await view();
  }
  assert.equal(current.phase, "GAME_OVER"); assert.equal(current.night, 12);
  assert.equal(current.rulesVersion, "mvp-2"); assert.equal(current.boardSize, 28); assert.equal(current.shops.length, 16);
  assert.equal(current.result.scores.length, count); assert(current.result.winnerSeats.length > 0);
  assert(current.players.every(player => player.cash >= 0 && current.shops.some(shop => shop.ownerSeat === player.seat)));
  await action(1, current, { type: "START_REMATCH" });
  const rematch = await view(); assert.notEqual(rematch.phaseKey, initialKey); assert.equal(rematch.night, 1);
  assert(rematch.players.every(player => player.assets === 25));
  console.log(JSON.stringify({ players: count, complete: true, steps, rematch: true, displayUrl: room.displayUrl, joinUrl: room.joinUrl }));
}
for (const count of [3, 4]) await run(count);
