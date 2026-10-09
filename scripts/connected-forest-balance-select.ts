import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate, BalanceCase } from "../src/modules/connected-forest/analysis/balance-experiments";

const documents = [0, 1, 2].map((index) => JSON.parse(readFileSync(`docs/plans/assets/forest-balance-screen-${index}.json`, "utf8")) as { candidates: BalanceCandidate[]; cases: BalanceCase[] });
const ranking = documents.flatMap((document) => document.candidates.map((candidate) => {
  const cases = document.cases.filter((row) => row.candidateId === candidate.id);
  return { candidate, worst: Math.max(...cases.map((row) => row.winGap)), mean: cases.reduce((sum, row) => sum + row.winGap, 0) / cases.length, free: Math.min(...cases.map((row) => row.freeRate)), freedom: Math.min(...cases.map((row) => row.senderFreedom)) };
})).sort((a, b) => a.worst - b.worst || a.mean - b.mean);
const preferred = ranking.filter((row) => row.freedom >= .5 && row.free >= .7).slice(0, 4);
const incomingControl = ranking.find((row) => row.candidate.rules.visitRouting === "BALANCED_INCOMING")!;
const baseline = ranking.find((row) => row.candidate.id === "free-s2-w3-r3-t3-d0")!;
const selected = [...preferred, incomingControl, baseline];
writeFileSync("docs/plans/assets/forest-balance-shortlist.json", JSON.stringify({ purpose: "exploratory shortlist, not held-out validation", candidates: selected.map((row) => row.candidate), ranking: ranking.map(({ candidate, ...metrics }) => ({ id: candidate.id, ...metrics })) }, null, 2));
console.log(JSON.stringify(selected.map((row) => ({ id: row.candidate.id, worst: row.worst, mean: row.mean, free: row.free, freedom: row.freedom })), null, 2));
