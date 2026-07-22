import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DarkHouseState } from "@/features/dark-house/types";

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
  joinTokenHash: string;
  displayTokenHash: string;
  hostUserId: string;
  hostLastSeenAt: number;
  displayLastSeenAt?: number;
  status: "lobby" | "playing" | "finished";
  players: LobbyPlayer[];
  version: number;
  game?: DarkHouseState;
  processedActions: Map<string, ProcessedAction>;
  createdAt: number;
  expiresAt: number;
  storageRevision: number;
};

declare global {
  var __darkHouseRooms: Map<string, RoomRecord> | undefined;
}

const rooms = globalThis.__darkHouseRooms ?? new Map<string, RoomRecord>();
if (process.env.NODE_ENV !== "production") globalThis.__darkHouseRooms = rooms;

let adminClient: SupabaseClient | undefined;
const usesSupabase = () => process.env.GAME_STORE === "supabase";

function getAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("GAME_STORE=supabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

type SerializedRoom = Omit<RoomRecord, "processedActions"> & {
  processedActions: Array<[string, ProcessedAction]>;
};

const serialize = (room: RoomRecord): SerializedRoom => ({
  ...room,
  processedActions: [...room.processedActions.entries()],
});

const deserialize = (value: SerializedRoom, revision: number): RoomRecord => ({
  ...value,
  processedActions: new Map(value.processedActions),
  storageRevision: revision,
});

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const createSecret = () => randomBytes(16).toString("base64url");

export async function createRoomRecord(hostUserId: string, now: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join("");
  } while (rooms.has(code));

  const joinToken = createSecret();
  const displayToken = createSecret();
  const room: RoomRecord = {
    id: randomUUID(),
    code,
    joinTokenHash: hashSecret(joinToken),
    displayTokenHash: hashSecret(displayToken),
    hostUserId,
    hostLastSeenAt: now,
    status: "lobby",
    players: [],
    version: 0,
    processedActions: new Map(),
    createdAt: now,
    expiresAt: now + 12 * 60 * 60 * 1_000,
    storageRevision: 0,
  };
  if (usesSupabase()) {
    const { error } = await getAdminClient().from("game_rooms_runtime").insert({
      code,
      revision: 0,
      snapshot: serialize(room),
      expires_at: new Date(room.expiresAt).toISOString(),
    });
    if (error) throw error;
  } else {
    rooms.set(code, room);
  }
  return { room, joinToken, displayToken };
}

export async function getRoomRecord(code: string) {
  const normalized = code.toUpperCase();
  if (!usesSupabase()) return rooms.get(normalized);
  const { data, error } = await getAdminClient()
    .from("game_rooms_runtime")
    .select("snapshot, revision")
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return deserialize(data.snapshot as SerializedRoom, Number(data.revision));
}

export async function saveRoomRecord(room: RoomRecord, expectedRevision: number) {
  if (!usesSupabase()) return true;
  const { data, error } = await getAdminClient().rpc("commit_game_room", {
    p_code: room.code,
    p_expected_revision: expectedRevision,
    p_snapshot: serialize({ ...room, storageRevision: expectedRevision + 1 }),
    p_expires_at: new Date(room.expiresAt).toISOString(),
  });
  if (error) throw error;
  const saved = Boolean(data);
  if (saved) room.storageRevision = expectedRevision + 1;
  return saved;
}

export function verifyJoinToken(room: RoomRecord, token: string) {
  return hashSecret(token) === room.joinTokenHash;
}

export function verifyDisplayToken(room: RoomRecord, token: string) {
  return hashSecret(token) === room.displayTokenHash;
}

export function rotateRoomToken(room: RoomRecord, kind: "join" | "display") {
  const token = createSecret();
  if (kind === "join") room.joinTokenHash = hashSecret(token);
  else room.displayTokenHash = hashSecret(token);
  return token;
}

export function resetMemoryStore() {
  rooms.clear();
}

export async function cleanupExpiredRooms(now = Date.now()) {
  if (usesSupabase()) {
    const { data, error } = await getAdminClient().rpc("cleanup_expired_game_rooms");
    if (error) throw error;
    return Number(data ?? 0);
  }
  let removed = 0;
  for (const [code, room] of rooms) {
    if (room.expiresAt < now - 24 * 60 * 60 * 1_000) {
      rooms.delete(code);
      removed += 1;
    }
  }
  return removed;
}
