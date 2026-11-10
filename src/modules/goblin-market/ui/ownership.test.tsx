// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMarketState } from "../domain/reducer";
import { projectMarketPlayer } from "../projection/game-view";
import { GoblinMarketPlayerControls } from "./player-controls";
import { GoblinMarketPublicBoard } from "./public-board";

const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, "animate", animateDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
});
function sample() {
  const state = createMarketState([2, 5, 8, 11].map(seat => ({ seat, userId: `u${seat}`, nickname: `상인${seat}` })), "ownership", { now: 1000, randomIndex: () => 0 });
  state.shops.forEach(shop => { shop.ownerSeat = null; shop.level = 0; });
  state.shops[0].ownerSeat = 5;
  state.players[0].position = 1;
  state.phaseEndsAt = undefined;
  return projectMarketPlayer(state, { code: "STYLE", version: 1, now: 1000, status: "playing", hostUserId: "u2", viewerUserId: "u2", connectedSeats: [2, 5, 8, 11] });
}
function mockAnimation() {
  const animate = vi.fn(() => ({ cancel: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  return animate;
}
it("uses the owner's merchant identity regardless of visitors or the nightly turn order", () => {
  const current = sample();
  current.order = [11, 8, 5, 2];
  render(<GoblinMarketPublicBoard view={current}/>);
  const tile = screen.getByLabelText(/1번 달토끼 떡집/);
  expect(tile.querySelector("[data-merchant]")?.getAttribute("data-merchant")).toBe("fox");
  expect(tile.getAttribute("aria-label")).toContain("상인5의 노점");
  expect(screen.getByLabelText("상인2의 말")).toBeTruthy();
  expect(screen.getByLabelText(/2번 도깨비 대장간/).querySelector("[data-merchant]")).toBeNull();
});
it("animates ownership changes once, retains the board between phases, and resets the action selection", () => {
  const animate = mockAnimation(), current = sample();
  current.phase = "MARKET_DISCARD"; current.self.legalActions = ["MARKET_DISCARD"];
  const { rerender } = render(<GoblinMarketPlayerControls view={current} busy={false} onAction={vi.fn()}/>);
  const board = screen.getByRole("group", { name: "28칸 야시장 보드" });
  const card = screen.getByRole("region", { name: "내 비밀 장난 카드" }).querySelector("button")!;
  fireEvent.click(card); expect(card.getAttribute("aria-pressed")).toBe("true");
  expect(animate).not.toHaveBeenCalled();

  const next = structuredClone(current);
  next.phaseKey += ":next"; next.players[0].position = 2; next.shops[0].ownerSeat = 8;
  rerender(<GoblinMarketPlayerControls view={next} busy={false} onAction={vi.fn()}/>);
  expect(screen.getByRole("group", { name: "28칸 야시장 보드" })).toBe(board);
  expect(screen.getByLabelText(/1번 달토끼 떡집/).querySelector("[data-merchant]")?.getAttribute("data-merchant")).toBe("rabbit");
  expect(screen.getByRole("region", { name: "내 비밀 장난 카드" }).querySelector("button")?.getAttribute("aria-pressed")).toBe("false");
  expect(animate).toHaveBeenCalledTimes(2);
  rerender(<GoblinMarketPlayerControls view={{...next, room: {...next.room, version: 3}}} busy={false} onAction={vi.fn()}/>);
  expect(animate).toHaveBeenCalledTimes(2);

  const sold = structuredClone(next); sold.shops[0].ownerSeat = null;
  rerender(<GoblinMarketPlayerControls view={sold} busy={false} onAction={vi.fn()}/>);
  const vacant = screen.getByLabelText(/1번 달토끼 떡집/);
  expect(vacant.getAttribute("aria-label")).toContain("빈 가게");
  expect(vacant.querySelector("[data-merchant]")).toBeNull();
  expect(vacant.querySelector("[title$='간판']")).toBeNull();
});
it("updates the owner immediately without animations when reduced motion is requested", () => {
  const animate = mockAnimation();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const current = sample(), { rerender } = render(<GoblinMarketPublicBoard view={current}/>);
  const next = structuredClone(current); next.shops[0].ownerSeat = 11;
  rerender(<GoblinMarketPublicBoard view={next}/>);
  expect(screen.getByLabelText(/1번 달토끼 떡집/).querySelector("[data-merchant]")?.getAttribute("data-merchant")).toBe("ghost");
  expect(animate).not.toHaveBeenCalled();
});
