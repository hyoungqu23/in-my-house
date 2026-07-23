import type { DarkHouseState } from "@/modules/dark-house/domain/types";
import type { SuspiciousInviteState } from "@/modules/suspicious-invite/domain/types";

export type StoredGame =
  | { type: "dark-house"; state: DarkHouseState }
  | { type: "suspicious-invite"; state: SuspiciousInviteState };
