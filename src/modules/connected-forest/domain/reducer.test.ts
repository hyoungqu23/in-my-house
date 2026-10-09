import { describe, expect, it } from "vitest";
import { createMatchSetup } from "./content";
import {
  advanceTimedState,
  createInitialState,
  legalActions,
  transition,
} from "./reducer";
import { forestWelcomeChoices } from "./rules";
import type {
  ConnectedForestState,
  ForestAnimalCard,
  ForestPlayer,
  ForestResidentFigure,
  ForestTerrainKind,
} from "./types";

const roster = [1, 2, 3, 4].map((seat) => ({
  seat,
  userId: `u${seat}`,
  nickname: `p${seat}`,
}));
const connectedSeats = roster.map((player) => player.seat);
const context = (now: number, connected = connectedSeats) => ({ now, connectedSeats: connected });
const setup = () => createMatchSetup({
  seats: connectedSeats,
  randomIndex: (maxExclusive) => maxExclusive - 1,
});
const initial = (now = 0) => createInitialState(roster, setup(), now);

const swapTerrainIntoHand = (
  state: ConnectedForestState,
  player: ForestPlayer,
  kind: ForestTerrainKind,
) => {
  const deckIndex = state.terrainDeck.findIndex((card) => card.kind === kind);
  const deckCard = state.terrainDeck[deckIndex];
  const oldCard = player.hand[0];
  state.terrainDeck[deckIndex] = oldCard;
  player.hand[0] = deckCard;
  return deckCard;
};

const installResident = (
  player: ForestPlayer,
  card: ForestAnimalCard,
  hexId = "h00",
): ForestResidentFigure => {
  const index = player.activeAnimals.findIndex((candidate) => candidate.id === card.id);
  expect(index).toBeGreaterThanOrEqual(0);
  player.activeAnimals.splice(index, 1);
  player.board.find((cell) => cell.hexId === hexId)!.terrain = card.visitorTerrain;
  const resident: ForestResidentFigure = {
    kind: "RESIDENT",
    figureId: `resident-${player.seat}-${card.id}`,
    animalCardId: card.id,
    speciesId: card.speciesId,
    hexId,
    visited: false,
  };
  player.figures.push(resident);
  return resident;
};

const visitSelectionFixture = () => {
  const state = initial();
  state.phase = "SEASON_VISIT_SELECT";
  state.phaseKey = "connected-forest:0:visit-select";
  state.phaseEndsAt = 30_000;
  state.draftSubmissions = {};
  state.visitSelections = { 2: "NONE", 3: "NONE", 4: "NONE" };
  return state;
};

describe("connected forest reducer", () => {
  it("copies a welcome payload before storing an immutable submission", () => {
    let state = initial();
    const player = state.players[0];
    const card = swapTerrainIntoHand(state, player, "ROCK");
    player.board[0].terrain = "TREE";
    player.board.find((cell) => cell.hexId === "h06")!.terrain = "MUSHROOM";
    player.board.find((cell) => cell.hexId === "h01")!.terrain = "TREE";
    const welcome = {
      animalCardId: "squirrel-bend3" as const,
      originHexId: "h00",
      rotation: 0 as const,
      residentHexId: "h00",
    };
    state = transition(state, 1, {
      type: "LOCK_TERRAIN_PICK", cardId: card.id, hexId: "h04",
      useGoldenAcorn: false, welcome,
    }, context(1));
    welcome.residentHexId = "h01";
    expect(state.draftSubmissions[1].welcome?.residentHexId).toBe("h00");
    for (const seat of [2, 3, 4]) {
      state = transition(state, seat, {
        type: "LOCK_TERRAIN_PICK", cardId: state.players[seat - 1].hand[0].id,
        hexId: "h00", useGoldenAcorn: false,
      }, context(2));
    }
    expect(state.players[0].figures[0].hexId).toBe("h00");
  });

  it("immediately farewells an impossible visit on entry without exposing a dead choice", () => {
    let state = visitSelectionFixture();
    const resident = installResident(state.players[0], state.players[0].activeAnimals[0]);
    state.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)!.length = 3;
    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT", animalCardId: resident.animalCardId, targetSeat: 2,
    }, context(100));
    expect(state.phase).toBe("SEASON_REVEAL");
    expect(state.phaseEndsAt).toBe(1900);
    expect(state.seasonVisitResults).toMatchObject([{ choice: "FAREWELL" }]);
    expect(state.players.map((player) => player.leaves)).toEqual([1, 1, 0, 0]);
    expect(legalActions(state, 2, connectedSeats)).toEqual([]);
  });

  it("waits for disconnected seats only when their input is required", () => {
    let state = initial();
    state = transition(state, 1, {
      type: "LOCK_TERRAIN_PICK", cardId: state.players[0].hand[0].id,
      hexId: "h00", useGoldenAcorn: false,
    }, context(1));
    const online = [2, 3, 4];
    state = advanceTimedState(state, context(2, online));
    expect(state.pause).toBeUndefined();
    for (const seat of online) {
      state = transition(state, seat, {
        type: "LOCK_TERRAIN_PICK", cardId: state.players[seat - 1].hand[0].id,
        hexId: "h00", useGoldenAcorn: false,
      }, context(3, online));
    }
    expect(state.pickIndex).toBe(1);
    expect(state.pause?.disconnectedSeats).toEqual([1]);
    const resumed = advanceTimedState(state, context(1003));
    expect(resumed.pause).toBeUndefined();
    expect(resumed.phaseEndsAt).toBe(state.phaseEndsAt! + 1000);
  });

  it("finishes a reveal without waiting, then pauses on the next missing draft input", () => {
    let state = advanceTimedState(initial(), context(180000));
    expect(state.phase).toBe("SEASON_REVEAL");
    state = advanceTimedState(state, context(180001, [2, 3, 4]));
    expect(state.pause).toBeUndefined();
    state = advanceTimedState(state, context(181800, [2, 3, 4]));
    expect(state.seasonIndex).toBe(1);
    expect(state.phase).toBe("SEASON_DRAFT");
    expect(state.pause?.disconnectedSeats).toEqual([1]);
    expect(state.players.every((player) => player.hand.length === 3)).toBe(true);
  });

  it("ignores offline players with no visit or an already submitted visit selection", () => {
    let state = visitSelectionFixture();
    const first = installResident(state.players[0], state.players[0].activeAnimals[0]);
    const third = installResident(state.players[2], state.players[2].activeAnimals[0]);
    state.visitSelections = { 2: "NONE", 4: "NONE" };
    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT", animalCardId: first.animalCardId, targetSeat: 2,
    }, context(10));
    state = advanceTimedState(state, context(11, [2, 3]));
    expect(state.pause).toBeUndefined();
    state = transition(state, 3, {
      type: "CHOOSE_SEASON_VISIT", animalCardId: third.animalCardId, targetSeat: 2,
    }, context(12, [2, 3]));
    expect(state.phase).toBe("SEASON_VISIT_RESPOND");
    expect(state.pause).toBeUndefined();
    state = transition(state, 2, {
      type: "RESOLVE_VISIT", visitId: state.visitQueues[2].visits[0].visitId, choice: "WALK",
    }, context(13, [2, 3]));
    expect(state.visitQueues[2].currentIndex).toBe(1);
  });

  it("only pauses a still-waiting receiver when another receiver has finished", () => {
    let state = visitSelectionFixture();
    const first = installResident(state.players[0], state.players[0].activeAnimals[0]);
    const second = installResident(state.players[1], state.players[1].activeAnimals[0]);
    state.visitSelections = { 3: "NONE", 4: "NONE" };
    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT", animalCardId: first.animalCardId, targetSeat: 2,
    }, context(10));
    state = transition(state, 2, {
      type: "CHOOSE_SEASON_VISIT", animalCardId: second.animalCardId, targetSeat: 1,
    }, context(11));
    state = transition(state, 1, {
      type: "RESOLVE_VISIT", visitId: state.visitQueues[1].visits[0].visitId, choice: "WALK",
    }, context(12));
    const continuing = advanceTimedState(state, context(13, [2, 3, 4]));
    expect(continuing.pause).toBeUndefined();
    const paused = advanceTimedState(continuing, context(14, [3, 4]));
    expect(paused.pause?.disconnectedSeats).toEqual([2]);
  });

  it("recovers a persisted impossible visit that was waiting before the immediate-settlement fix", () => {
    const state = visitSelectionFixture();
    const resident = installResident(state.players[0], state.players[0].activeAnimals[0]);
    resident.visited = true;
    state.phase = "SEASON_VISIT_RESPOND";
    state.phaseEndsAt = undefined;
    state.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)!.length = 3;
    state.visitQueues = { 2: {
      visits: [{ visitId: "v-0-1", animalCardId: resident.animalCardId, speciesId: resident.speciesId,
        visitorTerrain: "TREE", sourceSeat: 1, targetSeat: 2 }],
      currentIndex: 0, currentDeadlineAt: 20000,
    } };
    const recovered = advanceTimedState(state, context(20000));
    expect(recovered.phase).toBe("SEASON_REVEAL");
    expect(recovered.seasonVisitResults[0].choice).toBe("FAREWELL");
    expect(recovered.players.slice(0, 2).map((player) => player.leaves)).toEqual([1, 1]);
  });

  it("creates a four-player game with private hands, active animals, paths, and a deadline", () => {
    const state = initial(100);
    expect(state).toMatchObject({
      phase: "SEASON_DRAFT",
      rulesVersion: "prototype-1",
      seasonIndex: 0,
      pickIndex: 0,
      passDirection: "LEFT",
      phaseEndsAt: 60_100,
    });
    expect(state.players).toHaveLength(4);
    expect(state.players.every((player) => player.hand.length === 3)).toBe(true);
    expect(state.players.every((player) => player.activeAnimals.length === 2)).toBe(true);
    expect(state.neighborPaths).toHaveLength(4);
    expect(legalActions(state, 1, connectedSeats)).toEqual(["LOCK_TERRAIN_PICK"]);
    expect(legalActions(state, 9, connectedSeats)).toEqual([]);
  });

  it("rejects invalid roster and setup combinations", () => {
    expect(() => createInitialState(roster.slice(0, 3), setup(), 0)).toThrow(/4–6명/);
    expect(() => createInitialState(roster, { ...setup(), seats: [1, 2, 3, 5] }, 0))
      .toThrow(/setup/);
    const shortDeck = setup();
    shortDeck.terrainDeck.pop();
    expect(() => createInitialState(roster, shortDeck, 0)).toThrow(/setup/);
    const shortAnimals = setup();
    shortAnimals.animalDeck.pop();
    expect(() => createInitialState(roster, shortAnimals, 0)).toThrow(/setup/);
  });

  it("locks simultaneous picks, prevents duplicate actions, and passes remaining hands", () => {
    let state = initial();
    expect(() => transition(state, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: state.players[0].hand[0].id,
      hexId: "h01",
      useGoldenAcorn: false,
    }, context(1))).toThrow(/놓을 수 없는/);

    for (const player of state.players) {
      const cardId = player.hand[0].id;
      state = transition(state, player.seat, {
        type: "LOCK_TERRAIN_PICK",
        cardId,
        hexId: "h00",
        useGoldenAcorn: false,
      }, context(10 + player.seat));
      if (player.seat === 1) {
        expect(() => transition(state, 1, {
          type: "LOCK_TERRAIN_PICK",
          cardId,
          hexId: "h00",
          useGoldenAcorn: false,
        }, context(20))).toThrow(/이미/);
      }
    }
    expect(state.pickIndex).toBe(1);
    expect(state.players.every((player) => player.hand.length === 2)).toBe(true);
    expect(state.terrainDiscard).toHaveLength(4);
  });

  it("uses a bound golden acorn, refreshes once, and welcomes one matching animal", () => {
    let state = initial();
    const actor = state.players[0];
    const rock = swapTerrainIntoHand(state, actor, "ROCK");
    actor.board.find((cell) => cell.hexId === "h00")!.terrain = "TREE";
    actor.board.find((cell) => cell.hexId === "h06")!.terrain = "MUSHROOM";
    const animal = actor.activeAnimals.find((card) => card.id === "squirrel-bend3")!;
    const preview = structuredClone(actor);
    preview.board.find((cell) => cell.hexId === "h04")!.terrain = "ROCK";
    const welcome = forestWelcomeChoices(preview, animal)
      .find((choice) => choice.originHexId === "h00" && choice.rotation === 0)!;

    state = transition(state, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: rock.id,
      hexId: "h04",
      useGoldenAcorn: true,
      acornTerrain: "ROCK",
      welcome,
    }, context(10));
    for (const player of state.players.slice(1)) {
      state = transition(state, player.seat, {
        type: "LOCK_TERRAIN_PICK",
        cardId: player.hand[0].id,
        hexId: "h00",
        useGoldenAcorn: false,
      }, context(10 + player.seat));
    }
    expect(state.players[0].figures).toEqual([
      expect.objectContaining({ kind: "RESIDENT", animalCardId: "squirrel-bend3" }),
    ]);
    expect(state.players[0].welcomedThisSeason).toBe(true);
    expect(state.players[0].board.find((cell) => cell.hexId === "h04")?.acornTerrain).toBe("ROCK");

    const nextCard = state.players[0].hand[0];
    expect(() => transition(state, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: nextCard.id,
      hexId: "h01",
      refreshAnimalCardId: state.players[0].activeAnimals[0].id,
      useGoldenAcorn: false,
    }, context(30))).toThrow(/교환/);

    const fresh = initial();
    expect(() => transition(fresh, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: fresh.players[0].hand[0].id,
      hexId: "h00",
      useGoldenAcorn: true,
    }, context(10))).toThrow(/도토리/);
    const acorn = transition(fresh, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: fresh.players[0].hand[0].id,
      hexId: "h00",
      useGoldenAcorn: true,
      acornTerrain: "WATER",
    }, context(10));
    expect(acorn.draftSubmissions[1]).toMatchObject({ useGoldenAcorn: true, acornTerrain: "WATER" });
    let resolvedAcorn = acorn;
    for (const player of resolvedAcorn.players.slice(1)) {
      resolvedAcorn = transition(resolvedAcorn, player.seat, {
        type: "LOCK_TERRAIN_PICK",
        cardId: player.hand[0].id,
        hexId: "h00",
        useGoldenAcorn: false,
      }, context(20 + player.seat));
    }
    expect(resolvedAcorn.players[0].board[0]).toMatchObject({ acornTerrain: "WATER" });
    expect(resolvedAcorn.players[0].goldenAcornAvailable).toBe(false);
    expect(() => transition(fresh, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: fresh.players[0].hand[0].id,
      hexId: "h00",
      useGoldenAcorn: false,
      acornTerrain: "TREE",
    }, context(10))).toThrow(/도토리/);
  });

  it("applies simultaneous animal refreshes in seat order", () => {
    let state = initial();
    const discardedId = state.players[0].activeAnimals[0].id;
    for (const player of state.players) {
      state = transition(state, player.seat, {
        type: "LOCK_TERRAIN_PICK",
        cardId: player.hand[0].id,
        hexId: "h00",
        refreshAnimalCardId: player.seat === 1 ? discardedId : undefined,
        useGoldenAcorn: false,
      }, context(10 + player.seat));
    }
    expect(state.animalDiscard.map((card) => card.id)).toContain(discardedId);
    expect(state.players[0]).toMatchObject({
      animalRefreshAvailable: false,
      activeAnimals: expect.arrayContaining([expect.not.objectContaining({ id: discardedId })]),
    });
  });

  it("rejects conflicting or invalid welcome requests before applying a batch", () => {
    const state = initial();
    const player = state.players[0];
    const animalId = player.activeAnimals[0].id;
    const dummyWelcome = {
      animalCardId: animalId,
      originHexId: "h00",
      rotation: 0 as const,
      residentHexId: "h00",
    };
    expect(() => transition(state, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: player.hand[0].id,
      hexId: "h00",
      refreshAnimalCardId: animalId,
      useGoldenAcorn: false,
      welcome: dummyWelcome,
    }, context(1))).toThrow(/교환할 동물/);
    const alreadyWelcomed = structuredClone(state);
    alreadyWelcomed.players[0].welcomedThisSeason = true;
    expect(() => transition(alreadyWelcomed, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: alreadyWelcomed.players[0].hand[0].id,
      hexId: "h00",
      useGoldenAcorn: false,
      welcome: dummyWelcome,
    }, context(1))).toThrow(/이미 동물/);
    expect(() => transition(state, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: player.hand[0].id,
      hexId: "h00",
      useGoldenAcorn: false,
      welcome: dummyWelcome,
    }, context(1))).toThrow(/완성되지 않은/);
  });

  it("fails loudly when a valid transition cannot draw a required card", () => {
    expect(() => {
      let noAnimals = initial();
      noAnimals.animalDiscard.push(...noAnimals.animalDeck.splice(0));
      for (const player of noAnimals.players) {
        noAnimals = transition(noAnimals, player.seat, {
          type: "LOCK_TERRAIN_PICK",
          cardId: player.hand[0].id,
          hexId: "h00",
          refreshAnimalCardId: player.seat === 1 ? player.activeAnimals[0].id : undefined,
          useGoldenAcorn: false,
        }, context(10 + player.seat));
      }
    }).toThrow(/동물 덱/);

    const noTerrain = initial();
    noTerrain.terrainDiscard.push(...noTerrain.terrainDeck.splice(0));
    noTerrain.phase = "SEASON_REVEAL";
    noTerrain.phaseKey = "connected-forest:0:reveal";
    noTerrain.phaseEndsAt = 1;
    expect(() => advanceTimedState(noTerrain, context(1))).toThrow(/지형 덱/);
  });

  it("auto-plays all deadlines, skips empty visit phases, and finishes with four empty hexes", () => {
    const state = advanceTimedState(initial(), context(2_000_000));
    expect(state.phase).toBe("GAME_OVER");
    expect(state.result?.forfeited).toBe(false);
    expect(state.result?.scores).toHaveLength(4);
    expect(state.terrainDeck).toHaveLength(0);
    expect(state.terrainDiscard).toHaveLength(60);
    for (const player of state.players) {
      expect(player.board.filter((cell) => cell.terrain || cell.acornTerrain)).toHaveLength(15);
      expect(player.board.filter((cell) => !cell.terrain && !cell.acornTerrain)).toHaveLength(4);
    }
    expect(advanceTimedState(state, context(3_000_000))).toEqual(state);
  });

  it("lets a resident visit and stay on a compatible empty figure slot", () => {
    let state = visitSelectionFixture();
    const resident = installResident(state.players[0], state.players[0].activeAnimals[0]);
    state.players[1].board.find((cell) => cell.hexId === "h00")!.terrain = resident.speciesId === "squirrel"
      ? "TREE"
      : state.players[0].activeAnimals[0]?.visitorTerrain ?? "TREE";

    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: resident.animalCardId,
      targetSeat: 2,
    }, context(100));
    expect(state.phase).toBe("SEASON_VISIT_RESPOND");
    const visit = state.visitQueues[2].visits[0];
    expect(legalActions(state, 2, connectedSeats)).toEqual(["RESOLVE_VISIT"]);
    expect(() => transition(state, 2, {
      type: "RESOLVE_VISIT",
      visitId: visit.visitId,
      choice: "STAY",
    }, context(105))).toThrow(/머물 수 없는/);
    state = transition(state, 2, {
      type: "RESOLVE_VISIT",
      visitId: visit.visitId,
      choice: "STAY",
      targetHexId: "h00",
    }, context(110));
    expect(state.phase).toBe("SEASON_REVEAL");
    expect(state.players[0].leaves).toBe(1);
    expect(state.players[1].figures).toEqual([
      expect.objectContaining({ kind: "VISITOR", visitId: "v-0-1" }),
    ]);
  });

  it("resolves opposing visits deterministically when one walk fills their shared path", () => {
    let state = visitSelectionFixture();
    const first = installResident(state.players[0], state.players[0].activeAnimals[0]);
    const second = installResident(state.players[1], state.players[1].activeAnimals[0]);
    state.visitSelections = { 3: "NONE", 4: "NONE" };
    state.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)!.length = 2;

    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: first.animalCardId,
      targetSeat: 2,
    }, context(100));
    expect(legalActions(state, 2, connectedSeats)).toEqual(["CHOOSE_SEASON_VISIT"]);
    expect(() => transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: first.animalCardId,
      targetSeat: 2,
    }, context(105))).toThrow(/이미/);
    state = transition(state, 2, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: second.animalCardId,
      targetSeat: 1,
    }, context(110));
    expect(state.phase).toBe("SEASON_VISIT_RESPOND");
    const visitToOne = state.visitQueues[1].visits[0];
    expect(() => transition(state, 1, {
      type: "RESOLVE_VISIT",
      visitId: "wrong",
      choice: "WALK",
    }, context(115))).toThrow(/현재 응답/);
    state = transition(state, 1, {
      type: "RESOLVE_VISIT",
      visitId: visitToOne.visitId,
      choice: "WALK",
    }, context(120));
    expect(state.phase).toBe("SEASON_REVEAL");
    expect(state.seasonVisitResults.map((result) => result.choice).sort()).toEqual([
      "FAREWELL",
      "WALK",
    ]);
    expect(state.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)?.length)
      .toBe(3);
  });

  it("auto-selects and auto-resolves visits at their independent deadlines", () => {
    let state = visitSelectionFixture();
    installResident(state.players[0], state.players[0].activeAnimals[0]);
    state = advanceTimedState(state, context(30_000));
    expect(state.phase).toBe("SEASON_VISIT_RESPOND");
    const deadline = state.visitQueues[2]?.currentDeadlineAt ?? state.visitQueues[4].currentDeadlineAt;
    state = advanceTimedState(state, context(deadline));
    expect(state.phase).toBe("SEASON_REVEAL");
    expect(state.seasonVisitResults).toHaveLength(1);
  });

  it("auto-selects the lexicographically first of multiple unvisited residents", () => {
    let state = visitSelectionFixture();
    const player = state.players[0];
    const first = installResident(player, player.activeAnimals[0]);
    const second = installResident(player, player.activeAnimals[0], "h01");
    state = advanceTimedState(state, context(30_000));
    const visit = Object.values(state.visitQueues).flatMap((queue) => queue.visits)[0];
    expect(visit.animalCardId).toBe([first.animalCardId, second.animalCardId].sort()[0]);
  });

  it("recovers an empty visit-selection phase by revealing immediately", () => {
    const state = visitSelectionFixture();
    state.visitSelections = { 1: "NONE", 2: "NONE", 3: "NONE", 4: "NONE" };
    const revealed = advanceTimedState(state, context(30_000));
    expect(revealed.phase).toBe("SEASON_REVEAL");
  });

  it("rejects a visit selection whose resident disappeared before queue creation", () => {
    const state = visitSelectionFixture();
    state.visitSelections = {
      1: {
        visitId: "v-0-1",
        animalCardId: "squirrel-line3",
        speciesId: "squirrel",
        visitorTerrain: "TREE",
        sourceSeat: 1,
        targetSeat: 2,
      },
      2: "NONE",
      3: "NONE",
      4: "NONE",
    };
    expect(() => advanceTimedState(state, context(30_000))).toThrow(/주민/);
  });

  it.each([
    { mode: "STAY", receiverTerrain: true, fullPath: false },
    { mode: "WALK", receiverTerrain: false, fullPath: false },
    { mode: "FAREWELL", receiverTerrain: false, fullPath: true },
  ] as const)("uses the $mode deadline fallback when visit options change", ({
    mode,
    receiverTerrain,
    fullPath,
  }) => {
    let state = visitSelectionFixture();
    const resident = installResident(state.players[0], state.players[0].activeAnimals[0]);
    if (receiverTerrain) {
      state.players[1].board.find((cell) => cell.hexId === "h00")!.terrain =
        state.players[0].figures[0].speciesId === "squirrel" ? "TREE" : "MUSHROOM";
    }
    if (fullPath) {
      state.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)!.length = 3;
    }
    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: resident.animalCardId,
      targetSeat: 2,
    }, context(100));
    if (mode === "FAREWELL") {
      expect(state.phase).toBe("SEASON_REVEAL");
      expect(state.phaseEndsAt).toBe(1900);
    } else {
      const deadline = state.visitQueues[2].currentDeadlineAt;
      state = advanceTimedState(state, context(deadline));
    }
    expect(state.seasonVisitResults[0].choice).toBe(mode);
  });

  it("advances two incoming visits sequentially and preserves independent queue clocks", () => {
    let state = visitSelectionFixture();
    const first = installResident(state.players[0], state.players[0].activeAnimals[0]);
    const third = installResident(state.players[2], state.players[2].activeAnimals[0]);
    state.visitSelections = { 2: "NONE", 4: "NONE" };
    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: first.animalCardId,
      targetSeat: 2,
    }, context(100));
    state = transition(state, 3, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: third.animalCardId,
      targetSeat: 2,
    }, context(110));
    expect(state.visitQueues[2].visits).toHaveLength(2);
    const firstVisit = state.visitQueues[2].visits[0];
    state = transition(state, 2, {
      type: "RESOLVE_VISIT",
      visitId: firstVisit.visitId,
      choice: "WALK",
    }, context(120));
    expect(state.visitQueues[2]).toMatchObject({
      currentIndex: 1,
      currentDeadlineAt: 20_120,
    });
  });

  it("orders simultaneous expired receiver queues and shifts their deadlines across a pause", () => {
    let state = visitSelectionFixture();
    const first = installResident(state.players[0], state.players[0].activeAnimals[0]);
    const second = installResident(state.players[1], state.players[1].activeAnimals[0]);
    state.visitSelections = { 3: "NONE", 4: "NONE" };
    state = transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: first.animalCardId,
      targetSeat: 2,
    }, context(100));
    state = transition(state, 2, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: second.animalCardId,
      targetSeat: 1,
    }, context(110));
    const deadline = state.visitQueues[1].currentDeadlineAt;
    const paused = advanceTimedState(state, context(1_000, [2, 3, 4]));
    const resumed = advanceTimedState(paused, context(2_000));
    expect(resumed.visitQueues[1].currentDeadlineAt).toBe(deadline + 1_000);
    const finished = advanceTimedState(resumed, context(deadline + 1_000));
    expect(finished.phase).toBe("SEASON_REVEAL");

    let staggered = structuredClone(state);
    staggered.visitQueues[1].currentDeadlineAt = 100;
    staggered.visitQueues[2].currentDeadlineAt = 200;
    staggered = advanceTimedState(staggered, context(200));
    expect(staggered.phase).toBe("SEASON_REVEAL");
  });

  it("pauses all deadlines, resumes with their offsets, and permits a delayed forfeit", () => {
    const active = initial();
    const paused = advanceTimedState(active, context(1_000, [1, 2, 3]));
    expect(paused.pause).toEqual({
      disconnectedSeats: [4],
      pausedAt: 1_000,
      forfeitClaimAt: 181_000,
    });
    expect(legalActions(paused, 1, [1, 2, 3])).toEqual(["CLAIM_FORFEIT"]);
    const moreDisconnected = advanceTimedState(paused, context(1_500, [1, 2]));
    expect(moreDisconnected.pause?.disconnectedSeats).toEqual([3, 4]);
    expect(() => transition(paused, 4, { type: "CLAIM_FORFEIT" }, context(181_000, [1, 2, 3])))
      .toThrow(/연결된/);
    expect(() => transition(paused, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: paused.players[0].hand[0].id,
      hexId: "h00",
      useGoldenAcorn: false,
    }, context(2_000, [1, 2, 3]))).toThrow(/일시정지/);
    expect(() => transition(paused, 1, { type: "CLAIM_FORFEIT" }, context(180_999, [1, 2, 3])))
      .toThrow(/3분/);

    const resumed = advanceTimedState(paused, context(2_000));
    expect(resumed.pause).toBeUndefined();
    expect(resumed.phaseEndsAt).toBe(active.phaseEndsAt! + 1_000);

    const forfeited = transition(paused, 1, { type: "CLAIM_FORFEIT" }, context(181_000, [1, 2, 3]));
    expect(forfeited).toMatchObject({ phase: "GAME_OVER", result: { forfeited: true } });
  });

  it("rejects invalid phases, players, cards, and visits", () => {
    const state = initial();
    expect(() => transition(state, 9, {
      type: "LOCK_TERRAIN_PICK",
      cardId: "missing",
      hexId: "h00",
      useGoldenAcorn: false,
    }, context(1))).toThrow(/플레이어/);
    expect(() => transition(state, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: "missing",
      hexId: "h00",
      useGoldenAcorn: false,
    }, context(1))).toThrow(/손에 없는/);
    expect(() => transition(state, 1, { type: "CLAIM_FORFEIT" }, context(1))).toThrow(/지금은/);
    expect(() => transition(state, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: "squirrel-line3",
      targetSeat: 2,
    }, context(1))).toThrow(/방문을 보낼/);
    expect(() => transition(state, 1, {
      type: "RESOLVE_VISIT",
      visitId: "none",
      choice: "WALK",
    }, context(1))).toThrow(/응답/);

    const selecting = visitSelectionFixture();
    installResident(selecting.players[0], selecting.players[0].activeAnimals[0]);
    expect(() => transition(selecting, 1, {
      type: "LOCK_TERRAIN_PICK",
      cardId: selecting.players[0].hand[0].id,
      hexId: "h01",
      useGoldenAcorn: false,
    }, context(1))).toThrow(/지형을 선택/);
    expect(() => transition(selecting, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: "tanuki-trail4",
      targetSeat: 3,
    }, context(1))).toThrow(/유효하지/);

    let response = visitSelectionFixture();
    const resident = installResident(response.players[0], response.players[0].activeAnimals[0]);
    response = transition(response, 1, {
      type: "CHOOSE_SEASON_VISIT",
      animalCardId: resident.animalCardId,
      targetSeat: 2,
    }, context(10));
    expect(() => transition(response, 2, {
      type: "RESOLVE_VISIT",
      visitId: response.visitQueues[2].visits[0].visitId,
      choice: "STAY",
      targetHexId: "h00",
    }, context(11))).toThrow(/머물 수 없/);
    response.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)!.length = 3;
    expect(() => transition(response, 2, {
      type: "RESOLVE_VISIT",
      visitId: response.visitQueues[2].visits[0].visitId,
      choice: "WALK",
    }, context(12))).toThrow(/더 이을 수 없/);
    expect(() => transition(response, 3, {
      type: "RESOLVE_VISIT",
      visitId: response.visitQueues[2].visits[0].visitId,
      choice: "WALK",
    }, context(13))).toThrow(/현재 응답/);
  });
});
