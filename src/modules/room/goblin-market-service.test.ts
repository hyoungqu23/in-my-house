import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { applyRoomAction, createRoom, getRoomView, heartbeat, joinRoom } from "./room-service";
import { getRoomRecord, resetMemoryStore, saveRoomRecord } from "./repository";
import type { ActionRequest, GoblinMarketPlayerRoomView } from "./contracts";
import type { MarketCommand } from "../goblin-market/domain/types";
import { createMarketState } from "../goblin-market/domain/reducer";

beforeEach(()=>resetMemoryStore());
async function setup(count=3) {
  const room=await createRoom("u1","http://localhost","goblin-market",1000);
  for(let seat=1;seat<=count;seat++)await joinRoom({code:room.code,joinToken:new URL(room.joinUrl).hash.slice(1),nickname:`상인${seat}`,userId:`u${seat}`,now:1001});
  return room;
}
const view=async(code:string,seat=1,now=1002)=>await getRoomView({code,userId:`u${seat}`,mode:"private",now}) as GoblinMarketPlayerRoomView;
async function act(code:string,seat:number,command:MarketCommand|{type:"START_GAME"}|{type:"START_REMATCH"},now=1002) {
  const current=await view(code,seat,now);
  return applyRoomAction({code,userId:`u${seat}`,now,request:{clientActionId:`market-${current.room.version}-${seat}`,expectedVersion:current.room.version,action:command.type==="START_GAME"||command.type==="START_REMATCH"?command:{...command,phaseKey:current.phaseKey}}});
}
it.each([3,4])("runs a complete %i-player game through room storage, projections and rematch",async count=>{
  const room=await setup(count);await act(room.code,1,{type:"START_GAME"});
  let current=await view(room.code);const firstKey=current.phaseKey;let steps=0;
  const pub=await getRoomView({code:room.code,displayToken:new URL(room.displayUrl).hash.slice(1),mode:"private",now:1002});
  expect(pub.projection).toBe("public");expect(JSON.stringify(pub)).not.toContain('"hand":');
  while(current.phase!=="GAME_OVER" && steps++<500) {
    const seat=current.actingSeats[0];current=await view(room.code,seat);
    const owned=current.shops.filter(shop=>shop.ownerSeat===seat);
    let command:MarketCommand;
    switch(current.phase) {
      case "MARKET_ROLL":command={type:"MARKET_ROLL"};break;
      case "MARKET_BUY":command={type:"MARKET_BUY",tile:current.self.buyTiles[0]};break;
      case "MARKET_PORTAL":command={type:"MARKET_PORTAL",tile:current.shops.find(shop=>shop.ownerSeat!==seat)?.tile??1};break;
      case "MARKET_UPGRADE":command={type:"MARKET_UPGRADE",tile:owned.find(shop=>!shop.level)!.tile};break;
      case "MARKET_DISCARD":command={type:"MARKET_DISCARD",cardId:current.self.hand[0].id};break;
      case "MARKET_SETTLE":command={type:"MARKET_SELL",tile:owned[0].tile};break;
      case "MARKET_DUEL": {
        const card=current.self.hand.find(card=>current.self.legalCardIds.includes(card.id));
        command={type:"MARKET_DUEL",cardId:card?.id??null,...(card?.kind==="C"?{targetTile:current.self.exchangeTiles[0]}:{})};break;
      }
      default:throw new Error("Unexpected phase");
    }
    await act(room.code,seat,command);current=await view(room.code);
  }
  expect(current.night).toBe(12);expect(current.boardSize).toBe(28);expect(current.shops).toHaveLength(16);
  expect(current.room.status).toBe("finished");expect(current.result?.scores).toHaveLength(count);expect(current.result?.winnerSeats.length).toBeGreaterThan(0);
  await act(room.code,1,{type:"START_REMATCH"});const rematch=await view(room.code);
  expect(rematch.phaseKey).not.toBe(firstKey);expect(rematch.night).toBe(1);expect(rematch.rulesVersion).toBe("mvp-2");
  expect(rematch.players.every(player=>player.assets===25)).toBe(true);
});
it("enforces player limits, host-only start, wrong-game actions, display privacy and authorization",async()=>{
  const room=await setup(2);await expect(act(room.code,1,{type:"START_GAME"})).rejects.toThrow(/3명/);
  for(const seat of [3,4])await joinRoom({code:room.code,joinToken:new URL(room.joinUrl).hash.slice(1),nickname:`상인${seat}`,userId:`u${seat}`,now:1001});
  await expect(joinRoom({code:room.code,joinToken:new URL(room.joinUrl).hash.slice(1),nickname:"상인5",userId:"u5",now:1001})).rejects.toThrow(/가득/);
  await expect(act(room.code,2,{type:"START_GAME"})).rejects.toThrow(/호스트/);await act(room.code,1,{type:"START_GAME"});
  const current=await view(room.code);
  await expect(applyRoomAction({code:room.code,userId:"u1",now:1002,request:{clientActionId:"wrong-game-action",expectedVersion:current.room.version,action:{type:"PASS"}}})).rejects.toThrow(/이 게임/);
  await expect(getRoomView({code:room.code,userId:"intruder",mode:"private",now:1002})).rejects.toThrow(/권한/);
});
it("persists a simultaneous secret commit, retries once, rejects a stale rival and charges the old owner once",async()=>{
  const room=await setup();await act(room.code,1,{type:"START_GAME"});const record=(await getRoomRecord(room.code))!;
  if(record.game?.type!=="goblin-market")throw new Error("Wrong game");
  const state=record.game.state;state.night=2;state.order=[1,2,3];state.turnIndex=0;state.phase="MARKET_DUEL";state.phaseEndsAt=12000;
  for(const shop of state.shops){shop.ownerSeat=null;shop.level=0;}
  Object.assign(state.shops.find(shop=>shop.tile===1)!,{ownerSeat:2,level:1});Object.assign(state.shops.find(shop=>shop.tile===4)!,{ownerSeat:1,level:1});state.shops.find(shop=>shop.tile===8)!.ownerSeat=3;
  const cards=[...state.deck,...state.discard,...state.players.flatMap(player=>player.hand)];state.discard=[];state.players.forEach(player=>{player.hand=[];player.cash=10;});
  state.players[0].hand=[cards.splice(cards.findIndex(card=>card.kind==="C"),1)[0]];state.players[1].hand=[cards.splice(cards.findIndex(card=>card.kind==="M"),1)[0]];state.deck=cards;
  state.duel={visitorSeat:1,ownerSeat:2,tile:1,originalRent:5,choices:{}};record.version++;await saveRoomRecord(record,record.storageRevision);
  const before=await view(room.code);
  const request:ActionRequest={clientActionId:"one-secret-contract",expectedVersion:before.room.version,action:{type:"MARKET_DUEL",phaseKey:before.phaseKey,cardId:state.players[0].hand[0].id,targetTile:4}};
  await applyRoomAction({code:room.code,userId:"u1",now:1002,request});
  const restored=await view(room.code);expect(restored.self.choice?.targetTile).toBe(4);
  const rival=await view(room.code,2);expect(rival.self.choice).toBeUndefined();expect(JSON.stringify(rival)).not.toContain(state.players[0].hand[0].id);
  const reply:ActionRequest={clientActionId:"other-secret-card",expectedVersion:before.room.version,action:{type:"MARKET_DUEL",phaseKey:before.phaseKey,cardId:state.players[1].hand[0].id}};
  await expect(applyRoomAction({code:room.code,userId:"u2",now:1002,request:reply})).rejects.toThrow(/바뀌/);
  await applyRoomAction({code:room.code,userId:"u2",now:1002,request:{...reply,expectedVersion:rival.room.version}});
  expect((await applyRoomAction({code:room.code,userId:"u1",now:1002,request})).alreadyApplied).toBe(true);
  const after=await view(room.code);expect(after.players[0].cash).toBe(7);expect(after.players[1].cash).toBe(13);expect(after.lastDuel).toMatchObject({paid:3,exchanged:true});
});
it("reconnects to persisted state after timed defaults without eliminating a merchant",async()=>{
  const room=await setup();await act(room.code,1,{type:"START_GAME"});
  const before=await view(room.code);for(const seat of [1,2,3])await heartbeat({code:room.code,userId:`u${seat}`,now:8000});
  const after=await view(room.code,1,8000);expect(after.phaseKey).not.toBe(before.phaseKey);expect(after.players).toHaveLength(3);
  expect((await view(room.code,1,8000)).phaseKey).toBe(after.phaseKey);
});
it("resumes a saved MVP-1 game and uses the expansion only on its rematch",async()=>{
  const room=await setup();await act(room.code,1,{type:"START_GAME"});
  const record=(await getRoomRecord(room.code))!;
  const legacy=createMarketState([1,2,3].map(seat=>({seat,userId:`u${seat}`,nickname:`상인${seat}`})),"legacy-saved",{now:1000,randomIndex:()=>0},"mvp-1");
  record.game={type:"goblin-market",state:JSON.parse(JSON.stringify(legacy))};record.version++;
  await saveRoomRecord(record,record.storageRevision);
  const resumed=await view(room.code);
  expect(resumed.rulesVersion).toBe("mvp-1");expect(resumed.boardSize).toBe(20);expect(resumed.nights).toBe(8);expect(resumed.shops).toHaveLength(12);
  const ending=(await getRoomRecord(room.code))!;
  if(ending.game?.type!=="goblin-market")throw new Error("Wrong game");
  ending.game.state.night=8;ending.game.state.turnIndex=2;ending.game.state.phase="MARKET_UPGRADE";ending.game.state.phaseEndsAt=20000;
  const last=ending.game.state.order[2];ending.version++;await saveRoomRecord(ending,ending.storageRevision);
  await act(room.code,last,{type:"MARKET_UPGRADE",tile:null});expect((await view(room.code)).room.status).toBe("finished");
  await act(room.code,1,{type:"START_REMATCH"});const rematch=await view(room.code);
  expect(rematch.rulesVersion).toBe("mvp-2");expect(rematch.boardSize).toBe(28);expect(rematch.nights).toBe(12);expect(rematch.shops).toHaveLength(16);
});
