"""One fixed, independent precision run for every unresolved regression condition.

Selection uses the initial regression only. These new samples are not pooled
with that selection data, and there is no repeat-until-pass loop.
"""
import hashlib
import json
from pathlib import Path

import goblin_card_audit as audit
from goblin_card_tuning import active_profile
from goblin_market_expansion import VARIANTS, geometry, schema_hashes, simulate


def main():
    root = Path(__file__).resolve().parents[1]
    source = root / 'docs/plans/assets/goblin-expansion-regression-trained.json'
    model = root / 'docs/plans/assets/goblin-expansion-training.json'
    regression, trained = json.loads(source.read_text()), json.loads(model.read_text())
    assert len(regression['experiments']) == 6, 'Wait for the complete initial regression'
    assert regression['sources'] == trained['sources'] == schema_hashes()
    selected = [(i, r) for i, r in enumerate(regression['experiments'])
                if max(r['seatGap']['simultaneous95'][1], r['starterGap']['simultaneous95'][1]) >= .05]
    output = {'kind': 'fixed-independent-precision-confirmation', 'sources': schema_hashes(),
        'runnerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'selectionFileSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'modelSha256': hashlib.sha256(model.read_bytes()).hexdigest(),
        'runsPerCondition': 100000, 'selectionRule': 'initial seat/starter upper >= .05',
        'selected': [{'players': r['players'], 'roster': r['roster']} for _, r in selected], 'experiments': []}
    target = root / 'docs/plans/assets/goblin-expansion-precision.json'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    with active_profile('half'):
        for i, old in selected:
            variant, n = VARIANTS[old['variant']], old['players']
            with geometry(variant):
                r = simulate(variant, n, 100000, 351000000 + n * 1000000 + i * 200000, old['roster'],
                    responses=audit.Responses(trained['models'][variant.id][str(n)]))
                output['experiments'].append(r)
                target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
                print(json.dumps({'n': n, 'roster': old['roster'], 'seatGap': r['seatGap'], 'starterGap': r['starterGap']}), flush=True)


if __name__ == '__main__': main()
