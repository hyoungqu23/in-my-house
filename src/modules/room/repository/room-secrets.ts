import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { RoomRecord } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const createSecret = () => randomBytes(16).toString("base64url");

export function createRoomCandidate(hostUserId: string, now: number) {
  const code = Array.from(randomBytes(6), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
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
  return { room, joinToken, displayToken };
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
