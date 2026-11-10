"""Board/horizon audit adapter. Never modifies the frozen engines or production rules.

All policies use the same public-information forecasting model on the active board.
The baseline is regression-tested against the frozen half-settlement adapter.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import random
import statistics
import time

import goblin_market_v2 as base
import goblin_card_audit as audit
from goblin_card_tuning import TuningGame, active_profile
from goblin_market_tune import candidates
from goblin_market_report import simultaneous_gap


@dataclass(frozen=True)
class Board:
    id: str
    size: int
    groups: tuple[tuple[int, ...], ...]
    rumors: tuple[int, ...]
    markets: tuple[int, ...]
    portals: tuple[int, ...]
    rests: tuple[int, ...]
    gates: tuple[int, ...]

    @property
    def shops(self):
        return tuple(sorted(s for group in self.groups for s in group))

    @property
    def category(self):
        return {slot: i for i, group in enumerate(self.groups) for slot in group}


BOARD20 = Board('mvp20', 20, base.GROUPS, base.RUMORS, (5,), (10,), (15,), (0, 5, 10, 15))
BOARD28 = Board('spread28', 28,
    ((1, 8, 15, 22), (2, 9, 16, 23), (4, 11, 18, 25), (5, 12, 19, 26)),
    (3, 6, 10, 13, 17, 24), (7, 20), (14, 27), (21,), (0, 7, 14, 21))


@dataclass(frozen=True)
class Variant:
    id: str
    board: Board
    nights: int
    income: int = 3
    monopoly: int = 0  # zero means all shops in the category


VARIANTS = {v.id: v for v in (
    Variant('mvp20-8', BOARD20, 8),
    Variant('long20-12', BOARD20, 12),
    Variant('expanded28-12', BOARD28, 12),
    Variant('expanded28-12-income2', BOARD28, 12, 2),
    Variant('expanded28-12-set3', BOARD28, 12, 3, 3),
)}


@lru_cache(maxsize=None)
def movement(board: Board, turns: int, start: int, portal=True):
    state = [0.] * board.size
    state[start] = 1.
    visits = [0.] * board.size
    for _ in range(turns):
        nxt = [0.] * board.size
        for pos, mass in enumerate(state):
            if not mass:
                continue
            for steps, probability in base.DICE:
                landed = (pos + steps) % board.size
                weight = mass * probability
                visits[landed] += weight
                if landed in board.portals and portal:
                    for shop in board.shops:
                        nxt[shop] += weight / len(board.shops)
                        visits[shop] += weight / len(board.shops)
                else:
                    nxt[landed] += weight
        state = nxt
    return tuple(visits)


@contextmanager
def geometry(variant):
    """Process-local public geometry; restored even if a validation fails."""
    board = variant.board
    group_of = board.category
    old = {k: getattr(base, k) for k in ('SHOPS', 'GROUPS', 'GROUP', 'RUMORS', 'movement', 'rent', 'shop_value', 'hand_priority')}
    base.SHOPS, base.GROUPS, base.GROUP, base.RUMORS = board.shops, board.groups, board.category, board.rumors
    base.movement = lambda turns, start, portal=True: movement(board, turns, start, portal)

    def threshold(slot):
        return variant.monopoly or len(board.groups[group_of[slot]])

    def rent(owners, levels, slot, trend, rules):
        fee = rules.upgraded_rent if levels[slot] else rules.base_rent
        fee += rules.quiet_premium * (slot in base.QUIET_SHOPS)
        fee += int(owners[slot] >= 0 and sum(owners[s] == owners[slot] for s in board.groups[group_of[slot]]) >= threshold(slot))
        return fee + int(group_of[slot] == trend)

    def shop_value(view, slot, owner=None):
        owner = view.actor if owner is None else owner
        fee = view.rules.upgraded_rent if view.levels[slot] else view.rules.base_rent
        fee += view.rules.quiet_premium * (slot in base.QUIET_SHOPS)
        fee += .25
        count = sum(view.owners[s] == owner for s in board.groups[group_of[slot]] if s != slot)
        bonus = 1 if count >= threshold(slot) - 1 else .15 * count
        if view.strategy == 'trend':
            value = 0.
            for p, left in enumerate(view.remaining):
                if p == owner or not left:
                    continue
                total = base.movement(left, view.positions[p])[slot]
                current_move = left > view.rules.rounds - view.night - 1
                first = base.movement(1, view.positions[p])[slot]
                second = base.movement(2, view.positions[p])[slot] - first if left >= 2 else 0
                current, following = (first if current_move else 0), (second if current_move else first)
                if view.next_trend is None:
                    following = 0
                value += total * (fee - .25 + bonus) + current * (group_of[slot] == view.trend)
                value += following * (group_of[slot] == view.next_trend)
                value += max(0, total - current - following) * .25
            return value
        return base.future_visits(view, slot, owner) * (fee + bonus)

    def hand_priority(policy, view, card):
        if card == view.rules.disabled:
            return -100
        own = sum(view.owners[s] == view.actor for s in board.shops)
        opportunities = sum(view.remaining) * own / board.size
        values = {'contract': 3. if own else .1, 'haggle': 2.,
                  'markup': 1.9 * min(1.5, opportunities), 'ward': .8 * min(1.5, opportunities)}
        if policy == 'ward_keeper': values['ward'] = 3.2
        if policy == 'collector': values['contract'] += .6
        if policy in ('adaptive', 'trend', 'skeptic'):
            vt, ot = sum(s[0] for s in view.public_duels), sum(s[3] for s in view.public_duels)
            pc = (sum(s[1] for s in view.public_duels) + 1) / (vt + 4)
            pw = (sum(s[4] for s in view.public_duels) + 1) / (ot + 4)
            values['contract'] = 3. * (1 - pw) if own else .1
            values['markup'] *= 1 - pc
            values['ward'] = 3.5 * pc * min(1.5, opportunities)
        if policy == 'skeptic': values['contract'], values['haggle'] = 1.4, 3.3
        return values[card]

    base.rent, base.shop_value, base.hand_priority = rent, shop_value, hand_priority
    try:
        yield
    finally:
        for name, value in old.items(): setattr(base, name, value)


class ExpansionGame(TuningGame):
    def __init__(self, seed, specs, variant, *, responses=None, mode='learned', economy='balanced', check=False,
                 future_weight=.5, card_cost=.35, explore=0):
        self.variant, self.board = variant, variant.board
        self.specs = [audit.SPECS[s] if isinstance(s, str) else s for s in specs]
        self.responses, self.mode = responses or audit.Responses(), mode
        self.future_weight, self.card_cost, self.explore = future_weight, card_cost, explore
        self.observed = defaultdict(lambda: [0, 0, 0])
        self.discard_contexts, self.duplicate_keeps = Counter(), 0
        self.rules = replace(dict(candidates(len(specs)))['shuffle-four-gates-grace1-flat'], rounds=variant.nights, income=variant.income)
        self.policies, self.n, self.check = [economy] * len(specs), len(specs), check
        self.setup_rng, self.deck_rng = random.Random(seed * 101 + 1), random.Random(seed * 101 + 2)
        dice_rng = random.Random(seed * 101 + 3)
        self.policy_rng = [random.Random(seed * 101 + 10 + p) for p in range(self.n)]
        self.orders = []
        for night in range(self.rules.rounds):
            order = [(night + k) % self.n for k in range(self.n)]
            if night: random.Random(seed * 109 + night * 7).shuffle(order)
            self.orders.append(order)
        self.rolls = [[dice_rng.randint(1, 6) + dice_rng.randint(1, 6) for _ in specs] for _ in range(self.rules.rounds)]
        self.owners = [-1 if s in self.board.shops else -2 for s in range(self.board.size)]
        self.levels = [0] * self.board.size
        self.starters = self.setup_rng.sample(self.board.shops, self.n)
        for p, s in enumerate(self.starters): self.owners[s] = p
        start = random.Random(seed * 101 + 5).choice(self.board.gates)
        self.positions, self.cash = [start] * self.n, [16] * self.n
        trend_rng, self.trends = random.Random(seed * 101 + 4), []
        for _ in range((self.rules.rounds + 3) // 4):
            block = list(range(4)); trend_rng.shuffle(block); self.trends.extend(block)
        self.deck, self.discard = list(base.CARDS) * 6, []
        self.deck_rng.shuffle(self.deck)
        self.hands, self.night, self.played = [[] for _ in specs], 0, set()
        self.metrics = Counter()
        self.tile_visits, self.tile_paid, self.tile_owned_turns = ([0] * self.board.size for _ in range(3))
        self.card_held, self.card_used, self.card_effective, self.card_delta = (Counter() for _ in range(4))
        self.paid, self.earned, self.sales = ([0] * self.n for _ in range(3))
        self.bank_net, self.loss, self.ledger_origin = 0, 0, sum(self.cash) + self.n * self.rules.buy
        self.snapshots, self.stock_snapshots = [], []
        self.public_duels = [[0] * 6 for _ in specs]
        self.zero_at, self.recoveries, self.unrecovered = {}, [], 0
        self.windows = Counter()
        self.windows_by_night = [Counter() for _ in range(self.rules.rounds)]
        self.duels_by_night, self.swaps_by_night, self.buys_by_night = ([0] * self.rules.rounds for _ in range(3))
        for p in range(self.n): self.draw(p); self.draw(p)

    def window(self, kind):
        self.windows[kind] += 1; self.windows_by_night[self.night][kind] += 1

    def trim_hand(self, p):
        self.window('discard') if len(self.hands[p]) > self.rules.hand_limit else None
        return super().trim_hand(p)

    def visit_shop(self, p, s):
        if self.owners[s] == -1 and self.cash[p] >= self.rules.buy: self.window('buy')
        return super().visit_shop(p, s)

    def duel(self, p, slot):
        self.window('duel'); self.duels_by_night[self.night] += 1
        before = self.metrics['swaps']
        super().duel(p, slot)
        self.swaps_by_night[self.night] += self.metrics['swaps'] - before

    def pay(self, visitor, owner, fee):
        if self.cash[visitor] < fee and sum(self.owners[s] == visitor for s in self.board.shops) > 1: self.window('sale')
        return super().pay(visitor, owner, fee)

    def buy_at(self, p, s):
        before = self.metrics['buys']; super().buy_at(p, s)
        self.buys_by_night[self.night] += self.metrics['buys'] - before

    def run(self):
        for night in range(self.rules.rounds):
            self.night, self.played = night, set()
            for p in range(self.n): self.cash[p] += self.rules.income; self.bank_net += self.rules.income
            if night:
                for p in self.orders[night]: self.draw(p, trim=False)
                for p in self.orders[night]: self.trim_hand(p)
            for p in self.orders[night]:
                self.played.add(p); self.window('roll')
                for s in self.board.shops: self.tile_owned_turns[s] += self.owners[s] >= 0
                steps = self.rolls[night][p]
                if self.positions[p] + steps >= self.board.size:
                    self.cash[p] += 2; self.bank_net += 2; self.metrics['start_bonuses'] += 1
                s = (self.positions[p] + steps) % self.board.size
                self.positions[p] = s; self.tile_visits[s] += 1
                if s in self.board.shops: self.visit_shop(p, s)
                elif s in self.board.rumors: self.draw(p)
                elif s in self.board.markets:
                    options = [t for t in self.board.shops if self.owners[t] == -1]
                    if options:
                        if self.cash[p] >= self.rules.buy: self.window('buy')
                        self.buy_at(p, self.best_shop(p, options))
                    else:
                        self.metrics['empty_market_visits'] += 1; self.draw(p)
                elif s in self.board.portals:
                    self.window('portal')
                    target = self.best_shop(p, self.board.shops, True)
                    self.positions[p] = target; self.tile_visits[target] += 1
                    self.metrics['portal_visits'] += 1; self.metrics['portal_to_own'] += self.owners[target] == p
                    self.visit_shop(p, target)
                elif s in self.board.rests:
                    self.cash[p] += 2; self.bank_net += 2; self.metrics['rest_bonuses'] += 1
                if self.cash[p] >= self.rules.upgrade and any(self.owners[t] == p and not self.levels[t] for t in self.board.shops): self.window('upgrade')
                upgrade = base.choose_upgrade(self.policies[p], self.view(p), self.policy_rng[p])
                if upgrade is not None:
                    self.cash[p] -= self.rules.upgrade; self.levels[upgrade] = 1; self.metrics['upgrades'] += 1
                if self.check: self.invariant()
            self.snapshots.append(self.assets())
            self.stock_snapshots.append({'occupied': sum(self.owners[s] >= 0 for s in self.board.shops),
                'upgraded': sum(self.levels[s] for s in self.board.shops), 'cash': list(self.cash)})
            for group in self.board.groups:
                required = self.variant.monopoly or len(group)
                self.metrics['monopoly_rounds'] += any(sum(self.owners[s] == p for s in group) >= required for p in range(self.n))
        self.invariant()
        assert all(any(self.owners[s] == p for s in self.board.shops) for p in range(self.n))
        return self


def schema_hashes():
    root = Path(__file__).resolve().parent
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in
        ('goblin_market_expansion.py', 'goblin_market_v2.py', 'goblin_card_audit.py', 'goblin_card_tuning.py')}


def simulate(variant, n, runs, seed, roster, *, responses=None, resident=None, economy='balanced', mode='learned', mixed=False):
    seats, starts = [[] for _ in range(n)], {s: [] for s in variant.board.shops}
    wins, observations, used, effective = defaultdict(list), defaultdict(lambda: [0, 0, 0]), Counter(), Counter()
    metrics, samples = Counter(), defaultdict(list)
    curves = [Counter() for _ in range(variant.nights)]
    for i in range(runs):
        rng = random.Random((seed + i) * 127 + 4)
        lineup = [rng.choice(roster)] + [resident] * (n - 1) if resident else rng.sample(roster, n) if mixed else [roster[i % len(roster)]] * n
        rng.shuffle(lineup)
        g = ExpansionGame(seed + i, lineup, variant, responses=responses, economy=economy, mode=mode).run()
        scores, high = g.assets(), max(g.assets())
        ties = sum(v == high for v in scores); shares = [1 / ties if v == high else 0 for v in scores]
        for p in range(n): seats[p].append(shares[p]); starts[g.starters[p]].append(shares[p])
        for sid in set(lineup): wins[sid].append(statistics.fmean(shares[p] for p in range(n) if lineup[p] == sid))
        for key, value in g.observed.items(): observations[key] = [a + b for a, b in zip(observations[key], value)]
        metrics.update(g.metrics); used.update(g.card_used); effective.update(g.card_effective)
        samples['duels'].append(g.metrics['duels']); samples['swaps'].append(g.metrics['swaps'])
        samples['cashPerPlayer'].append(statistics.fmean(g.cash))
        samples['occupied'].append(g.stock_snapshots[-1]['occupied']); samples['upgraded'].append(g.stock_snapshots[-1]['upgraded'])
        late = g.windows_by_night[variant.nights * 2 // 3:]
        samples['lateInvestmentWindows'].append(sum(row['buy'] + row['upgrade'] for row in late))
        samples['lateNoInvestment'].append(not any(row['buy'] + row['upgrade'] for row in late))
        samples['choiceBudgetMinutes'].append(sum(g.windows[k] * v for k, v in {'roll': 5, 'buy': 10, 'portal': 10, 'duel': 8, 'discard': 5, 'sale': 10, 'upgrade': 5}.items()) / 60)
        samples['decisionWindows'].append(sum(g.windows.values()))
        halfway = g.snapshots[variant.nights // 2 - 1]
        samples['halfwayLeaderWin'].append(sum(shares[p] for p in range(n) if halfway[p] == max(halfway)))
        samples['assetGap'].append(max(scores) - sorted(scores)[-2])
        for k, snap in enumerate(g.stock_snapshots):
            curves[k].update({'occupied': snap['occupied'], 'upgraded': snap['upgraded'], 'cash': statistics.fmean(snap['cash']),
                             'duels': g.duels_by_night[k], 'swaps': g.swaps_by_night[k], 'buys': g.buys_by_night[k]})
    seat_rows = [audit.moments(v) for v in seats]
    starter_rows = {s: audit.moments(v) for s, v in starts.items() if v}
    return {'variant': variant.id, 'players': n, 'runs': runs, 'seed': seed, 'roster': roster, 'resident': resident,
        'economy': economy, 'mode': mode, 'mixed': mixed,
        'wins': {s: audit.moments(v) for s, v in wins.items()}, 'seatWin': seat_rows, 'starterWin': starter_rows,
        'seatGap': simultaneous_gap(seat_rows), 'starterGap': simultaneous_gap(list(starter_rows.values())),
        'samples': {k: audit.moments(v) for k, v in samples.items()},
        'curves': [{k: v / runs for k, v in row.items()} for row in curves],
        'metrics': dict(metrics), 'cards': {c: {'used': used[c], 'effective': effective[c]} for c in base.CARDS},
        'observations': dict(observations)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=('screen', 'train', 'league', 'regression', 'counter'), required=True)
    parser.add_argument('--variants', default='expanded28-12')
    parser.add_argument('--runs', type=int, default=1000)
    parser.add_argument('--seed', type=int, default=231000000)
    parser.add_argument('--model')
    parser.add_argument('--roster', default='all')
    parser.add_argument('--resident')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    roster = list(audit.SPECS) if args.roster == 'all' else args.roster.split(',')
    assert set(roster) <= set(audit.SPECS)
    trained = json.loads(Path(args.model).read_text()) if args.model else None
    if trained: assert trained['sources'] == schema_hashes()
    output = {'kind': 'expansion-audit', 'stage': args.stage, 'date': '2026-10-30', 'sources': schema_hashes(),
        'variants': {key: asdict(VARIANTS[key]) for key in args.variants.split(',')}, 'experiments': [], 'models': {}}
    started = time.monotonic()
    def save():
        output['elapsedSeconds'] = time.monotonic() - started
        Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    with active_profile('half'):
        for variant_id in args.variants.split(','):
            variant = VARIANTS[variant_id]
            with geometry(variant):
                for n in (3, 4):
                    model = audit.Responses(trained['models'][variant_id][str(n)]) if trained else audit.Responses()
                    rounds = 3 if args.stage == 'train' else 1
                    for epoch in range(rounds):
                        policies = ['S_roles', 'D_CWHM', 'D_HMWC'] if args.stage in ('screen', 'regression') else [None]
                        for k, sid in enumerate(policies):
                            ids = [sid] if sid else roster
                            r = simulate(variant, n, args.runs, args.seed + n * 1000000 + epoch * 100000 + k * 100000,
                                ids, responses=model, resident=args.resident, mode='heuristic' if args.stage == 'screen' else 'learned',
                                mixed=args.stage in ('train', 'league'))
                            output['experiments'].append(r)
                            if args.stage == 'train':
                                model = audit.Responses(r['observations']); output['models'].setdefault(variant_id, {})[str(n)] = dict(model.counts)
                            save()
                            print(json.dumps({'variant': variant_id, 'n': n, 'epoch': epoch, 'policy': sid, 'runs': args.runs,
                                'duels': round(r['samples']['duels']['mean'], 2), 'swaps': round(r['samples']['swaps']['mean'], 2),
                                'cash': round(r['samples']['cashPerPlayer']['mean'], 2), 'seatUpper': round(r['seatGap']['simultaneous95'][1], 4),
                                'starterUpper': round(r['starterGap']['simultaneous95'][1], 4)}), flush=True)


if __name__ == '__main__': main()
