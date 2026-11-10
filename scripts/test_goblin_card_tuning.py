import itertools
import copy
import unittest

import goblin_market_v2 as base
import goblin_card_audit as audit
from goblin_card_tuning import PROFILES, ORIGINAL_RESOLVE, ORIGINAL_CLASS, resolve_profile, active_profile


class CardTuningTests(unittest.TestCase):
    def test_baseline_resolver_matches_frozen_rules(self):
        for fee,v,o,legal in itertools.product(range(2,7),(None,'contract','haggle'),(None,'markup','ward'),(False,True)):
            self.assertEqual(resolve_profile(PROFILES['baseline'],fee,v,o,legal),ORIGINAL_RESOLVE(fee,v,o,legal))

    def test_contract_settlement_cases(self):
        self.assertEqual(resolve_profile(PROFILES['settle1'],5,'contract','markup'),(1,True))
        self.assertEqual(resolve_profile(PROFILES['half'],5,'contract','markup'),(3,True))
        self.assertEqual(resolve_profile(PROFILES['half'],4,'contract','ward'),(4,False))
        self.assertEqual(resolve_profile(PROFILES['normal'],4,'contract','markup'),(6,True))
        self.assertEqual(resolve_profile(PROFILES['normal'],4,'contract','ward'),(4,False))

    def test_amount3_combines_before_the_cap(self):
        p=PROFILES['amount3']
        self.assertEqual(resolve_profile(p,4,'haggle','markup'),(4,False))
        self.assertEqual(resolve_profile(p,6,'haggle',None),(3,False))
        self.assertEqual(resolve_profile(p,2,None,'markup'),(5,False))

    def test_profile_is_process_local_and_restores_even_on_failure(self):
        resolver,cls=base.resolve,audit.CardGame
        with self.assertRaises(RuntimeError):
            with active_profile('half'):
                self.assertEqual(base.resolve(4,'contract',None),(2,True))
                raise RuntimeError('deliberate')
        self.assertIs(base.resolve,resolver)
        self.assertIs(audit.CardGame,cls)

    def test_all_profiles_preserve_assets_cards_and_last_shop(self):
        for name in PROFILES:
            with active_profile(name):
                for n in (3,4):
                    for seed in range(15):
                        g=audit.CardGame(seed,['D_CWHM','D_HWCM','S_roles','S_endgame'][:n],check=True).run()
                        self.assertTrue(all(any(g.owners[s]==p for s in base.SHOPS) for p in range(n)))

    def test_baseline_fixed_strategies_match_frozen_card_adapter(self):
        for n in (3,4):
            for seed in range(10):
                ids=['D_CWHM','D_HWCM','D_HMWC','P_WCHM'][:n]
                a=ORIGINAL_CLASS(seed,ids,check=True).run()
                with active_profile('baseline'):
                    b=audit.CardGame(seed,ids,check=True).run()
                self.assertEqual((a.cash,a.owners,a.levels,a.hands,a.metrics),(b.cash,b.owners,b.levels,b.hands,b.metrics))

    def test_new_inventory_evaluation_does_not_read_hidden_cards_or_future(self):
        for sid in ('S_roles','S_counter','S_endgame'):
            with active_profile('half'):
                a=audit.CardGame(40,[sid,'D_CWHM','D_HWCM'])
                a.hands[0].append(a.deck.pop())
                b=copy.deepcopy(a)
                b.hands[1],b.hands[2]=b.hands[2],b.hands[1]
                b.trends[-1]=(b.trends[-1]+1)%4
                b.rolls[-1][0]=2
                a.trim_hand(0);b.trim_hand(0)
                self.assertEqual(a.hands[0],b.hands[0])
                a.invariant();b.invariant()


if __name__=='__main__':unittest.main()
