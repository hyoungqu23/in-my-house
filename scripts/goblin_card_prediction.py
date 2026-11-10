"""Compare two forecasts against the same held-out, publicly revealed actions."""
import hashlib
import json
from pathlib import Path
import random

import goblin_market_v2 as base
from goblin_card_audit import CardGame, Responses, SPECS, moments


class PredictionGame(CardGame):
    def __init__(self,*args,**kwargs):
        self.errors={'learned':[],'heuristic':[]}
        super().__init__(*args,**kwargs)

    def duel(self,p,slot):
        owner=self.owners[slot]
        v,o=self.view(p),self.view(owner)
        legal=any(self.owners[s]==p and self.levels[s]==self.levels[slot] for s in base.SHOPS)
        fee=base.rent(self.owners,self.levels,slot,self.trends[self.night],self.rules)
        forecasts={}
        original=self.mode
        for mode in ('learned','heuristic'):
            self.mode=mode
            forecasts[mode]=(self._probs(v,owner,'O',fee,legal),self._probs(o,p,'V',fee,legal))
        self.mode=original
        before=[row[:] for row in self.public_duels]
        super().duel(p,slot)
        visitor_action=1 if self.public_duels[p][1]>before[p][1] else 2 if self.public_duels[p][2]>before[p][2] else 0
        owner_action=2 if self.public_duels[owner][4]>before[owner][4] else 1 if self.public_duels[owner][5]>before[owner][5] else 0
        for mode in forecasts:
            for probs,actual in zip(forecasts[mode],(owner_action,visitor_action)):
                self.errors[mode].append(sum((prob-int(j==actual))**2 for j,prob in enumerate(probs)))


def main():
    root=Path(__file__).resolve().parents[1]
    path=root/'docs/plans/assets/goblin-card-training.json'
    trained=json.loads(path.read_text())
    out={'date':'2026-10-27','modelSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':[]}
    ids=list(SPECS)
    for n in (3,4):
        errors={'learned':[],'heuristic':[],'pairedImprovement':[]}
        events=0
        for i in range(5000):
            seed=61100000+n*1000000+i
            lineup=random.Random(seed*127+4).sample(ids,n)
            g=PredictionGame(seed,lineup,responses=Responses(trained['models'][str(n)])).run()
            if not g.errors['learned']:
                continue
            events+=len(g.errors['learned'])
            l=sum(g.errors['learned'])/len(g.errors['learned'])
            h=sum(g.errors['heuristic'])/len(g.errors['heuristic'])
            errors['learned'].append(l);errors['heuristic'].append(h);errors['pairedImprovement'].append(h-l)
        out['rows'].append({'players':n,'gamesAttempted':5000,'revealedActions':events,
                            **{k:moments(v) for k,v in errors.items()}})
        print(json.dumps(out['rows'][-1]),flush=True)
    (root/'docs/plans/assets/goblin-card-prediction.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
