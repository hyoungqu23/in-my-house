import { INN_CURRENT_RULES_VERSION, INN_GUESTS, innGuestInfo, innRules } from "./content";
import type { InnBoard, InnFurniture, InnGuest, InnItemKind, InnRulesVersion, InnScore, InnWeather } from "./types";

export const innAdjacent = (a: number, b: number) => Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) + Math.abs(a % 3 - b % 3) === 1;
export const guestRooms = (guest: InnGuest): number[] => guest.position < 0 ? [] : guest.kind === "rabbit" ? [guest.position, guest.position + 1] : [guest.position];
export function validInnBoard(board: InnBoard): boolean {
  const floor = new Set<number>(), ceiling = new Set<number>(), furniture = new Set<number>(), ids = new Set<string>();
  for (const item of [...board.guests, ...board.furniture]) {
    if (ids.has(item.id) || !Number.isInteger(item.position) || item.position < -1 || item.position > 5) return false;
    ids.add(item.id);
  }
  for (const guest of board.guests) {
    if (guest.kind === "rabbit" && [2, 5].includes(guest.position)) return false;
    const occupied = guest.kind === "cat" ? ceiling : floor;
    for (const cell of guestRooms(guest)) { if (occupied.has(cell)) return false; occupied.add(cell); }
  }
  for (const item of board.furniture) if (item.position >= 0) {
    if (furniture.has(item.position)) return false;
    furniture.add(item.position);
  }
  return true;
}
/** Move one guest, or move/swap furniture (including one stored item). */
export function moveInnItem(board: InnBoard, kind: InnItemKind, id: string, to: number): InnBoard | undefined {
  const next = structuredClone(board);
  const items = kind === "guest" ? next.guests : next.furniture;
  const item = items.find(candidate => candidate.id === id);
  if (!item || item.position === to) return undefined;
  if (kind === "furniture" && to >= 0) {
    const occupied = next.furniture.find(candidate => candidate.position === to);
    if (occupied) occupied.position = item.position;
  }
  item.position = to;
  return validInnBoard(next) ? next : undefined;
}
export function receiveInnItem(board: InnBoard, kind: InnItemKind, outgoingId: string, incoming: InnGuest | InnFurniture, to: number): InnBoard | undefined {
  const next = structuredClone(board);
  if (kind === "guest") {
    const index = next.guests.findIndex(item => item.id === outgoingId);
    if (index < 0 || !(incoming.kind in INN_GUESTS)) return undefined;
    next.guests[index] = { ...incoming, position: to } as InnGuest;
  } else {
    const index = next.furniture.findIndex(item => item.id === outgoingId);
    if (index < 0 || incoming.kind in INN_GUESTS) return undefined;
    next.furniture[index] = { ...incoming, position: to } as InnFurniture;
  }
  return validInnBoard(next) ? next : undefined;
}
export function scoreInn(board: InnBoard, weather: InnWeather, version: InnRulesVersion = INN_CURRENT_RULES_VERSION): InnScore {
  const rules = innRules(version);
  const wet = new Set<number>();
  for (const guest of board.guests) if (guest.kind === "cloud" && guest.position >= 0) {
    for (let p = 0; p < 6; p++) if (p === guest.position || innAdjacent(p, guest.position)) wet.add(p);
  }
  const at = (kind: InnFurniture["kind"], p: number) => board.furniture.some(item => item.kind === kind && item.position === p);
  const sleeping = board.guests.map(guest => guest.position >= 0 && !(guest.kind === "phoenix" && at("wood", guest.position) && !wet.has(guest.position)));
  const guests = board.guests.map((guest, i) => {
    if (!sleeping[i]) return { id: guest.id, sleeping: false, base: 0, comfort: 0, reason: guest.position < 0 ? "현관 대기석에 있어요. 방을 골라주세요." : "나무침대가 말라 있어요. 비가 닿거나 침대를 옮기면 잠들어요." };
    const cells = guestRooms(guest);
    let comfort = guest.kind !== "cat" && cells.some(p => at("wood", p) && !wet.has(p)) ? 1 : 0;
    let reason = comfort ? "마른 나무침대 +1" : "편안히 잠들어요";
    if (guest.kind === "rabbit" && cells.some(p => at("quilt", p) && !wet.has(p))) { comfort = 2; reason = "마른 담요 +2"; }
    if (guest.kind === "phoenix" && at("stone", guest.position)) { comfort = 2; reason = "돌침대 +2"; }
    if (guest.kind === "cloud" && at("basin", guest.position)) { comfort = 2; reason = "같은 방 대야 +2"; }
    if (guest.kind === "cat" && board.guests.some((other, j) => other.kind !== "cat" && sleeping[j] && guestRooms(other).includes(guest.position))) { comfort = 1; reason = "잠든 룸메이트 +1"; }
    if (guest.kind === "cat" && rules.woodCatBonus && at("wood", guest.position) && !wet.has(guest.position)) {
      reason = comfort ? "잠든 룸메이트 +1 · 마른 나무침대 +1" : "마른 나무침대 +1";
      comfort += rules.woodCatBonus;
    }
    return { id: guest.id, sleeping: true, base: innGuestInfo(guest.kind, version).base, comfort, reason };
  });
  const moon = Math.min(rules.moonCap, board.guests.filter((guest, i) => sleeping[i] && (weather === "roof" ? guest.position < 3 : guest.position >= 3)).length);
  return { guests, moon, total: guests.reduce((sum, guest) => sum + guest.base + guest.comfort, 0) + moon, wetRooms: [...wet].sort() };
}
