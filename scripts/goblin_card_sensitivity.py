"""Fixed supplementary contexts, not a search for favorable samples."""
import hashlib
import json
from pathlib import Path
import time

from goblin_card_audit import Responses, run_games

PAIRS = (("D_HWCM", "D_CWHM"), ("D_HMCW", "D_HWCM"),
         ("D_CMHW", "D_HMCW"), ("D_CWHM", "D_CMHW"))


def main():
    root = Path(__file__).resolve().parents[1]
    model_path = root / 'docs/plans/assets/goblin-card-training.json'
    trained = json.loads(model_path.read_text())
    out = {'date':'2026-10-27','kind':'supplementary-contexts',
           'modelSha256':hashlib.sha256(model_path.read_bytes()).hexdigest(), 'experiments':[]}
    started=time.monotonic()
    for context, economy, weight, cost in (('builder','builder',.5,.35), ('immediate','balanced',0,0)):
        for k,(challenger,resident) in enumerate(PAIRS):
            for n in (3,4):
                seed=45100000+(k+(4 if context=='immediate' else 0))*2000000+n*1000000
                r=run_games(n,5000,seed,[challenger],resident=resident,
                            model=Responses(trained['models'][str(n)]),economy=economy,
                            future_weight=weight,card_cost=cost)
                r.pop('responses')
                r['context']=context
                out['experiments'].append(r)
                out['elapsedSeconds']=time.monotonic()-started
                (root/'docs/plans/assets/goblin-card-sensitivity.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
                print(json.dumps({'context':context,'challenger':challenger,'resident':resident,'n':n,
                                  'win':r['wins'][challenger]['mean'],'seconds':round(out['elapsedSeconds'],1)}),flush=True)


if __name__=='__main__':
    main()
