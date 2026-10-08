import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate } from "../src/modules/connected-forest/analysis/balance-experiments";
const input = JSON.parse(readFileSync("docs/plans/assets/forest-balance-diversity-candidates.json", "utf8")) as { candidates: BalanceCandidate[] };
const base = input.candidates.find((candidate) => candidate.rules.visitorDiversityCap === 2)!;
const candidates = [{ id: `${base.id}-direction`, rules: { ...base.rules, visitTieBreak: "SEASON_DIRECTION" } }];
writeFileSync("docs/plans/assets/forest-balance-capped-direction-candidates.json", JSON.stringify({ purpose: "remove absolute-seat preference without changing rewards or routing availability", candidates }, null, 2));
console.log(candidates[0].id);
