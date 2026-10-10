import assert from 'node:assert/strict';
import { BASELINE, CAT2, score, explain, valid, positions, rng, neighbors, bestLocal, bestExchange, dayOptions, chooseDay, auditNight } from './engine.mjs';
import { innRules } from '../../src/modules/moonlit-inn/domain/content.ts';

const current = innRules('balanced-1');
const balanced = { id: 'balanced-1', base: [current.rabbitBase, 2, current.catBase, 2], catBonus: 1, woodCatBonus: current.woodCatBonus, moonCap: current.moonCap };

// Independent coordinate/set reference: deliberately no bitmasks or engine scoring helpers.
function reference(board, weather, cfg) {
  const cells = board.g.map((type, i) => board.gp[i] < 0 ? [] : type === 0 ? [board.gp[i], board.gp[i] + 1] : [board.gp[i]]);
  const wet = new Set();
  board.g.forEach((type, i) => {
    if (type !== 3 || !cells[i].length) return;
    const p = cells[i][0];
    for (let q = 0; q < 6; q++) if (Math.abs(Math.floor(p / 3) - Math.floor(q / 3)) + Math.abs(p % 3 - q % 3) <= 1) wet.add(q);
  });
  const at = (type, cell) => board.f.some((item, j) => item === type && board.fp[j] === cell);
  const asleep = board.g.map((type, i) => cells[i].length > 0 && !(type === 1 && at(3, cells[i][0]) && !wet.has(cells[i][0])));
  let value = 0, upper = 0, lower = 0;
  board.g.forEach((type, i) => {
    if (!asleep[i]) return;
    const room = cells[i][0];
    let bonus = type !== 2 && cells[i].some(cell => at(3, cell) && !wet.has(cell)) ? 1 : 0;
    if (type === 0 && cells[i].some(cell => at(0, cell) && !wet.has(cell))) bonus = 2;
    if (type === 1 && at(1, room)) bonus = 2;
    if (type === 3 && at(2, room)) bonus = 2;
    if (type === 2 && board.g.some((other, j) => other !== 2 && asleep[j] && cells[j].includes(room))) bonus = cfg.catBonus;
    if (type === 2 && at(3, room) && !wet.has(room)) bonus += cfg.woodCatBonus ?? 0;
    value += cfg.base[type] + bonus;
    if (room < 3) upper++; else lower++;
  });
  const cap = cfg.moonCap ?? 2;
  return value + (weather === 'expected' ? (Math.min(upper, cap) + Math.min(lower, cap)) / 2 : Math.min(weather === 'roof' ? upper : lower, cap));
}
const sample = { g: [0, 1, 3], gp: [0, 2, 4], f: [0, 3, 2], fp: [0, 2, 4] };
assert(valid(sample));
assert.equal(score(sample, 'roof'), 10); assert.equal(score(sample, 'garden'), 10);
const moved = { ...sample, gp: [0, 2, 5] };
assert.equal(score(moved, 'roof'), 11); assert.equal(score(moved, 'garden'), 10);
const bothMoved = { ...moved, fp: [0, 2, 5] };
assert.equal(score(bothMoved, 'roof'), 13); assert.equal(score(bothMoved, 'garden'), 12);
assert(!valid({ g: [0], gp: [2], f: [], fp: [] })); // Rabbit cannot wrap a floor.
assert(!valid({ g: [0, 1], gp: [0, 1], f: [], fp: [] }));
assert(valid({ g: [0, 2], gp: [0, 1], f: [], fp: [] }));
assert(!valid({ g: [2, 2], gp: [0, 0], f: [], fp: [] }));
assert.equal(explain({ g: [0], gp: [0], f: [0, 3], fp: [0, 1] }, 'roof').guestScores[0].comfort, 2); // Not 3.
assert.equal(explain({ g: [3], gp: [0], f: [3], fp: [0] }, 'roof').guestScores[0].comfort, 0);
assert.equal(explain({ g: [1, 3], gp: [0, 1], f: [3], fp: [0] }, 'roof').guestScores[0].comfort, 0);
assert.equal(explain({ g: [1, 2], gp: [0, 0], f: [3], fp: [0] }, 'roof').guestScores[1].comfort, 0); // Roommate not asleep.
assert.equal(explain({ g: [2, 2, 2], gp: [0, 1, 2], f: [], fp: [] }, 'roof').upper, 2);
assert([...neighbors({ g: [], gp: [], f: [0, 1], fp: [0, -1] })].some(x => x.board.fp[0] === -1 && x.board.fp[1] === 0));

const random = rng(108091);
let parity = 0;
for (let trial = 0; trial < 2500; trial++) {
  let board;
  do {
    const g = Array.from({ length: 3 }, () => Math.floor(random() * 4));
    const f = Array.from({ length: trial % 2 ? 6 : 3 }, () => Math.floor(random() * 4));
    board = { g, f, gp: g.map(t => { const options = positions(t); return options[Math.floor(random() * options.length)]; }), fp: f.map(() => Math.floor(random() * 7) - 1) };
  } while (!valid(board));
  for (const cfg of [BASELINE, CAT2, balanced]) for (const weather of ['roof', 'garden', 'expected']) {
    assert.equal(score(board, weather, cfg), reference(board, weather, cfg)); parity++;
  }
  const flip = p => p < 0 ? -1 : p < 3 ? p + 3 : p - 3;
  for (const cfg of [BASELINE, CAT2, balanced]) assert.equal(score(board, 'roof', cfg), score({ ...board, gp: board.gp.map(flip), fp: board.fp.map(flip) }, 'garden', cfg));
}
const optimum = dayOptions([0, 0, 0], [0, 0, 0]);
const tripleRabbit = chooseDay([0, 0, 0], [0, 0, 0], random);
assert.equal(explain(tripleRabbit, 'roof').sleeping, 2);
assert.equal(score(tripleRabbit, 'expected'), optimum.best);
for (const weather of ['roof', 'garden']) {
  const local = bestLocal(sample, weather, 2);
  assert(valid(local.board)); assert(local.actions.length <= 2);
  assert(local.score >= score(sample, weather));
  const exchange = bestExchange(sample, 'guest', 0, 2, weather);
  assert(valid(exchange.board)); assert(exchange.actions.length <= 2);
  assert.equal(exchange.actions.filter(a => a.kind.startsWith('exchange')).length, 1);
}
const a = { g: [0], gp: [0], f: [1], fp: [0] }, b = { g: [1], gp: [3], f: [0], fp: [3] };
const trade = auditNight([a, b], 'roof');
assert.equal(trade.matching.length, 1);
assert(trade.matching[0].gain.every(gain => gain > 0));
assert.deepEqual(trade.final.flatMap(board => board.g).sort(), [0, 1]);
assert.deepEqual(trade.final.flatMap(board => board.f).sort(), [0, 1]);
console.log(JSON.stringify({ status: 'pass', referenceComparisons: parity, reflectionCases: 7500, sampleScores: [[10, 11, 13], [10, 10, 12]], scope: '4 core guests, legacy and balanced-1 rules, two forecasts, storage swaps allowed' }));
