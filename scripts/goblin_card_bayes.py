"""Finite, one-encounter Bayesian zero-sum game with certified response gaps.

Uses bundled NumPy only. It is not a solution of the full multiplayer game.
"""
import itertools
import hashlib
import json
import math
from pathlib import Path
import time

import numpy as np
from goblin_market_v2 import CARDS, resolve

VISITOR = (None, "contract", "haggle")
OWNER = (None, "markup", "ward")


def hands(size):
    return list(itertools.combinations_with_replacement(CARDS, size))


def joint_prior(visitor, owner):
    vsize, osize = len(visitor[0]), len(owner[0])
    p = np.zeros((len(visitor), len(owner)))
    for i, v in enumerate(visitor):
        vc = [v.count(c) for c in CARDS]
        pv = math.prod(math.comb(6, x) for x in vc) / math.comb(24, vsize)
        for j, o in enumerate(owner):
            oc = [o.count(c) for c in CARDS]
            p[i,j] = pv * math.prod(math.comb(6-vc[k], oc[k]) for k in range(4)) / math.comb(24-vsize, osize)
    return p


def payoff(fee, gain=0, cost=0):
    m = np.zeros((3,3))
    for a, card in enumerate(VISITOR):
        for b, response in enumerate(OWNER):
            paid, swap = resolve(fee, card, response)
            m[a,b] = -paid + gain * swap - cost * (card is not None) + cost * (response is not None)
    return m


def solve_batch(visitor, owner, prior, cases, *, tolerance=.005, maximum=30000):
    """CFR+ behavioral averages; report explicit best-response upper/lower.

    Constant chance reach makes per-type behavioral averaging valid here.
    Regret iterations stop only when the computed response gap meets tolerance.
    """
    batch = len(cases)
    matrices = np.array([payoff(c["fee"],c["gain"],c["cost"]) for c in cases])
    vm = np.array([[[True, "contract" in h and c["legal"], "haggle" in h] for h in visitor] for c in cases])
    om = np.array([[[True, "markup" in h, "ward" in h] for h in owner] for c in cases])
    vp, op = prior.sum(axis=1), prior.sum(axis=0)
    pv = prior / vp[:,None]
    po = prior.T / op[:,None]
    vx = vm.astype(float) / vm.sum(axis=2,keepdims=True)
    oy = om.astype(float) / om.sum(axis=2,keepdims=True)
    vr, oreg = np.zeros_like(vx), np.zeros_like(oy)
    avgx, avgy = np.zeros_like(vx), np.zeros_like(oy)
    weight_sum = 0.0
    def responses(x, y):
        av = np.matmul(np.matmul(pv, y), matrices.transpose(0,2,1))
        ao = -np.matmul(np.matmul(po, x), matrices)
        upper = (np.where(vm, av, -np.inf).max(axis=2) * vp).sum(axis=1)
        lower = -(np.where(om, ao, -np.inf).max(axis=2) * op).sum(axis=1)
        value = ((x * av).sum(axis=2) * vp).sum(axis=1)
        return av, ao, upper, lower, value
    for iteration in range(1, maximum+1):
        av = np.matmul(np.matmul(pv, oy), matrices.transpose(0,2,1))
        vr = np.maximum(0, vr + av - (vx*av).sum(axis=2,keepdims=True)) * vm
        vx = np.divide(vr, vr.sum(axis=2,keepdims=True), out=vm.astype(float)/vm.sum(axis=2,keepdims=True), where=vr.sum(axis=2,keepdims=True)>0)
        ao = -np.matmul(np.matmul(po, vx), matrices)
        oreg = np.maximum(0, oreg + ao - (oy*ao).sum(axis=2,keepdims=True)) * om
        oy = np.divide(oreg, oreg.sum(axis=2,keepdims=True), out=om.astype(float)/om.sum(axis=2,keepdims=True), where=oreg.sum(axis=2,keepdims=True)>0)
        if iteration > 50:
            w = iteration-50
            avgx += w*vx
            avgy += w*oy
            weight_sum += w
        if iteration >= 256 and iteration % 256 == 0:
            _, _, upper, lower, value = responses(avgx/weight_sum, avgy/weight_sum)
            if (upper-lower).max() <= tolerance:
                break
    x,y = avgx/weight_sum, avgy/weight_sum
    _,_,upper,lower,value = responses(x,y)
    return {"visitor": x, "owner": y, "upper": upper, "lower": lower, "value": value,
            "gap": upper-lower, "iterations": iteration}


def main():
    started = time.monotonic()
    cases = [{"fee": fee, "gain": gain, "cost": cost, "legal": legal}
             for fee,gain,cost,legal in itertools.product(range(2,7),(-8,-4,-2,0,2,4,8),(0,.35,1),(False,True))]
    output = {"date": "2026-10-27", "method": "CFR+ with computed Bayesian best-response interval",
              "scope": "One encounter, random finite-deck private hands, fixed continuation transfer and symmetric card opportunity cost",
              "sourceSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "numpyVersion":np.__version__,
              "cases": []}
    for vs, os in itertools.product(range(3), repeat=2):
        v,o = hands(vs),hands(os)
        prior = joint_prior(v,o)
        assert abs(prior.sum()-1)<1e-12
        solved = solve_batch(v,o,prior,cases)
        for i,c in enumerate(cases):
            row = {**c, "visitorCards":vs, "ownerCards":os,
                   "value":float(solved['value'][i]), "gap":float(solved['gap'][i]),
                   "lower":float(solved['lower'][i]), "upper":float(solved['upper'][i]), "iterations":solved['iterations']}
            if vs==2 and os==2:
                row['CH_action'] = solved['visitor'][i,v.index(("contract","haggle"))].tolist()
                row['MW_action'] = solved['owner'][i,o.index(("markup","ward"))].tolist()
            output['cases'].append(row)
        output['elapsedSeconds']=time.monotonic()-started
        path=Path(__file__).resolve().parents[1]/'docs/plans/assets/goblin-card-bayes.json'
        path.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({"v":vs,"o":os,"maxGap":float(solved['gap'].max()),"iterations":solved['iterations']}),flush=True)
    assert len(output['cases'])==1890
    assert max(c['gap'] for c in output['cases']) <= .005
    examples=[{'fee':r,'gain':0,'cost':0,'legal':True} for r in (2,4,6)]
    solved=solve_batch([('contract','haggle')],[('markup','ward')],np.array([[1.]]),examples,tolerance=.001)
    output['knownHandsExamples']=[{**c,'visitor':solved['visitor'][i,0].tolist(),'owner':solved['owner'][i,0].tolist(),
                                  'value':float(solved['value'][i]),'gap':float(solved['gap'][i])} for i,c in enumerate(examples)]
    path.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
