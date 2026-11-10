import { expect, it } from "vitest";
import { createMarketState, transitionMarket } from "../domain/reducer";
import { projectMarketPlayer, projectMarketPublic } from "./game-view";

const context={code:"MARKET",version:4,now:1001,status:"playing" as const,hostUserId:"u1",viewerUserId:"u1",connectedSeats:[1,2,3]};
const roster=[1,2,3].map(seat=>({seat,userId:`u${seat}`,nickname:`상인${seat}`}));
function fixture() {
  const state=createMarketState(roster,"private-match",{now:1000,randomIndex:()=>0},"mvp-1");
  state.order=[1,2,3];state.night=2;state.phase="MARKET_DUEL";state.phaseEndsAt=9000;
  for(const shop of state.shops)shop.ownerSeat=shop.tile===1?2:shop.tile===4?1:3;
  const pool=[...state.deck,...state.players.flatMap(player=>player.hand)];state.players.forEach(player=>player.hand=[]);
  const contract=pool.splice(pool.findIndex(card=>card.kind==="C"),1)[0],ward=pool.splice(pool.findIndex(card=>card.kind==="W"),1)[0];
  state.players[0].hand=[contract];state.players[1].hand=[ward];state.deck=pool;
  state.duel={visitorSeat:1,ownerSeat:2,tile:1,originalRent:3,choices:{}};
  return state;
}
it("whitelists display information and reveals only today's and tomorrow's trends",()=>{
  const state=fixture();state.duel!.choices[1]={cardId:state.players[0].hand[0].id,targetTile:4};
  const pub=projectMarketPublic(state,{...context,viewerUserId:undefined,display:true});
  expect(pub.duel?.committedSeats).toEqual([1]);expect(pub.trend).toBe(state.trends[1]);expect(pub.nextTrend).toBe(state.trends[2]);
  const encoded=JSON.stringify(pub);
  for(const field of ['"hand":','"deck":','"trends":','"choices":','"cardId":','"targetTile":','"userId":'])expect(encoded).not.toContain(field);
  for(const card of [...state.deck,...state.players.flatMap(player=>player.hand)])expect(encoded).not.toContain(card.id);
  expect(pub.viewer.roles).toEqual(["DISPLAY"]);expect(pub.viewer.legalAdministrativeActions).toEqual([]);
});
it("restores only my committed choice and never reads the opponent's hidden choice for legal options",()=>{
  const state=fixture(),before=projectMarketPlayer(state,context);
  state.duel!.choices[2]={cardId:state.players[1].hand[0].id};
  expect(projectMarketPlayer(state,context).self).toEqual(before.self);
  const committed=transitionMarket(state,1,{type:"MARKET_DUEL",phaseKey:state.phaseKey,cardId:state.players[0].hand[0].id,targetTile:4},{now:1001,randomIndex:()=>0});
  expect(projectMarketPlayer(committed,context).lastDuel?.visitorCard).toBe("C");
  const pending=fixture();pending.duel!.choices[1]={cardId:pending.players[0].hand[0].id,targetTile:4};
  const restored=projectMarketPlayer(pending,context),other=projectMarketPlayer(pending,{...context,viewerUserId:"u2"});
  expect(restored.self.choice?.targetTile).toBe(4);expect(restored.self.legalActions).toEqual([]);
  expect(other.self.choice).toBeUndefined();expect(other.self.hand).toEqual(pending.players[1].hand);
  expect(JSON.stringify(other)).not.toContain(pending.players[0].hand[0].id);
  expect(()=>projectMarketPlayer(pending,{...context,viewerUserId:"intruder"})).toThrow(/player viewer/);
});
it("does not return mutable references to the persisted game",()=>{
  const state=fixture(),view=projectMarketPlayer(state,context);
  view.self.hand[0].kind="H";view.players[0].cash=999;view.shops[0].ownerSeat=99;view.order.reverse();
  expect(state.players[0].hand[0].kind).toBe("C");expect(state.players[0].cash).toBe(19);expect(state.shops[0].ownerSeat).toBe(2);expect(state.order).toEqual([1,2,3]);
});
