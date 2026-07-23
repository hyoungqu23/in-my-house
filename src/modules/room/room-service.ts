import "server-only";

import { randomInt } from "node:crypto";
import { advanceTimedState, createInitialState, transition } from "@/modules/dark-house/domain/reducer";
import { projectPlayer, projectPublic } from "@/modules/dark-house/projection/game-view";
import type { ActionRequest, PublicRoomView } from "@/modules/room/contracts";
import { DomainError as GameRuleError } from "@/shared/errors/domain-error";
import {
  createRoomRecord,
  getRoomRecord,
  hashSecret,
  RoomRecord,
  rotateRoomToken,
  saveRoomRecord,
  verifyDisplayToken,
  verifyJoinToken,
} from "./repository";

const normalizeNickname = (nickname: string) =>
  nickname.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");

export function validateNickname(nickname: string) {
  const normalized = normalizeNickname(nickname);
  const count = [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(normalized)].length;
  if (count < 2 || count > 16) throw new GameRuleError("INVALID_NICKNAME", "닉네임은 2–16자로 입력해 주세요.");
  return normalized;
}

const assertNotExpired = (room: RoomRecord, now: number) => {
  if (room.expiresAt <= now) throw new GameRuleError("ROOM_EXPIRED", "방이 만료되었습니다.");
};

const findPlayer = (room: RoomRecord, userId: string) =>
  room.players.find((player) => player.userId === userId);

const randomRemovalId = (room: RoomRecord) => {
  const game = room.game;
  const challenger = game?.players.find((player) => player.seat === game.challengerSeat);
  const candidates = challenger ? [...challenger.hand, ...challenger.stack] : [];
  return candidates.length > 0 ? candidates[randomInt(candidates.length)].id : undefined;
};

function advanceRoom(room: RoomRecord, now: number) {
  if (!room.game) return false;
  const before = JSON.stringify(room.game);
  room.game = advanceTimedState(room.game, { now, randomRemovalTokenId: randomRemovalId(room) });
  if (JSON.stringify(room.game) !== before) {
    room.version += 1;
    if (room.game.phase === "GAME_OVER") room.status = "finished";
    return true;
  }
  return false;
}

export async function createRoom(hostUserId: string, origin: string, now = Date.now()) {
  const { room, joinToken, displayToken } = await createRoomRecord(hostUserId, now);
  return {
    code: room.code,
    joinUrl: `${origin}/room/${room.code}/join#${joinToken}`,
    displayUrl: `${origin}/room/${room.code}/display#${displayToken}`,
  };
}

export async function joinRoom(input: {
  code: string;
  joinToken: string;
  nickname: string;
  userId: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const room = await getRoomRecord(input.code);
    if (!room) throw new GameRuleError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
    const revision = room.storageRevision;
    assertNotExpired(room, now);
    if (!verifyJoinToken(room, input.joinToken)) throw new GameRuleError("UNAUTHORIZED", "초대 링크가 유효하지 않습니다.");
    const existing = findPlayer(room, input.userId);
    if (existing) {
      existing.lastSeenAt = now;
      if (await saveRoomRecord(room, revision)) return { code: room.code, seat: existing.seat };
      continue;
    }
    if (room.status !== "lobby") throw new GameRuleError("GAME_ALREADY_STARTED", "이미 시작한 게임입니다.");
    if (room.players.length >= 6) throw new GameRuleError("ROOM_FULL", "방이 가득 찼습니다.");
    const nicknameNormalized = validateNickname(input.nickname);
    if (room.players.some((player) => player.nicknameNormalized === nicknameNormalized)) {
      throw new GameRuleError("NICKNAME_TAKEN", "이미 사용 중인 닉네임입니다.");
    }
    const occupied = new Set(room.players.map((player) => player.seat));
    const seat = [1, 2, 3, 4, 5, 6].find((candidate) => !occupied.has(candidate))!;
    room.players.push({
      seat,
      userId: input.userId,
      nickname: input.nickname.normalize("NFKC").replace(/\s+/gu, " ").trim(),
      nicknameNormalized,
      lastSeenAt: now,
    });
    room.version += 1;
    if (await saveRoomRecord(room, revision)) return { code: room.code, seat };
  }
  throw new GameRuleError("STALE_VERSION", "동시에 많은 사람이 참가했습니다. 다시 시도해 주세요.");
}

function projectLobby(room: RoomRecord, viewerUserId: string | undefined, now: number, display = false): PublicRoomView {
  const isHost = room.hostUserId === viewerUserId;
  return {
    room: { code: room.code, status: "lobby", version: room.version },
    serverNow: new Date(now).toISOString(),
    phase: "LOBBY",
    players: room.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      connected: now - player.lastSeenAt <= 45_000,
      active: true,
      isHost: player.userId === room.hostUserId,
      tokenCount: 4,
      keyCount: 0,
      flashlightUsed: false,
      passed: false,
    })),
    stacks: room.players.map((player) => ({ seat: player.seat, count: 0, revealed: [] })),
    viewer: {
      roles: [
        ...(display ? (["DISPLAY"] as const) : []),
        ...(isHost ? (["HOST"] as const) : []),
        ...(findPlayer(room, viewerUserId ?? "") ? (["PLAYER"] as const) : []),
      ],
      playerSeat: findPlayer(room, viewerUserId ?? "")?.seat,
      legalAdministrativeActions: isHost ? ["START_GAME", "ROTATE_INVITE", "ROTATE_DISPLAY"] : [],
    },
  };
}

export async function getRoomView(input: {
  code: string;
  userId?: string;
  displayToken?: string;
  mode: "public" | "private";
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const room = await getRoomRecord(input.code);
  if (!room) throw new GameRuleError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
  assertNotExpired(room, now);
  const player = input.userId ? findPlayer(room, input.userId) : undefined;
  const isHost = room.hostUserId === input.userId;
  const isDisplay = Boolean(input.displayToken && verifyDisplayToken(room, input.displayToken));
  if (!player && !isHost && !isDisplay) throw new GameRuleError("UNAUTHORIZED", "이 방을 볼 권한이 없습니다.");
  const revision = room.storageRevision;
  const advanced = advanceRoom(room, now);
  if (advanced && !(await saveRoomRecord(room, revision))) {
    return getRoomView(input);
  }
  if (!room.game) return projectLobby(room, input.userId, now, isDisplay);

  const context = {
    code: room.code,
    version: room.version,
    now,
    status: room.status === "finished" ? "finished" as const : "playing" as const,
    hostUserId: room.hostUserId,
    viewerUserId: input.userId,
    display: isDisplay,
  };
  return input.mode === "private" && player
    ? projectPlayer(room.game, context)
    : projectPublic(room.game, context);
}

export async function applyRoomAction(input: {
  code: string;
  userId: string;
  request: ActionRequest;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const room = await getRoomRecord(input.code);
  if (!room) throw new GameRuleError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
  assertNotExpired(room, now);
  const revision = room.storageRevision;
  advanceRoom(room, now);
  const fingerprint = hashSecret(JSON.stringify(input.request.action));
  const processedKey = `${input.userId}:${input.request.clientActionId}`;
  const processed = room.processedActions.get(processedKey);
  if (processed) {
    if (processed.fingerprint !== fingerprint) throw new GameRuleError("ACTION_ID_REUSED", "행동 ID가 다른 요청에 재사용됐습니다.");
    return {
      alreadyApplied: true,
      originalAppliedVersion: processed.resultingVersion,
      currentVersion: room.version,
      projection: await getRoomView({ code: room.code, userId: input.userId, mode: "private", now }),
    };
  }
  if (input.request.expectedVersion !== room.version) throw new GameRuleError("STALE_VERSION", "게임 상태가 바뀌었습니다. 다시 시도해 주세요.");

  const action = input.request.action;
  const isHost = room.hostUserId === input.userId;
  if (action.type === "START_GAME") {
    if (!isHost) throw new GameRuleError("UNAUTHORIZED", "호스트만 시작할 수 있습니다.");
    if (room.status !== "lobby") throw new GameRuleError("GAME_ALREADY_STARTED", "이미 시작한 게임입니다.");
    const connected = room.players.filter((player) => now - player.lastSeenAt <= 45_000);
    if (connected.length < 3) throw new GameRuleError("MIN_PLAYERS", "연결된 플레이어가 3명 이상 필요합니다.");
    room.players = connected;
    room.game = createInitialState(connected.map(({ seat, userId, nickname }) => ({ seat, userId, nickname })));
    room.status = "playing";
    room.expiresAt = Math.min(now + 12 * 60 * 60 * 1_000, room.createdAt + 24 * 60 * 60 * 1_000);
  } else if (action.type === "START_REMATCH") {
    if (!isHost) throw new GameRuleError("UNAUTHORIZED", "호스트만 다시 시작할 수 있습니다.");
    if (room.status !== "finished") throw new GameRuleError("INVALID_PHASE", "게임이 끝난 뒤 다시 할 수 있습니다.");
    const connected = room.players.filter((player) => now - player.lastSeenAt <= 45_000);
    room.game = createInitialState(connected.map(({ seat, userId, nickname }) => ({ seat, userId, nickname })));
    room.players = connected;
    room.status = "playing";
  } else {
    const player = findPlayer(room, input.userId);
    if (!player || !room.game) throw new GameRuleError("UNAUTHORIZED", "플레이어로 참가해야 합니다.");
    room.game = transition(room.game, player.seat, action, {
      now,
      randomRemovalTokenId: randomRemovalId(room),
      sequenceId: input.request.clientActionId,
    });
    if (room.game.phase === "GAME_OVER") room.status = "finished";
  }

  room.version += 1;
  room.processedActions.set(processedKey, { fingerprint, resultingVersion: room.version });
  if (!(await saveRoomRecord(room, revision))) {
    const fresh = await getRoomRecord(room.code);
    const duplicate = fresh?.processedActions.get(processedKey);
    if (duplicate?.fingerprint === fingerprint) {
      return {
        alreadyApplied: true,
        originalAppliedVersion: duplicate.resultingVersion,
        currentVersion: fresh!.version,
        projection: await getRoomView({ code: room.code, userId: input.userId, mode: "private", now }),
      };
    }
    throw new GameRuleError("STALE_VERSION", "게임 상태가 바뀌었습니다. 다시 시도해 주세요.");
  }
  return {
    alreadyApplied: false,
    currentVersion: room.version,
    projection: await getRoomView({ code: room.code, userId: input.userId, mode: "private", now }),
  };
}

export async function heartbeat(input: { code: string; userId?: string; displayToken?: string; now?: number }) {
  const now = input.now ?? Date.now();
  const room = await getRoomRecord(input.code);
  if (!room) throw new GameRuleError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
  assertNotExpired(room, now);
  if (input.userId) {
    const player = findPlayer(room, input.userId);
    if (player) player.lastSeenAt = now;
    if (room.hostUserId === input.userId) room.hostLastSeenAt = now;
    if (!player && room.hostUserId !== input.userId) throw new GameRuleError("UNAUTHORIZED", "방 구성원이 아닙니다.");
  } else if (input.displayToken && verifyDisplayToken(room, input.displayToken)) {
    room.displayLastSeenAt = now;
  } else {
    throw new GameRuleError("UNAUTHORIZED", "heartbeat 권한이 없습니다.");
  }

  if (now - room.hostLastSeenAt > 120_000) {
    const successor = room.players
      .filter((player) => now - player.lastSeenAt <= 45_000)
      .sort((a, b) => a.seat - b.seat)[0];
    if (successor) room.hostUserId = successor.userId;
  }
  const revision = room.storageRevision;
  advanceRoom(room, now);
  if (!(await saveRoomRecord(room, revision))) throw new GameRuleError("STALE_VERSION", "상태가 갱신되었습니다.");
  return { ok: true, serverNow: new Date(now).toISOString() };
}

export async function rotateToken(input: { code: string; userId: string; kind: "join" | "display"; origin: string }) {
  const room = await getRoomRecord(input.code);
  if (!room) throw new GameRuleError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
  if (room.hostUserId !== input.userId) throw new GameRuleError("UNAUTHORIZED", "호스트만 링크를 바꿀 수 있습니다.");
  const revision = room.storageRevision;
  const token = rotateRoomToken(room, input.kind);
  if (!(await saveRoomRecord(room, revision))) throw new GameRuleError("STALE_VERSION", "링크가 이미 변경되었습니다.");
  const segment = input.kind === "join" ? "join" : "display";
  return { url: `${input.origin}/room/${room.code}/${segment}#${token}` };
}
