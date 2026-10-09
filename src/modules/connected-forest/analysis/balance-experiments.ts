import { connectedForestRules } from "../domain/content";
import { createSeededRandom, simulateConnectedForestGame } from "../domain/simulator";
import type { ForestAgentPolicy, ForestSenderModel } from "../domain/simulator";
import type { ConnectedForestRules } from "../domain/types";

export type BalanceCandidate = { id: string; rules: ConnectedForestRules };
export type BalanceCohort = "CORE" | "SMART" | "DIVERSE" | "MYOPIC";
export const BALANCE_COHORTS: Record<BalanceCohort, ForestAgentPolicy[]> = {
  CORE: ["STAY", "WALK", "MIXED"],
  SMART: ["STAY", "WALK", "ADAPTIVE"],
  DIVERSE: ["STAY", "WALK", "ADAPTIVE", "RANDOM"],
  MYOPIC: ["STAY", "WALK", "IMMEDIATE"],
};
export const BALANCE_SENDERS: ForestSenderModel[] = ["A_SHORTEST", "B_RANDOM", "C_NEARLY_DONE", "D_LOW_SCORE"];

export function createBalanceCandidates(): BalanceCandidate[] {
  const base = connectedForestRules("prototype-1");
  const vectors = [
    [2, 3, 3, 3, 0], [3, 3, 3, 3, 0], [2, 2, 3, 3, 0],
    [2, 2, 1, 1, 0], [2, 2, 2, 1, 0], [2, 2, 3, 1, 0],
    [3, 2, 1, 1, 0], [3, 2, 2, 1, 0], [3, 2, 3, 1, 0],
    [3, 3, 1, 1, 0], [3, 3, 2, 1, 0],
    [2, 2, 1, 1, 1], [2, 2, 2, 1, 1], [2, 2, 3, 1, 1],
    [2, 2, 2, 2, 1], [2, 2, 3, 2, 1], [2, 3, 2, 1, 1],
    [2, 3, 3, 1, 1], [2, 2, 3, 1, 2], [2, 3, 3, 1, 2],
    [1, 2, 1, 1, 1], [1, 2, 2, 1, 1], [1, 2, 3, 1, 1],
    [1, 2, 3, 1, 2], [1, 2, 3, 2, 2], [2, 1, 2, 1, 0],
  ];
  return (["FREE", "ALTERNATE", "BALANCED_INCOMING"] as const).flatMap((visitRouting) => vectors.map(([stayReceiverHearts, walkReceiverLeaves, pathCompletionReceiverLeaves, pathCompletionSenderLeaves, visitorDiversityHearts]) => ({
    id: `${visitRouting.toLowerCase()}-s${stayReceiverHearts}-w${walkReceiverLeaves}-r${pathCompletionReceiverLeaves}-t${pathCompletionSenderLeaves}-d${visitorDiversityHearts}`,
    rules: { ...base, visitRouting, stayReceiverHearts, walkReceiverLeaves, pathCompletionReceiverLeaves, pathCompletionSenderLeaves, visitorDiversityHearts },
  })));
}

/** Rotate policy labels independently of decks and of sender decisions. */
export function createAgentSchedule(size: number, runs: number, seed: number, agents: ForestAgentPolicy[]) {
  if (agents.length > size || agents.length < 2) throw new Error("Agent cohort does not fit the table");
  const random = createSeededRandom(seed ^ 0x85ebca6b);
  const result: ForestAgentPolicy[][] = [];
  while (result.length < runs) {
    const seats = Array.from({ length: size }, (_, index) => index % agents.length);
    for (let index = seats.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [seats[index], seats[other]] = [seats[other], seats[index]];
    }
    const offset = Math.floor(random() * agents.length);
    for (let rotation = 0; rotation < agents.length && result.length < runs; rotation += 1) result.push(seats.map((label) => agents[(label + offset + rotation) % agents.length]));
  }
  return result;
}

export type BalanceSample = {
  seed: number;
  policies: ForestAgentPolicy[];
  winners: boolean[];
  score: number[];
  incoming: number[];
  sent: number[];
  free: number[];
  freeWalk: number[];
  visitPoints: number[];
  totalVisits: number;
  farewell: number;
  completedPaths: number;
  pathPoints: number;
  gold: number;
  refresh: number;
  restrictedSenders: number;
};

export type BalanceCase = {
  candidateId: string;
  playerCount: 4 | 5 | 6;
  sender: ForestSenderModel | "HETEROGENEOUS";
  cohort: BalanceCohort;
  seedBase: number;
  runs: number;
  tools: boolean;
  skill: "GREEDY" | "NOISY" | "RANDOM";
  order: "SEAT" | "REVERSE" | "SHUFFLED";
  policy: Partial<Record<ForestAgentPolicy, { exposures: number; wins: number; winRate: number; tieSplitWinRate: number; meanScore: number; meanIncoming: number; meanSent: number; freeWalkRate: number; meanVisitPoints: number }>>;
  winGap: number;
  seatWinRates: number[];
  seatWinGap: number;
  incomingGap: number;
  freeRate: number;
  adaptiveWalkRate?: number;
  senderFreedom: number;
  farewellRate: number;
  pathsPerGame: number;
  pathScoreShare: number;
  visitorScoreShare: number;
  toolsUsage: { goldPerGame: number; refreshPerGame: number };
  gap95?: [number, number];
  seatGap95?: [number, number];
};

const quantile = (sorted: number[], probability: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))];
export function bootstrapGap(samples: BalanceSample[], agents: ForestAgentPolicy[], seed = 11939, replicates = 300): [number, number] {
  if (!samples.length) return [0, 0];
  const random = createSeededRandom(seed);
  const gaps: number[] = [];
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const exposures = agents.map(() => 0);
    const wins = agents.map(() => 0);
    // Resample complete policy-rotation blocks, preserving within-game and
    // scheduled between-game dependence rather than treating seats as trials.
    const blocks = Math.ceil(samples.length / agents.length);
    for (let index = 0; index < blocks; index += 1) {
      const start = Math.floor(random() * blocks) * agents.length;
      for (let offset = 0; offset < agents.length && start + offset < samples.length; offset += 1) {
        const sample = samples[start + offset];
        sample.policies.forEach((policy, seat) => { const agent = agents.indexOf(policy); exposures[agent] += 1; wins[agent] += Number(sample.winners[seat]); });
      }
    }
    const rates = wins.map((value, index) => value / Math.max(1, exposures[index]));
    gaps.push(Math.max(...rates) - Math.min(...rates));
  }
  gaps.sort((a, b) => a - b);
  return [quantile(gaps, .025), quantile(gaps, .975)];
}

/** Preserve the same complete game/rotation blocks when estimating seat bias. */
export function bootstrapSeatGap(samples: BalanceSample[], seatCount: number, blockSize: number, seed = 18313, replicates = 300): [number, number] {
  if (!samples.length) return [0, 0];
  const random = createSeededRandom(seed);
  const gaps: number[] = [];
  const blocks = Math.ceil(samples.length / blockSize);
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const wins = Array(seatCount).fill(0) as number[];
    let games = 0;
    for (let index = 0; index < blocks; index += 1) {
      const start = Math.floor(random() * blocks) * blockSize;
      for (let offset = 0; offset < blockSize && start + offset < samples.length; offset += 1) {
        games += 1;
        samples[start + offset].winners.forEach((won, seat) => { wins[seat] += Number(won); });
      }
    }
    const rates = wins.map((value) => value / games);
    gaps.push(Math.max(...rates) - Math.min(...rates));
  }
  gaps.sort((a, b) => a - b);
  return [quantile(gaps, .025), quantile(gaps, .975)];
}

export function runBalanceCase(input: {
  candidate: BalanceCandidate;
  playerCount: 4 | 5 | 6;
  sender: ForestSenderModel | "HETEROGENEOUS";
  runs: number;
  seedBase: number;
  cohort?: BalanceCohort;
  tools?: boolean;
  skill?: "GREEDY" | "NOISY" | "RANDOM";
  order?: "SEAT" | "REVERSE" | "SHUFFLED";
  bootstrap?: number;
}) {
  const cohort = input.cohort ?? "CORE";
  const agents = BALANCE_COHORTS[cohort];
  const schedule = createAgentSchedule(input.playerCount, input.runs, input.seedBase, agents);
  const samples: BalanceSample[] = [];
  for (let run = 0; run < input.runs; run += 1) {
    const policies = schedule[run];
    const seed = input.seedBase + run;
    const game = simulateConnectedForestGame({ playerCount: input.playerCount, seed, rules: input.candidate.rules,
      policies: Array.from({ length: input.playerCount }, (_, index) => (["STAY", "WALK", "MIXED"] as const)[index % 3]),
      agentPolicies: policies, senderModel: input.sender === "HETEROGENEOUS" ? "A_SHORTEST" : input.sender,
      senderModels: input.sender === "HETEROGENEOUS" ? policies.map((_, index) => BALANCE_SENDERS[(index + run) % BALANCE_SENDERS.length]) : undefined,
      useTools: input.tools ?? false, placementSkill: input.skill ?? "GREEDY", responseOrder: input.order ?? "SEAT" });
    const d = game.diagnostics;
    samples.push({ seed, policies, winners: game.state.players.map((player) => game.winnerSeats.includes(player.seat)), score: game.scores,
      incoming: d.incomingVisits, sent: d.sentVisits, free: d.freeChoices, freeWalk: d.freeWalkChoices, visitPoints: d.receiverVisitPoints,
      totalVisits: game.stats.stay + game.stats.walk + game.stats.farewell, farewell: game.stats.farewell, completedPaths: game.stats.completedPaths,
      pathPoints: game.state.players.reduce((sum, player) => sum + player.leavesFromPaths, 0), gold: d.goldenAcornsUsed, refresh: d.refreshesUsed, restrictedSenders: d.restrictedSenderChoices });
  }
  const policy: BalanceCase["policy"] = {};
  for (const agent of agents) {
    let exposures = 0, wins = 0, score = 0, incoming = 0, sent = 0, free = 0, freeWalk = 0, points = 0, fractionalWins = 0;
    for (const sample of samples) sample.policies.forEach((candidate, seat) => {
      if (candidate !== agent) return;
      exposures += 1; wins += Number(sample.winners[seat]); fractionalWins += Number(sample.winners[seat]) / sample.winners.filter(Boolean).length;
      score += sample.score[seat]; incoming += sample.incoming[seat]; sent += sample.sent[seat]; free += sample.free[seat]; freeWalk += sample.freeWalk[seat]; points += sample.visitPoints[seat];
    });
    policy[agent] = { exposures, wins, winRate: wins / exposures, tieSplitWinRate: fractionalWins / exposures, meanScore: score / exposures, meanIncoming: incoming / exposures, meanSent: sent / exposures, freeWalkRate: freeWalk / Math.max(1, free), meanVisitPoints: points / exposures };
  }
  const total = (fn: (sample: BalanceSample) => number) => samples.reduce((sum, sample) => sum + fn(sample), 0);
  const visits = total((sample) => sample.totalVisits);
  const sumPoints = total((sample) => sample.score.reduce((a, b) => a + b, 0));
  const rates = Object.values(policy).map((entry) => entry!.winRate);
  const arrivals = Object.values(policy).map((entry) => entry!.meanIncoming);
  const seatWinRates = Array.from({ length: input.playerCount }, (_, seat) => samples.filter((sample) => sample.winners[seat]).length / samples.length);
  const result: BalanceCase = {
    candidateId: input.candidate.id, playerCount: input.playerCount, sender: input.sender, cohort, seedBase: input.seedBase, runs: input.runs,
    tools: input.tools ?? false, skill: input.skill ?? "GREEDY", order: input.order ?? "SEAT", policy,
    winGap: Math.max(...rates) - Math.min(...rates), incomingGap: Math.max(...arrivals) - Math.min(...arrivals),
    seatWinRates, seatWinGap: Math.max(...seatWinRates) - Math.min(...seatWinRates),
    freeRate: total((sample) => sample.free.reduce((a, b) => a + b, 0)) / Math.max(1, visits), adaptiveWalkRate: policy.ADAPTIVE?.freeWalkRate,
    senderFreedom: 1 - total((sample) => sample.restrictedSenders) / Math.max(1, visits), farewellRate: total((sample) => sample.farewell) / Math.max(1, visits),
    pathsPerGame: total((sample) => sample.completedPaths) / Math.max(1, input.runs), pathScoreShare: total((sample) => sample.pathPoints) / Math.max(1, sumPoints),
    visitorScoreShare: total((sample) => sample.visitPoints.reduce((a, b) => a + b, 0)) / Math.max(1, sumPoints),
    toolsUsage: { goldPerGame: total((sample) => sample.gold) / Math.max(1, input.runs), refreshPerGame: total((sample) => sample.refresh) / Math.max(1, input.runs) },
    gap95: input.bootstrap ? bootstrapGap(samples, agents, input.seedBase ^ 11939, input.bootstrap) : undefined,
    seatGap95: input.bootstrap ? bootstrapSeatGap(samples, input.playerCount, agents.length, input.seedBase ^ 18313, input.bootstrap) : undefined,
  };
  return { result, samples };
}
