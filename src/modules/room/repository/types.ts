import type { GameId } from "@/modules/game-catalog/games";
import type { StoredGame } from "@/modules/game-runtime/types";
import type { FootprintsRoomMark } from "@/modules/midnight-footprints/domain/types";

export type LobbyPlayer = {
  seat: number;
  userId: string;
  nickname: string;
  nicknameNormalized: string;
  lastSeenAt: number;
};

export type ProcessedAction = {
  fingerprint: string;
  resultingVersion: number;
};

export type RoomRecord = {
  id: string;
  code: string;
  gameId: GameId;
  joinTokenHash: string;
  displayTokenHash: string;
  hostUserId: string;
  hostLastSeenAt: number;
  displayLastSeenAt?: number;
  status: "lobby" | "playing" | "finished";
  players: LobbyPlayer[];
  version: number;
  game?: StoredGame;
  processedActions: Map<string, ProcessedAction>;
  createdAt: number;
  expiresAt: number;
  storageRevision: number;
};

export type SerializedRoom = Omit<RoomRecord, "processedActions"> & {
  processedActions: Array<[string, ProcessedAction]>;
};

export type FootprintsPrivateStateRecord = {
  revision: number;
  roundKey: string;
  roomMarks: Record<string, FootprintsRoomMark>;
};

export interface RoomRepository {
  insert(room: RoomRecord): Promise<boolean>;
  find(code: string): Promise<RoomRecord | undefined>;
  commit(room: RoomRecord, expectedRevision: number): Promise<boolean>;
  cleanupExpired(now: number): Promise<number>;
  findFootprintsPrivateState(
    code: string,
    userId: string,
  ): Promise<FootprintsPrivateStateRecord | undefined>;
  commitFootprintsPrivateState(
    code: string,
    userId: string,
    state: FootprintsPrivateStateRecord,
    expectedRevision: number,
  ): Promise<boolean>;
}
