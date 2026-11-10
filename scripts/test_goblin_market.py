"""Independent small cases and invariants for the audit model."""
import itertools
import random
import unittest
from dataclasses import replace

from goblin_market import (CARDS, DICE, GROUPS, SHOPS, Game, Rules, choose_upgrade,
                          movement, owner_choice, resolve, should_buy, visitor_choice)


class MarketAuditTests(unittest.TestCase):
    def test_board_covers_every_tile_once(self):
        tiles = [s for group in GROUPS for s in group] + [0, 3, 5, 8, 10, 13, 15, 18]
        self.assertEqual(sorted(tiles), list(range(20)))

    def test_dice_distribution_independent_enumeration(self):
        outcomes = [a + b for a in range(1, 7) for b in range(1, 7)]
        self.assertEqual(dict(DICE), {s: outcomes.count(s) / 36 for s in range(2, 13)})
        counts = movement(1, 0, False)
        for s in range(20):
            self.assertAlmostEqual(counts[s], outcomes.count(s) / 36)
        self.assertAlmostEqual(sum(movement(8, 0, False)), 8)

    def test_two_moves_match_brute_force(self):
        counts = [0.0] * 20
        for a, b, c, d in itertools.product(range(1, 7), repeat=4):
            counts[(a + b) % 20] += 1 / 1296
            counts[(a + b + c + d) % 20] += 1 / 1296
        for actual, expected in zip(movement(2, 0, False), counts):
            self.assertAlmostEqual(actual, expected)

    def test_written_examples_and_order_of_cap(self):
        self.assertEqual(resolve(5, "contract", "markup"), (0, True))
        self.assertEqual(resolve(5, "contract", "ward"), (5, False))
        self.assertEqual(resolve(5, "haggle", "markup"), (5, False))
        self.assertEqual(resolve(6, "haggle", "markup"), (6, False))
        self.assertEqual(resolve(6, None, "markup"), (6, False))
        self.assertEqual(resolve(2, "haggle", "ward"), (0, False))
        self.assertEqual(resolve(4, "contract", None, False), (4, False))

    def test_card_matrix_all_edges(self):
        for b, v, o in itertools.product(range(2, 7), (None, "contract", "haggle"), (None, "ward", "markup")):
            fee, swap = resolve(b, v, o)
            self.assertTrue(0 <= fee <= 6)
            self.assertEqual(swap, v == "contract" and o != "ward")

    def test_liquidation_and_unpaid_do_not_mint_money(self):
        g = Game(40, ["balanced"] * 3)
        g.cash[0] = 0
        g.bank_net -= 16
        owned = g.starters[0]
        paid = g.pay(0, 1, 6)
        self.assertEqual(paid, 3)
        self.assertEqual(g.owners[owned], -1)
        self.assertEqual(g.metrics["unpaid"], 3)
        self.assertEqual(g.loss, 3)
        g.invariant()

    def test_full_sale_for_exact_fee_needs_no_extra_sale(self):
        g = Game(41, ["balanced"] * 3)
        g.cash[0] = 0
        g.bank_net -= 16
        self.assertEqual(g.pay(0, 1, 3), 3)
        self.assertEqual(g.sales[0], 1)
        self.assertEqual(g.metrics["unpaid"], 0)
        g.invariant()

    def test_setup_dice_trends_stay_paired_across_gate_candidate(self):
        a = Game(54, ["balanced"] * 4)
        b = Game(54, ["balanced"] * 4, replace(Rules(), start_mode="four_gates"))
        self.assertEqual(a.starters, b.starters)
        self.assertEqual(a.trends, b.trends)
        self.assertEqual(a.rolls, b.rolls)
        self.assertEqual(a.hands, b.hands)

    def test_view_cannot_observe_secret_hands_dice_or_late_trends(self):
        a = Game(70, ["balanced"] * 4)
        a.played = {0}
        slot = a.starters[1]
        before = a.view(0)
        decision = visitor_choice("balanced", before, slot, random.Random(2))
        # Permute secret hand contents without changing public hand counts.
        a.hands[1], a.hands[2] = a.hands[2], a.hands[1]
        a.rolls[-1][0] = 2
        a.trends[-1] = (a.trends[-1] + 1) % 4
        after = a.view(0)
        self.assertEqual(before, after)
        self.assertEqual(decision, visitor_choice("balanced", after, slot, random.Random(2)))
        self.assertFalse(hasattr(after, "deck"))
        self.assertFalse(hasattr(after, "policies"))

    def test_many_games_conserve_assets_and_cards_after_each_turn(self):
        for n in (3, 4):
            for seed in range(30):
                for r in (Rules(), replace(Rules(), hand_limit=3), replace(Rules(), ward_rebate=2)):
                    game = Game(seed, ["balanced", "builder", "random", "ward_keeper"][:n], r, check=True).run()
                    self.assertEqual(len(game.snapshots), r.rounds)
                    self.assertTrue(all(c >= 0 for c in game.cash))
                    self.assertTrue(all(c in CARDS for h in game.hands for c in h))


if __name__ == "__main__":
    unittest.main()
