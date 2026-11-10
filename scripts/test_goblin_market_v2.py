"""Candidate regression tests; v1 stays a frozen independent reference."""
from dataclasses import replace
import unittest
import random

import goblin_market as original
import goblin_market_v2 as model


class CandidateTests(unittest.TestCase):
    def test_default_rules_match_frozen_engine(self):
        for n in (3, 4):
            for seed in range(30):
                cohort = ["balanced", "builder", "random", "ward_keeper"][:n]
                a = original.Game(seed, cohort, check=True).run()
                b = model.Game(seed, cohort, check=True).run()
                self.assertEqual((a.cash, a.owners, a.levels, a.metrics, a.hands, a.snapshots),
                                 (b.cash, b.owners, b.levels, b.metrics, b.hands, b.snapshots))

    def test_last_shop_is_preserved_and_no_unpaid_money_is_created(self):
        g = model.Game(51, ["balanced"] * 3, replace(model.Rules(), protect_last=True))
        g.cash[0] = 0
        g.bank_net -= 16
        before = g.cash[1]
        for _ in range(20):
            self.assertEqual(g.pay(0, 1, 6), 0)
            self.assertEqual(sum(g.owners[s] == 0 for s in model.SHOPS), 1)
            self.assertEqual(g.cash[1], before)
            g.invariant()
        self.assertEqual(g.metrics["last_shop_protected"], 20)
        self.assertEqual(g.metrics["unpaid"], 120)

    def test_other_shops_are_sold_before_last_shop_protection(self):
        g = model.Game(52, ["balanced"] * 3, replace(model.Rules(), protect_last=True))
        extra = next(s for s in model.SHOPS if g.owners[s] == -1)
        g.owners[extra] = 0
        g.cash[0] = 0
        g.ledger_origin = sum(g.assets())
        self.assertEqual(g.pay(0, 1, 6), 3)
        self.assertEqual(sum(g.owners[s] == 0 for s in model.SHOPS), 1)
        self.assertEqual(g.loss, 3)
        self.assertEqual(g.sales[0], 1)
        g.invariant()

    def test_quiet_shop_premium_applies_to_both_sizes(self):
        g = model.Game(53, ["balanced"] * 3)
        g.owners[1], g.owners[2], g.owners[7] = 0, 1, 2
        r = replace(model.Rules(), quiet_premium=1)
        self.assertEqual(model.rent(g.owners, g.levels, 1, 3, r), 3)
        g.levels[1] = 1
        self.assertEqual(model.rent(g.owners, g.levels, 1, 3, r), 5)
        self.assertEqual(model.resolve(7, "haggle", "markup"), (6, False))

    def test_setup_bonus_has_correct_ledger_and_does_not_change_dice(self):
        r = replace(model.Rules(), seat_bonus=(0, 1, 2, 3), starter_quiet_bonus=1)
        a, b = model.Game(54, ["balanced"] * 4), model.Game(54, ["balanced"] * 4, r)
        self.assertEqual(a.rolls, b.rolls)
        self.assertEqual(a.starters, b.starters)
        for p, s in enumerate(b.starters):
            self.assertEqual(b.cash[p], 16 + p + (s in model.QUIET_SHOPS))
        b.invariant()

    def test_snake_and_shuffle_give_each_player_one_turn_per_night(self):
        for n in (3, 4):
            for mode in ("rotate", "snake", "shuffle"):
                g = model.Game(55, ["balanced"] * n, replace(model.Rules(), order_mode=mode))
                self.assertEqual(g.orders[0], list(range(n)))
                for order in g.orders:
                    self.assertEqual(sorted(order), list(range(n)))

    def test_batch_draws_finish_before_any_new_discards(self):
        g = model.Game(56, ["balanced"] * 4)
        g.discard += g.deck[:-1]
        g.deck = g.deck[-1:]
        for p in range(4):
            g.draw(p, trim=False)
            self.assertEqual(len(g.hands[p]), 3)
        for p in range(4):
            g.trim_hand(p)
        g.invariant()

    def test_all_combinations_conserve_assets_and_keep_one_shop(self):
        for n in (3, 4):
            for seed in range(30):
                for mode in ("rotate", "snake", "shuffle"):
                    r = replace(model.Rules(), protect_last=True, quiet_premium=seed % 2,
                                starter_quiet_bonus=seed % 2, order_mode=mode,
                                seat_bonus=tuple(range(n)), opening_grace=bool(seed % 2),
                                batch_draw=True, market_fallback=True)
                    g = model.Game(seed, ["balanced", "builder", "random", "ward_keeper"][:n], r, check=True).run()
                    self.assertTrue(all(any(g.owners[s] == p for s in model.SHOPS) for p in range(n)))

    def test_adaptive_observations_do_not_include_secret_actions_or_future(self):
        g = model.Game(57, ["adaptive", "trend", "ward_keeper"])
        before = g.view(0)
        decision = model.visitor_choice("adaptive", before, g.starters[1], random.Random(1))
        g.hands[1], g.hands[2] = g.hands[2], g.hands[1]
        g.trends[4] = (g.trends[4] + 1) % 4
        g.rolls[-1][0] = 2
        self.assertEqual(before, g.view(0))
        self.assertEqual(decision, model.visitor_choice("adaptive", g.view(0), g.starters[1], random.Random(1)))

    def test_adaptive_and_trend_strategies_conserve_cards_and_money(self):
        for n in (3, 4):
            for seed in range(40):
                r = replace(model.Rules(), protect_last=True, batch_draw=True, market_fallback=True,
                            opening_grace=True, order_mode="shuffle", quiet_premium=seed % 2)
                model.Game(seed, ["adaptive", "trend", "ward_keeper", "builder"][:n], r, check=True).run()
                model.Game(seed, ["skeptic", "trend", "ward_keeper", "adaptive"][:n], r, check=True).run()


if __name__ == "__main__":
    unittest.main()
