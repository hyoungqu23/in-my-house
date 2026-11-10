"""Macro-policy sensitivity; independent of the card-retention league."""
import hashlib
import json
from pathlib import Path
import random
import sys

import goblin_card_audit as audit
from goblin_card_tuning import active_profile
from goblin_market_expansion import VARIANTS, ExpansionGame, geometry, schema_hashes


def main():
    root = Path(__file__).resolve().parents[1]
    model_path = root / 'docs/plans/assets/goblin-expansion-training.json'
    trained = json.loads(model_path.read_text())
    assert trained['sources'] == schema_hashes()
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    output = {'kind': 'one-macro-challenger-among-balanced-investors', 'sources': schema_hashes(),
        'runnerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'trainingSha256': hashlib.sha256(model_path.read_bytes()).hexdigest(), 'experiments': []}
    with active_profile('half'):
        for key in ('mvp20-8', 'expanded28-12'):
            variant = VARIANTS[key]
            with geometry(variant):
                for n in (3, 4):
                    responses = audit.Responses(trained['models'][key][str(n)])
                    for k, policy in enumerate(('cash', 'builder', 'cautious')):
                        shares, liquidations = [], 0
                        seed = 321000000 + n * 1000000 + k * 100000
                        for i in range(runs):
                            actor = random.Random((seed + i) * 7).randrange(n)
                            g = ExpansionGame(seed + i, ['S_roles'] * n, variant, responses=responses)
                            g.policies[actor] = policy
                            g.run()
                            scores = g.assets(); high = max(scores)
                            shares.append(1 / sum(v == high for v in scores) if scores[actor] == high else 0)
                            liquidations += g.metrics['forced_sales']
                        row = {'variant': key, 'players': n, 'runs': runs, 'seed': seed, 'challenger': policy,
                            'win': audit.moments(shares), 'forcedSalesPerGame': liquidations / runs}
                        output['experiments'].append(row)
                        (root / 'docs/plans/assets/goblin-expansion-economy.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
                        print(json.dumps(row), flush=True)


if __name__ == '__main__': main()
