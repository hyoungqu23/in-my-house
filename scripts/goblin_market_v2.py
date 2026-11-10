"""Balance candidate model; v1 audit engine remains unchanged for reproduction.

Python standard library only. Policies receive a frozen public/private view;
they cannot inspect the opponent's hand, dice tape, or unrevealed trends.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import asdict, dataclass, replace
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import random
import statistics
import time


SHOPS = (1, 2, 4, 6, 7, 9, 11, 12, 14, 16, 17, 19)
GROUPS = ((1, 2, 7), (4, 6, 12), (9, 11, 17), (14, 16, 19))
GROUP = {s: g for g, slots in enumerate(GROUPS) for s in slots}
RUMORS = (3, 8, 13, 18)
CARDS = ("contract", "haggle", "markup", "ward")
DICE = tuple((s, (6 - abs(7 - s)) / 36) for s in range(2, 13))
QUIET_SHOPS = (1, 2, 16, 17, 19)


@dataclass(frozen=True)
class Rules:
    rounds: int = 8
    income: int = 3
    buy: int = 6
    upgrade: int = 4
    base_rent: int = 2
    upgraded_rent: int = 4
    cap: int = 6
    start_mode: str = "fixed"
    hand_limit: int = 2
    ward_rebate: int = 0
    disabled: str = ""
    draw_order: str = "turn"
    seat_bonus: tuple[int, ...] = ()
    order_mode: str = "rotate"
    quiet_premium: int = 0
    starter_quiet_bonus: int = 0
    protect_last: bool = False
    opening_grace: bool = False
    batch_draw: bool = False
    market_fallback: bool = False


@dataclass(frozen=True)
class View:
    actor: int
    night: int
    rules: Rules
    owners: tuple[int, ...]
    levels: tuple[int, ...]
    cash: tuple[int, ...]
    positions: tuple[int, ...]
    remaining: tuple[int, ...]
    hand: tuple[str, ...]
    hand_sizes: tuple[int, ...]
    discard: tuple[int, ...]
    trend: int
    next_trend: int | None
    strategy: str
    public_duels: tuple[tuple[int, ...], ...]


def rent(owners, levels, slot, trend, rules):
    owner = owners[slot]
    value = rules.upgraded_rent if levels[slot] else rules.base_rent
    value += rules.quiet_premium * (slot in QUIET_SHOPS)
    value += int(all(owners[s] == owner for s in GROUPS[GROUP[slot]]))
    return value + int(GROUP[slot] == trend)


def resolve(base, visitor, owner, legal=True, cap=6):
    """Return fee and swap, before liquidation, independent of policy code."""
    if visitor == "contract" and legal and owner != "ward":
        return 0, True
    return max(0, min(cap, base + 2 * (owner == "markup") - 2 * (visitor == "haggle"))), False


@lru_cache(maxsize=None)
def movement(turns, start, portal=True):
    """Exact 2d6 DP; portal destination uniform among shops in this reference.

    Counts both the portal entrance and the subsequent shop encounter. Terminal
    position is the selected shop. Actual game policies choose the destination.
    """
    state = [0.0] * 20
    state[start] = 1.0
    visits = [0.0] * 20
    for _ in range(turns):
        nxt = [0.0] * 20
        for pos, mass in enumerate(state):
            if not mass:
                continue
            for steps, probability in DICE:
                landed = (pos + steps) % 20
                weight = mass * probability
                visits[landed] += weight
                if landed == 10 and portal:
                    for shop in SHOPS:
                        nxt[shop] += weight / 12
                        visits[shop] += weight / 12
                else:
                    nxt[landed] += weight
        state = nxt
    return tuple(visits)


def future_visits(view, slot, exclude=None):
    return sum(movement(left, view.positions[p])[slot]
               for p, left in enumerate(view.remaining) if p != exclude)


def shop_value(view, slot, owner=None):
    owner = view.actor if owner is None else owner
    fee = view.rules.upgraded_rent if view.levels[slot] else view.rules.base_rent
    fee += view.rules.quiet_premium * (slot in QUIET_SHOPS)
    fee += .25  # Forecast never reads the unrevealed trend sequence.
    count = sum(view.owners[s] == owner for s in GROUPS[GROUP[slot]] if s != slot)
    if view.strategy == "trend":
        base = fee - .25 + (1 if count == 2 else .15 * count)
        value = 0.0
        for p, left in enumerate(view.remaining):
            if p == owner or not left:
                continue
            total = movement(left, view.positions[p])[slot]
            current_move = left > view.rules.rounds - view.night - 1
            first = movement(1, view.positions[p])[slot]
            second = movement(2, view.positions[p])[slot] - first if left >= 2 else 0
            known_current = first if current_move else 0
            known_next = second if current_move else first
            if view.next_trend is None:
                known_next = 0
            value += total * base + known_current * (GROUP[slot] == view.trend)
            value += known_next * (GROUP[slot] == view.next_trend)
            value += max(0, total - known_current - known_next) * .25
        return value
    return future_visits(view, slot, owner) * (fee + (1 if count == 2 else .15 * count))


def reserve(policy, view):
    if policy == "builder":
        return 0
    if policy == "cash":
        return 10**6
    if policy == "collector":
        return 4
    if policy == "cautious":
        return 10
    if policy == "random":
        return 0
    return 6 if view.remaining[view.actor] else 0


def should_buy(policy, view, slot, rng):
    if view.cash[view.actor] < view.rules.buy + reserve(policy, view):
        return False
    return rng.random() < .65 if policy == "random" else True


def choose_upgrade(policy, view, rng):
    options = [s for s in SHOPS if view.owners[s] == view.actor and view.levels[s] == 0]
    if not options or policy in ("cash", "collector"):
        return None
    if view.cash[view.actor] < view.rules.upgrade + reserve(policy, view):
        return None
    if policy == "random":
        return rng.choice(options) if rng.random() < .65 else None
    best = max(options, key=lambda s: (future_visits(view, s, view.actor), -s))
    return best if policy == "builder" or future_visits(view, best, view.actor) > .05 else None


def hand_priority(policy, view, card):
    if card == view.rules.disabled:
        return -100
    owned = [s for s in SHOPS if view.owners[s] == view.actor]
    opportunities = sum(view.remaining) * len(owned) / 20
    values = {"contract": 3.0 if owned else .1, "haggle": 2.0,
              "markup": 1.9 * min(1.5, opportunities),
              "ward": .8 * min(1.5, opportunities)}
    if policy == "ward_keeper":
        values["ward"] = 3.2
    if policy == "collector":
        values["contract"] += .6
    if policy in ("adaptive", "trend", "skeptic"):
        visitor_turns = sum(s[0] for s in view.public_duels)
        owner_turns = sum(s[3] for s in view.public_duels)
        contract_rate = (sum(s[1] for s in view.public_duels) + 1) / (visitor_turns + 4)
        ward_rate = (sum(s[4] for s in view.public_duels) + 1) / (owner_turns + 4)
        values["contract"] = 3.0 * (1 - ward_rate) if owned else .1
        values["markup"] *= 1 - contract_rate
        values["ward"] = 3.5 * contract_rate * min(1.5, opportunities)
    if policy == "skeptic":
        values["contract"], values["haggle"] = 1.4, 3.3
    return values[card]


def prob_has(view, other, card):
    # Unknown pool = all cards except public discard and own private hand.
    counts = [6 - view.discard[i] - view.hand.count(c) for i, c in enumerate(CARDS)]
    total, count, size = sum(counts), counts[CARDS.index(card)], view.hand_sizes[other]
    if not total or size == 0 or count == 0:
        return 0.0
    return 1 - math.comb(total - count, size) / math.comb(total, size) if total - count >= size else 1.0


def visitor_choice(policy, view, slot, rng):
    mine = [s for s in SHOPS if view.owners[s] == view.actor and view.levels[s] == view.levels[slot]]
    actions = [(None, None)]
    if "haggle" in view.hand and view.rules.disabled != "haggle":
        actions.append(("haggle", None))
    if "contract" in view.hand and mine and view.rules.disabled != "contract":
        actions.extend(("contract", s) for s in mine)
    if policy == "random":
        return rng.choice(actions)
    other = view.owners[slot]
    base = rent(view.owners, view.levels, slot, view.trend, view.rules)
    ward = prob_has(view, other, "ward") * (.8 if policy == "cautious" else .55) if mine else 0
    markup = (1 - ward) * prob_has(view, other, "markup") * .7
    if policy in ("adaptive", "trend", "skeptic"):
        stats = view.public_duels[other]
        ward = (stats[4] + 1) / (stats[3] + 4) if mine else 0
        markup = (stats[5] + 1) / (stats[3] + 4)
        if policy == "skeptic" and mine:
            ward = max(ward, .65)
            markup = min(markup, 1 - ward)
    beliefs = ((None, 1 - ward - markup), ("ward", ward), ("markup", markup))
    relative = 1 + 1 / (len(view.cash) - 1)
    def value(action):
        card, offered = action
        score = 0.0
        for response, probability in beliefs:
            fee, swapped = resolve(base, card, response, bool(mine), view.rules.cap)
            change = -fee * relative
            if swapped:
                change += (shop_value(view, slot) - shop_value(view, offered)) * relative
            score += probability * change
        return score - (.35 if card and view.remaining[view.actor] else 0)
    return max(actions, key=value)


def owner_choice(policy, view, visitor, slot, rng):
    actions = [None] + [c for c in ("markup", "ward") if c in view.hand and c != view.rules.disabled]
    if policy == "random":
        return rng.choice(actions)
    mine = [s for s in SHOPS if view.owners[s] == visitor and view.levels[s] == view.levels[slot]]
    contract = prob_has(view, visitor, "contract") * .65 if mine else 0
    haggle = (1 - contract) * prob_has(view, visitor, "haggle") * .65
    if policy in ("adaptive", "trend", "skeptic"):
        stats = view.public_duels[visitor]
        contract = (stats[1] + 1) / (stats[0] + 4) if mine else 0
        haggle = (stats[2] + 1) / (stats[0] + 4)
    beliefs = ((None, 1 - contract - haggle), ("contract", contract), ("haggle", haggle))
    base = rent(view.owners, view.levels, slot, view.trend, view.rules)
    relative = 1 + 1 / (len(view.cash) - 1)
    # Opponent's offered shop is a hidden simultaneous selection. Estimate the
    # mean among public, legal options; do not inspect their chosen target.
    exchange_loss = shop_value(view, slot) - statistics.fmean(shop_value(view, s) for s in mine) if mine else 0
    def value(response):
        score = 0.0
        for card, probability in beliefs:
            fee, swapped = resolve(base, card, response, bool(mine), view.rules.cap)
            score += probability * (fee * relative - (exchange_loss * relative if swapped else 0))
            if response == "ward" and card == "contract":
                score += probability * view.rules.ward_rebate
        return score - (.25 if response else 0)
    return max(actions, key=value)


class Game:
    def __init__(self, seed, policies, rules=Rules(), check=False):
        self.rules, self.policies, self.n, self.check = rules, policies, len(policies), check
        self.setup_rng = random.Random(seed * 101 + 1)
        self.deck_rng = random.Random(seed * 101 + 2)
        dice_rng = random.Random(seed * 101 + 3)
        self.policy_rng = [random.Random(seed * 101 + 10 + p) for p in range(self.n)]
        self.orders = []
        for night in range(rules.rounds):
            if rules.order_mode == "snake":
                order = [(night // 2 + k) % self.n for k in range(self.n)]
                if night % 2:
                    order.reverse()
            else:
                order = [(night + k) % self.n for k in range(self.n)]
                if rules.order_mode == "shuffle" and night:
                    random.Random(seed * 109 + night * 7).shuffle(order)
            self.orders.append(order)
        self.rolls = [[dice_rng.randint(1, 6) + dice_rng.randint(1, 6) for _ in policies] for _ in range(rules.rounds)]
        self.owners = [-1 if s in SHOPS else -2 for s in range(20)]
        self.levels = [0] * 20
        starters = self.setup_rng.sample(SHOPS, self.n)
        for p, s in enumerate(starters):
            self.owners[s] = p
        self.starters = starters
        start_rng = random.Random(seed * 101 + 5)
        trend_rng = random.Random(seed * 101 + 4)
        start = start_rng.choice((0, 5, 10, 15)) if rules.start_mode == "four_gates" else 0
        self.positions, self.cash = [start] * self.n, [16] * self.n
        for p, slot in enumerate(starters):
            self.cash[p] += rules.seat_bonus[p] if rules.seat_bonus else 0
            self.cash[p] += rules.starter_quiet_bonus * (slot in QUIET_SHOPS)
        self.trends = []
        for _ in range((rules.rounds + 3) // 4):
            block = list(range(4))
            trend_rng.shuffle(block)
            self.trends.extend(block)
        self.deck, self.discard = list(CARDS) * 6, []
        self.deck_rng.shuffle(self.deck)
        self.hands = [[] for _ in policies]
        self.night, self.played = 0, set()
        self.metrics = Counter()
        self.tile_visits, self.tile_paid, self.tile_owned_turns = [0] * 20, [0] * 20, [0] * 20
        self.card_held, self.card_used, self.card_effective, self.card_delta = Counter(), Counter(), Counter(), Counter()
        self.paid, self.earned, self.sales = [0] * self.n, [0] * self.n, [0] * self.n
        self.bank_net, self.loss = 0, 0
        self.ledger_origin = sum(self.cash) + self.n * self.rules.buy
        self.snapshots = []
        # Publicly revealed role/action counts only: visitor turns, contract,
        # haggle, owner turns, ward, markup. Never include hidden held cards.
        self.public_duels = [[0] * 6 for _ in policies]
        self.zero_at, self.recoveries, self.unrecovered = {}, [], 0
        for p in range(self.n):
            self.draw(p); self.draw(p)

    def view(self, p):
        return View(p, self.night, self.rules, tuple(self.owners), tuple(self.levels), tuple(self.cash),
                    tuple(self.positions), tuple(self.rules.rounds - self.night - 1 + (q not in self.played) for q in range(self.n)),
                    tuple(self.hands[p]), tuple(map(len, self.hands)), tuple(self.discard.count(c) for c in CARDS),
                    self.trends[self.night], self.trends[self.night + 1] if self.night + 1 < self.rules.rounds else None,
                    self.policies[p], tuple(tuple(s) for s in self.public_duels))

    def draw(self, p, trim=True):
        if not self.deck:
            self.deck, self.discard = self.discard, []
            self.deck_rng.shuffle(self.deck)
        if self.deck:
            self.hands[p].append(self.deck.pop())
            self.metrics["draws"] += 1
        if trim:
            self.trim_hand(p)

    def trim_hand(self, p):
        while len(self.hands[p]) > self.rules.hand_limit:
            view = self.view(p)
            if self.policies[p] == "random":
                idx = self.policy_rng[p].randrange(len(self.hands[p]))
            else:
                idx = min(range(len(self.hands[p])), key=lambda i: hand_priority(self.policies[p], view, self.hands[p][i]))
            card = self.hands[p].pop(idx)
            self.discard.append(card)
            self.metrics["discard_" + card] += 1

    def assets(self):
        scores = list(self.cash)
        for s in SHOPS:
            if self.owners[s] >= 0:
                scores[self.owners[s]] += self.rules.buy + self.rules.upgrade * self.levels[s]
        return scores

    def invariant(self):
        assert all(c >= 0 for c in self.cash)
        assert all(len(h) <= self.rules.hand_limit for h in self.hands)
        assert Counter(self.deck + self.discard + sum(self.hands, [])) == Counter({c: 6 for c in CARDS})
        assert sum(self.assets()) == self.ledger_origin + self.bank_net - self.loss
        assert all(self.levels[s] == 0 for s in SHOPS if self.owners[s] < 0)

    def pay(self, visitor, owner, fee):
        while self.cash[visitor] < fee:
            owned = [s for s in SHOPS if self.owners[s] == visitor]
            if not owned:
                break
            if self.rules.protect_last and len(owned) == 1:
                self.metrics["last_shop_protected"] += 1
                break
            view = self.view(visitor)
            sold = min(owned, key=lambda s: (shop_value(view, s) + self.levels[s] * .2, s))
            refund = 5 if self.levels[sold] else 3
            self.loss += self.rules.buy + self.rules.upgrade * self.levels[sold] - refund
            self.cash[visitor] += refund
            self.owners[sold], self.levels[sold] = -1, 0
            self.sales[visitor] += 1
            self.metrics["forced_sales"] += 1
        paid = min(fee, self.cash[visitor])
        self.cash[visitor] -= paid
        self.cash[owner] += paid
        self.paid[visitor] += paid
        self.earned[owner] += paid
        self.metrics["unpaid"] += fee - paid
        return paid

    def duel(self, p, slot):
        owner = self.owners[slot]
        self.metrics["duels"] += 1
        v, o = self.view(p), self.view(owner)
        legal = any(self.owners[s] == p and self.levels[s] == self.levels[slot] for s in SHOPS)
        self.metrics["swap_legal"] += legal
        for card in ("contract", "haggle"):
            if card in self.hands[p] and (legal or card != "contract"):
                self.card_held[card] += 1
        for card in ("markup", "ward"):
            if card in self.hands[owner]:
                self.card_held[card] += 1
        vc, offered = visitor_choice(self.policies[p], v, slot, self.policy_rng[p])
        oc = owner_choice(self.policies[owner], o, p, slot, self.policy_rng[owner])
        self.public_duels[p][0] += 1
        self.public_duels[p][1] += vc == "contract"
        self.public_duels[p][2] += vc == "haggle"
        self.public_duels[owner][3] += 1
        self.public_duels[owner][4] += oc == "ward"
        self.public_duels[owner][5] += oc == "markup"
        base = rent(self.owners, self.levels, slot, self.trends[self.night], self.rules)
        fee, swapped = resolve(base, vc, oc, legal, self.rules.cap)
        for actor, card in ((p, vc), (owner, oc)):
            if card:
                self.hands[actor].remove(card)
                self.discard.append(card)
                self.card_used[card] += 1
                alternative, alt_swap = resolve(base, None if actor == p else vc,
                                                None if actor == owner else oc, legal, self.rules.cap)
                delta = alternative - fee if actor == p else fee - alternative
                self.card_delta[card] += delta
                self.card_effective[card] += fee != alternative or swapped != alt_swap
        if swapped:
            assert offered is not None and self.levels[offered] == self.levels[slot]
            self.owners[slot], self.owners[offered] = p, owner
            self.metrics["swaps"] += 1
        elif vc == "contract" and oc == "ward":
            self.metrics["blocks"] += 1
            self.cash[owner] += self.rules.ward_rebate
            self.bank_net += self.rules.ward_rebate
        self.metrics["rent_demand"] += fee
        self.tile_paid[slot] += self.pay(p, owner, fee)

    def best_shop(self, p, options, portal=False):
        v, policy = self.view(p), self.policies[p]
        if policy == "random":
            return self.policy_rng[p].choice(options)
        def value(s):
            owner = self.owners[s]
            if owner < 0:
                return shop_value(v, s) if should_buy(policy, v, s, self.policy_rng[p]) else 0
            if owner == p:
                return .01
            card, _ = visitor_choice(policy, v, s, self.policy_rng[p])
            estimate, _ = resolve(rent(v.owners, v.levels, s, v.trend, v.rules), card, None, True, v.rules.cap)
            return -estimate
        return max(options, key=lambda s: (value(s), -s))

    def buy_at(self, p, s):
        if should_buy(self.policies[p], self.view(p), s, self.policy_rng[p]):
            self.cash[p] -= self.rules.buy
            self.owners[s] = p
            self.metrics["buys"] += 1

    def visit_shop(self, p, s):
        if self.owners[s] == -1:
            self.buy_at(p, s)
        elif self.owners[s] != p:
            if self.night == 0 and self.rules.opening_grace:
                self.metrics["opening_free_visits"] += 1
            else:
                self.duel(p, s)

    def run(self):
        for night in range(self.rules.rounds):
            self.night, self.played = night, set()
            for p in range(self.n):
                self.cash[p] += self.rules.income
                self.bank_net += self.rules.income
            if night:
                order = list(range(self.n)) if self.rules.draw_order == "seat" else self.orders[night]
                for p in order:
                    self.draw(p, trim=not self.rules.batch_draw)
                if self.rules.batch_draw:
                    for p in order:
                        self.trim_hand(p)
            for p in self.orders[night]:
                self.played.add(p)
                for s in SHOPS:
                    self.tile_owned_turns[s] += self.owners[s] >= 0
                steps = self.rolls[night][p]
                if self.positions[p] + steps >= 20:
                    self.cash[p] += 2; self.bank_net += 2
                    self.metrics["start_bonuses"] += 1
                s = (self.positions[p] + steps) % 20
                self.positions[p] = s
                self.tile_visits[s] += 1
                if s in SHOPS:
                    self.visit_shop(p, s)
                elif s in RUMORS:
                    self.draw(p)
                elif s == 5:
                    options = [t for t in SHOPS if self.owners[t] == -1]
                    if options:
                        self.buy_at(p, self.best_shop(p, options))
                    else:
                        self.metrics["empty_market_visits"] += 1
                        if self.rules.market_fallback:
                            self.draw(p)
                elif s == 10:
                    target = self.best_shop(p, SHOPS, True)
                    self.positions[p] = target
                    self.tile_visits[target] += 1
                    self.metrics["portal_visits"] += 1
                    self.metrics["portal_to_own"] += self.owners[target] == p
                    self.visit_shop(p, target)
                elif s == 15:
                    self.cash[p] += 2; self.bank_net += 2
                    self.metrics["rest_bonuses"] += 1
                upgrade = choose_upgrade(self.policies[p], self.view(p), self.policy_rng[p])
                if upgrade is not None:
                    self.cash[p] -= self.rules.upgrade
                    self.levels[upgrade] = 1
                    self.metrics["upgrades"] += 1
                own = sum(self.owners[t] == p for t in SHOPS)
                if not own and p not in self.zero_at:
                    self.zero_at[p] = night
                    self.metrics["zero_asset_episodes"] += 1
                elif own and p in self.zero_at:
                    self.recoveries.append(night - self.zero_at.pop(p))
                if self.check:
                    self.invariant()
            self.snapshots.append(self.assets())
            for slots in GROUPS:
                owners = [self.owners[s] for s in slots]
                self.metrics["monopoly_rounds"] += owners[0] >= 0 and len(set(owners)) == 1
        self.unrecovered = len(self.zero_at)
        self.metrics["unrecovered_episodes"] += self.unrecovered
        self.metrics["recovered_episodes"] += len(self.recoveries)
        self.metrics["recovered_within_two"] += sum(t <= 2 for t in self.recoveries)
        self.metrics["recovery_censored_late"] += sum(self.rules.rounds - 1 - t < 2 for t in self.zero_at.values())
        self.invariant()
        return self


def estimate(values):
    n = len(values)
    mean = statistics.fmean(values)
    se = statistics.stdev(values) / math.sqrt(n) if n > 1 else 0
    return {"mean": mean, "ci95": [mean - 1.96 * se, mean + 1.96 * se], "n": n}


def experiment(label, n, runs, seed, cohort, rules=Rules()):
    seats = [[] for _ in range(n)]
    starter_win, starter_score = {s: [] for s in SHOPS}, {s: [] for s in SHOPS}
    policy_wins, policy_scores = {}, {}
    totals, held, used, effective, delta = Counter(), Counter(), Counter(), Counter(), Counter()
    visits, paid, owned_turns = [0] * 20, [0] * 20, [0] * 20
    margins, duels, swaps, lead_wins = [], [], [], []
    all_scores = []
    for i in range(runs):
        # Independent lineup stream: no coupling to setup, dice, or deck.
        lineup_rng = random.Random((seed + i) * 101 + 9)
        lineup = lineup_rng.sample(cohort, n) if len(cohort) > n else [cohort[j % len(cohort)] for j in range(n)]
        lineup_rng.shuffle(lineup)
        game = Game(seed + i, lineup, rules).run()
        scores = game.assets()
        all_scores.extend(scores)
        top = max(scores)
        winners = [p for p, score in enumerate(scores) if score == top]
        shares = [1 / len(winners) if p in winners else 0 for p in range(n)]
        for p in range(n):
            seats[p].append(shares[p])
            starter_win[game.starters[p]].append(shares[p])
            starter_score[game.starters[p]].append(scores[p])
        # Each row is one game-level policy mean; players from one game are not
        # falsely treated as independent observations for policy uncertainty.
        for policy in set(lineup):
            ids = [p for p in range(n) if lineup[p] == policy]
            policy_wins.setdefault(policy, []).append(statistics.fmean(shares[p] for p in ids))
            policy_scores.setdefault(policy, []).append(statistics.fmean(scores[p] for p in ids))
        totals.update(game.metrics); held.update(game.card_held); used.update(game.card_used)
        effective.update(game.card_effective); delta.update(game.card_delta)
        visits = [a + b for a, b in zip(visits, game.tile_visits)]
        paid = [a + b for a, b in zip(paid, game.tile_paid)]
        owned_turns = [a + b for a, b in zip(owned_turns, game.tile_owned_turns)]
        margins.append(sorted(scores)[-1] - sorted(scores)[-2])
        duels.append(game.metrics["duels"]); swaps.append(game.metrics["swaps"])
        halfway = game.snapshots[max(0, rules.rounds // 2 - 1)]
        leaders = [p for p in range(n) if halfway[p] == max(halfway)]
        lead_wins.append(sum(shares[p] for p in leaders))
    return {"label": label, "players": n, "runs": runs, "seed": seed, "rules": asdict(rules),
            "cohort": cohort, "seatWin": [estimate(x) for x in seats],
            "starterWin": {s: estimate(x) for s, x in starter_win.items()},
            "starterScore": {s: estimate(x) for s, x in starter_score.items()},
            "policyWin": {p: estimate(v) for p, v in policy_wins.items()},
            "policyScore": {p: estimate(v) for p, v in policy_scores.items()},
            "metrics": dict(totals), "cards": {c: {"heldEligible": held[c], "used": used[c],
                "effective": effective[c], "rentDelta": delta[c]} for c in CARDS},
            "tileVisits": visits, "tilePaid": paid, "tileOwnedTurns": owned_turns,
            "margin": estimate(margins), "duels": estimate(duels), "swaps": estimate(swaps),
            "halfwayLeaderWins": estimate(lead_wins), "meanScore": statistics.fmean(all_scores)}


def exact_audit(rounds=8):
    simple = movement(rounds, 0, False)
    neutral = movement(rounds, 0, True)
    gates = [statistics.fmean(movement(rounds, s, True)[t] for s in (0, 5, 10, 15)) for t in range(20)]
    return {"dice": dict(DICE), "noPortalVisits": simple, "uniformPortalVisits": neutral,
            "fourGateUniformPortalVisits": gates,
            "groups": [{"slots": list(g), "noPortalVisits": sum(simple[s] for s in g),
                        "uniformPortalVisits": sum(neutral[s] for s in g)} for g in GROUPS],
            "combat": [{"base": b, "visitor": v, "owner": o, "fee": resolve(b, v, o)[0],
                        "swap": resolve(b, v, o)[1]}
                       for b in range(2, 7) for v in (None, "haggle", "contract") for o in (None, "markup", "ward")]}


def recovery_stress(runs=200):
    """Adversarial midgame state, not a frequency estimate of normal games.

    Four remaining nights; one player owns nothing, all 12 shops are held by
    solvent opponents. Exact invariant: absent an opponent's forced sale,
    neither purchase nor same-level exchange can give that player a shop.
    """
    output = []
    for n in (3, 4):
        regained, forced_sales, winners = 0, 0, 0
        for seed in range(6000000, 6000000 + runs):
            g = Game(seed, ["balanced"] * n, replace(Rules(), rounds=4), check=True)
            for j, s in enumerate(SHOPS):
                g.owners[s] = 1 + j % (n - 1)
            g.cash = [0] + [40] * (n - 1)
            g.ledger_origin = sum(g.assets())
            g.run()
            regained += any(g.owners[s] == 0 for s in SHOPS)
            forced_sales += g.metrics["forced_sales"]
            winners += g.assets()[0] == max(g.assets())
        output.append({"players": n, "runs": runs, "remainingNights": 4,
                       "regainedAnyShop": regained, "opponentOrSelfForcedSales": forced_sales,
                       "brokePlayerWins": winners, "normalGameFrequency": None})
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3000)
    parser.add_argument("--output", default="docs/plans/assets/goblin-market-audit.json")
    parser.add_argument("--suite", choices=("screen", "confirm"), default="screen")
    args = parser.parse_args()
    started = time.monotonic()
    jobs = []
    for n in (3, 4):
        for policy in ("balanced", "builder", "ward_keeper"):
            jobs.append((f"homogeneous/{policy}/{n}", n, [policy], Rules()))
        for challenger in ("builder", "collector", "cash", "cautious", "ward_keeper", "random"):
            jobs.append((f"challenger/{challenger}/{n}", n, [challenger] + ["balanced"] * (n - 1), Rules()))
        jobs.append((f"mixed/{n}", n, ["balanced", "builder", "collector", "cautious"], Rules()))
        jobs.append((f"mixed_counterplay/{n}", n, ["balanced", "builder", "ward_keeper"], Rules()))
        for resident in ("builder", "ward_keeper"):
            for challenger in ("balanced", "ward_keeper" if resident == "builder" else "builder"):
                jobs.append((f"invasion/{challenger}_vs_{resident}/{n}", n,
                             [challenger] + [resident] * (n - 1), Rules()))
        for card in CARDS:
            jobs.append((f"ablation/{card}/{n}", n, ["balanced"], replace(Rules(), disabled=card)))
        for name, variant in (("four_gates", replace(Rules(), start_mode="four_gates")),
                              ("hand3", replace(Rules(), hand_limit=3)),
                              ("rounds12", replace(Rules(), rounds=12)),
                              ("fixed_draw", replace(Rules(), draw_order="seat")),
                              ("ward_rebate2", replace(Rules(), ward_rebate=2))):
            jobs.append((f"candidate/{name}/{n}", n, ["balanced"], variant))
    output = {"date": "2026-10-26", "suite": args.suite, "engineSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "method": "frozen-observation heuristics; independent RNG streams; split ties; game-level policy uncertainty",
              "exact": exact_audit(), "recoveryStress": recovery_stress(), "experiments": []}
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    seed_base = 810000 if args.suite == "screen" else 1920000
    for label, n, cohort, rules in jobs:
        # Common seeds across rule candidates, ablations and cohorts. 3/4-player
        # games use separate seed ranges; confirm never reuses screening seeds.
        result = experiment(label, n, args.runs, seed_base + n * 100000, cohort, rules)
        output["experiments"].append(result)
        output["elapsedSeconds"] = time.monotonic() - started
        path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"label": label, "duels": round(result["duels"]["mean"], 2),
                          "swaps": round(result["swaps"]["mean"], 2), "seconds": round(output["elapsedSeconds"], 1)}), flush=True)


if __name__ == "__main__":
    main()
