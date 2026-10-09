import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate } from "../src/modules/connected-forest/analysis/balance-experiments";
const input = JSON.parse(readFileSync("docs/plans/assets/forest-balance-diversity-candidates.json", "utf8")) as { candidates: BalanceCandidate[] };
const base = input.candidates.find((candidate) => candidate.rules.visitorDiversityCap === 2)!;
const candidates = [0, 1, 2].map((staySenderLeaves) => ({ id: `${base.id}-gift${staySenderLeaves}`, rules: { ...base.rules, staySenderLeaves } }));
writeFileSync("docs/plans/assets/forest-balance-gift-candidates.json", JSON.stringify({ purpose: "joint receiver diversity limit and sender hosting reward", candidates }, null, 2));
console.log(candidates.map((candidate) => candidate.id).join("\n"));
