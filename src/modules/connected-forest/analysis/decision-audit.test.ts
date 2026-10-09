import { describe, expect, it } from "vitest";
import { connectedForestRules } from "../domain/content";
import type { BalanceCase, BalanceCohort } from "./balance-experiments";
import { auditDecision, type ExperimentDocument } from "./decision-audit";

const complete = (seedBase: number): ExperimentDocument => ({
  engineSha256: "frozen-engine", completed: true, runs: 1500, seedBase,
  candidates: [{ id: "frozen-candidate", rules: connectedForestRules("prototype-1") }],
  cases: (["CORE", "SMART", "MYOPIC"] as BalanceCohort[]).flatMap((cohort) => (["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"] as const).flatMap((sender) => ([4, 5, 6] as const).map((playerCount) => ({ candidateId: "frozen-candidate", playerCount, sender, cohort, seedBase, runs: 1500, tools: false, skill: "GREEDY", order: "SEAT", winGap: .04, gap95: [.02, .08], freeRate: .8, senderFreedom: .6 } as BalanceCase)))),
});
describe("completion decision audit", () => {
  it("requires all planned conditions and independent primary seeds", () => {
    expect(auditDecision([complete(10), complete(20)], []).passed).toBe(true);
    const missing = complete(20); missing.cases.pop();
    expect(auditDecision([complete(10), missing], []).passed).toBe(false);
    expect(auditDecision([complete(10), complete(10)], []).passed).toBe(false);
  });
  it("retains weak primary evidence and accepts only same-condition independent precision", () => {
    const first = complete(10), second = complete(20);
    first.cases[0].gap95 = [.03, .12];
    const extra = complete(30); extra.runs = 5000; extra.cases = [{ ...first.cases[0], seedBase: 30, runs: 5000, gap95: [.04, .09] }];
    const audited = auditDecision([first, second], [extra]);
    expect(audited.passed).toBe(true);
    expect(audited.confirmations[0].primary.gap95?.[1]).toBe(.12);
    extra.engineSha256 = "changed";
    expect(auditDecision([first, second], [extra]).passed).toBe(false);
  });
  it("cannot rescue an observed failure, low choice availability or a different condition", () => {
    const first = complete(10), second = complete(20), extra = complete(30);
    first.cases[0].winGap = .11;
    extra.cases = [{ ...first.cases[0], seedBase: 30, runs: 5000, winGap: .03, gap95: [.01, .07] }];
    expect(auditDecision([first, second], [extra]).passed).toBe(false);
    first.cases[0].winGap = .04; first.cases[0].freeRate = .65;
    expect(auditDecision([first, second], [extra]).passed).toBe(false);
    first.cases[0].freeRate = .8; first.cases[0].gap95 = [.03, .12]; extra.cases[0].playerCount = 5;
    expect(auditDecision([first, second], [extra]).passed).toBe(false);
  });
  it("rejects mixing primary engines even when every row passes", () => {
    const first = complete(10), second = complete(20);
    second.engineSha256 = "different-engine";
    expect(auditDecision([first, second], []).passed).toBe(false);
  });
  it("requires independent seat balance evidence in the stricter final protocol", () => {
    const first = complete(10), second = complete(20);
    expect(auditDecision([first, second], [], { requireSeatBalance: true }).passed).toBe(false);
    for (const doc of [first, second]) for (const row of doc.cases) { row.seatWinGap = .03; row.seatGap95 = [.01, .07]; }
    expect(auditDecision([first, second], [], { requireSeatBalance: true }).passed).toBe(true);
    first.cases[0].seatWinGap = .11;
    expect(auditDecision([first, second], [], { requireSeatBalance: true }).passed).toBe(false);
    first.cases[0].seatWinGap = .06;
    first.cases[0].seatGap95 = [.02, .12];
    first.cases[0].gap95 = [.03, .12];
    const extra = complete(30);
    extra.cases = [{ ...first.cases[0], seedBase: 30, runs: 10000, gap95: [.04, .09], seatGap95: [.02, .08] }];
    expect(auditDecision([first, second], [extra], { requireSeatBalance: true }).passed).toBe(true);
    extra.cases[0].seatGap95 = [.02, .11];
    expect(auditDecision([first, second], [extra], { requireSeatBalance: true }).passed).toBe(false);
  });
});
