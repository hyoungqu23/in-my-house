export const GAME_IDS = ["dark-house", "suspicious-invite", "dawn-switchboard"] as const;

export type GameId = (typeof GAME_IDS)[number];
export type GameAvailability = "playable" | "coming-soon";

export type GameDefinition = {
  id: GameId;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  durationMinutes: readonly [number, number];
  availability: GameAvailability;
};

export const games = [
  {
    id: "dark-house",
    title: "불 꺼진 집",
    minPlayers: 3,
    maxPlayers: 6,
    durationMinutes: [10, 20],
    availability: "playable",
  },
  {
    id: "suspicious-invite",
    title: "수상한 초대장",
    minPlayers: 3,
    maxPlayers: 6,
    durationMinutes: [15, 25],
    availability: "playable",
  },
  {
    id: "dawn-switchboard",
    title: "새벽의 배전반",
    minPlayers: 3,
    maxPlayers: 6,
    durationMinutes: [12, 18],
    availability: "playable",
  },
] as const satisfies readonly GameDefinition[];

export function findGame(gameId: string) {
  return games.find((game) => game.id === gameId);
}
