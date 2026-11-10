"""Seat/starter regression for the half-settlement recommendation."""
import json
from pathlib import Path

import goblin_card_audit as audit
import goblin_market_v2 as game
from goblin_market_report import simultaneous_gap
from goblin_card_tuning import active_profile


def main():
    root=Path(__file__).resolve().parents[1]
    trained=json.loads((root/'docs/plans/assets/goblin-card-tune-half-train.json').read_text())
    out={'variant':'half','date':'2026-10-27','experiments':[]}
    with active_profile('half'):
        for n in (3,4):
            for k,sid in enumerate(('D_CWHM','D_HMWC','S_roles')):
                seats=[[] for _ in range(n)]
                starters={s:[] for s in game.SHOPS}
                metrics={}
                seed=111100000+n*1000000+k*100000
                for i in range(50000):
                    g=audit.CardGame(seed+i,[sid]*n,responses=audit.Responses(trained['models'][str(n)])).run()
                    scores=g.assets(); high=max(scores); tied=sum(v==high for v in scores)
                    for p,score in enumerate(scores):
                        win=1/tied if score==high else 0
                        seats[p].append(win);starters[g.starters[p]].append(win)
                    for name,value in g.metrics.items():metrics[name]=metrics.get(name,0)+value
                seat_rows=[audit.moments(v) for v in seats]
                starter_rows={s:audit.moments(v) for s,v in starters.items()}
                r={'players':n,'policy':sid,'runs':50000,'seed':seed,'seatWin':seat_rows,'starterWin':starter_rows,
                   'seatGap':simultaneous_gap(seat_rows),'starterGap':simultaneous_gap(list(starter_rows.values())),
                   'metrics':metrics}
                out['experiments'].append(r)
                (root/'docs/plans/assets/goblin-card-adjust-regression.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
                print(json.dumps({'n':n,'policy':sid,'seatUpper':r['seatGap']['simultaneous95'][1],
                                  'starterUpper':r['starterGap']['simultaneous95'][1]}),flush=True)


if __name__=='__main__':main()
