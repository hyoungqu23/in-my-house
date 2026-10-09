import { describe, expect, it } from "vitest";
import { createMatchSetup } from "./content";
import { advanceTimedState, createInitialState, legalActions, transition } from "./reducer";
import {
  assertConnectedForestState,
  forestNeighborSeats,
  forestVisitOptions,
  forestWelcomeChoices,
  legalForestPlacementHexIds,
  placeForestTerrain,
} from "./rules";
import { createSeededRandom } from "./simulator";
import type {
  ConnectedForestAction,
  ConnectedForestState,
  ForestResidentFigure,
} from "./types";

const randomChoice = <T>(values: readonly T[], random: () => number) =>
  values[Math.floor(random() * values.length)];

const draftAction = (
  state: ConnectedForestState,
  seat: number,
  random: () => number,
): ConnectedForestAction => {
  const player = state.players.find((candidate) => candidate.seat === seat)!;
  const card = randomChoice(player.hand, random);
  const hexId = randomChoice(legalForestPlacementHexIds(player), random);
  const preview = structuredClone(player);
  placeForestTerrain(preview, card, hexId);
  const welcome = random() < 0.5 && !player.welcomedThisSeason
    ? preview.activeAnimals.flatMap((animal) => forestWelcomeChoices(preview, animal))[0]
    : undefined;
  return {
    type: "LOCK_TERRAIN_PICK",
    cardId: card.id,
    hexId,
    useGoldenAcorn: false,
    welcome,
  };
};

const visitAction = (
  state: ConnectedForestState,
  seat: number,
  random: () => number,
): ConnectedForestAction => {
  const player = state.players.find((candidate) => candidate.seat === seat)!;
  const resident = randomChoice(
    player.figures.filter(
      (figure): figure is ForestResidentFigure => figure.kind === "RESIDENT" && !figure.visited,
    ),
    random,
  );
  return {
    type: "CHOOSE_SEASON_VISIT",
    animalCardId: resident.animalCardId,
    targetSeat: randomChoice(forestNeighborSeats(state, seat), random),
  };
};

const responseAction = (
  state: ConnectedForestState,
  seat: number,
  random: () => number,
): ConnectedForestAction => {
  const queue = state.visitQueues[seat];
  const visit = queue.visits[queue.currentIndex];
  const options = forestVisitOptions(state, visit);
  const choices = [
    ...(options.stayHexIds.length > 0 ? ["STAY" as const] : []),
    ...(options.canWalk ? ["WALK" as const] : []),
  ];
  const choice = randomChoice(choices, random);
  return {
    type: "RESOLVE_VISIT",
    visitId: visit.visitId,
    choice,
    targetHexId: choice === "STAY" ? randomChoice(options.stayHexIds, random) : undefined,
  };
};

const playGeneratedGame = (seed: number) => {
  const random = createSeededRandom(seed);
  const playerCount = (4 + seed % 3) as 4 | 5 | 6;
  const seats = Array.from({ length: playerCount }, (_, index) => index + 1);
  const setup = createMatchSetup({
    seats,
    randomIndex: (maxExclusive) => Math.floor(random() * maxExclusive),
  });
  const roster = seats.map((seat) => ({ seat, userId: `u${seat}`, nickname: `P${seat}` }));
  const connectedSeats = [...seats];
  let now = 0;
  let state = createInitialState(roster, setup, now);
  const visitIds = new Set<string>();

  for (let guard = 0; guard < 500 && state.phase !== "GAME_OVER"; guard += 1) {
    const actors = seats.filter((seat) => legalActions(state, seat, connectedSeats).length > 0);
    if (actors.length === 0) {
      now = state.phaseEndsAt ?? Math.min(
        ...Object.values(state.visitQueues).map((queue) => queue.currentDeadlineAt),
      );
      state = advanceTimedState(state, { now, connectedSeats });
    } else {
      const seat = randomChoice(actors, random);
      const action = state.phase === "SEASON_DRAFT"
        ? draftAction(state, seat, random)
        : state.phase === "SEASON_VISIT_SELECT"
          ? visitAction(state, seat, random)
          : responseAction(state, seat, random);
      now += 1;
      state = transition(state, seat, action, { now, connectedSeats });
    }
    assertConnectedForestState(state);
    for (const result of state.seasonVisitResults) {
      expect(visitIds.has(result.visitId), `duplicate visit ${result.visitId} at seed ${seed}`).toBe(false);
      visitIds.add(result.visitId);
    }
    state.seasonVisitResults = [];
  }

  expect(state.phase, `seed ${seed} did not finish`).toBe("GAME_OVER");
  expect(state.terrainDeck).toHaveLength(0);
  expect(state.terrainDiscard).toHaveLength(playerCount * 15);
  for (const player of state.players) {
    expect(player.board.filter((cell) => cell.terrain || cell.acornTerrain)).toHaveLength(15);
    expect(player.board.filter((cell) => !cell.terrain && !cell.acornTerrain)).toHaveLength(4);
    expect(player.leavesFromPaths).toBeLessThanOrEqual(player.leaves);
  }
};

describe("connected forest generated state sequences", () => {
  it("preserves all invariants through 200 deterministic complete games", () => {
    for (let seed = 1; seed <= 200; seed += 1) playGeneratedGame(seed);
  }, 30_000);
});
