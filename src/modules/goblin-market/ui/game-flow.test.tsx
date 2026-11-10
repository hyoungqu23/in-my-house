// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMarketState } from "../domain/reducer";
import { projectMarketPlayer } from "../projection/game-view";
import { GoblinMarketPlayerControls } from "./player-controls";
import { GoblinMarketPublicBoard } from "./public-board";
import type { MarketRulesVersion } from "../domain/types";

afterEach(cleanup);
function view(version: MarketRulesVersion = "mvp-1") {
  const state=createMarketState([1,2,3].map(seat=>({seat,userId:`u${seat}`,nickname:`상인${seat}`})),"ui-match",{now:1000,randomIndex:()=>0},version);
  state.order=[1,2,3];state.turnIndex=0;state.night=2;state.phase="MARKET_DUEL";
  for(const shop of state.shops)shop.ownerSeat=shop.tile===1?2:shop.tile===4?1:3;
  const pool=[...state.deck,...state.players.flatMap(player=>player.hand)];state.players.forEach(player=>player.hand=[]);
  state.players[0].hand=[pool.splice(pool.findIndex(card=>card.kind==="C"),1)[0],pool.splice(pool.findIndex(card=>card.kind==="W"),1)[0]];state.deck=pool;
  state.duel={visitorSeat:1,ownerSeat:2,tile:1,originalRent:5,choices:{}};
  return projectMarketPlayer(state,{code:"MARKET",version:3,now:1001,status:"playing",hostUserId:"u1",viewerUserId:"u1",connectedSeats:[1,2,3]});
}
it("selects a same-level shop and sends a locked contract with the current phase key",()=>{
  const current=view(),onAction=vi.fn();render(<GoblinMarketPlayerControls view={current} busy={false} onAction={onAction}/>);
  const contract=screen.getByRole("button",{name:"둔갑 계약 · 방문객"});
  fireEvent.click(contract);
  expect(screen.getByRole("combobox",{name:/바꿔줄 내 가게/})).toBeTruthy();
  expect(screen.getByText(/성공하면 이전 점주에게 3엽전 정산/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"이 장난 확정하기"}));
  expect(onAction).toHaveBeenCalledWith({type:"MARKET_DUEL",phaseKey:current.phaseKey,cardId:current.self.hand[0].id,targetTile:4});
  expect(screen.getByRole("button",{name:"부적 · 점주"}).hasAttribute("disabled")).toBe(true);
});
it("restores my confirmed choice without allowing a second submission",()=>{
  const current=view();current.self.choice={cardId:current.self.hand[0].id,targetTile:4};current.self.legalActions=[];
  render(<GoblinMarketPlayerControls view={current} busy={false} onAction={vi.fn()}/>);
  expect(screen.getByText("선택을 확정했어요")).toBeTruthy();expect(screen.queryByRole("button",{name:"이 장난 확정하기"})).toBeNull();
});
it("keeps a liquidation control available after revealing the duel",()=>{
  const current=view();current.phase="MARKET_SETTLE";current.self.legalActions=["MARKET_SELL"];current.self.choice=undefined;
  current.payment={fromSeat:1,toSeat:2,due:6};current.shops.find(shop=>shop.tile===7)!.ownerSeat=1;
  const onAction=vi.fn();render(<GoblinMarketPlayerControls view={current} busy={false} onAction={onAction}/>);
  fireEvent.click(screen.getByRole("button",{name:/도깨비 대장간 매각/}));
  expect(onAction).toHaveBeenCalledWith({type:"MARKET_SELL",phaseKey:current.phaseKey,tile:4});
});
it("renders all twenty tiles and shared winners without rendering private cards",()=>{
  const current=view();current.phase="GAME_OVER";current.result={winnerSeats:[1,2],scores:[{seat:1,cash:20,shops:1,total:26},{seat:2,cash:20,shops:1,total:26},{seat:3,cash:10,shops:1,total:16}]};
  render(<GoblinMarketPublicBoard view={current}/>);
  const board=screen.getByRole("group",{name:"20칸 야시장 보드"});expect(board.querySelectorAll('[aria-label*="번 "]')).toHaveLength(20);
  expect(screen.getByRole("heading",{name:"상인1 · 상인2 공동 우승!"})).toBeTruthy();expect(screen.queryByRole("region",{name:"내 비밀 장난 카드"})).toBeNull();
});
it("renders all twenty-eight expanded tiles and the twelve-night progress",()=>{
  const current=view("mvp-2");render(<GoblinMarketPublicBoard view={current}/>);
  const board=screen.getByRole("group",{name:"28칸 야시장 보드"});
  expect(board.querySelectorAll('[aria-label*="번 "]')).toHaveLength(28);
  expect(board.style.getPropertyValue("--board-side")).toBe("8");
  expect(screen.getByLabelText("2번째 밤, 총 열두 밤").children).toHaveLength(12);
  expect(screen.getByText("반딧불 놀이방")).toBeTruthy();
  expect(screen.getAllByText("만물장터")).toHaveLength(2);
  expect(screen.getAllByText("도깨비 지름길")).toHaveLength(2);
});
