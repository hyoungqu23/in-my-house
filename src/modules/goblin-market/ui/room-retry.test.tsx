// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoomClient } from "@/modules/room/ui/room-client";
import { RoomApiError, roomApiFetch } from "@/modules/room/client/room-api";
import { createMarketState, transitionMarket } from "../domain/reducer";
import { projectMarketPlayer, projectMarketPublic } from "../projection/game-view";
import type { ActionRequest, RoomView } from "@/modules/room/contracts";
import type { MarketAction } from "../domain/types";

vi.mock("@/modules/room/client/room-api",async original=>({...await original<typeof import("@/modules/room/client/room-api")>(),roomApiFetch:vi.fn()}));
vi.mock("@/modules/auth/client",()=>({getAuthHeaders:async()=>({}),getBrowserSupabase:()=>undefined}));
vi.mock("@/shared/ui/qr-code",()=>({QrCode:()=>null}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it("retries a simultaneous room-version conflict without losing the selected contract target",async()=>{
  const ctx={now:1001,randomIndex:()=>0};
  let state=createMarketState([1,2,3].map(seat=>({seat,userId:`u${seat}`,nickname:`상인${seat}`})),"retry-match",ctx);
  state.order=[1,2,3];state.turnIndex=0;state.night=2;state.phase="MARKET_DUEL";
  for(const shop of state.shops)shop.ownerSeat=shop.tile===1?2:shop.tile===4?1:3;
  const cards=[...state.deck,...state.players.flatMap(player=>player.hand)];state.players.forEach(player=>player.hand=[]);
  state.players[0].hand=[cards.splice(cards.findIndex(card=>card.kind==="C"),1)[0]];
  state.players[1].hand=[cards.splice(cards.findIndex(card=>card.kind==="M"),1)[0]];state.deck=cards;
  state.duel={visitorSeat:1,ownerSeat:2,tile:1,originalRent:3,choices:{}};
  const projection=(version:number)=>projectMarketPlayer(state,{code:"MARKET",version,now:1001,status:"playing",hostUserId:"u1",viewerUserId:"u1",connectedSeats:[1,2,3]});
  const requests:ActionRequest[]=[];let version=1;
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true}));
  vi.mocked(roomApiFetch).mockImplementation(async(path,init)=>{
    if(path.includes("/actions")) {
      const request=JSON.parse(String(init?.body)) as ActionRequest;requests.push(request);
      if(requests.length===1) {
        state=transitionMarket(state,2,{type:"MARKET_DUEL",phaseKey:state.phaseKey,cardId:state.players[1].hand[0].id},ctx);version=2;
        throw new RoomApiError("STALE_VERSION",409,"게임 상태가 바뀌었습니다.");
      }
      state=transitionMarket(state,1,request.action as MarketAction,ctx);version=3;
      return {projection:projection(version)};
    }
    return projection(version);
  });
  const contractId=state.players[0].hand[0].id;
  render(<RoomClient code="MARKET"/>);
  fireEvent.click(await screen.findByRole("button",{name:"둔갑 계약 · 방문객"}));
  fireEvent.click(screen.getByRole("button",{name:"이 장난 확정하기"}));
  await waitFor(()=>expect(requests).toHaveLength(2));
  expect(requests.map(request=>request.expectedVersion)).toEqual([1,2]);
  expect(requests[1].clientActionId).toBe(requests[0].clientActionId);
  expect(requests[1].action).toEqual({...requests[0].action,cardId:contractId,targetTile:4});
  await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());
  expect(state.lastDuel).toMatchObject({exchanged:true,due:2,paid:2});
});
it("does not replay a secret choice if the player switches public during the version refresh",async()=>{
  const state=createMarketState([1,2,3].map(seat=>({seat,userId:`u${seat}`,nickname:`상인${seat}`})),"hidden-retry",{now:1001,randomIndex:()=>0});
  const context={code:"MARKET",version:1,now:1001,status:"playing" as const,hostUserId:"u1",viewerUserId:"u1",connectedSeats:[1,2,3]};
  const requests:ActionRequest[]=[];
  let refresh=false,finishRefresh:((view:RoomView)=>void)|undefined;
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true}));
  vi.mocked(roomApiFetch).mockImplementation(async(path,init)=>{
    if(path.includes("/actions")) {
      requests.push(JSON.parse(String(init?.body)) as ActionRequest);refresh=true;
      throw new RoomApiError("STALE_VERSION",409,"게임 상태가 바뀌었습니다.");
    }
    if(path.includes("mode=public"))return projectMarketPublic(state,context);
    if(refresh)return new Promise<RoomView>(resolve=>{finishRefresh=resolve;});
    return projectMarketPlayer(state,context);
  });
  // A card discard is private input and uses the same retry lifecycle as a duel.
  state.phase="MARKET_DISCARD";state.discardQueue=[1];state.players[0].hand.push(state.deck.shift()!);
  render(<RoomClient code="MARKET"/>);
  const hand=await screen.findByRole("region",{name:"내 비밀 장난 카드"});
  fireEvent.click(hand.querySelector("button")!);
  fireEvent.click(screen.getByRole("button",{name:"이 카드 버리고 두 장 남기기"}));
  await waitFor(()=>expect(finishRefresh).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button",{name:"공개 화면",exact:true}));
  await waitFor(()=>expect(screen.queryByRole("region",{name:"내 비밀 장난 카드"})).toBeNull());
  await act(async()=>{finishRefresh!(projectMarketPlayer(state,{...context,version:2}));});
  expect(requests).toHaveLength(1);
  expect(screen.queryByRole("region",{name:"내 비밀 장난 카드"})).toBeNull();
});
