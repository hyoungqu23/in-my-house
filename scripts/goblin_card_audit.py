"""Card-only strategy audit over frozen playtest-2 economic/game rules.

Retention policies are varied independently of investment policy. Optional
response priors use statistics from separate training games, never hidden hands.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, replace
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import statistics
import time

import goblin_market_v2 as base
from goblin_market_tune import candidates

CARDS = base.CARDS
SHORT = dict(zip(CARDS, "CHMW"))
TRIPLES = tuple(itertools.combinations_with_replacement(CARDS, 3))


@dataclass(frozen=True)
class Spec:
    id: str
    family: str
    priority: tuple[str, ...] = ()
    diverse: bool = False
    legacy: str = ""


def discard_fixed(hand, priority, diverse=False):
    counts = Counter(hand)
    options = list(counts)
    if diverse and len(counts) > 1 and any(v > 1 for v in counts.values()):
        options = [c for c in options if counts[c] > 1]
    return max(options, key=priority.index)


def all_specs():
    specs, seen_diverse = [], set()
    for rank in itertools.permutations(CARDS):
        label = "".join(SHORT[c] for c in rank)
        specs.append(Spec("P_" + label, "priority", rank))
        behavior = tuple(discard_fixed(h, rank, True) for h in TRIPLES)
        if behavior not in seen_diverse:
            seen_diverse.add(behavior)
            specs.append(Spec("D_" + label, "diverse", rank, True))
    for name in ("balanced", "ward_keeper", "adaptive", "trend", "skeptic"):
        specs.append(Spec("L_" + name, "legacy", legacy=name))
    for name in ("roles", "counter", "endgame"):
        specs.append(Spec("S_" + name, "situational"))
    assert sum(s.family == "priority" for s in specs) == 24
    assert sum(s.family == "diverse" for s in specs) == 12
    return specs


SPECS = {s.id: s for s in all_specs()}


def condition(sid, role, fee, legal, size):
    return f"{sid}|{role}|{fee}|{int(legal)}|{size}"


class Responses:
    """Frozen public-style response frequencies learned in prior games."""
    def __init__(self, counts=None):
        self.counts = counts or {}

    def probabilities(self, sid, role, fee, legal, size):
        if not size:
            return (1.0, 0.0, 0.0)
        aggregate = self.counts.get(condition(sid, role, "all", legal, size), [2, 1, 1])
        prior = [(v + 1) / (sum(aggregate) + 3) for v in aggregate]
        counts = self.counts.get(condition(sid, role, fee, legal, size), [0, 0, 0])
        probs = [(counts[i] + 6 * prior[i]) / (sum(counts) + 6) for i in range(3)]
        if role == "V" and not legal:
            probs[0] += probs[1]
            probs[1] = 0
        return tuple(probs)


class CardGame(base.Game):
    def __init__(self, seed, specs, *, responses=None, mode="learned", economy="balanced",
                 future_weight=.5, card_cost=.35, explore=0, check=False):
        self.specs = [SPECS[s] if isinstance(s, str) else s for s in specs]
        self.responses, self.mode = responses or Responses(), mode
        self.future_weight, self.card_cost, self.explore = future_weight, card_cost, explore
        self.observed = defaultdict(lambda: [0, 0, 0])
        self.discard_contexts = Counter()
        self.duplicate_keeps = 0
        rules = dict(candidates(len(specs)))["shuffle-four-gates-grace1-flat"]
        super().__init__(seed, [economy] * len(specs), rules, check)

    def trim_hand(self, p):
        while len(self.hands[p]) > self.rules.hand_limit:
            spec, hand, view = self.specs[p], self.hands[p], self.view(p)
            if spec.family in ("priority", "diverse"):
                card = discard_fixed(hand, spec.priority, spec.diverse)
            elif spec.family == "legacy":
                card = min(hand, key=lambda c: base.hand_priority(spec.legacy, replace(view, strategy=spec.legacy), c))
            else:
                own = [s for s in base.SHOPS if self.owners[s] == p]
                incoming = sum(base.movement(1, self.positions[q])[s]
                               for q in range(self.n) if q != p and view.remaining[q] > self.rules.rounds - self.night - 1
                               for s in own)
                outgoing = .6 * sum(self.owners[s] >= 0 and self.owners[s] != p for s in base.SHOPS) / 12
                visitor_stats = sum(x[0] for x in self.public_duels)
                owner_stats = sum(x[3] for x in self.public_duels)
                pc = (sum(x[1] for x in self.public_duels) + 1) / (visitor_stats + 4)
                pw = (sum(x[4] for x in self.public_duels) + 1) / (owner_stats + 4)
                values = {"contract": 4 * (1 - pw), "haggle": 2.0,
                          "markup": 2 * (1 - pc), "ward": 4 * pc}
                if spec.id == "S_roles":
                    values = {"contract": 3.0, "haggle": 2.0, "markup": 1.7, "ward": 2.4}
                if spec.id == "S_endgame":
                    # Visitor cards cannot be spent after the last own turn;
                    # owner cards may still react to other players this night.
                    outgoing *= min(1.0, view.remaining[p])
                    incoming *= min(1.0, sum(view.remaining) / self.n)
                def score(drop):
                    kept = list(hand)
                    kept.remove(drop)
                    attacks = sorted((values[c] for c in kept if c in ("contract", "haggle")), reverse=True)
                    defenses = sorted((values[c] for c in kept if c in ("markup", "ward")), reverse=True)
                    value = outgoing * (attacks[0] if attacks else 0)
                    value += min(1, incoming) * (defenses[0] if defenses else 0)
                    value += min(1, max(0, incoming - 1)) * (defenses[1] if len(defenses) > 1 else 0)
                    value += .1 * (attacks[1] if len(attacks) > 1 and view.remaining[p] > 1 else 0)
                    return value
                card = max(dict.fromkeys(hand), key=score)
            self.discard_contexts["".join(sorted(SHORT[c] for c in hand))] += 1
            hand.remove(card)
            self.discard.append(card)
            self.metrics["discard_" + card] += 1
            self.duplicate_keeps += len(set(hand)) == 1

    def _probs(self, view, other, role, fee, legal):
        if self.mode == "heuristic":
            if role == "O":
                ward = base.prob_has(view, other, "ward") * .55 if legal else 0
                markup = (1 - ward) * base.prob_has(view, other, "markup") * .7
                return 1 - ward - markup, markup, ward
            contract = base.prob_has(view, other, "contract") * .65 if legal else 0
            haggle = (1 - contract) * base.prob_has(view, other, "haggle") * .65
            return 1 - contract - haggle, contract, haggle
        return self.responses.probabilities(self.specs[other].id, role, fee, legal, view.hand_sizes[other])

    def _visitor(self, view, slot, rng):
        p, owner = view.actor, view.owners[slot]
        offers = [s for s in base.SHOPS if view.owners[s] == p and view.levels[s] == view.levels[slot]]
        actions = [(None, None)]
        if "haggle" in view.hand:
            actions.append(("haggle", None))
        if "contract" in view.hand:
            actions += [("contract", s) for s in offers]
        if self.explore and rng.random() < self.explore:
            return rng.choice(actions)
        fee = base.rent(view.owners, view.levels, slot, view.trend, view.rules)
        probs = self._probs(view, owner, "O", fee, bool(offers))
        relative = 1 + 1 / (self.n - 1)
        def value(action):
            card, offer = action
            utility = 0.0
            swap_gain = (base.shop_value(view, slot) - base.shop_value(view, offer)) * relative if offer is not None else 0
            for response, probability in zip((None, "markup", "ward"), probs):
                amount, swap = base.resolve(fee, card, response, bool(offers))
                utility += probability * (-amount * relative + self.future_weight * swap * swap_gain)
            return utility - (self.card_cost if card and view.remaining[p] else 0)
        return max(actions, key=value)

    def _owner(self, view, visitor, slot, rng):
        actions = [None] + [c for c in ("markup", "ward") if c in view.hand]
        if self.explore and rng.random() < self.explore:
            return rng.choice(actions)
        offers = [s for s in base.SHOPS if view.owners[s] == visitor and view.levels[s] == view.levels[slot]]
        fee = base.rent(view.owners, view.levels, slot, view.trend, view.rules)
        probs = self._probs(view, visitor, "V", fee, bool(offers))
        relative = 1 + 1 / (self.n - 1)
        # Predict a contract target from public positions/ownership, not the
        # simultaneous visitor choice or their private hand.
        if offers:
            public_visitor = replace(view, actor=visitor, hand=())
            offer = max(offers, key=lambda s: base.shop_value(public_visitor, slot) - base.shop_value(public_visitor, s))
            loss = base.shop_value(view, slot) - base.shop_value(view, offer)
        else:
            loss = 0
        future_contacts = sum(base.future_visits(view, s, view.actor) for s in base.SHOPS if view.owners[s] == view.actor)
        def value(response):
            utility = 0.0
            for card, probability in zip((None, "contract", "haggle"), probs):
                amount, swap = base.resolve(fee, card, response, bool(offers))
                utility += probability * (amount * relative - self.future_weight * swap * loss * relative)
            return utility - (self.card_cost * min(1, future_contacts) if response else 0)
        return max(actions, key=value)

    def duel(self, p, slot):
        owner = self.owners[slot]
        self.metrics["duels"] += 1
        v, o = self.view(p), self.view(owner)
        legal = any(self.owners[s] == p and self.levels[s] == self.levels[slot] for s in base.SHOPS)
        self.metrics["swap_legal"] += legal
        for c in ("contract", "haggle"):
            self.card_held[c] += c in self.hands[p] and (legal or c != "contract")
        for c in ("markup", "ward"):
            self.card_held[c] += c in self.hands[owner]
        if self.mode == "legacy":
            vp = self.specs[p].legacy or "balanced"
            op = self.specs[owner].legacy or "balanced"
            vc, offered = base.visitor_choice(vp, replace(v, strategy=vp), slot, self.policy_rng[p])
            oc = base.owner_choice(op, replace(o, strategy=op), p, slot, self.policy_rng[owner])
        else:
            vc, offered = self._visitor(v, slot, self.policy_rng[p])
            oc = self._owner(o, p, slot, self.policy_rng[owner])
        fee = base.rent(self.owners, self.levels, slot, self.trends[self.night], self.rules)
        for actor, role, action, options in ((p, "V", vc, (None, "contract", "haggle")),
                                             (owner, "O", oc, (None, "markup", "ward"))):
            for key in (condition(self.specs[actor].id, role, fee, legal, len(self.hands[actor])),
                        condition(self.specs[actor].id, role, "all", legal, len(self.hands[actor]))):
                self.observed[key][options.index(action)] += 1
        self.public_duels[p][0] += 1
        self.public_duels[p][1] += vc == "contract"
        self.public_duels[p][2] += vc == "haggle"
        self.public_duels[owner][3] += 1
        self.public_duels[owner][4] += oc == "ward"
        self.public_duels[owner][5] += oc == "markup"
        amount, swapped = base.resolve(fee, vc, oc, legal)
        for actor, card in ((p, vc), (owner, oc)):
            if card:
                self.hands[actor].remove(card)
                self.discard.append(card)
                self.card_used[card] += 1
                alternative, alt_swap = base.resolve(fee, None if actor == p else vc,
                                                   None if actor == owner else oc, legal)
                self.card_delta[card] += alternative - amount if actor == p else amount - alternative
                self.card_effective[card] += amount != alternative or swapped != alt_swap
        if swapped:
            self.owners[slot], self.owners[offered] = p, owner
            self.metrics["swaps"] += 1
        elif vc == "contract" and oc == "ward":
            self.metrics["blocks"] += 1
        self.metrics["rent_demand"] += amount
        self.tile_paid[slot] += self.pay(p, owner, amount)


def moments(values):
    n = len(values)
    mean = statistics.fmean(values)
    se = statistics.stdev(values) / math.sqrt(n) if n > 1 else 0
    return {"mean": mean, "se": se, "n": n, "ci95": [mean - 1.96 * se, mean + 1.96 * se]}


def run_games(n, runs, seed, roster, *, model=None, mode="learned", economy="balanced", resident=None,
              future_weight=.5, card_cost=.35, explore=0):
    wins, scores = defaultdict(list), defaultdict(list)
    observations = defaultdict(lambda: [0, 0, 0])
    metrics, used, held, effective, delta = Counter(), Counter(), Counter(), Counter(), Counter()
    for i in range(runs):
        rng = random.Random((seed + i) * 127 + 4)
        lineup = [rng.choice(roster)] + [resident] * (n - 1) if resident else rng.sample(roster, n)
        rng.shuffle(lineup)
        g = CardGame(seed+i, lineup, responses=model, mode=mode, economy=economy,
                     future_weight=future_weight, card_cost=card_cost, explore=explore).run()
        assets = g.assets()
        high = max(assets)
        tie = sum(s == high for s in assets)
        shares = [1 / tie if s == high else 0 for s in assets]
        for sid in set(lineup):
            ids = [p for p, s in enumerate(lineup) if s == sid]
            wins[sid].append(statistics.fmean(shares[p] for p in ids))
            scores[sid].append(statistics.fmean(assets[p] for p in ids))
        for key, value in g.observed.items():
            observations[key] = [a+b for a,b in zip(observations[key], value)]
        metrics.update(g.metrics); used.update(g.card_used); held.update(g.card_held)
        effective.update(g.card_effective); delta.update(g.card_delta)
    return {"players": n, "runs": runs, "seed": seed, "mode": mode, "economy": economy,
            "futureWeight": future_weight, "cardCost": card_cost,
            "roster": roster, "resident": resident, "wins": {s: moments(v) for s,v in wins.items()},
            "scores": {s: moments(v) for s,v in scores.items()}, "metrics": dict(metrics),
            "cards": {c:{"held": held[c], "used": used[c], "effective": effective[c], "delta": delta[c]} for c in CARDS},
            "responses": dict(observations)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--stage", choices=("train", "league", "duel"), required=True)
    p.add_argument("--runs", type=int, default=30000)
    p.add_argument("--seed", type=int, default=10100000)
    p.add_argument("--mode", choices=("legacy", "heuristic", "learned"), default="learned")
    p.add_argument("--economy", default="balanced")
    p.add_argument("--future-weight", type=float, default=.5)
    p.add_argument("--card-cost", type=float, default=.35)
    p.add_argument("--roster", default="all")
    p.add_argument("--resident")
    p.add_argument("--model")
    p.add_argument("--output", required=True)
    args = p.parse_args()
    roster = list(SPECS) if args.roster == "all" else args.roster.split(",")
    assert set(roster) <= set(SPECS)
    if args.resident:
        assert args.resident in SPECS
        if len(roster) > 1:
            roster = [s for s in roster if s != args.resident]
    trained = json.loads(Path(args.model).read_text()) if args.model else None
    root = Path(__file__).resolve().parents[1]
    out = {"date": "2026-10-27", "stage": args.stage, "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "gameSha256": hashlib.sha256((root/'scripts/goblin_market_v2.py').read_bytes()).hexdigest(),
           "specs": [s.__dict__ for s in SPECS.values()], "experiments": [], "models": {}}
    started = time.monotonic()
    for n in (3,4):
        model = Responses(trained["models"][str(n)]) if trained else Responses()
        epochs = 3 if args.stage == "train" else 1
        collected = defaultdict(lambda: [0,0,0])
        for epoch in range(epochs):
            span = max(1000000, 3 * (args.runs + 1000))
            r = run_games(n, args.runs, args.seed+n*span+epoch*(args.runs+1000), roster, model=model, mode=args.mode,
                          economy=args.economy, resident=args.resident, future_weight=args.future_weight,
                          card_cost=args.card_cost, explore=.03 if args.stage == "train" else 0)
            if args.stage == "train":
                for key, value in r["responses"].items():
                    collected[key] = [a+b for a,b in zip(collected[key], value)]
                model = Responses(dict(collected))
            out["models"][str(n)] = model.counts
            out["experiments"].append({k:v for k,v in r.items() if k != "responses"})
            out["elapsedSeconds"] = time.monotonic()-started
            Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2)+"\n")
            print(json.dumps({"n": n, "epoch": epoch, "runs": args.runs,
                              "seconds": round(out['elapsedSeconds'],1)}), flush=True)


if __name__ == "__main__":
    main()
