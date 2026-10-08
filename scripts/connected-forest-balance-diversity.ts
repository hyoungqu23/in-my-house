import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate } from "../src/modules/connected-forest/analysis/balance-experiments";
const document = JSON.parse(readFileSync("docs/plans/assets/forest-balance-cap4-candidates.json", "utf8")) as { candidates: BalanceCandidate[] };
const base = document.candidates.find((candidate) => candidate.id === "alternate-s1-w2-r1-t1-d1-cap4")!;
const candidates = [2, 3, 4].map((visitorDiversityCap) => ({ id: `${base.id}-guests${visitorDiversityCap}`, rules: { ...base.rules, visitorDiversityCap } }));
candidates.push({ id: `${base.id}-symmetric2`, rules: { ...base.rules, pathCompletionReceiverLeaves: 2, pathCompletionSenderLeaves: 2, visitorDiversityCap: 12 } });
writeFileSync("docs/plans/assets/forest-balance-diversity-candidates.json", JSON.stringify({ purpose: "bound the arrival-feedback reward while preserving new-friend collection", candidates }, null, 2));
console.log(candidates.map((candidate) => candidate.id).join("\n"));
