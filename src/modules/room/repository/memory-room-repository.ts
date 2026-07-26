import type {
  FootprintsPrivateStateRecord,
  RoomRecord,
  RoomRepository,
} from "./types";

declare global {
  var __darkHouseRooms: Map<string, RoomRecord> | undefined;
  var __inMyHouseRooms: Map<string, RoomRecord> | undefined;
  var __inMyHouseFootprintsPrivateStates:
    Map<string, FootprintsPrivateStateRecord> | undefined;
}

const rooms = globalThis.__inMyHouseRooms ?? globalThis.__darkHouseRooms ?? new Map<string, RoomRecord>();
if (process.env.NODE_ENV !== "production") globalThis.__inMyHouseRooms = rooms;
const footprintsPrivateStates =
  globalThis.__inMyHouseFootprintsPrivateStates
  ?? new Map<string, FootprintsPrivateStateRecord>();
if (process.env.NODE_ENV !== "production") {
  globalThis.__inMyHouseFootprintsPrivateStates = footprintsPrivateStates;
}

const privateKey = (code: string, userId: string) =>
  `${code.toUpperCase()}:${userId}`;

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

  async findFootprintsPrivateState(code: string, userId: string) {
    const state = footprintsPrivateStates.get(privateKey(code, userId));
    return state ? structuredClone(state) : undefined;
  }

  async commitFootprintsPrivateState(
    code: string,
    userId: string,
    state: FootprintsPrivateStateRecord,
    expectedRevision: number,
  ) {
    const key = privateKey(code, userId);
    const currentRevision = footprintsPrivateStates.get(key)?.revision ?? 0;
    if (currentRevision !== expectedRevision) return false;
    footprintsPrivateStates.set(key, structuredClone(state));
    return true;
  }

  reset() {
    rooms.clear();
    footprintsPrivateStates.clear();
  }
}
