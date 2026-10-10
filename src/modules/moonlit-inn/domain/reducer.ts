import { DomainError } from "@/shared/errors/domain-error";
import { INN_CURRENT_RULES_VERSION, INN_FORFEIT_MS, INN_FURNITURE, INN_GUESTS, INN_REVEAL_MS } from "./content";
import { moveInnItem, receiveInnItem, scoreInn, validInnBoard } from "./rules";
import type { InnAction, InnBundle, InnContext, InnItemKind, InnPhase, InnPlayer, InnSetup, InnState } from "./types";

function fail(code: string, message: string): never { throw new DomainError(code, message); }
const item = (player: InnPlayer, kind: InnItemKind, id: string) => (kind === "guest" ? player.guests : player.furniture).find(candidate => candidate.id === id);
function setPhase(state: InnState, phase: InnPhase) {
  state.phase = phase; state.phaseKey = `${state.matchId}:${phase}:${state.draftRound}`;
}
function touch(state: InnState, ...players: InnPlayer[]) {
  const seats = players.map(player => player.seat);
  for (const player of players) player.revision++;
  state.offers = state.offers.filter(offer => !seats.includes(offer.fromSeat) && !seats.includes(offer.toSeat));
}
function acquire(player: InnPlayer, bundle: InnBundle) {
  const guest = { ...bundle.guest, position: -1 };
  player.guests.push(guest);
  for (let p = 0; p < 6; p++) {
    guest.position = p;
    if (validInnBoard(player)) break;
    guest.position = -1;
  }
  const position = [0, 1, 2, 3, 4, 5].find(p => !player.furniture.some(f => f.position === p)) ?? -1;
  player.furniture.push({ ...bundle.furniture, position });
}
export function createInnState(roster: Array<Pick<InnPlayer, "seat" | "userId" | "nickname">>, setup: InnSetup): InnState {
  if (roster.length !== 4) fail("MIN_PLAYERS", "보름달 여관은 연결된 플레이어 4명이 필요합니다.");
  if (new Set(roster.map(p => p.seat)).size !== 4 || setup.bundles.length !== 12) fail("INVALID_GAME_SETUP", "여관 준비가 올바르지 않습니다.");
  const state: InnState = {
    rulesVersion: setup.rulesVersion ?? INN_CURRENT_RULES_VERSION, matchId: setup.matchId, phase: "INN_DRAFT", phaseKey: "", draftRound: 0, weather: setup.weather,
    players: roster.map((player, i) => ({ ...player, hand: structuredClone(setup.bundles.slice(i * 3, i * 3 + 3)), guests: [], furniture: [], revision: 0, ready: false, actionsLeft: 2, traded: false })),
    offers: [], trades: [],
  };
  setPhase(state, "INN_DRAFT"); return state;
}
export function advanceInn(input: InnState, context: InnContext): InnState {
  const state = structuredClone(input);
  if (state.phase === "GAME_OVER") return state;
  const missing = state.players.filter(p => !context.connectedSeats.includes(p.seat)).map(p => p.seat);
  if (missing.length) {
    state.pause ??= { disconnectedSeats: missing, pausedAt: context.now, forfeitClaimAt: context.now + INN_FORFEIT_MS };
    state.pause.disconnectedSeats = missing;
    return state;
  }
  if (state.pause) {
    if (state.phaseEndsAt !== undefined) state.phaseEndsAt += context.now - state.pause.pausedAt;
    state.pause = undefined;
  }
  if (state.phase === "INN_REVEAL" && context.now >= state.phaseEndsAt!) {
    setPhase(state, "INN_NIGHT"); state.phaseEndsAt = undefined;
  }
  return state;
}
function resolveDraft(state: InnState) {
  for (const player of state.players) {
    const chosen = player.hand.find(bundle => bundle.id === player.pickedId)!;
    acquire(player, chosen);
    player.hand = player.hand.filter(bundle => bundle.id !== chosen.id);
    player.pickedId = undefined;
    player.revision++;
  }
  const hands = state.players.map(player => player.hand);
  state.players.forEach((player, index) => { player.hand = hands[(index + state.players.length - 1) % state.players.length]; });
  state.draftRound++;
  if (state.draftRound === 2) {
    for (const player of state.players) { acquire(player, player.hand[0]); player.hand = []; }
    setPhase(state, "INN_ARRANGE");
  } else setPhase(state, "INN_DRAFT");
}
function finish(state: InnState) {
  const scores = state.players.map(player => ({ seat: player.seat, score: scoreInn(player, state.weather, state.rulesVersion) }));
  const high = Math.max(...scores.map(row => row.score.total));
  state.result = { cancelled: false, scores, winnerSeats: scores.filter(row => row.score.total === high).map(row => row.seat) };
  state.offers = []; setPhase(state, "GAME_OVER");
}
export function transitionInn(input: InnState, actorSeat: number, action: InnAction, context: InnContext): InnState {
  const state = advanceInn(input, context);
  const player = state.players.find(candidate => candidate.seat === actorSeat) ?? fail("UNAUTHORIZED", "여관 주인만 행동할 수 있습니다.");
  if (!context.connectedSeats.includes(actorSeat)) fail("GAME_PAUSED", "다시 연결한 뒤 시도해 주세요.");
  if (action.phaseKey !== state.phaseKey || action.revision !== player.revision) fail("STALE_INN_ACTION", "내 여관이 바뀌었습니다. 다시 선택해 주세요.");
  if (state.pause) {
    if (action.type !== "INN_END_DISCONNECTED" || context.now < state.pause.forfeitClaimAt) fail("GAME_PAUSED", "친구가 다시 연결할 때까지 기다려 주세요.");
    state.result = { cancelled: true, scores: [], winnerSeats: [] }; state.offers = []; state.pause = undefined;
    setPhase(state, "GAME_OVER"); return state;
  }
  if (!legalInnActions(state, actorSeat).includes(action.type)) fail("INVALID_PHASE", "지금은 이 행동을 할 수 없습니다.");
  switch (action.type) {
    case "INN_PICK": {
      if (action.bundleId !== null && !player.hand.some(bundle => bundle.id === action.bundleId)) fail("CARD_NOT_IN_HAND", "내 꾸러미에서 골라주세요.");
      player.pickedId = action.bundleId ?? undefined; player.revision++;
      if (state.players.every(candidate => candidate.pickedId)) resolveDraft(state);
      return state;
    }
    case "INN_MOVE": {
      const next = moveInnItem(player, action.kind, action.itemId, action.to) ?? fail("INVALID_PLACEMENT", "그 자리에 놓을 수 없어요. 빈 자리나 수납함을 골라주세요.");
      player.guests = next.guests; player.furniture = next.furniture;
      if (state.phase === "INN_NIGHT") player.actionsLeft--;
      touch(state, player); return state;
    }
    case "INN_READY": {
      player.ready = action.ready; touch(state, player);
      if (state.players.every(candidate => candidate.ready)) {
        if (state.phase === "INN_ARRANGE") {
          state.players.forEach(candidate => { candidate.ready = false; });
          setPhase(state, "INN_REVEAL"); state.phaseEndsAt = context.now + INN_REVEAL_MS;
        } else finish(state);
      }
      return state;
    }
    case "INN_SKIP_REVEAL":
      setPhase(state, "INN_NIGHT"); state.phaseEndsAt = undefined; return state;
    case "INN_OFFER": {
      const target = state.players.find(candidate => candidate.seat === action.targetSeat);
      if (!target || target === player || target.ready || target.traded || target.actionsLeft < 1) fail("INVALID_TRADE", "지금 교환할 수 있는 다른 여관을 골라주세요.");
      const incoming = item(target, action.kind, action.incomingId);
      if (!incoming || !receiveInnItem(player, action.kind, action.outgoingId, incoming, action.receiveAt)) fail("INVALID_TRADE", "교환할 물건과 받을 자리를 다시 골라주세요.");
      state.offers = state.offers.filter(offer => offer.fromSeat !== player.seat);
      state.offers.push({ id: `${state.matchId}:${player.seat}:${context.sequenceId ?? player.revision}`, fromSeat: player.seat, toSeat: target.seat, kind: action.kind, outgoingId: action.outgoingId, incomingId: action.incomingId, receiveAt: action.receiveAt, fromRevision: player.revision, toRevision: target.revision });
      return state;
    }
    case "INN_DECLINE": {
      const offer = state.offers.find(offer => offer.id === action.offerId);
      if (!offer || offer.fromSeat !== player.seat && offer.toSeat !== player.seat) fail("INVALID_TRADE", "이 제안을 변경할 수 없습니다.");
      state.offers = state.offers.filter(candidate => candidate.id !== offer.id); return state;
    }
    case "INN_ACCEPT": {
      const offer = state.offers.find(candidate => candidate.id === action.offerId && candidate.toSeat === actorSeat) ?? fail("INVALID_TRADE", "제안이 만료되었습니다.");
      const sender = state.players.find(candidate => candidate.seat === offer.fromSeat)!;
      if (sender.revision !== offer.fromRevision || player.revision !== offer.toRevision || sender.ready || sender.traded || sender.actionsLeft < 1 || player.traded || player.actionsLeft < 1) fail("INVALID_TRADE", "교환 조건이 바뀌었습니다. 새로 제안해 주세요.");
      const outgoing = item(sender, offer.kind, offer.outgoingId), incoming = item(player, offer.kind, offer.incomingId);
      if (!outgoing || !incoming) fail("INVALID_TRADE", "교환할 손님이나 가구가 없습니다.");
      const senderBoard = receiveInnItem(sender, offer.kind, outgoing.id, incoming, offer.receiveAt);
      const targetBoard = receiveInnItem(player, offer.kind, incoming.id, outgoing, action.receiveAt);
      if (!senderBoard || !targetBoard) fail("INVALID_PLACEMENT", "양쪽 여관에 받을 자리가 필요해요.");
      sender.guests = senderBoard.guests; sender.furniture = senderBoard.furniture;
      player.guests = targetBoard.guests; player.furniture = targetBoard.furniture;
      sender.actionsLeft--; player.actionsLeft--; sender.traded = true; player.traded = true;
      const name = (kind: string) => kind in INN_GUESTS ? INN_GUESTS[kind as keyof typeof INN_GUESTS].name : INN_FURNITURE[kind as keyof typeof INN_FURNITURE].name;
      state.trades.push({ fromSeat: sender.seat, toSeat: player.seat, kind: offer.kind, fromName: name(outgoing.kind), toName: name(incoming.kind) });
      touch(state, sender, player); return state;
    }
    default: return fail("INVALID_PHASE", "지금은 이 행동을 할 수 없습니다.");
  }
}
export function legalInnActions(state: InnState, seat: number): InnAction["type"][] {
  const player = state.players.find(candidate => candidate.seat === seat);
  if (!player || state.phase === "GAME_OVER") return [];
  if (state.pause) return state.pause.disconnectedSeats.includes(seat) ? [] : ["INN_END_DISCONNECTED"];
  if (state.phase === "INN_DRAFT") return ["INN_PICK", "INN_MOVE"];
  if (state.phase === "INN_ARRANGE") return player.ready ? ["INN_READY"] : ["INN_MOVE", "INN_READY"];
  if (state.phase === "INN_REVEAL") return ["INN_SKIP_REVEAL"];
  if (state.phase === "INN_NIGHT") {
    if (player.ready) return ["INN_READY"];
    return ["INN_READY", "INN_DECLINE", ...(player.actionsLeft > 0 ? ["INN_MOVE" as const] : []), ...(player.actionsLeft > 0 && !player.traded ? ["INN_OFFER" as const, "INN_ACCEPT" as const] : [])];
  }
  return [];
}
