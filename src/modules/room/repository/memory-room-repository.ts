import type { RoomRecord, RoomRepository } from "./types";

declare global {
  var __darkHouseRooms: Map<string, RoomRecord> | undefined;
}

const rooms = globalThis.__darkHouseRooms ?? new Map<string, RoomRecord>();
if (process.env.NODE_ENV !== "production") globalThis.__darkHouseRooms = rooms;

export class MemoryRoomRepository implements RoomRepository {
  async insert(room: RoomRecord) {
    if (rooms.has(room.code)) return false;
    rooms.set(room.code, room);
    return true;
  }

  async find(code: string) {
    return rooms.get(code.toUpperCase());
  }

  async commit() {
    return true;
  }

  async cleanupExpired(now: number) {
    let removed = 0;
    for (const [code, room] of rooms) {
      if (room.expiresAt < now - 24 * 60 * 60 * 1_000) {
        rooms.delete(code);
        removed += 1;
      }
    }
    return removed;
  }

  reset() {
    rooms.clear();
  }
}
