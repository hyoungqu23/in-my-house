// Offline rule experiment for docs/plans/moonlit-inn.md v0.2, not game runtime.
// Four core species only. No human enjoyment or negotiation behavior is modeled.
export const GUESTS = ['rabbit', 'phoenix', 'cat', 'cloud'];
export const FURNITURE = ['quilt', 'stone', 'basin', 'wood'];
/** @type {Readonly<{id: string, base: number[], catBonus: number, woodCatBonus?: number, moonCap?: number}>} */
export const BASELINE = Object.freeze({ id: 'v0.2', base: [3, 2, 1, 2], catBonus: 1 });
export const CAT2 = Object.freeze({ id: 'cat-base-2-probe', base: [3, 2, 2, 2], catBonus: 1 });
export const bit = p => p < 0 ? 0 : 1 << p;
export const adjacent = (a, b) => Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) + Math.abs(a % 3 - b % 3) === 1;
export const WET = Array.from({ length: 6 }, (_, p) => [0, 1, 2, 3, 4, 5].reduce((mask, q) => mask | (p === q || adjacent(p, q) ? bit(q) : 0), 0));
export const positions = type => type === 0 ? [-1, 0, 1, 3, 4] : [-1, 0, 1, 2, 3, 4, 5];
export const footprint = (type, p) => p < 0 ? 0 : type === 0 ? bit(p) | bit(p + 1) : bit(p);
export function rng(seed) {
  let x = seed >>> 0;
  return () => { x += 0x6d2b79f5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export const counts = items => items.reduce((a, x) => { a[x]++; return a; }, [0, 0, 0, 0]);
function hash(text) { let value = 2166136261; for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; }
export function valid(board) {
  if (board.g.length !== board.gp.length || board.f.length !== board.fp.length) return false;
  let floor = 0, ceiling = 0, furniture = 0;
  for (let i = 0; i < board.g.length; i++) {
    const type = board.g[i], p = board.gp[i];
    if (!GUESTS[type] || !positions(type).includes(p)) return false;
    const mask = footprint(type, p);
    if (type === 2) { if (mask & ceiling) return false; ceiling |= mask; }
    else { if (mask & floor) return false; floor |= mask; }
  }
  for (let i = 0; i < board.f.length; i++) {
    const p = board.fp[i];
    if (!FURNITURE[board.f[i]] || !Number.isInteger(p) || p < -1 || p > 5 || furniture & bit(p)) return false;
    furniture |= bit(p);
  }
  return true;
}
export function furnitureMasks(board) {
  const masks = [0, 0, 0, 0];
  board.f.forEach((type, i) => { masks[type] |= bit(board.fp[i]); });
  return masks;
}
function stats(g, gp, masks, cfg, details = false) {
  let wet = 0, floorSleeping = 0, base = 0, upper = 0, lower = 0, sleeping = 0;
  const guestScores = details ? g.map(() => ({ base: 0, comfort: 0, sleeping: false })) : null;
  for (let i = 0; i < g.length; i++) if (g[i] === 3 && gp[i] >= 0) wet |= WET[gp[i]];
  for (let i = 0; i < g.length; i++) {
    const type = g[i], p = gp[i];
    if (p < 0 || type === 2) continue;
    const mask = footprint(type, p);
    if (type === 1 && masks[3] & mask && !(wet & mask)) continue;
    let comfort = masks[3] & mask & ~wet ? 1 : 0;
    if (type === 0 && masks[0] & mask & ~wet || type === 1 && masks[1] & mask || type === 3 && masks[2] & mask) comfort = 2;
    base += cfg.base[type] + comfort; sleeping++; if (p < 3) upper++; else lower++;
    floorSleeping |= mask;
    if (details) guestScores[i] = { base: cfg.base[type], comfort, sleeping: true };
  }
  for (let i = 0; i < g.length; i++) if (g[i] === 2 && gp[i] >= 0) {
    const comfort = (floorSleeping & bit(gp[i]) ? cfg.catBonus : 0) + (masks[3] & bit(gp[i]) & ~wet ? cfg.woodCatBonus ?? 0 : 0);
    base += cfg.base[2] + comfort; sleeping++; if (gp[i] < 3) upper++; else lower++;
    if (details) guestScores[i] = { base: cfg.base[2], comfort, sleeping: true };
  }
  return { base, upper: Math.min(upper, cfg.moonCap ?? 2), lower: Math.min(lower, cfg.moonCap ?? 2), sleeping, wet, guestScores };
}
export function score(board, weather, cfg = BASELINE) {
  const s = stats(board.g, board.gp, furnitureMasks(board), cfg);
  return weather === 'expected' ? s.base + (s.upper + s.lower) / 2 : s.base + (weather === 'roof' ? s.upper : s.lower);
}
export function explain(board, weather, cfg = BASELINE) {
  const s = stats(board.g, board.gp, furnitureMasks(board), cfg, true);
  return { ...s, total: s.base + (weather === 'roof' ? s.upper : s.lower) };
}
const guestLayoutCache = new Map(), furnitureLayoutCache = new Map(), dayCache = new Map();
export function guestLayouts(g) {
  const key = g.join('');
  if (guestLayoutCache.has(key)) return guestLayoutCache.get(key);
  const result = [], gp = [];
  function walk(i, floor, ceiling) {
    if (i === g.length) { result.push([...gp]); return; }
    for (const p of positions(g[i])) {
      // Interchangeable copies need one canonical labeling, including multiple lobby guests.
      if (i > 0 && g[i] === g[i - 1] && p < gp[i - 1]) continue;
      const mask = footprint(g[i], p);
      if (mask & (g[i] === 2 ? ceiling : floor)) continue;
      gp.push(p); walk(i + 1, floor | (g[i] === 2 ? 0 : mask), ceiling | (g[i] === 2 ? mask : 0)); gp.pop();
    }
  }
  walk(0, 0, 0); guestLayoutCache.set(key, result); return result;
}
export function furnitureLayouts(f) {
  const amount = counts(f), key = amount.join(',');
  if (furnitureLayoutCache.has(key)) return furnitureLayoutCache.get(key);
  const result = [], masks = [0, 0, 0, 0];
  function walk(room) {
    if (room === 6) { result.push([...masks]); return; }
    walk(room + 1); // All unplaced copies remain in storage.
    for (let type = 0; type < 4; type++) if (amount[type]) {
      amount[type]--; masks[type] |= bit(room); walk(room + 1); masks[type] ^= bit(room); amount[type]++;
    }
  }
  walk(0); furnitureLayoutCache.set(key, result); return result;
}
function positionsFromMasks(f, masks) {
  const remaining = [...masks];
  return f.map(type => { for (let p = 0; p < 6; p++) if (remaining[type] & bit(p)) { remaining[type] ^= bit(p); return p; } return -1; });
}
export function dayOptions(guests, furniture, cfg = BASELINE) {
  const g = [...guests].sort(), f = [...furniture].sort(), key = cfg.id + ':' + g.join('') + '/' + f.join('');
  if (dayCache.has(key)) return dayCache.get(key);
  let best = -Infinity;
  const buckets = new Map(), random = rng(hash(key));
  for (const gp of guestLayouts(g)) for (const masks of furnitureLayouts(f)) {
    const s = stats(g, gp, masks, cfg), value = 2 * s.base + s.upper + s.lower;
    if (value > best) best = value;
    if (value < best - 2) continue;
    let bucket = buckets.get(value);
    if (!bucket) { bucket = { count: 0, layouts: [] }; buckets.set(value, bucket); }
    bucket.count++;
    const slot = bucket.count <= 12 ? bucket.count - 1 : Math.floor(random() * bucket.count);
    if (slot < 12) bucket.layouts[slot] = { gp: [...gp], masks: [...masks] };
  }
  const result = { g, f, best: best / 2, buckets: [...buckets].filter(([v]) => v >= best - 2).map(([v, b]) => ({ value: v / 2, ...b })) };
  dayCache.set(key, result); return result;
}
export function chooseDay(g, f, random, policy = 'optimal', cfg = BASELINE) {
  const options = dayOptions(g, f, cfg);
  const eligible = options.buckets.filter(b => policy === 'bounded' || b.value === options.best);
  // Bounded policy first selects score level uniformly, then a reservoir representative.
  const bucket = eligible[Math.floor(random() * eligible.length)];
  const layout = bucket.layouts[Math.floor(random() * bucket.layouts.length)];
  return { g: [...options.g], f: [...options.f], gp: [...layout.gp], fp: positionsFromMasks(options.f, layout.masks) };
}
export function* neighbors(board) {
  for (let i = 0; i < board.g.length; i++) for (const p of positions(board.g[i])) if (p !== board.gp[i]) {
    const next = { ...board, gp: [...board.gp] }; next.gp[i] = p;
    if (valid(next)) yield { board: next, action: { kind: 'move-guest', index: i, from: board.gp[i], to: p } };
  }
  for (let i = 0; i < board.f.length; i++) for (let p = -1; p < 6; p++) if (p !== board.fp[i]) {
    if (p >= 0 && board.fp.includes(p)) continue;
    const next = { ...board, fp: [...board.fp] }; next.fp[i] = p;
    yield { board: next, action: { kind: 'move-furniture', index: i, from: board.fp[i], to: p } };
  }
  for (let i = 0; i < board.f.length; i++) for (let j = i + 1; j < board.f.length; j++) {
    // Interpret "swap own furniture" generously: one piece may be in storage.
    // This strengthens the no-trade alternative; two stored or identical pieces do nothing.
    if (board.fp[i] === board.fp[j] || board.f[i] === board.f[j]) continue;
    const next = { ...board, fp: [...board.fp] }; [next.fp[i], next.fp[j]] = [next.fp[j], next.fp[i]];
    yield { board: next, action: { kind: 'swap-furniture', indices: [i, j] } };
  }
}
export function bestLocal(board, weather, budget = 2, cfg = BASELINE) {
  let best = { board, score: score(board, weather, cfg), actions: [] };
  if (budget === 0) return best;
  for (const next of neighbors(board)) {
    const result = budget === 1 ? { board: next.board, score: score(next.board, weather, cfg), actions: [] } : bestLocal(next.board, weather, budget - 1, cfg);
    const actions = [next.action, ...result.actions];
    if (result.score > best.score || result.score === best.score && actions.length < best.actions.length) best = { ...result, actions };
  }
  return best;
}
function* receive(board, kind, index, incoming) {
  const typeKey = kind === 'guest' ? 'g' : 'f', posKey = kind === 'guest' ? 'gp' : 'fp';
  for (const p of kind === 'guest' ? positions(incoming) : [-1, 0, 1, 2, 3, 4, 5]) {
    const next = { ...board, [typeKey]: [...board[typeKey]], [posKey]: [...board[posKey]] };
    next[typeKey][index] = incoming; next[posKey][index] = p;
    if (valid(next)) yield { board: next, action: { kind: 'exchange-' + kind, index, outgoing: board[typeKey][index], incoming, to: p } };
  }
}
export function bestExchange(board, kind, index, incoming, weather, cfg = BASELINE) {
  let best = { score: -Infinity, board: null, actions: [] };
  // A legal two-action plan can put its single local action either before or after the exchange.
  for (const exchanged of receive(board, kind, index, incoming)) {
    const after = bestLocal(exchanged.board, weather, 1, cfg);
    const actions = [exchanged.action, ...after.actions];
    if (after.score > best.score || after.score === best.score && actions.length < best.actions.length) best = { ...after, actions };
  }
  for (const before of neighbors(board)) for (const exchanged of receive(before.board, kind, index, incoming)) {
    const value = score(exchanged.board, weather, cfg);
    if (value > best.score || value === best.score && 2 < best.actions.length) best = { score: value, board: exchanged.board, actions: [before.action, exchanged.action] };
  }
  return best;
}
export function auditNight(boards, weather, cfg = BASELINE) {
  const local = boards.map(board => bestLocal(board, weather, 2, cfg));
  const caches = boards.map(() => new Map()), edges = [];
  let weakPairs = 0, freePairs = 0;
  function side(player, kind, index, incoming) {
    const key = kind + index + ':' + incoming;
    if (!caches[player].has(key)) caches[player].set(key, bestExchange(boards[player], kind, index, incoming, weather, cfg));
    return caches[player].get(key);
  }
  for (let a = 0; a < boards.length; a++) for (let b = a + 1; b < boards.length; b++) {
    let best = null, weak = false, free = false;
    for (const kind of ['guest', 'furniture']) {
      const key = kind === 'guest' ? 'g' : 'f';
      for (let i = 0; i < boards[a][key].length; i++) for (let j = 0; j < boards[b][key].length; j++) {
        if (boards[a][key][i] === boards[b][key][j]) continue;
        const left = side(a, kind, i, boards[b][key][j]), right = side(b, kind, j, boards[a][key][i]);
        const gain = [left.score - local[a].score, right.score - local[b].score];
        if (gain[0] >= 0 && gain[1] >= 0 && gain[0] + gain[1] > 0) weak = true;
        if (left.score > score(boards[a], weather, cfg) && right.score > score(boards[b], weather, cfg)) free = true;
        if (gain[0] > 0 && gain[1] > 0 && (!best || gain[0] + gain[1] > best.gain[0] + best.gain[1])) best = { a, b, kind, indices: [i, j], gain, plans: [left, right] };
      }
    }
    if (best) edges.push(best);
    if (weak) weakPairs++;
    if (free) freePairs++;
  }
  // Enumerate disjoint pairings: every player can trade once. No greedy double-use of a player.
  let matching = [], totalGain = 0;
  function match(index, used, chosen, gain) {
    if (index === edges.length) { if (gain > totalGain) { totalGain = gain; matching = [...chosen]; } return; }
    match(index + 1, used, chosen, gain);
    const edge = edges[index], mask = 1 << edge.a | 1 << edge.b;
    if (!(mask & used)) { chosen.push(edge); match(index + 1, used | mask, chosen, gain + edge.gain[0] + edge.gain[1]); chosen.pop(); }
  }
  match(0, 0, [], 0);
  const final = local.map(plan => plan.board), finalScores = local.map(plan => plan.score);
  for (const edge of matching) { final[edge.a] = edge.plans[0].board; final[edge.b] = edge.plans[1].board; finalScores[edge.a] = edge.plans[0].score; finalScores[edge.b] = edge.plans[1].score; }
  return { local, edges, weakPairs, freePairs, matching, totalGain, final, finalScores };
}
export function combinations(n, types = 4, min = 0, prefix = [], output = []) {
  if (n === 0) { output.push([...prefix]); return output; }
  for (let type = min; type < types; type++) combinations(n - 1, types, type, [...prefix, type], output);
  return output;
}
export const cacheInfo = () => ({ days: dayCache.size, guestGroups: guestLayoutCache.size, furnitureGroups: furnitureLayoutCache.size });
