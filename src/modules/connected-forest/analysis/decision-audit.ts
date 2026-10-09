import type { BalanceCase, BalanceCandidate } from "./balance-experiments";

export type ExperimentDocument = {
  engineSha256: string;
  candidates: BalanceCandidate[];
  cases: BalanceCase[];
  seedBase: number;
  runs: number;
  completed?: boolean;
};
const sameCondition = (a: BalanceCase, b: BalanceCase) => a.candidateId === b.candidateId && a.playerCount === b.playerCount && a.sender === b.sender && a.cohort === b.cohort && a.tools === b.tools && a.skill === b.skill && a.order === b.order;
const numericalReasons = (row: BalanceCase, requireSeatBalance: boolean) => [
  ...(row.winGap >= .1 ? ["policy gap >= 10%p"] : []),
  ...(!row.gap95 || row.gap95[1] >= .1 ? ["95% upper gap >= 10%p or missing"] : []),
  ...(row.freeRate < .7 ? ["free receiver choice < 70%"] : []),
  ...(row.senderFreedom < .5 ? ["free sender choice < 50%"] : []),
  ...(requireSeatBalance && (!Number.isFinite(row.seatWinGap) || row.seatWinGap >= .1) ? ["seat gap >= 10%p or missing"] : []),
  ...(requireSeatBalance && (!row.seatGap95 || row.seatGap95[1] >= .1) ? ["95% upper seat gap >= 10%p or missing"] : []),
];

/** Preserve all primary evidence. An independent, pre-sized precision run may
 * resolve only uncertainty, never an observed failure or a different condition. */
export function auditDecision(primary: ExperimentDocument[], precision: ExperimentDocument[], options: { requireSeatBalance?: boolean } = {}) {
  const requireSeatBalance = options.requireSeatBalance ?? false;
  const missing: string[] = [];
  const failures: Array<{ condition: string; reasons: string[] }> = [];
  const confirmations: Array<{ condition: string; primary: BalanceCase; confirmation: BalanceCase }> = [];
  const accepted: BalanceCase[] = [];
  const candidateId = primary[0]?.candidates[0]?.id;
  const candidateDefinition = JSON.stringify(primary[0]?.candidates[0]?.rules);
  for (const document of primary) {
    if (document.completed === false || document.candidates.length !== 1 || document.candidates[0].id !== candidateId || JSON.stringify(document.candidates[0].rules) !== candidateDefinition) missing.push("Incomplete or inconsistent candidate document");
    if (document.engineSha256 !== primary[0]?.engineSha256) missing.push("Inconsistent primary experiment engine");
    for (const cohort of ["CORE", "SMART", "MYOPIC"]) for (const sender of ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"]) for (const n of [4, 5, 6]) {
      if (document.cases.filter((row) => row.cohort === cohort && row.sender === sender && row.playerCount === n && row.candidateId === candidateId).length !== 1) missing.push(`${document.seedBase}/${cohort}/${sender}/${n}`);
    }
    for (const row of document.cases) {
      const condition = `${row.seedBase}/${row.tools ? "tools" : "no-tools"}/${row.skill}/${row.order}/${row.cohort}/${row.sender}/${row.playerCount}`;
      const reasons = numericalReasons(row, requireSeatBalance);
      if (!reasons.length) { accepted.push(row); continue; }
      const onlyUncertainty = reasons.every((reason) => reason.startsWith("95%"));
      const independent = onlyUncertainty ? precision.filter((run) => run.engineSha256 === document.engineSha256 && JSON.stringify(run.candidates[0]?.rules) === candidateDefinition && run.completed !== false).flatMap((run) => run.cases).find((confirmation) => sameCondition(row, confirmation) && confirmation.seedBase !== row.seedBase && confirmation.runs >= 5000 && numericalReasons(confirmation, requireSeatBalance).length === 0) : undefined;
      if (independent) { confirmations.push({ condition, primary: row, confirmation: independent }); accepted.push(independent); }
      else failures.push({ condition, reasons });
    }
  }
  if (primary.length < 2 || new Set(primary.map((document) => document.seedBase)).size !== primary.length) missing.push("Independent primary seed families missing");
  return {
    candidateId, passed: accepted.length > 0 && missing.length === 0 && failures.length === 0,
    missing, failures, confirmations, conditions: accepted.length,
    maxPolicyGap: Math.max(0, ...accepted.map((row) => row.winGap)),
    maxPrimaryObservedGap: Math.max(0, ...primary.flatMap((document) => document.cases).map((row) => row.winGap)),
    max95Upper: Math.max(0, ...accepted.map((row) => row.gap95![1])),
    minFreeRate: Math.min(1, ...accepted.map((row) => row.freeRate)),
    minSenderFreedom: Math.min(1, ...accepted.map((row) => row.senderFreedom)),
    seatBalanceRequired: requireSeatBalance,
    maxSeatGap: Math.max(0, ...accepted.map((row) => row.seatWinGap ?? 0)),
    maxSeat95Upper: Math.max(0, ...accepted.map((row) => row.seatGap95?.[1] ?? 0)),
    accepted,
  };
}
