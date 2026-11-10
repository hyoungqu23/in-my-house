import itertools
import random
import unittest
from dataclasses import replace

import goblin_market_v2 as base
from goblin_market_tune import candidates
from goblin_card_audit import CardGame, CARDS, SPECS, TRIPLES, Responses, discard_fixed


class CardAuditTests(unittest.TestCase):
    def test_all_fixed_orders_and_unique_diverse_orders(self):
        strict = [s for s in SPECS.values() if s.family == "priority"]
        diverse = [s for s in SPECS.values() if s.family == "diverse"]
        self.assertEqual(len(strict), 24)
        self.assertEqual(len(diverse), 12)
        maps = {tuple(discard_fixed(h, s.priority, s.diverse) for h in TRIPLES) for s in strict + diverse}
        self.assertEqual(len(maps), 36)
        self.assertEqual(len(TRIPLES), 20)
        self.assertEqual(2**12 * 3**4, 331776)

    def test_diverse_discards_duplicate_even_if_favored(self):
        rank = ("contract", "ward", "haggle", "markup")
        hand = ["contract", "contract", "ward"]
        self.assertEqual(discard_fixed(hand, rank, False), "ward")
        self.assertEqual(discard_fixed(hand, rank, True), "contract")

    def test_legacy_controller_matches_frozen_rules_game(self):
        for n in (3, 4):
            for policy in ("balanced", "ward_keeper", "adaptive"):
                for seed in range(10):
                    rules = dict(candidates(n))["shuffle-four-gates-grace1-flat"]
                    a = base.Game(seed, [policy] * n, rules, check=True).run()
                    b = CardGame(seed, ["L_" + policy] * n, mode="legacy", economy=policy, check=True).run()
                    self.assertEqual((a.owners, a.levels, a.cash, a.hands, a.metrics),
                                     (b.owners, b.levels, b.cash, b.hands, b.metrics))

    def test_hidden_hand_and_future_cannot_change_same_observation_decision(self):
        g = CardGame(50, ["P_CWHM", "P_WHCM", "D_CHMW"])
        target = g.starters[1]
        view = g.view(0)
        before = g._visitor(view, target, random.Random(4))
        g.hands[1], g.hands[2] = g.hands[2], g.hands[1]
        g.rolls[-1][0] = 2
        g.trends[-1] = (g.trends[-1] + 1) % 4
        self.assertEqual(view, g.view(0))
        self.assertEqual(before, g._visitor(g.view(0), target, random.Random(4)))
        owner_view = g.view(1)
        owner_before = g._owner(owner_view, 0, target, random.Random(4))
        g.hands[0] = list(reversed(g.hands[0]))
        self.assertEqual(owner_before, g._owner(owner_view, 0, target, random.Random(4)))

    def test_response_distribution_is_normalized_and_never_requires_hidden_hands(self):
        r = Responses()
        for role, legal, size in itertools.product(("V", "O"), (False, True), (0, 1, 2)):
            p = r.probabilities("P_CWHM", role, 4, legal, size)
            self.assertAlmostEqual(sum(p), 1)
            self.assertTrue(all(0 <= x <= 1 for x in p))
            if role == "V" and not legal:
                self.assertEqual(p[1], 0)

    def test_every_strategy_family_preserves_cards_and_assets(self):
        ids = list(SPECS)
        for n in (3, 4):
            for i, sid in enumerate(ids):
                lineup = [sid] + [ids[(i+k+1) % len(ids)] for k in range(n-1)]
                for mode in ("heuristic", "learned"):
                    CardGame(i, lineup, mode=mode, check=True).run()


if __name__ == "__main__":
    unittest.main()
