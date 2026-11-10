"""Export independent Python audit games for production reducer replay.

Initial state and public actions are synthetic. Random tape reproduces the
same dice totals, orders and card-kind shuffle permutations across runtimes.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path

import goblin_market_v2 as base
import goblin_card_audit as audit
from goblin_card_tuning import active_profile
from goblin_market_expansion import VARIANTS, ExpansionGame, geometry, schema_hashes

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('food', 'goods', 'fortune', 'fun')


class RecordedGame(ExpansionGame):
    def __init__(self, *args, **kwargs):
        self.events, self.tape, self.recording, self.ordered = [], [], False, {0}
        super().__init__(*args, **kwargs)
        actual_shuffle = self.deck_rng.shuffle
        def shuffle(cards):
            before = list(cards)
            actual_shuffle(cards)
            # Python draws from the end; production draws from the front.
            self.permutation(before, list(reversed(cards)))
        self.deck_rng.shuffle = shuffle
        self.recording = True

    def permutation(self, before, target):
        values = list(before)
        for i in range(len(values) - 1, 0, -1):
            j = next(k for k in range(i + 1) if values[k] == target[i])
            self.tape.append({'max': i + 1, 'value': j})
            values[i], values[j] = values[j], values[i]
        assert values == target

    def draw(self, p, trim=True):
        if self.recording and self.night not in self.ordered:
            self.permutation(list(range(self.n)), self.orders[self.night])
            self.ordered.add(self.night)
        return super().draw(p, trim)

    def window(self, kind):
        super().window(kind)
        if self.recording and kind == 'roll':
            actor = self.orders[self.night][len(self.played) - 1]
            self.events.append({'seat': actor + 1, 'action': {'type': 'MARKET_ROLL'}})
            steps = self.rolls[self.night][actor]
            dice = (1, steps - 1) if steps <= 7 else (steps - 6, 6)
            self.tape.extend({'max': 6, 'value': die - 1} for die in dice)

    def trim_hand(self, p):
        before = list(self.hands[p])
        super().trim_hand(p)
        if self.recording:
            removed = list((Counter(before) - Counter(self.hands[p])).elements())
            assert len(removed) <= 1
            for kind in removed:
                self.events.append({'seat': p + 1, 'action': {'type': 'MARKET_DISCARD', 'cardKind': audit.SHORT[kind]}})

    def buy_at(self, p, s):
        eligible = self.cash[p] >= self.rules.buy
        before = self.metrics['buys']
        super().buy_at(p, s)
        if self.recording and eligible:
            self.events.append({'seat': p + 1, 'action': {'type': 'MARKET_BUY', 'tile': s if self.metrics['buys'] > before else None}})

    def best_shop(self, p, options, portal=False):
        target = super().best_shop(p, options, portal)
        if self.recording and portal:
            self.events.append({'seat': p + 1, 'action': {'type': 'MARKET_PORTAL', 'tile': target}})
        return target

    def _visitor(self, view, slot, rng):
        card, target = super()._visitor(view, slot, rng)
        action = {'type': 'MARKET_DUEL', 'cardKind': audit.SHORT[card] if card else None}
        if card == 'contract': action['targetTile'] = target
        self.events.append({'seat': view.actor + 1, 'action': action})
        return card, target

    def _owner(self, view, visitor, slot, rng):
        card = super()._owner(view, visitor, slot, rng)
        self.events.append({'seat': view.actor + 1, 'action': {'type': 'MARKET_DUEL', 'cardKind': audit.SHORT[card] if card else None}})
        return card


def snapshot(g, match_id):
    counts = Counter()
    def card(kind):
        label = audit.SHORT[kind]; index = counts[label]; counts[label] += 1
        return {'id': f'{match_id}:{label}-{index}', 'kind': label}
    players = [{'seat': p + 1, 'userId': f'u{p + 1}', 'nickname': f'상인{p + 1}',
        'cash': g.cash[p] + 3, 'position': g.positions[p], 'hand': [card(c) for c in g.hands[p]]} for p in range(g.n)]
    state = {'rulesVersion': 'mvp-2', 'matchId': match_id, 'step': 1, 'phaseKey': match_id + ':1',
        'phase': 'MARKET_ROLL', 'phaseEndsAt': 6000, 'night': 1, 'turnIndex': 0, 'order': [p + 1 for p in g.orders[0]],
        'trends': [CATEGORIES[c] for c in g.trends[:12]], 'players': players,
        'shops': [{'tile': s, 'category': CATEGORIES[g.board.category[s]], 'ownerSeat': g.owners[s] + 1 if g.owners[s] >= 0 else None, 'level': g.levels[s]} for s in g.board.shops],
        'deck': [card(c) for c in reversed(g.deck)], 'discard': [card(c) for c in g.discard],
        'discardQueue': [], 'discardThen': 'ROLL', 'buyTiles': [], 'log': []}
    assert counts == Counter({c: 6 for c in 'CHMW'})
    return state


def main():
    variant = VARIANTS['expanded28-12']
    output = {'kind': 'independent-python-reducer-replay', 'sources': schema_hashes(),
        'exporterSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'board': {'size': 28, 'nights': 12, 'groups': variant.board.groups, 'specials': {
            'gate': [0], 'rumor': variant.board.rumors, 'market': variant.board.markets, 'portal': variant.board.portals, 'rest': variant.board.rests}},
        'cases': []}
    with active_profile('half'), geometry(variant):
        for n in (3, 4):
            for seed in range(4):
                g = RecordedGame(seed, ['S_roles', 'D_CWHM', 'D_HMWC', 'S_endgame'][:n], variant, mode='heuristic', check=True)
                initial = snapshot(g, f'reference-{n}-{seed}')
                choose = base.choose_upgrade
                def upgrade(policy, view, rng):
                    result = choose(policy, view, rng)
                    eligible = view.cash[view.actor] >= view.rules.upgrade and any(view.owners[s] == view.actor and not view.levels[s] for s in base.SHOPS)
                    if eligible: g.events.append({'seat': view.actor + 1, 'action': {'type': 'MARKET_UPGRADE', 'tile': result}})
                    return result
                base.choose_upgrade = upgrade
                try: g.run()
                finally: base.choose_upgrade = choose
                assert g.metrics['forced_sales'] == 0, 'Replay recorder requires solvent examples; liquidation has dedicated tests'
                output['cases'].append({'players': n, 'seed': seed, 'initial': initial, 'randomTape': g.tape,
                    'actions': g.events, 'nightAssets': g.snapshots,
                    'expected': {'cash': g.cash, 'positions': g.positions,
                        'shops': [{'tile': s, 'ownerSeat': g.owners[s] + 1 if g.owners[s] >= 0 else None, 'level': g.levels[s]} for s in g.board.shops],
                        'hands': [[audit.SHORT[c] for c in hand] for hand in g.hands],
                        'deck': [audit.SHORT[c] for c in reversed(g.deck)], 'discard': [audit.SHORT[c] for c in g.discard], 'assets': g.assets()}})
    path = ROOT / 'src/modules/goblin-market/domain/fixtures/expanded-golden.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'cases': len(output['cases']), 'actions': sum(len(row['actions']) for row in output['cases']), 'path': str(path)}))


if __name__ == '__main__': main()
