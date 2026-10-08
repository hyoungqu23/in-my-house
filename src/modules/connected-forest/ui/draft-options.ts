import { forestWelcomeChoices, placeForestTerrain } from "../domain/rules";
import type { ForestAnimalCard, ForestPlayer, ForestTerrainKind, ForestWelcomeChoice } from "../domain/types";
import type { ConnectedForestPlayerRoomView } from "@/modules/room/contracts";

export type ForestDraft = {
  cardId?: string;
  hexId?: string;
  useGoldenAcorn: boolean;
  acornTerrain?: ForestTerrainKind;
  refreshAnimalCardId?: ForestAnimalCard["id"];
  welcome?: ForestWelcomeChoice;
  visitAnimalCardId?: ForestAnimalCard["id"];
  targetSeat?: number;
  stayHexId?: string;
  patternRotations?: Partial<Record<ForestAnimalCard["id"], 0 | 1 | 2 | 3 | 4 | 5>>;
};

/** Preview only the viewer's board. The reducer independently checks the submitted choice. */
export function forestDraftOptions(view: ConnectedForestPlayerRoomView, draft: ForestDraft) {
  const publicSelf = view.players.find((player) => player.seat === view.self.seat)!;
  const preview: ForestPlayer = {
    ...structuredClone(publicSelf),
    ...structuredClone(view.self),
    userId: "viewer",
    leaves: publicSelf.score.leafHearts,
    leavesFromPaths: publicSelf.score.leafHeartsFromPaths,
  };
  const card = view.self.hand.find((candidate) => candidate.id === draft.cardId);
  const valid = Boolean(card && draft.hexId && view.self.legalPlacementHexIds.includes(draft.hexId)
    && (!draft.useGoldenAcorn || (view.self.goldenAcornAvailable && draft.acornTerrain)));
  if (!valid) return { preview, choices: [] as ForestWelcomeChoice[], valid: false };
  placeForestTerrain(preview, card!, draft.hexId!, draft.useGoldenAcorn ? draft.acornTerrain : undefined);
  const choices = view.self.welcomedThisSeason ? [] : view.self.activeAnimals
    .filter((animal) => animal.id !== draft.refreshAnimalCardId)
    .flatMap((animal) => forestWelcomeChoices(preview, animal));
  return { preview, choices, valid: true };
}

export const sameForestWelcome = (first: ForestWelcomeChoice, second: ForestWelcomeChoice) =>
  first.animalCardId === second.animalCardId && first.originHexId === second.originHexId
  && first.rotation === second.rotation && first.residentHexId === second.residentHexId;
