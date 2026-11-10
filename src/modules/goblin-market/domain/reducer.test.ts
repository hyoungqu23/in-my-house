import { describe, expect, it } from "vitest";
import { z } from "zod";
import { marketActionSchemas } from "./action-schema";
import { advanceMarket, createMarketState, marketActingSeats, marketTurnSeat, transitionMarket } from "./reducer";
import { marketAssets, marketDuelFee, marketRefund, marketRent, ownedShops } from "./rules";
import type { MarketAction, MarketCardKind, MarketCommand, MarketContext, MarketState } from "./types";

export function seeded(seed: number) { return (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); }; }
export const roster = (count=3) => Array.from({length:count},(_,i)=>({seat:i+1,userId:`u${i+1}`,nickname:`상인${i+1}`}));
export const context = (seed=12): MarketContext => ({ now:1001,randomIndex:seeded(seed) });
export function initial(count=3) { return createMarketState(roster(count),"test-match",context(),"mvp-1"); }
export function duelFixture(visitor: MarketCardKind="C", owner: MarketCardKind="M") {
  const state=initial();
  state.night=2; state.order=[1,2,3];state.turnIndex=0;state.phase="MARKET_DUEL";state.phaseEndsAt=10000;
  for(const shop of state.shops) {shop.ownerSeat=null;shop.level=0;}
  Object.assign(state.shops.find(shop=>shop.tile===1)!,{ownerSeat:2,level:1});
  Object.assign(state.shops.find(shop=>shop.tile===4)!,{ownerSeat:1,level:1});
  Object.assign(state.shops.find(shop=>shop.tile===7)!,{ownerSeat:3,level:0});
  state.trends[1]="fortune";
  const pool=[...state.deck,...state.discard,...state.players.flatMap(player=>player.hand)];
  state.discard=[]; state.players.forEach(player=>{player.hand=[];player.cash=10;});
  state.players[0].position=1;
  state.players[0].hand=[pool.splice(pool.findIndex(card=>card.kind===visitor),1)[0]];
  state.players[1].hand=[pool.splice(pool.findIndex(card=>card.kind===owner),1)[0]];
  state.deck=pool;
  state.duel={visitorSeat:1,ownerSeat:2,tile:1,originalRent:marketRent(state,state.shops.find(shop=>shop.tile===1)!),choices:{}};
  return state;
}
const apply=(state:MarketState,seat:number,command:MarketCommand)=>transitionMarket(state,seat,{...command,phaseKey:state.phaseKey} as MarketAction,context());

describe("MVP setup and progression",()=>{
  it.each([3,4])("starts %i equal merchants with two balanced trend cycles and a common gate",count=>{
    const state=initial(count);
    expect(state.rulesVersion).toBe("mvp-1"); expect(state.players.map(player=>marketAssets(state,player))).toEqual(Array(count).fill(25));
    expect(new Set(state.players.map(player=>player.position)).size).toBe(1);
    expect([0,5,10,15]).toContain(state.players[0].position);
    expect(state.players.every(player=>player.hand.length===2 && ownedShops(state,player.seat).length===1)).toBe(true);
    expect(new Set(state.trends.slice(0,4)).size).toBe(4);expect(new Set(state.trends.slice(4)).size).toBe(4);
    expect([...state.order].sort()).toEqual(roster(count).map(player=>player.seat));
  });
  it("rejects invalid starts, foreign turns, expired actions and stale phase keys",()=>{
    expect(()=>initial(2)).toThrow(/3–4/); expect(()=>initial(5)).toThrow(/3–4/);
    const state=initial(),seat=marketTurnSeat(state);
    expect(()=>apply(state,state.players.find(player=>player.seat!==seat)!.seat,{type:"MARKET_ROLL"})).toThrow(/지금/);
    expect(()=>transitionMarket(state,seat,{type:"MARKET_ROLL",phaseKey:"old"},context())).toThrow(/바뀌/);
    expect(()=>transitionMarket(state,seat,{type:"MARKET_ROLL",phaseKey:state.phaseKey},{...context(),now:state.phaseEndsAt!})).toThrow(/바뀌/);
  });
  it("waives visits on night one and awards gate money only on real dice movement",()=>{
    const state=initial();state.order=[1,2,3];state.players[0].position=0;
    state.shops.find(shop=>shop.tile===2)!.ownerSeat=2;
    const next=transitionMarket(state,1,{type:"MARKET_ROLL",phaseKey:state.phaseKey},{now:1002,randomIndex:()=>0});
    expect(next.phase).not.toBe("MARKET_DUEL");expect(next.players[0].cash).toBe(19);
    state.players[0].position=18;
    const wrap=transitionMarket(state,1,{type:"MARKET_ROLL",phaseKey:state.phaseKey},{now:1002,randomIndex:()=>0});
    expect(wrap.players[0].position).toBe(0);expect(wrap.players[0].cash).toBe(21);
    state.phase="MARKET_PORTAL";state.players[0].position=10;
    const portal=apply(state,1,{type:"MARKET_PORTAL",tile:2});expect(portal.players[0].cash).toBe(19);
  });
  it("deals to everybody before trimming and never recycles a just-dealt discard in the same deal",()=>{
    const state=initial();state.order=[1,2,3];state.turnIndex=2;state.phase="MARKET_UPGRADE";
    state.deck=state.deck.slice(0,1);state.discard=[{id:"old-discard",kind:"W"}];
    const next=apply(state,3,{type:"MARKET_UPGRADE",tile:null});
    expect(next.night).toBe(2);expect(next.phase).toBe("MARKET_DISCARD");
    expect(next.players.map(player=>player.hand.length).sort()).toEqual([2,3,3]);expect(next.discardQueue).toHaveLength(2);
    expect(next.players.every(player=>player.cash===22)).toBe(true);
    expect(next.deck).toHaveLength(0);expect(next.discard).toHaveLength(0);
  });
  it("offers a card only when the remote market is sold out, and permits a just-bought shop upgrade",()=>{
    const state=initial();state.order=[1,2,3];state.players[0].position=3;
    for(const shop of state.shops) shop.ownerSeat=shop.ownerSeat??2;
    const full=transitionMarket(state,1,{type:"MARKET_ROLL",phaseKey:state.phaseKey},{now:1002,randomIndex:()=>0});
    expect(full.players[0].position).toBe(5);expect(full.phase).toBe("MARKET_DISCARD");expect(full.players[0].hand).toHaveLength(3);
    state.shops[0].ownerSeat=null;
    const buy=transitionMarket(state,1,{type:"MARKET_ROLL",phaseKey:state.phaseKey},{now:1002,randomIndex:()=>0});
    expect(buy.phase).toBe("MARKET_BUY");expect(buy.players[0].hand).toHaveLength(2);
    const purchased=apply(buy,1,{type:"MARKET_BUY",tile:1});expect(purchased.phase).toBe("MARKET_UPGRADE");
    const built=apply(purchased,1,{type:"MARKET_UPGRADE",tile:1});expect(built.shops.find(shop=>shop.tile===1)?.level).toBe(1);
    expect(built.players[0].cash).toBe(9);
  });
});

describe("secret cards and payment",()=>{
  it.each([["C","M",2,true],["C","W",4,false],["H","M",4,false],["H","W",2,false]] as const)("resolves %s against %s at original rent four",(visitor,owner,due,exchanged)=>{
    let state=duelFixture(visitor,owner);const original=structuredClone(state);
    state=apply(state,1,{type:"MARKET_DUEL",cardId:state.players[0].hand[0].id,...(visitor==="C"?{targetTile:4}:{})});
    expect(state.players[0].cash).toBe(10);expect(state.discard).toHaveLength(0);
    expect(()=>apply(state,1,{type:"MARKET_DUEL",cardId:null})).toThrow(/지금/);
    state=apply(state,2,{type:"MARKET_DUEL",cardId:state.players[1].hand[0].id});
    expect(state.lastDuel).toMatchObject({due,paid:due,exchanged,settled:true});expect(state.discard).toHaveLength(2);
    expect(state.players[0].cash).toBe(10-due);expect(state.players[1].cash).toBe(10+due);
    expect(state.shops.find(shop=>shop.tile===1)?.ownerSeat).toBe(exchanged?1:2);
    expect(state.shops.find(shop=>shop.tile===4)?.ownerSeat).toBe(exchanged?2:1);
    expect(original.players[0].cash).toBe(10);expect(original.duel?.choices).toEqual({});
  });
  it("rounds up odd contract rent and preserves a committed card when the opponent times out",()=>{
    let state=duelFixture();state.trends[1]="food";state.duel!.originalRent=5;
    state=apply(state,1,{type:"MARKET_DUEL",cardId:state.players[0].hand[0].id,targetTile:4});
    state=advanceMarket(state,{...context(),now:state.phaseEndsAt!});
    expect(state.lastDuel).toMatchObject({originalRent:5,due:3,paid:3,visitorCard:"C",ownerCard:null,exchanged:true});
    expect(state.players[1].hand).toHaveLength(1);expect(state.players[1].cash).toBe(13);
  });
  it("rejects the wrong role, another player's card, mismatched exchange levels and forged schema fields",()=>{
    const state=duelFixture("W","M");
    expect(()=>apply(state,1,{type:"MARKET_DUEL",cardId:state.players[0].hand[0].id})).toThrow(/역할/);
    expect(()=>apply(state,1,{type:"MARKET_DUEL",cardId:state.players[1].hand[0].id})).toThrow(/손패/);
    const contract=duelFixture();contract.shops.find(shop=>shop.tile===4)!.level=0;
    expect(()=>apply(contract,1,{type:"MARKET_DUEL",cardId:contract.players[0].hand[0].id,targetTile:4})).toThrow(/같은 증축/);
    const schema=z.discriminatedUnion("type",marketActionSchemas);
    expect(schema.safeParse({type:"MARKET_ROLL",phaseKey:"key",dice:[6,6]}).success).toBe(false);
    expect(schema.safeParse({type:"MARKET_DUEL",phaseKey:"key",cardId:null,targetTile:28}).success).toBe(false);
  });
  it("sells enough shops but protects the last, resets sold shops and creates no bank-paid debt",()=>{
    let state=duelFixture("H","M");state.players[0].hand=[];state.players[0].cash=0;
    Object.assign(state.shops.find(shop=>shop.tile===9)!,{ownerSeat:1,level:0});
    state=apply(state,1,{type:"MARKET_DUEL",cardId:null});state=apply(state,2,{type:"MARKET_DUEL",cardId:state.players[1].hand[0].id});
    expect(state.phase).toBe("MARKET_SETTLE");expect(state.payment?.due).toBe(6);
    state=apply(state,1,{type:"MARKET_SELL",tile:4});
    expect(ownedShops(state,1)).toHaveLength(1);expect(state.players[0].cash).toBe(0);expect(state.players[1].cash).toBe(15);
    expect(state.lastDuel).toMatchObject({due:6,paid:5,settled:true});
    expect(state.shops.find(shop=>shop.tile===4)).toMatchObject({ownerSeat:null,level:0});
  });
  it("applies reductions before the cap and uses pre-exchange ownership for monopoly rent",()=>{
    expect(marketDuelFee(6,"H","M").due).toBe(6);expect(marketDuelFee(2,"H",null).due).toBe(0);
    const state=duelFixture();for(const shop of state.shops.filter(shop=>shop.category==="food"))shop.ownerSeat=2;
    state.trends[1]="food";expect(marketRent(state,state.shops.find(shop=>shop.tile===1)!)).toBe(6);
  });
});

it("completes varied three/four-player matches while conserving every card and every last shop",()=>{
  const covered=new Set<string>();
  for(const count of [3,4])for(let seed=1;seed<=50;seed++) {
    const ctx=context(seed);let state=createMarketState(roster(count),`match-${seed}`,ctx,"mvp-1");let decisions=0;
    while(state.phase!=="GAME_OVER" && decisions++<700) {
      covered.add(state.phase);
      const seat=marketActingSeats(state)[0], player=state.players.find(player=>player.seat===seat)!;
      let command:MarketCommand;
      switch(state.phase) {
        case "MARKET_ROLL":command={type:"MARKET_ROLL"};break;
        case "MARKET_BUY":command={type:"MARKET_BUY",tile:ctx.randomIndex(3)?state.buyTiles[ctx.randomIndex(state.buyTiles.length)]:null};break;
        case "MARKET_PORTAL":command={type:"MARKET_PORTAL",tile:state.shops[ctx.randomIndex(12)].tile};break;
        case "MARKET_UPGRADE":command={type:"MARKET_UPGRADE",tile:ctx.randomIndex(2)?ownedShops(state,seat).find(shop=>!shop.level)!.tile:null};break;
        case "MARKET_DISCARD":command={type:"MARKET_DISCARD",cardId:player.hand[ctx.randomIndex(player.hand.length)].id};break;
        case "MARKET_SETTLE":command={type:"MARKET_SELL",tile:ownedShops(state,seat).sort((a,b)=>marketRefund(a)-marketRefund(b))[0].tile};break;
        case "MARKET_DUEL": {
          const visitor=seat===state.duel!.visitorSeat,visited=state.shops.find(shop=>shop.tile===state.duel!.tile)!;
          const offered=ownedShops(state,seat).find(shop=>shop.level===visited.level);
          const cards=player.hand.filter(card=>visitor?card.kind==="H" || card.kind==="C" && offered:card.kind==="W" || card.kind==="M");
          const card=cards[ctx.randomIndex(cards.length+1)];
          command={type:"MARKET_DUEL",cardId:card?.id??null,...(card?.kind==="C"?{targetTile:offered!.tile}:{})};break;
        }
      }
      state=transitionMarket(state,seat,{...command,phaseKey:state.phaseKey} as MarketAction,ctx);
      const cards=[...state.deck,...state.discard,...state.players.flatMap(player=>player.hand)];
      expect(cards).toHaveLength(24);expect(new Set(cards.map(card=>card.id)).size).toBe(24);
      expect(state.shops).toHaveLength(12);expect(state.players.every(player=>player.cash>=0 && ownedShops(state,player.seat).length>=1)).toBe(true);
      expect(state.shops.every(shop=>shop.ownerSeat!==null || shop.level===0)).toBe(true);
    }
    expect(state.phase).toBe("GAME_OVER");expect(state.night).toBe(8);expect(state.result?.winnerSeats.length).toBeGreaterThan(0);
    expect(state.result?.scores).toHaveLength(count);expect(state.phaseEndsAt).toBeUndefined();
  }
  expect([...covered].sort()).toEqual(["MARKET_BUY","MARKET_DISCARD","MARKET_DUEL","MARKET_PORTAL","MARKET_ROLL","MARKET_SETTLE","MARKET_UPGRADE"]);
});

it.each([3,4])("finishes %i-player matches using timed defaults alone",count=>{
  const ctx=context(77);let state=createMarketState(roster(count),"timed-match",ctx,"mvp-1");let decisions=0;
  while(state.phase!=="GAME_OVER" && decisions++<500) {
    ctx.now=state.phaseEndsAt!;
    const oldKey=state.phaseKey;state=advanceMarket(state,ctx);
    expect(state.phaseKey).not.toBe(oldKey);
    expect(state.players.every(player=>player.cash>=0 && ownedShops(state,player.seat).length>=1)).toBe(true);
  }
  expect(state.phase).toBe("GAME_OVER");expect(state.result?.scores).toHaveLength(count);
});
