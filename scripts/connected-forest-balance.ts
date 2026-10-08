import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { BALANCE_SENDERS, createBalanceCandidates, runBalanceCase } from "../src/modules/connected-forest/analysis/balance-experiments";
import type { BalanceCandidate, BalanceCase, BalanceCohort, BalanceSample } from "../src/modules/connected-forest/analysis/balance-experiments";
import type { ForestSenderModel } from "../src/modules/connected-forest/domain/simulator";

const arg = (name: string, fallback: string) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const runs = Number(arg("--runs", "60"));
const seedBase = Number(arg("--seed", "70000"));
const shard = Number(arg("--shard", "0"));
const shardCount = Number(arg("--shards", "1"));
const stage = arg("--stage", "screen");
const output = arg("--output", `docs/plans/assets/forest-balance-${stage}-${shard}.json`);
const input = arg("--input", "");
const candidates: BalanceCandidate[] = input ? JSON.parse(readFileSync(input, "utf8")).candidates : createBalanceCandidates();
const ids = arg("--ids", "").split(",").filter(Boolean);
const selected = candidates.filter((candidate, index) => (!ids.length || ids.includes(candidate.id)) && index % shardCount === shard);
const cohorts = arg("--cohorts", stage === "screen" ? "CORE" : "CORE,SMART").split(",") as BalanceCohort[];
const explicitSenders = arg("--senders", "");
const senders: Array<ForestSenderModel | "HETEROGENEOUS"> = explicitSenders ? explicitSenders.split(",") as Array<ForestSenderModel | "HETEROGENEOUS"> : stage === "screen" ? BALANCE_SENDERS.slice(0, 3) : [...BALANCE_SENDERS, "HETEROGENEOUS" as const];
const counts = arg("--counts", "4,5,6").split(",").map(Number) as Array<4 | 5 | 6>;
const tools = process.argv.includes("--tools");
const bootstrap = Number(arg("--bootstrap", "0"));
const order = arg("--order", "SEAT") as "SEAT" | "REVERSE" | "SHUFFLED";
const skill = arg("--skill", "GREEDY") as "GREEDY" | "NOISY" | "RANDOM";
const cases: BalanceCase[] = [];
const raw: Array<{ candidateId: string; count: number; sender: string; cohort: string; samples: BalanceSample[] }> = [];
const startedAt = new Date().toISOString();
let completed = false;
const engineFiles = ["src/modules/connected-forest/domain/content.ts", "src/modules/connected-forest/domain/rules.ts", "src/modules/connected-forest/domain/reducer.ts", "src/modules/connected-forest/domain/simulator.ts", "src/modules/connected-forest/analysis/balance-experiments.ts"];
const engineSha256 = createHash("sha256").update(engineFiles.map((path) => `${path}\n${readFileSync(path, "utf8")}`).join("\n")).digest("hex");
mkdirSync(dirname(output), { recursive: true });
const checkpoint = () => writeFileSync(output, JSON.stringify({ formatVersion: 1, engineSha256, stage, startedAt, updatedAt: new Date().toISOString(), completed, expectedCases: selected.length * cohorts.length * senders.length * counts.length, cohorts, senders, counts, runs, seedBase, tools, order, skill, candidates: selected, cases, samples: process.argv.includes("--raw") ? raw : undefined }, null, 2));
if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(shardCount) || shardCount < 1) throw new Error("Invalid experiment size");
if (senders.some((sender) => ![...BALANCE_SENDERS, "HETEROGENEOUS"].includes(sender)) || counts.some((count) => ![4, 5, 6].includes(count))) throw new Error("Invalid experiment matrix");
console.log(`${stage}: ${selected.length} candidates × ${senders.length} sender models × ${counts.length} table sizes × ${cohorts.length} cohorts × ${runs} games`);
for (const candidate of selected) {
  const rows: BalanceCase[] = [];
  for (const cohort of cohorts) for (const sender of senders) for (const playerCount of counts) {
    const evaluated = runBalanceCase({ candidate, cohort, sender, playerCount, runs, seedBase, tools, order, skill, bootstrap });
    rows.push(evaluated.result); cases.push(evaluated.result);
    if (process.argv.includes("--raw")) raw.push({ candidateId: candidate.id, count: playerCount, sender, cohort, samples: evaluated.samples });
    checkpoint();
  }
  checkpoint();
  console.log(`${candidate.id}: worst ${(100 * Math.max(...rows.map((row) => row.winGap))).toFixed(1)}%p, free ${(100 * Math.min(...rows.map((row) => row.freeRate))).toFixed(1)}%, sender freedom ${(100 * Math.min(...rows.map((row) => row.senderFreedom))).toFixed(1)}%`);
}
completed = true;
checkpoint();
console.log(`completed: ${output}`);
