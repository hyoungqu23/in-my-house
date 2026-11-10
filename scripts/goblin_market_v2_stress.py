"""Matched, adversarial midgame solvency cases; not normal-game frequencies."""
from dataclasses import replace, asdict
import hashlib
import json
from pathlib import Path

from goblin_market_v2 import Game, SHOPS
from goblin_market_tune import candidates


def main():
    rows = []
    for n in (3, 4):
        chosen = dict(candidates(n))["shuffle-four-gates-grace1-flat"]
        for protection in (False, True):
            rules = replace(chosen, rounds=4, opening_grace=False, protect_last=protection)
            total, zero, protected, upgraded, forced, unpaid = 0, 0, 0, 0, 0, 0
            for slot in SHOPS:
                for level in (0, 1):
                    for policy in ("builder", "adaptive"):
                        for pattern in ("mixed", "upgraded"):
                            for k in range(20):
                                seed = 8800000 + total
                                g = Game(seed, [policy] + ["balanced"] * (n - 1), rules, check=True)
                                for j, s in enumerate(SHOPS):
                                    g.owners[s] = 0 if s == slot else 1 + j % (n - 1)
                                    g.levels[s] = level if s == slot else (1 if pattern == "upgraded" else j % 2)
                                g.cash = [0] + [40] * (n - 1)
                                g.ledger_origin = sum(g.assets())
                                g.run()
                                mine = [s for s in SHOPS if g.owners[s] == 0]
                                total += 1
                                zero += not mine
                                upgraded += any(g.levels[s] for s in mine)
                                protected += g.metrics["last_shop_protected"] > 0
                                forced += g.metrics["forced_sales"]
                                unpaid += g.metrics["unpaid"]
            if protection:
                assert zero == 0, "Last-shop invariant failed under a solvency shock"
            rows.append({"players": n, "protection": protection, "cases": total,
                         "finishWithZeroShops": zero, "protectionTriggeredCases": protected,
                         "finishWithUpgradedShop": upgraded, "forcedSales": forced, "unpaidCoins": unpaid,
                         "rules": asdict(rules)})
    root = Path(__file__).resolve().parents[1]
    output = {"kind": "constructed-midgame-stress", "remainingNights": 4,
              "description": "One shop and no cash, full market, solvent opponents. Not a frequency estimate.",
              "engineSha256": hashlib.sha256((root / "scripts/goblin_market_v2.py").read_bytes()).hexdigest(),
              "rows": rows}
    path = root / "docs/plans/assets/goblin-market-v2-stress.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
