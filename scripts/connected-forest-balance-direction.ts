import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate } from "../src/modules/connected-forest/analysis/balance-experiments";

const input = JSON.parse(readFileSync("docs/plans/assets/forest-balance-cap4-candidates.json", "utf8")) as { candidates: BalanceCandidate[] };
const candidates = input.candidates.filter((candidate) => candidate.rules.visitorDiversityHearts === 1).flatMap((candidate) => [
  { id: `${candidate.id}-direction`, rules: { ...candidate.rules, visitTieBreak: "SEASON_DIRECTION" } },
  { id: `${candidate.id}-symmetric-direction`, rules: { ...candidate.rules, pathCompletionSenderLeaves: candidate.rules.pathCompletionReceiverLeaves, visitTieBreak: "SEASON_DIRECTION" } },
]);
const unique = candidates.filter((candidate, index) => candidates.findIndex((other) => JSON.stringify(other.rules) === JSON.stringify(candidate.rules)) === index);
writeFileSync("docs/plans/assets/forest-balance-direction-candidates.json", JSON.stringify({ purpose: "avoid absolute-seat default preference and compare symmetric milestones", candidates: unique }, null, 2));
console.log(unique.map((candidate) => candidate.id).join("\n"));
