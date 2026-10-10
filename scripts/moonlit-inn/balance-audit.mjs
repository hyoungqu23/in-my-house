// Four-player, one-night rule audit. Does not alter live game rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { INN_CURRENT_RULES_VERSION, innRules } from '../../src/modules/moonlit-inn/domain/content.ts';
import {
  CAT2, GUESTS, FURNITURE, counts, combinations, dayOptions, chooseDay,
  bestLocal, bestExchange, explain, rng, shuffle, score, valid,
} from './engine.mjs';

const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const nSeeds = Number(option('--seeds', 512));
const seedBase = Number(option('--seed', 20261010));
const outputFile = option('--out', 'docs/plans/assets/moonlit-inn/balance-current.json');
const started = performance.now();
const requestedRules = option('--rules-version', INN_CURRENT_RULES_VERSION);
assert(['playtest-1', 'balanced-1'].includes(requestedRules));
const rules = innRules(requestedRules);
const rabbitBase = Number(option('--rabbit-base', rules.rabbitBase));
const woodCatBonus = Number(option('--wood-cat-bonus', rules.woodCatBonus));
const moonCap = Number(option('--moon-cap', rules.moonCap));
assert([2, 3].includes(rabbitBase));
assert([0, 1].includes(woodCatBonus));
assert([1, 2].includes(moonCap));
const variantBase = woodCatBonus === 1 ? `rabbit-${rabbitBase}-wood-cat-1-probe` : rabbitBase === 3 ? 'playtest-1' : 'rabbit-base-2-probe';
const variant = moonCap === 2 ? variantBase : `${variantBase}-moon-cap-${moonCap}`;
const sameProfile = rabbitBase === rules.rabbitBase && woodCatBonus === rules.woodCatBonus && moonCap === rules.moonCap;
const cfg = rabbitBase === 3 && woodCatBonus === 0 && moonCap === 2 ? CAT2 : Object.freeze({ id: variant, base: [rabbitBase, 2, 2, 2], catBonus: 1, woodCatBonus, moonCap });
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const fraction = (count, total) => ({ count, total, rate: total ? count / total : 0 });
const winningCredits = scores => {
  const top = Math.max(...scores), count = scores.filter(x => x === top).length;
  return scores.map(x => x === top ? 1 / count : 0);
};
const choose = (n, k) => { let x = 1; for (let i = 1; i <= k; i++) x *= (n - i + 1) / i; return x; };
const handWeight = hand => counts(hand).reduce((p, amount) => p * choose(4, amount), 1) / choose(16, 3);

assert.deepEqual(winningCredits([10, 10, 9, 8]), [.5, .5, 0, 0]);
assert.deepEqual(winningCredits([13, 12, 10, 9]), [1, 0, 0, 0]);
assert.deepEqual(winningCredits([14, 14, 10, 9]), [.5, .5, 0, 0]);
assert(Math.abs(combinations(3).reduce((s, h) => s + handWeight(h), 0) - 1) < 1e-12);

function structuralAudit() {
  const hands = combinations(3), guests = [], furniture = [], marginal = [];
  for (const [key, names, target] of [['g', GUESTS, guests], ['f', FURNITURE, furniture]]) {
    for (let from = 0; from < 4; from++) for (let to = 0; to < 4; to++) if (from !== to) {
      let oldBetter = 0, equal = 0, newBetter = 0, weightedDelta = 0, weight = 0;
      for (const g of hands) for (const f of hands) {
        const original = key === 'g' ? g : f;
        if (!original.includes(from)) continue;
        const replacement = [...original]; replacement[replacement.indexOf(from)] = to;
        const before = dayOptions(g, f, cfg).best;
        const after = dayOptions(key === 'g' ? replacement : g, key === 'f' ? replacement : f, cfg).best;
        if (before > after) oldBetter++; else if (before === after) equal++; else newBetter++;
        const p = handWeight(g) * handWeight(f); weight += p; weightedDelta += p * (after - before);
      }
      target.push({ from: names[from], to: names[to], oldBetter, equal, newBetter, total: oldBetter + equal + newBetter, weightedDelta: weightedDelta / weight });
    }
  }
  for (let type = 0; type < 4; type++) {
    let total = 0, positive = 0, weighted = 0, weight = 0;
    for (const g of hands) for (const f of hands) if (f.includes(type)) {
      const without = [...f]; without.splice(without.indexOf(type), 1);
      const gain = dayOptions(g, f, cfg).best - dayOptions(g, without, cfg).best;
      total++; if (gain > 0) positive++;
      const p = handWeight(g) * handWeight(f); weight += p; weighted += p * gain;
    }
    marginal.push({ name: FURNITURE[type], totalHands: total, positiveHands: positive, weightedMarginal: weighted / weight });
  }
  return { guests, furniture, marginal, weighting: 'Independent undrafted 3-card hands drawn without replacement from four copies of each type. Replacement comparisons condition on the replaced type being present; not post-draft frequency.' };
}
function chooseCard(values, random, policy) {
  const best = Math.max(...values);
  const weights = values.map(v => policy === 'greedy' || policy === 'auto' ? Number(v === best) : Math.exp(v - best));
  let threshold = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { threshold -= weights[i]; if (threshold < 0) return i; }
  return weights.length - 1;
}
function autoBoard(g, f) {
  const board = { g: [], f: [], gp: [], fp: [] };
  g.forEach((type, i) => {
    board.g.push(type); board.gp.push(-1);
    for (let p = 0; p < 6; p++) { board.gp[i] = p; if (valid(board)) break; board.gp[i] = -1; }
    board.f.push(f[i]); board.fp.push([0, 1, 2, 3, 4, 5].find(p => !board.fp.includes(p)) ?? -1);
  });
  assert(valid(board)); return board;
}
function draft(seed, policies, rotation = 0) {
  const deckRandom = rng(seed + 100003 + 4 * 500009);
  const pool = Array.from({ length: 16 }, (_, i) => Math.floor(i / 4));
  const gs = shuffle(pool, deckRandom).slice(0, 12), fs = shuffle(pool, deckRandom).slice(0, 12);
  const deck = gs.map((g, i) => ({ g, f: fs[i] }));
  const originals = Array.from({ length: 4 }, (_, seat) => deck.slice(seat * 3, seat * 3 + 3));
  let hands = Array.from({ length: 4 }, (_, seat) => originals[(seat + rotation) % 4]);
  const random = Array.from({ length: 4 }, (_, seat) => rng(seed + ((seat + rotation) % 4) * 7919 + 31));
  const held = Array.from({ length: 4 }, () => ({ g: [], f: [] })), decisions = [];
  const weather = deckRandom() < .5 ? 'roof' : 'garden';
  for (let round = 0; round < 3; round++) {
    const remaining = [];
    for (let seat = 0; seat < 4; seat++) {
      const hand = hands[seat], values = hand.map(c => dayOptions([...held[seat].g, c.g], [...held[seat].f, c.f], cfg).best);
      const index = hand.length === 1 ? 0 : chooseCard(values, random[seat], policies[seat]);
      const card = hand[index]; held[seat].g.push(card.g); held[seat].f.push(card.f);
      decisions.push({ seat, round, forced: hand.length === 1, chosen: card, options: hand });
      remaining.push(hand.filter((_, i) => i !== index));
    }
    hands = Array.from({ length: 4 }, (_, seat) => remaining[(seat + 3) % 4]);
  }
  const boards = held.map((hand, seat) => policies[seat] === 'auto' ? autoBoard(hand.g, hand.f) : chooseDay(hand.g, hand.f, rng(seed + 971 + ((seat + rotation) % 4) * 1259), policies[seat] === 'greedy' ? 'optimal' : 'bounded', cfg));
  return { boards, held, weather, decisions };
}
function tradeAudit(boards, weather) {
  const local = boards.map(board => bestLocal(board, weather, 2, cfg));
  const before = local.map(p => p.score), credits = winningCredits(before);
  const caches = boards.map(() => new Map()), candidates = [];
  function side(seat, kind, index, incoming) {
    const key = `${kind}:${index}:${incoming}`;
    if (!caches[seat].has(key)) caches[seat].set(key, bestExchange(boards[seat], kind, index, incoming, weather, cfg));
    return caches[seat].get(key);
  }
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const kind of ['guest', 'furniture']) {
    const key = kind === 'guest' ? 'g' : 'f';
    for (let i = 0; i < boards[a][key].length; i++) for (let j = 0; j < boards[b][key].length; j++) {
      if (boards[a][key][i] === boards[b][key][j]) continue;
      const left = side(a, kind, i, boards[b][key][j]), right = side(b, kind, j, boards[a][key][i]);
      const gain = [left.score - before[a], right.score - before[b]];
      if (gain.some(v => v <= 0)) continue;
      const after = [...before]; after[a] = left.score; after[b] = right.score;
      const afterCredits = winningCredits(after);
      const winnerSafe = afterCredits[a] >= credits[a] && afterCredits[b] >= credits[b];
      candidates.push({ a, b, kind, outgoingIndices: [i, j], gains: gain, scoresBefore: before, scoresAfter: after, creditsBefore: credits, creditsAfter: afterCredits, winnerSafe, bothWinImproved: afterCredits[a] > credits[a] && afterCredits[b] > credits[b], plans: [left, right] });
    }
  }
  // An existence check for a single initial offer, not an automatic final matching.
  // Every side gets its maximum own score for the chosen cards; deliberately
  // withholding points, future trades, relative utility and bargaining are excluded.
  return { local, candidates, scoreOpportunity: candidates.length > 0, winnerSafeOpportunity: candidates.some(e => e.winnerSafe), bothWinImproved: candidates.some(e => e.bothWinImproved) };
}
function quantiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries([.1, .5, .9].map(p => ['p' + p * 100, sorted[Math.floor(p * (sorted.length - 1))]]));
}
const result = {
  date: '2026-10-10', ruleVersion: sameProfile ? requestedRules : variant, rabbitBase, woodCatBonus, moonCap, seeds: nSeeds, seedBase,
  assumptions: [
    'Four players, one night, cat base 2. Four copies per guest/furniture type, independently shuffled, twelve paired bundles.',
    'Greedy draft optimizes the current holdings, not future hidden hands. Bounded choices use exp(value-best) and day placements within one expected point of optimum.',
    'Auto policy chooses greedy bundles but leaves the production initial placement unchanged during daytime. All policies optimize at most two own night actions.',
    'Competitive filter asks whether any single mutually score-improving offer preserves both parties split winner credit vs their own best no-trade plans, holding the other two scores fixed.',
    'It uses maximum own-score exchange plans, not deliberate point withholding or all bargaining equilibria. It does not model human discovery, reaction time or acceptance.',
    'Physical seat symmetry is tested by rotating starting hands AND player random streams. Post-trade seat wins are excluded because matching selection can introduce analysis ordering artifacts.',
    'Weather comparison evaluates both forecasts from the same day placement with two optimal own actions; trading is omitted for this comparison.',
  ], structural: structuralAudit(), groups: [], mixedSkill: null, seatAudit: null, examples: [], sourceHashes: {},
};
console.log(JSON.stringify({ phase: 'structural', seconds: (performance.now() - started) / 1000 }));
for (const policy of ['greedy', 'bounded', 'auto']) {
  const records = [], choices = { offeredGuests: [0, 0, 0, 0], pickedGuests: [0, 0, 0, 0], forcedGuests: [0, 0, 0, 0], offeredFurniture: [0, 0, 0, 0], pickedFurniture: [0, 0, 0, 0] };
  for (let run = 0; run < nSeeds; run++) {
    const seed = seedBase + run * 1009;
    const { boards, weather, decisions } = draft(seed, Array(4).fill(policy));
    const audited = tradeAudit(boards, weather);
    for (const decision of decisions) {
      if (decision.forced) choices.forcedGuests[decision.chosen.g]++;
      else {
        decision.options.forEach(c => { choices.offeredGuests[c.g]++; choices.offeredFurniture[c.f]++; });
        choices.pickedGuests[decision.chosen.g]++; choices.pickedFurniture[decision.chosen.f]++;
      }
    }
    const repair = audited.local.map((p, i) => p.score - score(boards[i], weather, cfg));
    const weatherScores = { roof: boards.map(board => bestLocal(board, 'roof', 2, cfg).score), garden: boards.map(board => bestLocal(board, 'garden', 2, cfg).score) };
    const moonSwing = weatherScores.roof.map((v, i) => Math.abs(v - weatherScores.garden[i]));
    const weatherWinnerChanged = JSON.stringify(winningCredits(weatherScores.roof)) !== JSON.stringify(winningCredits(weatherScores.garden));
    const final = audited.local.flatMap(p => explain(p.board, weather, cfg).guestScores.map((g, i) => ({ type: p.board.g[i], ...g })));
    const credits = winningCredits(audited.local.map(p => p.score));
    records.push({ seed, weather, start: boards.map(b => score(b, weather, cfg)), ownFinal: audited.local.map(p => p.score), repair, moonSwing, weatherWinnerChanged, credits, scoreOpportunity: audited.scoreOpportunity, winnerSafeOpportunity: audited.winnerSafeOpportunity, bothWinImproved: audited.bothWinImproved, final });
    const trap = audited.candidates.find(e => !e.winnerSafe);
    if (trap && result.examples.filter(e => e.kind === 'winner-trap').length < 2) result.examples.push({ kind: 'winner-trap', seed, policy, weather, boards, trade: trap });
    if ((run + 1) % 128 === 0 || run + 1 === nSeeds) console.log(JSON.stringify({ phase: policy, completed: run + 1, seconds: Math.round((performance.now() - started) / 1000) }));
  }
  const repairs = records.flatMap(r => r.repair), swings = records.flatMap(r => r.moonSwing), scores = records.flatMap(r => r.ownFinal);
  result.groups.push({ policy, tableNights: records.length, playerNights: records.length * 4,
    scoreOpportunity: fraction(records.filter(r => r.scoreOpportunity).length, records.length), winnerSafeOpportunity: fraction(records.filter(r => r.winnerSafeOpportunity).length, records.length), bothWinImproved: fraction(records.filter(r => r.bothWinImproved).length, records.length),
    repair: { ...fraction(repairs.filter(x => x > 0).length, repairs.length), meanGain: mean(repairs), maxGain: Math.max(...repairs) },
    weather: { ...fraction(swings.filter(x => x > 0).length, swings.length), meanSwing: mean(swings), maxSwing: Math.max(...swings), winnerChanged: fraction(records.filter(r => r.weatherWinnerChanged).length, records.length) },
    noTradeScores: { mean: mean(scores), ...quantiles(scores) },
    seatCredits: [0, 1, 2, 3].map(seat => mean(records.map(r => r.credits[seat]))),
    guests: GUESTS.map((name, type) => { const selected = records.flatMap(r => r.final).filter(g => g.type === type); return { name, count: selected.length, sleepingRate: selected.filter(g => g.sleeping).length / selected.length, meanBaseComfort: mean(selected.map(g => g.base + g.comfort)) }; }),
    choices, records: records.map(({ final, ...record }) => ({ ...record, guestSleep: counts(final.filter(g => g.sleeping).map(g => g.type)) })),
  });
}

const seatSeeds = Math.min(nSeeds, 256);
let compared = 0;
for (let run = 0; run < seatSeeds; run++) {
  const seed = seedBase + run * 1009;
  const base = draft(seed, Array(4).fill('greedy'));
  const expected = base.boards.map(b => bestLocal(b, base.weather, 2, cfg).score);
  for (let rotation = 1; rotation < 4; rotation++) {
    const rotated = draft(seed, Array(4).fill('greedy'), rotation);
    const actual = rotated.boards.map(b => bestLocal(b, rotated.weather, 2, cfg).score);
    assert.deepEqual(actual, [0, 1, 2, 3].map(seat => expected[(seat + rotation) % 4])); compared += 4;
  }
}
result.seatAudit = { seeds: seatSeeds, rotationsPerSeed: 3, playerComparisons: compared, mismatches: 0, scope: 'Draft + optimal own night repair; no trading selection or human speed.' };

const skillSeeds = Math.min(nSeeds, 256);
result.mixedSkill = {};
for (const opponent of ['bounded', 'auto']) {
  const expertCredits = [], gaps = [];
  for (let run = 0; run < skillSeeds; run++) for (let expert = 0; expert < 4; expert++) {
    const policies = [0, 1, 2, 3].map(seat => seat === expert ? 'greedy' : opponent);
    const seed = seedBase + run * 1009;
    const match = draft(seed, policies), totals = match.boards.map(b => bestLocal(b, match.weather, 2, cfg).score);
    expertCredits.push(winningCredits(totals)[expert]); gaps.push(totals[expert] - mean(totals.filter((_, i) => i !== expert)));
  }
  result.mixedSkill[opponent] = { independentDeckSeeds: skillSeeds, roleRotations: 4, tableCounterfactuals: expertCredits.length, greedyWinnerCredit: mean(expertCredits), meanGreedyScoreGap: mean(gaps), scope: `One greedy vs three ${opponent}, before trading. These policies are not measured human skill levels.` };
}
result.elapsedSeconds = (performance.now() - started) / 1000;
result.sourceHashes = Object.fromEntries(['scripts/moonlit-inn/engine.mjs', 'scripts/moonlit-inn/balance-audit.mjs', 'src/modules/moonlit-inn/domain/content.ts', 'src/modules/moonlit-inn/domain/rules.ts'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')]));
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ phase: 'done', out: outputFile, elapsedSeconds: result.elapsedSeconds, groups: result.groups.map(group => Object.fromEntries(Object.entries(group).filter(([key]) => !['records', 'choices'].includes(key)))), seatAudit: result.seatAudit, mixedSkill: result.mixedSkill }, null, 2));
