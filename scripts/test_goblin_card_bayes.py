import unittest
import itertools
import numpy as np
from goblin_card_bayes import hands, joint_prior, payoff, solve_batch


class BayesianTests(unittest.TestCase):
    def test_finite_deck_prior_matches_ordered_deals(self):
        v,o=hands(2),hands(2)
        p=joint_prior(v,o)
        self.assertAlmostEqual(float(p.sum()),1)
        cc=v.index(('contract','contract'))
        # C,C then C,C: 6/24 * 5/23 * 4/22 * 3/21.
        self.assertAlmostEqual(p[cc,cc],6/24*5/23*4/22*3/21)
        self.assertTrue(np.all(p>0))

    def test_closed_form_two_by_two_mixed_equilibria(self):
        cases=[{'fee':r,'gain':0,'cost':0,'legal':True} for r in (2,4,6)]
        s=solve_batch([('contract','haggle')],[('markup','ward')],np.array([[1.]]),cases,tolerance=.001)
        for i,r in enumerate((2,4,6)):
            self.assertAlmostEqual(s['visitor'][i,0,1],2/(r+2),delta=.003)
            self.assertAlmostEqual(s['owner'][i,0,2],r/(r+2),delta=.003)
            self.assertAlmostEqual(s['value'][i],-r*r/(r+2),delta=.003)
            self.assertLessEqual(s['gap'][i],.001)

    def test_no_cards_has_exact_known_payment(self):
        c=[{'fee':4,'gain':0,'cost':0,'legal':True}]
        s=solve_batch([()],[()],np.array([[1.]]),c)
        self.assertAlmostEqual(s['value'][0],-4)
        self.assertAlmostEqual(s['gap'][0],0)

    def test_each_card_has_a_strict_best_response_witness(self):
        m=payoff(4)
        self.assertGreater(m[1,1],max(m[0,1],m[2,1])) # C beats markup
        self.assertGreater(m[2,2],max(m[0,2],m[1,2])) # H beats ward
        self.assertLess(m[2,1],min(m[2,0],m[2,2])) # M beats haggling
        self.assertLess(m[1,2],min(m[1,0],m[1,1])) # W beats contract

    def test_response_bounds_match_independent_pure_policy_enumeration(self):
        v,o=hands(2),hands(2)
        p=joint_prior(v,o)
        case={'fee':4,'gain':2,'cost':.35,'legal':True}
        s=solve_batch(v,o,p,[case])
        m=payoff(4,2,.35)
        va=[[0]+([1] if 'contract' in h else [])+([2] if 'haggle' in h else []) for h in v]
        oa=[[0]+([1] if 'markup' in h else [])+([2] if 'ward' in h else []) for h in o]
        def visitor_value(policy):
            return sum(p[t,u]*sum(s['owner'][0,u,b]*m[policy[t],b] for b in oa[u])
                       for t in range(10) for u in range(10))
        def owner_value(policy):
            return sum(p[t,u]*sum(s['visitor'][0,t,a]*m[a,policy[u]] for a in va[t])
                       for t in range(10) for u in range(10))
        upper=max(visitor_value(q) for q in itertools.product(*va))
        lower=min(owner_value(q) for q in itertools.product(*oa))
        self.assertAlmostEqual(upper,s['upper'][0])
        self.assertAlmostEqual(lower,s['lower'][0])


if __name__=='__main__':
    unittest.main()
