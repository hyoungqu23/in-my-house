import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCandidate, BalanceCase } from "../src/modules/connected-forest/analysis/balance-experiments";

const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Pass result JSON paths");
const documents = paths.map((path) => ({ path, data: JSON.parse(readFileSync(path, "utf8")) as { candidates: BalanceCandidate[]; cases: BalanceCase[]; runs: number; seedBase: number; engineSha256?: string } }));
const summaries = documents.flatMap(({ path, data }) => data.candidates.map((candidate) => {
  const rows = data.cases.filter((row) => row.candidateId === candidate.id);
  if (!rows.length) return undefined;
  const adaptive = rows.filter((row) => row.cohort === "SMART");
  const immediate = rows.filter((row) => row.cohort === "MYOPIC");
  return { path, id: candidate.id, rows: rows.length, runs: data.runs, seed: data.seedBase, engineSha256: data.engineSha256,
    worstGap: Math.max(...rows.map((row) => row.winGap)), gap95Upper: rows.some((row) => row.gap95) ? Math.max(...rows.map((row) => row.gap95?.[1] ?? 0)) : undefined,
    minFreeRate: Math.min(...rows.map((row) => row.freeRate)), minSenderFreedom: Math.min(...rows.map((row) => row.senderFreedom)),
    seatGap: rows.some((row) => row.seatWinGap !== undefined) ? Math.max(...rows.map((row) => row.seatWinGap ?? 0)) : undefined,
    adaptiveWalkRange: adaptive.length ? [Math.min(...adaptive.map((row) => row.adaptiveWalkRate!)), Math.max(...adaptive.map((row) => row.adaptiveWalkRate!))] : undefined,
    immediateWalkRange: immediate.length ? [Math.min(...immediate.map((row) => row.policy.IMMEDIATE!.freeWalkRate)), Math.max(...immediate.map((row) => row.policy.IMMEDIATE!.freeWalkRate))] : undefined,
    pathScoreRange: [Math.min(...rows.map((row) => row.pathScoreShare)), Math.max(...rows.map((row) => row.pathScoreShare))],
    pathsRange: [Math.min(...rows.map((row) => row.pathsPerGame)), Math.max(...rows.map((row) => row.pathsPerGame))] };
})).filter(Boolean);
writeFileSync("docs/plans/assets/forest-balance-progress-summary.json", JSON.stringify({ updatedAt: new Date().toISOString(), summaries }, null, 2));
console.log(JSON.stringify(summaries, null, 2));
