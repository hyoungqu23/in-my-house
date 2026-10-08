import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { connectedForestRules } from "../src/modules/connected-forest/domain/content";

const engineFiles = ["src/modules/connected-forest/domain/content.ts", "src/modules/connected-forest/domain/rules.ts", "src/modules/connected-forest/domain/reducer.ts", "src/modules/connected-forest/domain/simulator.ts", "src/modules/connected-forest/analysis/balance-experiments.ts"];
const engineSha256 = createHash("sha256").update(engineFiles.map((path) => `${path}\n${readFileSync(path, "utf8")}`).join("\n")).digest("hex");
const candidate = { id: "balanced-2", rules: connectedForestRules("balanced-2") };
const protocol = {
  frozenAt: new Date().toISOString(), engineSha256, candidates: [candidate],
  purpose: "Same rewards as balanced-1; eliminate numeric-seat automatic/default targeting bias. Fresh engine, independent fixed-size evidence; no legacy data pooling.",
  primary: [
    { family: "tools", runs: 1500, seedBase: 1540027, tools: true, skill: "GREEDY", order: "SHUFFLED", cohorts: ["CORE", "SMART", "MYOPIC"], senders: ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"], counts: [4, 5, 6] },
    { family: "no-tools", runs: 1500, seedBase: 1684003, tools: false, skill: "GREEDY", order: "REVERSE", cohorts: ["CORE", "SMART", "MYOPIC"], senders: ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"], counts: [4, 5, 6] },
    { family: "noisy", runs: 1500, seedBase: 1792009, tools: true, skill: "NOISY", order: "REVERSE", cohorts: ["CORE", "SMART", "MYOPIC"], senders: ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"], counts: [4, 5, 6] },
  ],
  precision: [
    { family: "tools-n4", runs: 10000, seedBase: 2031013, tools: true, skill: "GREEDY", order: "SHUFFLED", cohorts: ["CORE", "SMART", "MYOPIC"], senders: ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE", "HETEROGENEOUS"], counts: [4] },
    { family: "tools-c56", runs: 10000, seedBase: 2031013, tools: true, skill: "GREEDY", order: "SHUFFLED", cohorts: ["CORE", "SMART", "MYOPIC"], senders: ["C_NEARLY_DONE"], counts: [5, 6] },
    { family: "noisy-c4", runs: 10000, seedBase: 2187017, tools: true, skill: "NOISY", order: "REVERSE", cohorts: ["CORE", "SMART", "MYOPIC"], senders: ["C_NEARLY_DONE"], counts: [4] },
  ],
  bootstrapReplicates: 1000,
  criteria: { policyGapBelow: .1, policyGap95UpperBelow: .1, seatGapBelow: .1, seatGap95UpperBelow: .1, receiverFreeAtLeast: .7, senderFreeAtLeast: .5 },
  precisionPolicy: "All precision cells and seeds pre-sized before new data collection. They may resolve confidence-interval uncertainty only, never rescue an observed gap or choice-rate failure. Retain every primary row and all previous rejected candidates.",
};
const output = "docs/plans/assets/forest-balance-fair-protocol.json";
writeFileSync(output, JSON.stringify(protocol, null, 2));
console.log(JSON.stringify({ output, engineSha256, primaryGames: 202500, precisionGames: 240000, totalGames: 442500 }));
