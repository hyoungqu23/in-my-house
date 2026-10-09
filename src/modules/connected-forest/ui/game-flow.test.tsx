// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomClient } from "@/modules/room/ui/room-client";
import { RoomApiError, roomApiFetch } from "@/modules/room/client/room-api";
import type { ActionRequest } from "@/modules/room/contracts";
import { createMatchSetup } from "../domain/content";
import { createInitialState, transition } from "../domain/reducer";
import type { ConnectedForestAction, ConnectedForestState } from "../domain/types";
import { projectPlayer, projectPublic } from "../projection/game-view";

vi.mock("@/modules/room/client/room-api", async (original) => ({ ...await original<typeof import("@/modules/room/client/room-api")>(), roomApiFetch: vi.fn() }));
vi.mock("@/modules/auth/client", () => ({ getAuthHeaders: async () => ({}), getBrowserSupabase: () => undefined }));
vi.mock("@/shared/ui/qr-code", () => ({ QrCode: () => null }));

const api = vi.mocked(roomApiFetch);
const context = { code: "ABC234", version: 1, now: 100000, status: "playing" as const, hostUserId: "u1", viewerUserId: "u1", connectedSeats: [1, 2, 3, 4], matchId: "match-one" };
let state: ConnectedForestState;
let requests: ActionRequest[];
let stale: "NONE" | "SAME_PICK" | "NEXT_PICK" | "NEXT_MATCH";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  // Use jsdom's browser storage, not Node's optional native localStorage.
  window.localStorage.clear();
  context.version = 1;
  context.matchId = "match-one";
  requests = [];
  stale = "NONE";
  state = createInitialState([1, 2, 3, 4].map((seat) => ({ seat, userId: `u${seat}`, nickname: `숲친구${seat}` })), createMatchSetup({ seats: [1, 2, 3, 4], randomIndex: () => 0 }), context.now);
  api.mockImplementation(async (path, init) => {
    if (path.includes("/actions")) {
      const request = JSON.parse(String(init?.body)) as ActionRequest;
      requests.push(request);
      if (stale !== "NONE") {
        context.version += 1;
        if (stale === "NEXT_PICK") state.phaseKey = "connected-forest:0:1";
        if (stale === "NEXT_MATCH") {
          context.matchId = "match-two";
          state = createInitialState([1, 2, 3, 4].map((seat) => ({ seat, userId: `u${seat}`, nickname: `숲친구${seat}` })), createMatchSetup({ seats: [1, 2, 3, 4], rulesVersion: state.rulesVersion, randomIndex: () => 0 }), context.now);
        }
        stale = "NONE";
        throw new RoomApiError("STALE_VERSION", 409, "게임 상태가 바뀌었습니다.");
      }
      state = transition(state, 1, request.action as ConnectedForestAction, { now: context.now, connectedSeats: context.connectedSeats });
      context.version += 1;
      return { projection: projectPlayer(state, context) };
    }
    return path.includes("mode=public") ? projectPublic(state, context) : projectPlayer(state, context);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const click = async (name: string | RegExp) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };
const mount = async () => { await act(async () => { render(<RoomClient code="ABC234" />); }); };
async function draftPick() {
  await click(/지형 카드 1/);
  await click("숲 칸 1 · 빈칸");
}

describe("forest player interaction and recovery", () => {
  it("preserves an unsent choice across public mode and inactivity and removes secrets from public DOM", async () => {
    await mount();
    await draftPick();
    await click("공개 화면");
    expect(screen.queryByRole("region", { name: "내 지형 카드" })).toBeNull();
    expect(screen.queryByRole("button", { name: /지형 카드 1/ })).toBeNull();
    await click("내 화면");
    expect(screen.getByRole("button", { name: /지형 카드 1/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "선택 잠그기" }).hasAttribute("disabled")).toBe(false);
    await act(async () => { vi.advanceTimersByTime(16000); });
    expect(screen.queryByRole("region", { name: "내 지형 카드" })).toBeNull();
    await click("내 화면");
    expect(screen.getByRole("button", { name: /지형 카드 1/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("retries concurrent locks with the same action ID and payload using only the new room version", async () => {
    await mount();
    await draftPick();
    stale = "SAME_PICK";
    await click("선택 잠그기");
    expect(requests).toHaveLength(2);
    expect(requests[1].clientActionId).toBe(requests[0].clientActionId);
    expect(requests[1].action).toEqual(requests[0].action);
    expect(requests.map((request) => request.expectedVersion)).toEqual([1, 2]);
    expect(screen.getByText("선택을 잠갔어요. 다른 친구들이 고르면 함께 놓습니다.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not replay a timed-out pick into the next pick", async () => {
    await mount();
    await draftPick();
    stale = "NEXT_PICK";
    await click("선택 잠그기");
    expect(requests).toHaveLength(1);
    expect(state.draftSubmissions[1]).toBeUndefined();
    expect(screen.getByRole("alert").textContent).toContain("상태가 바뀌");
    expect(screen.getByRole("button", { name: "선택 잠그기" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not retry an old pick into a rematch with the same domain phase key and card IDs", async () => {
    await mount();
    await draftPick();
    const oldPhaseKey = state.phaseKey;
    const oldCardIds = state.players[0].hand.map((card) => card.id);
    stale = "NEXT_MATCH";
    await click("선택 잠그기");
    expect(state.phaseKey).toBe(oldPhaseKey);
    expect(state.players[0].hand.map((card) => card.id)).toEqual(oldCardIds);
    expect(context.matchId).toBe("match-two");
    expect(requests).toHaveLength(1);
    expect(state.draftSubmissions[1]).toBeUndefined();
    expect(screen.getByRole("alert").textContent).toContain("상태가 바뀌");
  });

  it("clears an unsent draft when polling a rematch even if cards and counters repeat", async () => {
    await mount();
    await draftPick();
    context.matchId = "match-two";
    context.version += 1;
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole("button", { name: /지형 카드 1/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "선택 잠그기" }).hasAttribute("disabled")).toBe(true);
  });

  it("enables only a legal visit choice and sends the recipient's visit ID", async () => {
    state.phase = "SEASON_VISIT_RESPOND";
    state.phaseEndsAt = undefined;
    state.players[0].board[0].terrain = "TREE";
    state.neighborPaths.find((path) => path.lowSeat === 1 && path.highSeat === 2)!.length = 3;
    state.visitQueues = { 1: { visits: [{ visitId: "current-visit", animalCardId: "squirrel-line3", speciesId: "squirrel", visitorTerrain: "TREE", sourceSeat: 2, targetSeat: 1 }], currentIndex: 0, currentDeadlineAt: 120000 } };
    await mount();
    expect(screen.getByRole("button", { name: /함께 산책하기/ }).hasAttribute("disabled")).toBe(true);
    await click(/우리 숲에 머물기/);
    expect(requests[0].action).toEqual({ type: "RESOLVE_VISIT", visitId: "current-visit", choice: "STAY", targetHexId: "h00" });
    expect(state.players[0].figures[0].kind).toBe("VISITOR");
  });
});
