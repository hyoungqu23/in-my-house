// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInnSetup } from "@/modules/moonlit-inn/domain/content";
import { createInnState } from "@/modules/moonlit-inn/domain/reducer";
import type { InnAction } from "@/modules/moonlit-inn/domain/types";
import { projectInnPlayer } from "@/modules/moonlit-inn/projection/game-view";
import { RoomApiError, roomApiFetch } from "../client/room-api";
import type { ActionRequest, MoonlitInnPlayerRoomView, MoonlitInnPublicRoomView, RoomView } from "../contracts";
import { RoomClient } from "./room-client";

vi.mock("../client/room-api", async (original) => ({
  ...await original<typeof import("../client/room-api")>(),
  roomApiFetch: vi.fn(),
}));
vi.mock("@/modules/auth/client", () => ({
  getAuthHeaders: async () => ({}),
  getBrowserSupabase: () => undefined,
}));
vi.mock("@/shared/ui/qr-code", () => ({ QrCode: () => null }));
vi.mock("@/modules/moonlit-inn/ui/player-controls", () => ({
  MoonlitInnPlayerControls: ({ view, busy, onAction }: {
    view: MoonlitInnPlayerRoomView;
    busy: boolean;
    onAction: (action: InnAction) => void;
  }) => (
    <section>
      <h1>Private inn hand</h1>
      <button disabled={busy} onClick={() => onAction({
        type: "INN_PICK",
        phaseKey: view.phaseKey,
        revision: view.self.revision,
        bundleId: view.self.hand[0].id,
      })}>Pick bundle</button>
    </section>
  ),
}));
vi.mock("@/modules/moonlit-inn/ui/public-board", () => ({
  MoonlitInnPublicBoard: () => <h1>Public inn board</h1>,
}));

const api = vi.mocked(roomApiFetch);
const staleVersion = () => new RoomApiError("STALE_VERSION", 409, "다른 선택을 반영했습니다.");
const playerView = (): MoonlitInnPlayerRoomView => {
  const players = [1, 2, 3, 4].map((seat) => ({ seat, userId: `u${seat}`, nickname: `손님${seat}` }));
  const state = createInnState(players, createInnSetup("client-test-match", () => 0));
  return projectInnPlayer(state, {
    code: "ABC234", version: 1, now: 100_000, status: "playing",
    hostUserId: "u1", viewerUserId: "u1", connectedSeats: [1, 2, 3, 4],
  });
};
const publicView = (view: MoonlitInnPlayerRoomView): MoonlitInnPublicRoomView => {
  const result = { ...view, projection: "public" as const };
  Reflect.deleteProperty(result, "self");
  return result;
};
let current: MoonlitInnPlayerRoomView;
let requests: ActionRequest[];
let handleAction: (request: ActionRequest) => Promise<{ projection: RoomView }>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  localStorage.clear();
  current = playerView();
  requests = [];
  handleAction = async () => ({ projection: current });
  api.mockImplementation(async (path, init) => {
    if (path.includes("/actions")) {
      const request = JSON.parse(String(init?.body)) as ActionRequest;
      requests.push(request);
      return handleAction(request);
    }
    return path.includes("mode=public") ? publicView(current) : structuredClone(current);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const mount = async () => { await act(async () => { render(<RoomClient code="ABC234" />); }); };
const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const updateVersion = () => {
  current = { ...current, room: { ...current.room, version: current.room.version + 1 } };
};

describe("Moonlit Inn room requests", () => {
  it("retries a concurrent player update with the original action ID and own revision", async () => {
    handleAction = async () => {
      if (requests.length === 1) {
        updateVersion();
        throw staleVersion();
      }
      return { projection: current };
    };
    await mount();
    await click("Pick bundle");
    expect(requests.map((request) => request.expectedVersion)).toEqual([1, 2]);
    expect(requests[1].clientActionId).toBe(requests[0].clientActionId);
    expect(requests[1].action).toEqual(requests[0].action);
  });

  it.each(["revision", "phaseKey", "legalActions"] as const)("does not replay when its %s changes", async (field) => {
    handleAction = async () => {
      updateVersion();
      current = field === "revision"
        ? { ...current, self: { ...current.self, revision: current.self.revision + 1 } }
        : field === "phaseKey"
          ? { ...current, phaseKey: "next-phase" }
          : { ...current, self: { ...current.self, legalActions: [] } };
      throw staleVersion();
    };
    await mount();
    await click("Pick bundle");
    expect(requests).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("다른 선택을 반영했습니다.");
  });

  it("bounds stale-version retries to four attempts", async () => {
    handleAction = async () => { updateVersion(); throw staleVersion(); };
    await mount();
    await click("Pick bundle");
    expect(requests).toHaveLength(4);
    expect(new Set(requests.map((request) => request.clientActionId)).size).toBe(1);
  });

  it("keeps a late private poll hidden after selecting the public screen", async () => {
    await mount();
    let finish!: (view: RoomView) => void;
    api.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await tick(1_500);
    await click("공개 화면");
    await act(async () => { finish(playerView()); });
    expect(screen.getByRole("heading", { name: "Public inn board" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Private inn hand" })).toBeNull();
  });

  it.each(["manual", "inactivity"] as const)("keeps a late private action hidden after %s switches to public", async (reason) => {
    let finish!: (result: { projection: RoomView }) => void;
    handleAction = () => new Promise((resolve) => { finish = resolve; });
    await mount();
    await click("Pick bundle");
    if (reason === "manual") await click("공개 화면");
    else await tick(16_000);
    await act(async () => { finish({ projection: playerView() }); });
    expect(screen.getByRole("heading", { name: "Public inn board" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Private inn hand" })).toBeNull();
  });

  it("does not replay an action if the mode changes while refreshing its version", async () => {
    let finish!: (view: RoomView) => void;
    handleAction = async () => {
      api.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      throw staleVersion();
    };
    await mount();
    await click("Pick bundle");
    await click("공개 화면");
    await act(async () => { finish(playerView()); });
    expect(requests).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Public inn board" })).toBeTruthy();
  });
});
