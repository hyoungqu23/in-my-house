import type {
  FootprintsLayout,
  FootprintsMatchSetup,
  FootprintsRoom,
  FootprintsTarget,
  FootprintsTargetId,
} from "./types";

const ROOMS: readonly FootprintsRoom[] = [
  { id: "study", name: "서재", zone: "WEST", floor: "WOOD" },
  { id: "bedroom", name: "침실", zone: "WEST", floor: "CARPET" },
  { id: "bathroom", name: "욕실", zone: "WEST", floor: "TILE" },
  { id: "living-room", name: "거실", zone: "CENTER", floor: "WOOD" },
  { id: "central-hall", name: "중앙홀", zone: "CENTER", floor: "CARPET" },
  { id: "kitchen", name: "주방", zone: "CENTER", floor: "TILE" },
  { id: "workshop", name: "작업실", zone: "EAST", floor: "WOOD" },
  { id: "parlor", name: "응접실", zone: "EAST", floor: "CARPET" },
  { id: "laundry", name: "세탁실", zone: "EAST", floor: "TILE" },
] as const;

const TARGETS: Record<FootprintsTargetId, Omit<FootprintsTarget, "roomId">> = {
  "silver-coins": { id: "silver-coins", name: "은화 주머니", value: 2, minimumTurns: 5 },
  "starlight-necklace": { id: "starlight-necklace", name: "별빛 목걸이", value: 4, minimumTurns: 6 },
  "golden-cat": { id: "golden-cat", name: "황금 고양이상", value: 6, minimumTurns: 7 },
};

const target = (id: FootprintsTargetId, roomId: string): FootprintsTarget => ({
  ...TARGETS[id],
  roomId,
});

const layout = (
  definition: Omit<FootprintsLayout, "rooms">,
): FootprintsLayout => ({
  ...definition,
  rooms: ROOMS.map((room) => ({ ...room })),
});

export const FOOTPRINTS_LAYOUTS: readonly FootprintsLayout[] = [
  layout({
    id: "open-gallery",
    name: "열린 회랑",
    passages: [
      ["study", "central-hall"],
      ["parlor", "laundry"],
      ["bathroom", "laundry"],
      ["bedroom", "living-room"],
      ["bedroom", "central-hall"],
      ["living-room", "laundry"],
      ["bathroom", "living-room"],
      ["central-hall", "workshop"],
      ["workshop", "parlor"],
      ["central-hall", "kitchen"],
      ["study", "bathroom"],
      ["kitchen", "laundry"],
    ],
    entranceRoomIds: ["study", "bedroom", "living-room"],
    guardStartRoomId: "kitchen",
    targets: [
      target("silver-coins", "laundry"),
      target("starlight-necklace", "workshop"),
      target("golden-cat", "parlor"),
    ],
  }),
  layout({
    id: "crossed-hall",
    name: "엇갈린 복도",
    passages: [
      ["bathroom", "kitchen"],
      ["living-room", "kitchen"],
      ["study", "bedroom"],
      ["kitchen", "parlor"],
      ["study", "laundry"],
      ["living-room", "central-hall"],
      ["bathroom", "parlor"],
      ["living-room", "workshop"],
      ["bedroom", "laundry"],
      ["study", "workshop"],
      ["study", "bathroom"],
      ["bedroom", "central-hall"],
    ],
    entranceRoomIds: ["bathroom", "parlor", "laundry"],
    guardStartRoomId: "workshop",
    targets: [
      target("silver-coins", "bedroom"),
      target("starlight-necklace", "living-room"),
      target("golden-cat", "central-hall"),
    ],
  }),
  layout({
    id: "ring-manor",
    name: "고리 저택",
    passages: [
      ["study", "bedroom"],
      ["study", "workshop"],
      ["laundry", "kitchen"],
      ["bathroom", "laundry"],
      ["bathroom", "living-room"],
      ["central-hall", "workshop"],
      ["living-room", "laundry"],
      ["bedroom", "living-room"],
      ["kitchen", "parlor"],
      ["bathroom", "parlor"],
      ["study", "central-hall"],
      ["workshop", "parlor"],
    ],
    entranceRoomIds: ["kitchen", "workshop", "parlor"],
    guardStartRoomId: "study",
    targets: [
      target("silver-coins", "laundry"),
      target("starlight-necklace", "living-room"),
      target("golden-cat", "bedroom"),
    ],
  }),
] as const;

export function createMatchSetup(input: {
  seats: number[];
  previousLayoutId?: FootprintsLayout["id"];
  randomIndex: (maxExclusive: number) => number;
}): FootprintsMatchSetup {
  const available = FOOTPRINTS_LAYOUTS.filter((candidate) => candidate.id !== input.previousLayoutId);
  const selected = available[input.randomIndex(available.length)];
  return {
    layout: structuredClone(selected),
    intruderSeat: input.seats[0],
    guardSeat: input.seats[1],
  };
}
