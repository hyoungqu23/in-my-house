"""Probe all other retention policies against the strongest adaptive resident.

The 4-player exploratory winner gets a fixed independent 25k confirmation per
player count. Exploratory ranks themselves are never declared significant.
"""
import hashlib
import json
from pathlib import Path

import goblin_card_audit as audit
from goblin_card_tuning import active_profile
from goblin_market_expansion import VARIANTS, geometry, schema_hashes, simulate


def main():
    root = Path(__file__).resolve().parents[1]
    model_path = root / 'docs/plans/assets/goblin-expansion-training.json'
    trained = json.loads(model_path.read_text())
    assert trained['sources'] == schema_hashes()
    target = root / 'docs/plans/assets/goblin-expansion-probe.json'
    output = {'kind': 'finite-retention-response-probe', 'sources': schema_hashes(),
        'runnerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'trainingSha256': hashlib.sha256(model_path.read_bytes()).hexdigest(),
        'resident': 'S_roles', 'probeRunsPerPolicy': 1000, 'confirmRunsPerPlayerCount': 25000,
        'experiments': [], 'confirmations': []}
    def save(): target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    variant = VARIANTS['expanded28-12']
    with active_profile('half'), geometry(variant):
        for n in (3, 4):
            model = audit.Responses(trained['models'][variant.id][str(n)])
            for k, sid in enumerate(s for s in audit.SPECS if s != 'S_roles'):
                r = simulate(variant, n, 1000, 361000000 + n * 1000000 + k * 10000,
                    [sid], resident='S_roles', responses=model)
                output['experiments'].append(r); save()
            print(json.dumps({'probeComplete': n, 'conditions': len(output['experiments'])}), flush=True)
        rows = [r for r in output['experiments'] if r['players'] == 4]
        selected = max(rows, key=lambda r: r['wins'][r['roster'][0]]['mean'])['roster'][0]
        output['selected'] = selected; save()
        for n in (3, 4):
            r = simulate(variant, n, 25000, 371000000 + n * 1000000,
                [selected], resident='S_roles', responses=audit.Responses(trained['models'][variant.id][str(n)]))
            output['confirmations'].append(r); save()
            print(json.dumps({'confirmation': n, 'selected': selected, 'win': r['wins'][selected]}), flush=True)


if __name__ == '__main__': main()
