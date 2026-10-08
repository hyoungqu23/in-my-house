import { readFileSync, writeFileSync } from "node:fs";
import { runBalanceCase } from "../src/modules/connected-forest/analysis/balance-experiments";
import type { BalanceCandidate } from "../src/modules/connected-forest/analysis/balance-experiments";

const input = JSON.parse(readFileSync("docs/plans/assets/forest-balance-shortlist.json", "utf8")) as { candidates: BalanceCandidate[] };
const candidate = input.candidates.find((entry) => entry.id === "alternate-s1-w2-r1-t1-d1")!;
const rows = ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE"].map((sender) => runBalanceCase({ candidate, playerCount: 4, sender: sender as "A_SHORTEST" | "B_RANDOM" | "C_NEARLY_DONE", runs: 600, seedBase: 223607 }).result);
writeFileSync("docs/plans/assets/forest-balance-seat-audit.json", JSON.stringify({ candidate, rows }, null, 2));
console.log(JSON.stringify(rows.map((row) => ({ sender: row.sender, policyGap: row.winGap, seatRates: row.seatWinRates, seatGap: row.seatWinGap })), null, 2));
