import copy
import itertools
import unittest

import goblin_market_v2 as base
import goblin_card_audit as audit
from goblin_card_tuning import active_profile
from goblin_market_expansion import BOARD20, BOARD28, VARIANTS, ExpansionGame, geometry, movement


class ExpansionTests(unittest.TestCase):
    def test_every_tile_has_one_effect_and_categories_are_equal(self):
        for board in (BOARD20, BOARD28):
            slots = [0, *board.shops, *board.rumors, *board.markets, *board.portals, *board.rests]
            self.assertEqual(sorted(slots), list(range(board.size)))
            self.assertEqual(len(set(slots)), board.size)
            self.assertEqual(len(set(map(len, board.groups))), 1)
            self.assertTrue(set(board.gates) <= set(slots))

    def test_movement_matches_explicit_two_roll_enumeration(self):
        for board in (BOARD20, BOARD28):
            for start in board.gates:
                visits = [0.] * board.size
                for a, b, c, d in itertools.product(range(1, 7), repeat=4):
                    first = (start + a + b) % board.size
                    second = (first + c + d) % board.size
                    visits[first] += 1 / 1296; visits[second] += 1 / 1296
                for actual, exact in zip(movement(board, 2, start, False), visits):
                    self.assertAlmostEqual(actual, exact, places=11)
                one = movement(board, 1, start)
                # Each portal adds one shop encounter and ends on a shop.
                self.assertAlmostEqual(sum(one), 1 + sum(movement(board, 1, start, False)[p] for p in board.portals))

    def test_board20_matches_frozen_movement(self):
        for turns in (0, 1, 2, 8):
            for start in range(20):
                for portal in (False, True):
                    self.assertEqual(movement(BOARD20, turns, start, portal), base.movement(turns, start, portal))

    def test_half_settlement_baseline_matches_frozen_model(self):
        with active_profile('half'):
            for n in (3, 4):
                for seed in range(12):
                    ids = ['D_CWHM', 'D_HMWC', 'S_roles', 'L_trend'][:n]
                    frozen = audit.CardGame(seed, ids, mode='heuristic', check=True).run()
                    with geometry(VARIANTS['mvp20-8']):
                        adapted = ExpansionGame(seed, ids, VARIANTS['mvp20-8'], mode='heuristic', check=True).run()
                    for name in ('cash', 'owners', 'levels', 'positions', 'hands', 'deck', 'discard', 'snapshots',
                                 'metrics', 'card_used', 'card_effective', 'tile_visits', 'paid', 'earned'):
                        self.assertEqual(getattr(adapted, name), getattr(frozen, name), (seed, n, name))

    def test_four_shop_monopoly_and_three_shop_candidate_differ_only_at_threshold(self):
        for key, required in (('expanded28-12', 4), ('expanded28-12-set3', 3)):
            variant = VARIANTS[key]
            with active_profile('half'), geometry(variant):
                g = ExpansionGame(10, ['S_roles'] * 3, variant)
                for s in BOARD28.shops: g.owners[s] = 1
                for s in BOARD28.groups[0][:3]: g.owners[s] = 0
                self.assertEqual(base.rent(g.owners, g.levels, 1, 1, g.rules), 2 + int(required == 3))
                g.owners[22] = 0
                self.assertEqual(base.rent(g.owners, g.levels, 1, 1, g.rules), 3)

    def test_global_geometry_restores_on_failure(self):
        before = (base.SHOPS, base.movement, base.shop_value, base.rent)
        with self.assertRaises(ValueError), geometry(VARIANTS['expanded28-12']):
            raise ValueError('deliberate')
        self.assertEqual((base.SHOPS, base.movement, base.shop_value, base.rent), before)

    def test_all_candidates_preserve_cards_assets_and_last_shop(self):
        with active_profile('half'):
            for variant in VARIANTS.values():
                with geometry(variant):
                    for n in (3, 4):
                        for seed in range(12):
                            g = ExpansionGame(seed, ['S_roles', 'D_CWHM', 'D_HMWC', 'L_trend'][:n], variant, check=True).run()
                            self.assertEqual(len(g.stock_snapshots), variant.nights)
                            self.assertTrue(all(any(g.owners[s] == p for s in variant.board.shops) for p in range(n)))
                            self.assertEqual(g.windows['roll'], variant.nights * n)
                            self.assertEqual(g.windows['duel'], g.metrics['duels'])

    def test_forecast_and_choices_do_not_read_hidden_cards_or_future(self):
        variant = VARIANTS['expanded28-12']
        with active_profile('half'), geometry(variant):
            a = ExpansionGame(50, ['S_roles', 'S_counter', 'S_endgame'], variant)
            a.hands[0].append(a.deck.pop())
            b = copy.deepcopy(a)
            b.hands[1], b.hands[2] = b.hands[2], b.hands[1]
            b.trends[-1] = (b.trends[-1] + 1) % 4; b.rolls[-1][0] = 2
            a.trim_hand(0); b.trim_hand(0)
            self.assertEqual(a.hands[0], b.hands[0])
            for slot in variant.board.shops:
                self.assertEqual(base.shop_value(a.view(0), slot), base.shop_value(b.view(0), slot))

    def test_full_market_cash_shock_never_eliminates_the_protected_merchant(self):
        variant = VARIANTS['expanded28-12']
        with active_profile('half'), geometry(variant):
            for slot in variant.board.shops:
                for n in (3, 4):
                    g = ExpansionGame(100 + slot, ['S_roles'] * n, variant, check=True)
                    for j, s in enumerate(variant.board.shops):
                        g.owners[s] = 0 if s == slot else 1 + j % (n - 1)
                        g.levels[s] = 1
                    g.cash = [0] + [40] * (n - 1); g.ledger_origin = sum(g.assets())
                    g.run()
                    self.assertTrue(any(g.owners[s] == 0 for s in variant.board.shops))


if __name__ == '__main__': unittest.main()
