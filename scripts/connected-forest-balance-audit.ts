import { readFileSync, writeFileSync } from "node:fs";
import type { BalanceCase } from "../src/modules/connected-forest/analysis/balance-experiments";

const files = process.argv.slice(2);
if (!files.length) throw new Error("Supply completed experiment files");
const documents = files.map((path) => ({ path, data: JSON.parse(readFileSync(path, "utf8")) as { engineSha256: string; candidates: Array<{ id: string }>; cases: BalanceCase[]; runs: number; seedBase: number } }));
const rows = documents.flatMap(({ path, data }) => data.cases.map((row) => ({ ...row, path })));
const failures = rows.flatMap((row) => {
  const reasons: string[] = [];
  if (row.winGap >= .1) reasons.push("observed policy gap >= 10%p");
  if (!row.gap95 || row.gap95[1] >= .1) reasons.push("95% upper gap >= 10%p or missing");
  if (row.freeRate < .7) reasons.push("free receiver choice < 70%");
  if (row.senderFreedom < .5) reasons.push("free sender choice < 50%");
  return reasons.length ? [{ path: row.path, n: row.playerCount, sender: row.sender, cohort: row.cohort, gap: row.winGap, upper: row.gap95?.[1], free: row.freeRate, reasons }] : [];
});
// This final audit requires the full planned 45-condition matrix, not just
// whichever cohorts happen to have appeared in an unfinished checkpoint.
const missing = documents.flatMap(({ path, data }) => data.candidates.flatMap((candidate) =>
  ["CORE", "SMART", "MYOPIC"].flatMap((cohort) => ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"].flatMap((sender) =>
    [4, 5, 6].flatMap((n) => {
      const count = data.cases.filter((row) => row.candidateId === candidate.id && row.cohort === cohort && row.sender === sender && row.playerCount === n).length;
      return count === 1 ? [] : [{ path, candidate: candidate.id, cohort, sender, n, expected: 1, actual: count }];
    }),
  )),
));
const summary = { checkedAt: new Date().toISOString(), files, rows: rows.length, runs: documents.map(({ path, data }) => ({ path, runs: data.runs, seed: data.seedBase, engineSha256: data.engineSha256 })), missing,
  maxPolicyGap: Math.max(...rows.map((row) => row.winGap)), max95Upper: Math.max(...rows.map((row) => row.gap95?.[1] ?? 1)),
  minFreeRate: Math.min(...rows.map((row) => row.freeRate)), minSenderFreedom: Math.min(...rows.map((row) => row.senderFreedom)),
  maxSeatGap: Math.max(...rows.map((row) => row.seatWinGap ?? 1)), failures,
  passed: rows.length > 0 && missing.length === 0 && failures.length === 0 };
writeFileSync("docs/plans/assets/forest-balance-audit.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
