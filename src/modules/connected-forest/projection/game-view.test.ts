import { afterEach, describe, expect, it, vi } from "vitest";
import * as content from "../domain/content";
import { createMatchSetup } from "../domain/content";
import { createInitialState, transition } from "../domain/reducer";
import { projectPlayer, projectPublic } from "./game-view";

const roster = Array.from({ length: 4 }, (_, index) => ({ seat: index + 1, userId: `u${index + 1}`, nickname: `친구${index + 1}` }));
const context = { code: "FOREST", version: 1, now: 1000, status: "playing" as const, hostUserId: "u1", viewerUserId: "u1", connectedSeats: [1, 2, 3, 4] };
const initial = () => createInitialState(roster, createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0 }), 1000);
afterEach(() => vi.restoreAllMocks());

describe("connected forest privacy boundary", () => {
  it("scopes public and private phase keys to a match while preserving legacy views and state", () => {
    const state = initial();
    const firstContext = { ...context, matchId: "match-one" };
    const secondContext = { ...context, matchId: "match-two" };
    const first = projectPublic(state, firstContext);
    const second = projectPublic(state, secondContext);
    expect(first.phaseKey).not.toBe(second.phaseKey);
    expect(projectPlayer(state, firstContext).phaseKey).toBe(first.phaseKey);
    expect(projectPublic(state, context).phaseKey).toBe(state.phaseKey);
    expect(state.phaseKey).toBe("connected-forest:0:0");
  });
  it("publishes only applied boards and readiness, never decks, hands, animals or locked payloads", () => {
    const state = initial();
    const card = state.players[0].hand[0];
    const locked = transition(state, 1, { type: "LOCK_TERRAIN_PICK", cardId: card.id, hexId: "h00", useGoldenAcorn: true, acornTerrain: "TREE", refreshAnimalCardId: state.players[0].activeAnimals[0].id }, { now: 1001, connectedSeats: context.connectedSeats });
    const views = [projectPublic(locked, context), projectPublic(locked, { ...context, viewerUserId: undefined, display: true }), projectPlayer(locked, { ...context, viewerUserId: "u2" })];
    for (const view of views) {
      const text = JSON.stringify(view);
      expect(text).not.toContain(card.id);
      for (const animal of locked.players[0].activeAnimals) expect(text).not.toContain(animal.id);
      for (const key of ["draftSubmissions", "terrainDeck", "animalDeck", "visitSelections", "userId", "submittedAt"]) expect(text).not.toContain(`"${key}"`);
      expect(view.players[0].locked).toBe(true);
      expect(view.players[0].board.every((cell) => !cell.terrain && !cell.acornTerrain)).toBe(true);
    }
    const self = projectPlayer(locked, context);
    expect(self.self.lockedPick).toMatchObject({ cardId: card.id, hexId: "h00", useGoldenAcorn: true, acornTerrain: "TREE" });
    expect(self.self.legalActions).toEqual([]);
    expect(projectPublic(locked, { ...context, viewerUserId: undefined, display: true }).viewer.roles).toEqual(["DISPLAY"]);
  });

  it("reveals only the current recipient's visit and timer, and defers result timelines until reveal", () => {
    const state = initial();
    state.phase = "SEASON_VISIT_RESPOND";
    state.phaseEndsAt = undefined;
    const visits = [2, 3].map((targetSeat) => ({ visitId: `v-0-${targetSeat}`, animalCardId: "squirrel-bend3" as const, speciesId: "squirrel" as const, visitorTerrain: "TREE" as const, sourceSeat: 1, targetSeat }));
    state.visitQueues = Object.fromEntries(visits.map((visit) => [visit.targetSeat, { visits: [visit], currentIndex: 0, currentDeadlineAt: 2000 + visit.targetSeat * 1000 }]));
    state.seasonVisitResults = [{ ...visits[0], choice: "WALK" }];
    expect(projectPublic(state, context).seasonVisitResults).toEqual([]);
    const second = projectPlayer(state, { ...context, viewerUserId: "u2" });
    expect(second.self.currentVisit?.visitId).toBe("v-0-2");
    expect(second.self.respondEndsAt).toBe(new Date(4000).toISOString());
    expect(JSON.stringify(second)).not.toContain("v-0-3");
    expect(projectPlayer(state, context).self.currentVisit).toBeUndefined();
    state.phase = "SEASON_REVEAL";
    expect(projectPublic(state, context).seasonVisitResults).toHaveLength(1);
  });

  it("requires a player for private views and returns independent data copies", () => {
    const state = initial();
    expect(() => projectPlayer(state, { ...context, viewerUserId: "observer" })).toThrow(/player viewer/);
    const view = projectPlayer(state, context);
    view.self.hand[0].kind = "ROCK";
    view.players[0].board[0].terrain = "WATER";
    view.neighborPaths[0].length = 3;
    expect(state.players[0].hand[0].kind).not.toBe("ROCK");
    expect(state.players[0].board[0].terrain).toBeUndefined();
    expect(state.neighborPaths[0].length).toBe(0);
  });

  it("offers forfeiture only after three minutes to connected players, and rematches only to the host", () => {
    const state = initial();
    state.pause = { disconnectedSeats: [2], pausedAt: 1000, forfeitClaimAt: 181000 };
    expect(projectPlayer(state, { ...context, now: 180999 }).self.legalActions).toEqual([]);
    expect(projectPlayer(state, { ...context, now: 181000 }).self.legalActions).toEqual(["CLAIM_FORFEIT"]);
    expect(projectPlayer(state, { ...context, now: 181000, viewerUserId: "u2", connectedSeats: [1, 3, 4] }).self.legalActions).toEqual([]);
    state.phase = "GAME_OVER";
    state.pause = undefined;
    state.result = { forfeited: true };
    expect(projectPublic(state, context).viewer.legalAdministrativeActions).toEqual(["START_REMATCH"]);
    expect(projectPublic(state, { ...context, viewerUserId: "u2" }).viewer.legalAdministrativeActions).toEqual([]);
    expect(projectPublic(state, context).result?.winnerSeats).toBeUndefined();
  });
  it("projects permitted visit targets and the remaining new-species bonus without revealing history", () => {
    const base = content.connectedForestRules("prototype-1");
    vi.spyOn(content, "connectedForestRules").mockReturnValue({ ...base, stayReceiverHearts: 1, visitorDiversityHearts: 1, visitorDiversityCap: 2, visitRouting: "ALTERNATE" });
    const state = initial();
    state.visitLedger = [{ seasonIndex: 0, sourceSeat: 1, targetSeat: 2 }];
    expect(projectPlayer(state, context).self.visitTargetSeats).toEqual([4]);
    expect(JSON.stringify(projectPublic(state, context))).not.toContain("visitLedger");
    state.phase = "SEASON_VISIT_RESPOND";
    state.phaseEndsAt = undefined;
    state.visitQueues = { 1: { visits: [{ visitId: "v-1-2", animalCardId: "rabbit-line3", speciesId: "rabbit", visitorTerrain: "FLOWER", sourceSeat: 2, targetSeat: 1 }], currentIndex: 0, currentDeadlineAt: 20000 } };
    expect(projectPlayer(state, context).self.stayHearts).toBe(2);
    state.players[0].figures.push({ kind: "VISITOR", figureId: "a", visitId: "a", speciesId: "squirrel", hexId: "h00", sourceSeat: 2 }, { kind: "VISITOR", figureId: "b", visitId: "b", speciesId: "otter", hexId: "h01", sourceSeat: 4 });
    expect(projectPlayer(state, context).self.stayHearts).toBe(1);
  });
});
