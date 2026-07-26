import { describe, expect, it } from "vitest";
import { createMatchSetup } from "./content";
import type { FootprintsLayout } from "./types";

const adjacencyFor = (layout: FootprintsLayout) => {
  const adjacency = new Map(layout.rooms.map((room) => [room.id, [] as string[]]));
  for (const [first, second] of layout.passages) {
    adjacency.get(first)!.push(second);
    adjacency.get(second)!.push(first);
  }
  return adjacency;
};

const shortestDistance = (
  adjacency: Map<string, string[]>,
  from: string,
  to: string,
) => {
  const queue: Array<[string, number]> = [[from, 0]];
  const visited = new Set([from]);
  while (queue.length > 0) {
    const [roomId, distance] = queue.shift()!;
    if (roomId === to) return distance;
    for (const next of adjacency.get(roomId) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([next, distance + 1]);
    }
  }
  return Number.POSITIVE_INFINITY;
};

const simplePaths = (
  adjacency: Map<string, string[]>,
  from: string,
  to: string,
  visited = new Set([from]),
): string[][] => {
  if (from === to) return [[to]];
  return (adjacency.get(from) ?? []).flatMap((next) => {
    if (visited.has(next)) return [];
    const nextVisited = new Set(visited).add(next);
    return simplePaths(adjacency, next, to, nextVisited).map((path) => [from, ...path]);
  });
};

describe("midnight footprints map setup", () => {
  it("selects one of three complete nine-room layouts", () => {
    const setups = [0, 1, 2].map((layoutIndex) =>
      createMatchSetup({
        seats: [1, 2],
        previousLayoutId: undefined,
        randomIndex: () => layoutIndex,
      }),
    );

    expect(setups.map((setup) => setup.layout.id)).toEqual([
      "open-gallery",
      "crossed-hall",
      "ring-manor",
    ]);
    for (const setup of setups) {
      expect(setup.layout.rooms).toHaveLength(9);
      expect(new Set(setup.layout.rooms.map((room) => `${room.zone}:${room.floor}`))).toHaveLength(9);
      expect(setup.intruderSeat).toBe(1);
      expect(setup.guardSeat).toBe(2);
    }
  });

  it("returns layouts that satisfy the agreed route and enclosure constraints", () => {
    for (const layoutIndex of [0, 1, 2]) {
      const { layout } = createMatchSetup({
        seats: [1, 2],
        randomIndex: () => layoutIndex,
      });
      const adjacency = adjacencyFor(layout);
      const entranceZones = layout.entranceRoomIds.map((roomId) =>
        layout.rooms.find((room) => room.id === roomId)!.zone,
      );
      expect(new Set(entranceZones).size).toBeLessThan(3);

      for (const target of layout.targets) {
        expect(adjacency.get(target.roomId)!.length).toBeGreaterThanOrEqual(2);
        const turnsByEntrance = layout.entranceRoomIds.map((entryRoomId) => {
          const validExits = layout.entranceRoomIds.filter((roomId) => roomId !== entryRoomId);
          return 2
            + shortestDistance(adjacency, entryRoomId, target.roomId)
            + Math.min(...validExits.map((exitRoomId) =>
              shortestDistance(adjacency, target.roomId, exitRoomId),
            ));
        });
        expect(Math.min(...turnsByEntrance)).toBe(target.minimumTurns);
        expect(Math.max(...turnsByEntrance)).toBeLessThanOrEqual(target.minimumTurns + 2);

        for (const entryRoomId of layout.entranceRoomIds) {
          const [firstExit, secondExit] = layout.entranceRoomIds.filter(
            (roomId) => roomId !== entryRoomId,
          );
          const firstPaths = simplePaths(adjacency, target.roomId, firstExit);
          const secondPaths = simplePaths(adjacency, target.roomId, secondExit);
          const hasIndependentPair = firstPaths.some((firstPath) =>
            secondPaths.some((secondPath) => {
              const firstRoute = new Set(firstPath.slice(1));
              return secondPath.slice(1).every((roomId) => !firstRoute.has(roomId));
            }),
          );
          expect(hasIndependentPair).toBe(true);
        }
      }
    }

    const layouts = [0, 1, 2].map((layoutIndex) =>
      createMatchSetup({ seats: [1, 2], randomIndex: () => layoutIndex }).layout,
    );
    expect(layouts.some((layout) => {
      const adjacency = adjacencyFor(layout);
      return layout.rooms.some((room) =>
        !layout.entranceRoomIds.includes(room.id)
        && adjacency.get(room.id)?.length === 2,
      );
    })).toBe(true);
  });
});
