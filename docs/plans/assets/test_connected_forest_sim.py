"""Regression checks for the historical Python balance/golden generator."""
import importlib.util
import pathlib
import unittest
from collections import Counter

spec = importlib.util.spec_from_file_location(
    "forest_sim", pathlib.Path(__file__).with_name("connected-forest-sim.py")
)
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)


class SimulatorRegressionTests(unittest.TestCase):
    def test_balanced_policy_schedule(self):
        for n in (4, 5, 6):
            for runs in (30, 1000):
                schedule = sim.policy_schedule(n, runs)
                self.assertEqual(schedule, sim.policy_schedule(n, runs))
                self.assertEqual(len(schedule), runs)
                for row in schedule:
                    self.assertEqual(len(set(row)), 3)
                for seat in range(n):
                    counts = Counter(row[seat] for row in schedule)
                    self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)
        self.assertNotEqual(sim.policy_schedule(4, 30), sim.policy_schedule(4, 30, 80000))

    def test_tie_breakers_and_candidate_rewards(self):
        first, second = sim.P(0), sim.P(1)
        first.hosted = 2
        second.residents = [(sim.ANIMALS[0], (0, 0))]
        second.leaves = 1
        self.assertEqual(first.score(sim.PROVISIONAL), second.score(sim.PROVISIONAL))
        self.assertEqual(sim.winner_seats([first, second], sim.PROVISIONAL), [0])
        first.hosted = 0
        first.leaves = 4
        self.assertEqual(sim.winner_seats([first, second], sim.PROVISIONAL), [1])
        first.residents = list(second.residents)
        first.leaves = 1
        self.assertEqual(sim.winner_seats([first, second], sim.PROVISIONAL), [0, 1])
        first.hosted = 1
        first.residents = []
        first.leaves = 0
        self.assertEqual(sim.winner_seats([first, second], sim.Cfg(stay_self=5)), [0])


if __name__ == "__main__":
    unittest.main()
