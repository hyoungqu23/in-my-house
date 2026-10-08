import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { BALANCE_COHORTS } from "../src/modules/connected-forest/analysis/balance-experiments";
import type { BalanceCohort } from "../src/modules/connected-forest/analysis/balance-experiments";
import { auditDecision } from "../src/modules/connected-forest/analysis/decision-audit";
import type { ExperimentDocument } from "../src/modules/connected-forest/analysis/decision-audit";
import { connectedForestRules, CONNECTED_FOREST_CURRENT_RULES_VERSION } from "../src/modules/connected-forest/domain/content";

type Planned = { family: string; runs: number; seedBase: number; tools: boolean; skill: string; order: string; cohorts: BalanceCohort[]; senders: string[]; counts: number[] };
type Protocol = { engineSha256: string; candidates: ExperimentDocument["candidates"]; primary: Planned[]; precision: Planned[] };
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const protocolPath = "docs/plans/assets/forest-balance-fair-protocol.json";
const amendmentPath = "docs/plans/assets/forest-balance-fair-no-tools-amendment.json";
const protocol = read<Protocol>(protocolPath);
const amendment = read<{ engineSha256: string; precision: Planned }>(amendmentPath);
const engineFiles = ["src/modules/connected-forest/domain/content.ts", "src/modules/connected-forest/domain/rules.ts", "src/modules/connected-forest/domain/reducer.ts", "src/modules/connected-forest/domain/simulator.ts", "src/modules/connected-forest/analysis/balance-experiments.ts"];
const liveEngine = createHash("sha256").update(engineFiles.map((path) => `${path}\n${readFileSync(path, "utf8")}`).join("\n")).digest("hex");
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
requireThat(liveEngine === protocol.engineSha256 && amendment.engineSha256 === liveEngine, "Frozen engine no longer matches current source");
requireThat(CONNECTED_FOREST_CURRENT_RULES_VERSION === "balanced-2" && JSON.stringify(protocol.candidates[0]?.rules) === JSON.stringify(connectedForestRules("balanced-2")), "Registered/default rules differ from the tested candidate");
const equal = (a: number, b: number) => Math.abs(a - b) < 1e-10;
const rate = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
const interval = (value: [number, number] | undefined) => value?.length === 2 && value.every(rate) && value[0] <= value[1];

function inspect(plan: Planned, kind: "primary" | "precision") {
  const path = `docs/plans/assets/forest-balance-fair-${kind}-${plan.family}.json`;
  const doc = read<ExperimentDocument & { tools: boolean; skill: string; order: string; expectedCases: number }>(path);
  requireThat(doc.completed === true, `Experiment is not complete: ${path}`);
  requireThat(doc.engineSha256 === liveEngine && JSON.stringify(doc.candidates) === JSON.stringify(protocol.candidates), `Candidate/engine changed: ${path}`);
  requireThat(doc.seedBase === plan.seedBase && doc.runs === plan.runs && doc.tools === plan.tools && doc.skill === plan.skill && doc.order === plan.order, `Execution differs from frozen plan: ${path}`);
  const expected = plan.cohorts.flatMap((cohort) => plan.senders.flatMap((sender) => plan.counts.map((count) => `${cohort}/${sender}/${count}`)));
  requireThat(doc.expectedCases === expected.length && doc.cases.length === expected.length, `Condition count differs: ${path}`);
  const keys = doc.cases.map((row) => `${row.cohort}/${row.sender}/${row.playerCount}`);
  requireThat(new Set(keys).size === expected.length && expected.every((key) => keys.includes(key)), `Missing/duplicate conditions: ${path}`);
  for (const row of doc.cases) {
    requireThat(row.candidateId === protocol.candidates[0].id && row.seedBase === plan.seedBase && row.runs === plan.runs && row.tools === plan.tools && row.skill === plan.skill && row.order === plan.order, `Inconsistent row: ${path}`);
    requireThat([row.winGap, row.seatWinGap, row.freeRate, row.senderFreedom].every(rate) && interval(row.gap95) && interval(row.seatGap95), `Invalid/missing metrics: ${path}`);
    const agents = BALANCE_COHORTS[row.cohort];
    requireThat(Object.keys(row.policy).length === agents.length && agents.every((agent) => row.policy[agent]), `Policy cohort differs: ${path}`);
    const policies = agents.map((agent) => row.policy[agent]!);
    requireThat(policies.every((entry) => Number.isInteger(entry.exposures) && entry.exposures > 0 && Number.isInteger(entry.wins) && entry.wins >= 0 && entry.wins <= entry.exposures && equal(entry.winRate, entry.wins / entry.exposures)), `Invalid policy accounting: ${path}`);
    requireThat(policies.reduce((sum, entry) => sum + entry.exposures, 0) === row.playerCount * row.runs, `Wrong exposure total: ${path}`);
    requireThat(equal(policies.reduce((sum, entry) => sum + entry.exposures * entry.tieSplitWinRate, 0), row.runs), `Tie-split winners do not sum to game count: ${path}`);
    const wins = policies.map((entry) => entry.winRate);
    requireThat(equal(row.winGap, Math.max(...wins) - Math.min(...wins)), `Policy gap does not match raw rates: ${path}`);
    requireThat(row.seatWinRates.length === row.playerCount && row.seatWinRates.every(rate) && equal(row.seatWinGap, Math.max(...row.seatWinRates) - Math.min(...row.seatWinRates)), `Seat gap does not match raw rates: ${path}`);
  }
  return { path, doc };
}

const primary = protocol.primary.map((plan) => inspect(plan, "primary"));
const precision = [...protocol.precision, amendment.precision].map((plan) => inspect(plan, "precision"));
const audit = auditDecision(primary.map((entry) => entry.doc), precision.map((entry) => entry.doc), { requireSeatBalance: true });
requireThat(audit.conditions === 135, "Final audit did not inspect all 135 primary conditions");
const rows = primary.flatMap((entry) => entry.doc.cases);
const range = (values: number[]) => [Math.min(...values), Math.max(...values)];
const diagnostics = {
  primarySeatGapRange: range(rows.map((row) => row.seatWinGap)),
  primarySeat95UpperRange: range(rows.map((row) => row.seatGap95![1])),
  pathScoreShareRange: range(rows.map((row) => row.pathScoreShare)),
  completedPathsPerGameRange: range(rows.map((row) => row.pathsPerGame)),
  incomingGapRange: range(rows.map((row) => row.incomingGap)),
  walkRates: Object.fromEntries((["MIXED", "ADAPTIVE", "IMMEDIATE"] as const).map((agent) => [agent, range(rows.flatMap((row) => row.policy[agent] ? [row.policy[agent]!.freeWalkRate] : []))])),
};
const totalGames = [...primary, ...precision].reduce((sum, entry) => sum + entry.doc.cases.length * entry.doc.runs, 0);
requireThat(totalGames === 472500, "Evidence differs from the complete fixed-size plan");
const output = "docs/plans/assets/forest-balance-fair-decision-audit.json";
writeFileSync(output, JSON.stringify({ checkedAt: new Date().toISOString(), protocolPath, amendmentPath, engineSha256: liveEngine, primaryPaths: primary.map((entry) => entry.path), precisionPaths: precision.map((entry) => entry.path), totalGames, diagnostics, ...audit }, null, 2));
console.log(JSON.stringify({ output, totalGames, diagnostics, ...audit, accepted: undefined, confirmations: audit.confirmations.map((record) => ({ condition: record.condition, primaryGap: record.primary.winGap, originalUpper: record.primary.gap95?.[1], confirmationRuns: record.confirmation.runs, confirmationUpper: record.confirmation.gap95?.[1] })) }, null, 2));
if (!audit.passed) process.exitCode = 1;
