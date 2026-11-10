"""Isolated rule candidates; frozen playtest-2 and audit sources stay unchanged."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import hashlib
import json
import math
from pathlib import Path
import time

import goblin_market_v2 as game
import goblin_card_audit as audit

ORIGINAL_RESOLVE = game.resolve
ORIGINAL_CLASS = audit.CardGame


@dataclass(frozen=True)
class Profile:
    name: str
    contract: str = 'free'
    amount: int = 2


PROFILES = {
    'baseline': Profile('baseline'),
    'settle1': Profile('settle1', 'one'),
    'half': Profile('half', 'half'),
    'normal': Profile('normal', 'normal'),
    'amount3': Profile('amount3', 'free', 3),
}
ACTIVE = PROFILES['baseline']


def resolve_profile(profile, fee, visitor, owner, legal=True, cap=6):
    if visitor == 'contract' and legal and owner != 'ward':
        if profile.contract == 'one':
            return min(1,cap), True
        if profile.contract == 'half':
            return math.ceil(min(cap,fee)/2), True
        if profile.contract == 'normal':
            return max(0,min(cap,fee+profile.amount*(owner=='markup'))), True
        return 0,True
    return max(0,min(cap,fee+profile.amount*(owner=='markup')-profile.amount*(visitor=='haggle'))),False


class TuningGame(ORIGINAL_CLASS):
    """Use the same state-aware inventory valuation under every candidate."""
    def trim_hand(self,p):
        if self.specs[p].family != 'situational':
            return super().trim_hand(p)
        while len(self.hands[p]) > self.rules.hand_limit:
            hand,view=self.hands[p],self.view(p)
            own=[s for s in game.SHOPS if self.owners[s]==p]
            contacts=[]
            for q in range(self.n):
                if q!=p and view.remaining[q]>self.rules.rounds-self.night-1:
                    contacts.append(sum(game.movement(1,self.positions[q])[s] for s in own))
            p0=math.prod(1-v for v in contacts)
            p1=sum(v*math.prod(1-other for j,other in enumerate(contacts) if j!=i) for i,v in enumerate(contacts))
            owner_one,owner_two=1-p0,max(0,1-p0-p1)
            outgoing=sum(game.movement(1,self.positions[p],False)[s] for s in game.SHOPS if self.owners[s]>=0 and self.owners[s]!=p)
            if view.remaining[p] <= self.rules.rounds-self.night-1:
                outgoing *= .1 if view.remaining[p] else 0
            if self.specs[p].id=='S_roles':
                vp=(.3,.35,.35);op=(.3,.35,.35)
            else:
                vt=sum(row[0] for row in self.public_duels)
                ot=sum(row[3] for row in self.public_duels)
                pc=(sum(row[1] for row in self.public_duels)+1)/(vt+4)
                ph=(sum(row[2] for row in self.public_duels)+1)/(vt+4)
                pm=(sum(row[5] for row in self.public_duels)+1)/(ot+4)
                pw=(sum(row[4] for row in self.public_duels)+1)/(ot+4)
                vp=(1-pc-ph,pc,ph);op=(1-pm-pw,pm,pw)
            if self.specs[p].id=='S_endgame':
                owner_one*=min(1,sum(view.remaining)/self.n)
                owner_two*=min(1,sum(view.remaining)/self.n)
            def visit_value(card):
                return -sum(prob*game.resolve(4,card,other)[0] for prob,other in zip(op,(None,'markup','ward')))
            def own_value(card):
                return sum(prob*game.resolve(4,other,card)[0] for prob,other in zip(vp,(None,'contract','haggle')))
            values={'contract':visit_value('contract')-visit_value(None)+.75*(1-op[2]),
                    'haggle':visit_value('haggle')-visit_value(None),
                    'markup':own_value('markup')-own_value(None),
                    'ward':own_value('ward')-own_value(None)+.75*vp[1]}
            def score(drop):
                kept=list(hand);kept.remove(drop)
                attacks=sorted((values[c] for c in kept if c in ('contract','haggle')),reverse=True)
                defenses=sorted((values[c] for c in kept if c in ('markup','ward')),reverse=True)
                return (outgoing*(attacks[0] if attacks else 0)
                        +owner_one*(defenses[0] if defenses else 0)
                        +owner_two*(defenses[1] if len(defenses)>1 else 0)
                        +.05*(attacks[1] if len(attacks)>1 and view.remaining[p]>1 else 0))
            drop=max(dict.fromkeys(hand),key=score)
            self.discard_contexts[''.join(sorted(audit.SHORT[c] for c in hand))]+=1
            hand.remove(drop);self.discard.append(drop)
            self.metrics['discard_'+drop]+=1
            self.duplicate_keeps+=len(set(hand))==1


@contextmanager
def active_profile(name):
    global ACTIVE
    previous=ACTIVE
    old_resolve,old_class=game.resolve,audit.CardGame
    ACTIVE=PROFILES[name]
    game.resolve=lambda *a,**kw:resolve_profile(ACTIVE,*a,**kw)
    audit.CardGame=TuningGame
    try:
        yield ACTIVE
    finally:
        game.resolve,audit.CardGame=old_resolve,old_class
        ACTIVE=previous


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--variant',choices=PROFILES,required=True)
    p.add_argument('--stage',choices=('train','league','duel'),required=True)
    p.add_argument('--runs',type=int,default=10000)
    p.add_argument('--seed',type=int,default=70100000)
    p.add_argument('--model')
    p.add_argument('--resident')
    p.add_argument('--roster',default='all')
    p.add_argument('--output',required=True)
    args=p.parse_args()
    roster=list(audit.SPECS) if args.roster=='all' else args.roster.split(',')
    assert set(roster)<=set(audit.SPECS)
    trained=json.loads(Path(args.model).read_text()) if args.model else None
    if trained:assert trained['variant']['name']==args.variant
    root=Path(__file__).resolve().parents[1]
    hashes={name:hashlib.sha256((root/'scripts'/name).read_bytes()).hexdigest()
            for name in ('goblin_market_v2.py','goblin_card_audit.py','goblin_card_tuning.py')}
    out={'date':'2026-10-27','stage':args.stage,'variant':asdict(PROFILES[args.variant]),'sources':hashes,
         'experiments':[],'models':{}}
    started=time.monotonic()
    with active_profile(args.variant):
        for n in (3,4):
            model=audit.Responses(trained['models'][str(n)]) if trained else audit.Responses()
            counts=defaultdict(lambda:[0,0,0])
            epochs=3 if args.stage=='train' else 1
            for epoch in range(epochs):
                seed=args.seed+n*1000000+epoch*(args.runs+1000)
                r=audit.run_games(n,args.runs,seed,roster,model=model,resident=args.resident,
                                  explore=.03 if args.stage=='train' else 0)
                if args.stage=='train':
                    for key,value in r['responses'].items():counts[key]=[a+b for a,b in zip(counts[key],value)]
                    model=audit.Responses(dict(counts))
                r.pop('responses')
                out['experiments'].append(r);out['models'][str(n)]=model.counts
                out['elapsedSeconds']=time.monotonic()-started
                Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
                print(json.dumps({'variant':args.variant,'n':n,'epoch':epoch,'runs':args.runs,
                                  'seconds':round(out['elapsedSeconds'],1)}),flush=True)


if __name__=='__main__':
    main()
