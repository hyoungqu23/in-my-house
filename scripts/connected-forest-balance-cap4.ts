import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate } from "../src/modules/connected-forest/analysis/balance-experiments";

const input = JSON.parse(readFileSync("docs/plans/assets/forest-balance-shortlist.json", "utf8")) as { candidates: BalanceCandidate[] };
const selected = input.candidates.filter((candidate) => candidate.id === "alternate-s1-w2-r1-t1-d1" || candidate.id === "alternate-s1-w2-r2-t1-d1" || candidate.id === "alternate-s2-w2-r2-t1-d0");
const candidates = selected.map((candidate) => ({ id: `${candidate.id}-cap4`, rules: { ...candidate.rules, pathCap: 4 } }));
writeFileSync("docs/plans/assets/forest-balance-cap4-candidates.json", JSON.stringify({ purpose: "preserve receiver choice availability under tool-enabled density", candidates }, null, 2));
console.log(candidates.map((candidate) => candidate.id).join("\n"));
