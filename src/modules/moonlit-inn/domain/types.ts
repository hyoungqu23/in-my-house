export type InnGuestKind = "rabbit" | "phoenix" | "cat" | "cloud";
export type InnFurnitureKind = "quilt" | "stone" | "basin" | "wood";
export type InnItemKind = "guest" | "furniture";
export type InnWeather = "roof" | "garden";
export type InnRulesVersion = "playtest-1" | "balanced-1";
export type InnPhase = "INN_DRAFT" | "INN_ARRANGE" | "INN_REVEAL" | "INN_NIGHT" | "GAME_OVER";
export type InnGuest = { id: string; kind: InnGuestKind; position: number };
export type InnFurniture = { id: string; kind: InnFurnitureKind; position: number };
export type InnBoard = { guests: InnGuest[]; furniture: InnFurniture[] };
export type InnBundle = { id: string; guest: InnGuest; furniture: InnFurniture };
export type InnPlayer = InnBoard & {
  seat: number; userId: string; nickname: string;
  hand: InnBundle[]; pickedId?: string;
  revision: number; ready: boolean; actionsLeft: number; traded: boolean;
};
export type InnOffer = {
  id: string; fromSeat: number; toSeat: number; kind: InnItemKind;
  outgoingId: string; incomingId: string; receiveAt: number;
  fromRevision: number; toRevision: number;
};
export type InnGuestScore = { id: string; sleeping: boolean; base: number; comfort: number; reason: string };
export type InnScore = { guests: InnGuestScore[]; moon: number; total: number; wetRooms: number[] };
export type InnResult = { cancelled: boolean; scores: Array<{ seat: number; score: InnScore }>; winnerSeats: number[] };
export type InnState = {
  rulesVersion: InnRulesVersion; matchId: string; phase: InnPhase; phaseKey: string;
  draftRound: number; weather: InnWeather; phaseEndsAt?: number;
  players: InnPlayer[]; offers: InnOffer[];
  trades: Array<{ fromSeat: number; toSeat: number; kind: InnItemKind; fromName: string; toName: string }>;
  pause?: { disconnectedSeats: number[]; pausedAt: number; forfeitClaimAt: number };
  result?: InnResult;
};
export type InnSetup = { matchId: string; bundles: InnBundle[]; weather: InnWeather; rulesVersion?: InnRulesVersion };
export type InnAction = { phaseKey: string; revision: number } & (
  | { type: "INN_PICK"; bundleId: string | null }
  | { type: "INN_MOVE"; kind: InnItemKind; itemId: string; to: number }
  | { type: "INN_READY"; ready: boolean }
  | { type: "INN_OFFER"; targetSeat: number; kind: InnItemKind; outgoingId: string; incomingId: string; receiveAt: number }
  | { type: "INN_ACCEPT"; offerId: string; receiveAt: number }
  | { type: "INN_DECLINE"; offerId: string }
  | { type: "INN_SKIP_REVEAL" }
  | { type: "INN_END_DISCONNECTED" }
);
export type InnContext = { now: number; connectedSeats: number[]; sequenceId?: string };
export type InnCommand = { [K in InnAction["type"]]: Omit<Extract<InnAction, { type: K }>, "phaseKey" | "revision"> }[InnAction["type"]];
