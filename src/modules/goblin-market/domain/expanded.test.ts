import { describe, expect, it } from "vitest";
import { z } from "zod";
import { marketActionSchemas } from "./action-schema";
import { MARKET_CURRENT_RULES_VERSION, marketRules, marketTileName } from "./content";
import { advanceMarket, createMarketState, marketActingSeats, marketTurnSeat, transitionMarket } from "./reducer";
import { marketAssets, marketRefund, marketRent, ownedShops } from "./rules";
import type { MarketAction, MarketCommand, MarketRulesVersion, MarketState } from "./types";
import reference from "./fixtures/expanded-golden.json";

const roster = (count = 3) => Array.from({ length: count }, (_, i) => ({ seat: i + 1, userId: `u${i + 1}`, nickname: `상인${i + 1}` }));
function random(seed: number) { return (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); }; }
const initial = (n = 3, version: MarketRulesVersion = "mvp-2") => createMarketState(roster(n), "expanded", { now: 1000, randomIndex: random(71) }, version);
const act = (state: MarketState, seat: number, command: MarketCommand) => transitionMarket(state, seat, { ...command, phaseKey: state.phaseKey }, { now: 1001, randomIndex: () => 0 });
function land(tile: number) {
  const state = initial(); state.order = [1, 2, 3]; state.turnIndex = 0; state.players[0].position = (tile + 26) % 28;
  return act(state, 1, { type: "MARKET_ROLL" });
}

describe("expanded setup and rules", () => {
  it.each([3, 4])("starts %i merchants on the audited board with three complete trend cycles", n => {
    const state = createMarketState(roster(n), "new-match", { now: 1000, randomIndex: random(71) });
    expect(state.rulesVersion).toBe(MARKET_CURRENT_RULES_VERSION);
    const rules = marketRules(state.rulesVersion);
    expect(rules.size).toBe(reference.board.size); expect(rules.nights).toBe(reference.board.nights);
    expect(state.shops).toHaveLength(16); expect(state.trends).toHaveLength(12);
    for (let block = 0; block < 3; block++) expect(new Set(state.trends.slice(block * 4, block * 4 + 4)).size).toBe(4);
    for (const [index, category] of ["food", "goods", "fortune", "fun"].entries()) {
      expect(state.shops.filter(shop => shop.category === category).map(shop => shop.tile)).toEqual(reference.board.groups[index]);
    }
    for (const [kind, expected] of Object.entries(reference.board.specials)) {
      expect(Object.entries(rules.specials).filter(([, value]) => value.kind === kind).map(([key]) => Number(key))).toEqual(expected);
    }
    expect([...state.shops.map(shop => shop.tile), ...Object.keys(rules.specials).map(Number)].sort((a, b) => a - b)).toEqual(Array.from({ length: 28 }, (_, i) => i));
    expect(new Set(state.players.map(player => player.position)).size).toBe(1);
    expect([0, 7, 14, 21]).toContain(state.players[0].position);
    expect(state.players.map(player => marketAssets(state, player))).toEqual(Array(n).fill(25));
    expect(state.phaseEndsAt).toBe(6000);
  });
  it("keeps saved 20-tile matches and their names, bonuses and deadlines intact", () => {
    const state = JSON.parse(JSON.stringify(initial(3, "mvp-1"))) as MarketState;
    expect(state.shops).toHaveLength(12); expect(state.trends).toHaveLength(8);
    expect(marketTileName(4, state.rulesVersion)).toBe("도깨비 대장간");
    expect(marketTileName(4, "mvp-2")).toBe("달그림자 점집");
    state.order = [1, 2, 3]; state.players[0].position = 18;
    const next = act(state, 1, { type: "MARKET_ROLL" });
    expect(next.players[0].position).toBe(0); expect(next.players[0].cash).toBe(21);
    expect(next.phaseEndsAt).toBe(6001); // original 5-second upgrade window
  });
  it("requires all four category shops for the extra rent and keeps the cap at six", () => {
    const state = initial(); state.trends[0] = "goods";
    const food = state.shops.filter(shop => shop.category === "food");
    food.forEach((shop, i) => { shop.ownerSeat = i < 3 ? 1 : 2; });
    expect(marketRent(state, food[0])).toBe(2);
    food[3].ownerSeat = 1; expect(marketRent(state, food[0])).toBe(3);
    food[0].level = 1; state.trends[0] = "food"; expect(marketRent(state, food[0])).toBe(6);
  });
  it("accepts the extended API range and rejects out-of-board or special-cell targets", () => {
    const schema = z.discriminatedUnion("type", marketActionSchemas);
    expect(schema.safeParse({ type: "MARKET_PORTAL", phaseKey: "key", tile: 26 }).success).toBe(true);
    expect(schema.safeParse({ type: "MARKET_PORTAL", phaseKey: "key", tile: 28 }).success).toBe(false);
    const state = initial(); state.order = [1, 2, 3]; state.phase = "MARKET_PORTAL";
    expect(() => act(state, 1, { type: "MARKET_PORTAL", tile: 27 })).toThrow(/가게 칸/);
    const legacy = initial(3, "mvp-1"); legacy.order = [1, 2, 3]; legacy.phase = "MARKET_PORTAL";
    expect(() => act(legacy, 1, { type: "MARKET_PORTAL", tile: 26 })).toThrow(/가게 칸/);
  });
});

describe("every expanded special and the extended decision windows", () => {
  it.each([3, 6, 10, 13, 17, 24])("draws and trims at rumor tile %i", tile => {
    const state = land(tile); expect(state.players[0].position).toBe(tile);
    expect(state.phase).toBe("MARKET_DISCARD"); expect(state.players[0].hand).toHaveLength(3);
    expect(state.phaseEndsAt).toBe(9001);
  });
  it.each([7, 20])("offers remote purchases and a full-market card at tile %i", tile => {
    const state = land(tile); expect(state.phase).toBe("MARKET_BUY"); expect(state.phaseEndsAt).toBe(16001);
    const target = state.buyTiles.find(value => value >= 22)!;
    const bought = act(state, 1, { type: "MARKET_BUY", tile: target });
    expect(bought.shops.find(shop => shop.tile === target)?.ownerSeat).toBe(1);
    expect(bought.phaseEndsAt).toBe(11001);
    const full = initial(); full.order = [1, 2, 3]; full.players[0].position = tile - 2;
    full.shops.forEach(shop => { shop.ownerSeat ??= 2; });
    const card = act(full, 1, { type: "MARKET_ROLL" }); expect(card.phase).toBe("MARKET_DISCARD");
  });
  it.each([14, 27])("opens a 15-second portal selection at tile %i without a second gate bonus", tile => {
    const state = land(tile); expect(state.phase).toBe("MARKET_PORTAL"); expect(state.phaseEndsAt).toBe(16001);
    const next = act(state, 1, { type: "MARKET_PORTAL", tile: 26 });
    expect(next.players[0].position).toBe(26); expect(next.players[0].cash).toBe(19);
  });
  it("pays the rest and wrap bonuses at 21 and 0", () => {
    expect(land(21).players[0].cash).toBe(21);
    const gate = land(0); expect(gate.players[0].position).toBe(0); expect(gate.players[0].cash).toBe(21);
  });
  it("preserves a confirmed contract through the 15-second duel deadline and settles the captured monopoly rent", () => {
    const state = initial(); state.order = [1, 2, 3]; state.night = 2; state.trends[1] = "goods";
    state.shops.forEach(shop => { shop.ownerSeat = null; shop.level = 0; });
    state.shops.filter(shop => shop.category === "food").forEach(shop => { shop.ownerSeat = 2; });
    state.shops.find(shop => shop.tile === 1)!.level = 1;
    Object.assign(state.shops.find(shop => shop.tile === 2)!, { ownerSeat: 1, level: 1 });
    state.shops.find(shop => shop.tile === 4)!.ownerSeat = 3;
    const pool = [...state.deck, ...state.players.flatMap(player => player.hand)]; state.players.forEach(player => { player.hand = []; });
    state.players[0].hand = [pool.splice(pool.findIndex(card => card.kind === "C"), 1)[0]]; state.deck = pool;
    state.players[0].position = 27;
    const duel = act(state, 1, { type: "MARKET_ROLL" });
    expect(duel.duel?.originalRent).toBe(5); expect(duel.phaseEndsAt).toBe(16001);
    const locked = act(duel, 1, { type: "MARKET_DUEL", cardId: duel.players[0].hand[0].id, targetTile: 2 });
    expect(locked.phaseEndsAt).toBe(16001);
    expect(advanceMarket(locked, { now: 16000, randomIndex: () => 0 })).toBe(locked);
    const settled = advanceMarket(locked, { now: 16001, randomIndex: () => 0 });
    expect(settled.lastDuel).toMatchObject({ originalRent: 5, exchanged: true, paid: 3, ownerCard: null });
    expect(marketRent(settled, settled.shops.find(shop => shop.tile === 1)!)).toBe(4);
    expect(settled.players[1].cash).toBe(22);
  });
  it("continues after night eight and ends only after the final turn of night twelve", () => {
    const state = initial(); state.order = [1, 2, 3]; state.turnIndex = 2; state.night = 8; state.phase = "MARKET_UPGRADE";
    const ninth = act(state, 3, { type: "MARKET_UPGRADE", tile: null });
    expect(ninth.night).toBe(9); expect(ninth.phase).not.toBe("GAME_OVER"); expect(ninth.result).toBeUndefined();
    state.night = 12;
    const ended = act(state, 3, { type: "MARKET_UPGRADE", tile: null });
    expect(ended.phase).toBe("GAME_OVER"); expect(ended.phaseEndsAt).toBeUndefined(); expect(ended.result?.scores).toHaveLength(3);
  });
});

describe("independent Python expansion reference", () => {
  it.each(reference.cases)("replays all twelve nights for $players players, seed $seed", fixture => {
    let state = structuredClone(fixture.initial) as MarketState;
    let cursor = 0;
    const ctx = { now: 1000, randomIndex: (max: number) => {
      const next = fixture.randomTape[cursor++];
      expect(next, `Unexpected random request ${cursor}`).toBeDefined(); expect(next.max).toBe(max);
      return next.value;
    } };
    for (const event of fixture.actions) {
      const command = { ...event.action } as Record<string, unknown>;
      if (command.type === "MARKET_DUEL" || command.type === "MARKET_DISCARD") {
        const kind = command.cardKind;
        command.cardId = kind === null ? null : state.players.find(player => player.seat === event.seat)!.hand.find(card => card.kind === kind)!.id;
        delete command.cardKind;
      }
      const previousNight = state.night;
      state = transitionMarket(state, event.seat, { ...command, phaseKey: state.phaseKey } as MarketAction, ctx);
      if (state.night > previousNight) expect(state.players.map(player => marketAssets(state, player) - 3)).toEqual(fixture.nightAssets[previousNight - 1]);
      const cards = [...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)];
      expect(cards).toHaveLength(24); expect(new Set(cards.map(card => card.id)).size).toBe(24);
    }
    expect(cursor).toBe(fixture.randomTape.length); expect(state.phase).toBe("GAME_OVER"); expect(state.night).toBe(12);
    expect(state.players.map(player => player.cash)).toEqual(fixture.expected.cash);
    expect(state.players.map(player => player.position)).toEqual(fixture.expected.positions);
    expect(state.shops.map(({ tile, ownerSeat, level }) => ({ tile, ownerSeat, level }))).toEqual(fixture.expected.shops);
    expect(state.players.map(player => player.hand.map(card => card.kind))).toEqual(fixture.expected.hands);
    expect(state.deck.map(card => card.kind)).toEqual(fixture.expected.deck); expect(state.discard.map(card => card.kind)).toEqual(fixture.expected.discard);
    expect(state.result?.scores.map(row => row.total)).toEqual(fixture.expected.assets);
  });
});

it.each([3, 4])("finishes expanded %i-player matches under both active choices and timed defaults", n => {
  for (let seed = 1; seed <= 25; seed++) {
    const ctx = { now: 1000, randomIndex: random(seed) }; let state = createMarketState(roster(n), `active-${seed}`, ctx); let steps = 0;
    while (state.phase !== "GAME_OVER" && steps++ < 1000) {
      const seat = marketActingSeats(state)[0], player = state.players.find(player => player.seat === seat)!;
      let command: MarketCommand;
      switch (state.phase) {
        case "MARKET_ROLL": command = { type: "MARKET_ROLL" }; break;
        case "MARKET_BUY": command = { type: "MARKET_BUY", tile: ctx.randomIndex(3) ? state.buyTiles[ctx.randomIndex(state.buyTiles.length)] : null }; break;
        case "MARKET_PORTAL": command = { type: "MARKET_PORTAL", tile: state.shops[ctx.randomIndex(state.shops.length)].tile }; break;
        case "MARKET_DISCARD": command = { type: "MARKET_DISCARD", cardId: player.hand[ctx.randomIndex(player.hand.length)].id }; break;
        case "MARKET_UPGRADE": command = { type: "MARKET_UPGRADE", tile: ctx.randomIndex(2) ? ownedShops(state, seat).find(shop => !shop.level)!.tile : null }; break;
        case "MARKET_SETTLE": command = { type: "MARKET_SELL", tile: ownedShops(state, seat).sort((a, b) => marketRefund(a) - marketRefund(b))[0].tile }; break;
        case "MARKET_DUEL": {
          const visiting = state.duel!.visitorSeat === seat;
          const offered = ownedShops(state, seat).find(shop => shop.level === state.shops.find(shop => shop.tile === state.duel!.tile)!.level);
          const cards = player.hand.filter(card => visiting ? card.kind === "H" || card.kind === "C" && offered : card.kind === "M" || card.kind === "W");
          const card = cards[ctx.randomIndex(cards.length + 1)];
          command = { type: "MARKET_DUEL", cardId: card?.id ?? null, ...(card?.kind === "C" ? { targetTile: offered!.tile } : {}) }; break;
        }
      }
      state = transitionMarket(state, seat, { ...command, phaseKey: state.phaseKey }, ctx);
      expect(state.players.every(player => player.cash >= 0 && player.position < 28 && ownedShops(state, player.seat).length >= 1)).toBe(true);
    }
    expect(state.phase).toBe("GAME_OVER"); expect(state.night).toBe(12);
  }
  const ctx = { now: 1000, randomIndex: random(50) }; let timed = createMarketState(roster(n), "timed-expanded", ctx); let steps = 0;
  while (timed.phase !== "GAME_OVER" && steps++ < 1000) { ctx.now = timed.phaseEndsAt!; timed = advanceMarket(timed, ctx); }
  expect(timed.phase).toBe("GAME_OVER"); expect(timed.night).toBe(12); expect(timed.result?.scores).toHaveLength(n);
  expect(marketTurnSeat(timed)).toBeDefined();
});
