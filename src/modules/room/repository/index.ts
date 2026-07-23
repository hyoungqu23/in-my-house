import "server-only";

import type { GameId } from "@/modules/game-catalog/games";
import { MemoryRoomRepository } from "./memory-room-repository";
import { SupabaseRoomRepository } from "./supabase-room-repository";
import { createRoomCandidate } from "./room-secrets";
import type { RoomRecord, RoomRepository } from "./types";

const memoryRepository = new MemoryRoomRepository();
const supabaseRepository = new SupabaseRoomRepository();

function repository(): RoomRepository {
  return process.env.GAME_STORE === "supabase" ? supabaseRepository : memoryRepository;
}

export async function createRoomRecord(hostUserId: string, gameId: GameId, now: number) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = createRoomCandidate(hostUserId, gameId, now);
    if (await repository().insert(candidate.room)) return candidate;
  }
  throw new Error("Could not allocate a unique room code");
}

export function getRoomRecord(code: string) {
  return repository().find(code);
}

export function saveRoomRecord(room: RoomRecord, expectedRevision: number) {
  return repository().commit(room, expectedRevision);
}

export function cleanupExpiredRooms(now = Date.now()) {
  return repository().cleanupExpired(now);
}

export function resetMemoryStore() {
  memoryRepository.reset();
}

export { hashSecret, rotateRoomToken, verifyDisplayToken, verifyJoinToken } from "./room-secrets";
export type { RoomRecord } from "./types";
