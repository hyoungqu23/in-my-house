import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RoomRecord, RoomRepository, SerializedRoom } from "./types";

const serialize = (room: RoomRecord): SerializedRoom => ({
  ...room,
  processedActions: [...room.processedActions.entries()],
});

const deserialize = (value: SerializedRoom, revision: number): RoomRecord => ({
  ...value,
  processedActions: new Map(value.processedActions),
  storageRevision: revision,
});

export class SupabaseRoomRepository implements RoomRepository {
  private client?: SupabaseClient;

  private getClient() {
    if (this.client) return this.client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("GAME_STORE=supabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    this.client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return this.client;
  }

  async insert(room: RoomRecord) {
    const { error } = await this.getClient().from("game_rooms_runtime").insert({
      code: room.code,
      revision: 0,
      snapshot: serialize(room),
      expires_at: new Date(room.expiresAt).toISOString(),
    });
    if (error?.code === "23505") return false;
    if (error) throw error;
    return true;
  }

  async find(code: string) {
    const { data, error } = await this.getClient()
      .from("game_rooms_runtime")
      .select("snapshot, revision")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return deserialize(data.snapshot as SerializedRoom, Number(data.revision));
  }

  async commit(room: RoomRecord, expectedRevision: number) {
    const { data, error } = await this.getClient().rpc("commit_game_room", {
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

  async cleanupExpired() {
    const { data, error } = await this.getClient().rpc("cleanup_expired_game_rooms");
    if (error) throw error;
    return Number(data ?? 0);
  }
}
