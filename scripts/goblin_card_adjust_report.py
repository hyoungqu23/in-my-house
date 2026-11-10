"""Recommend a narrow card change; do not certify the full game as solved."""
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
from statistics import NormalDist

from goblin_card_tuning import PROFILES, resolve_profile

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'docs/plans/assets'
NAMES={'baseline':'기준 재계산','settle1':'성공 정산 1엽전','half':'성공 요금 절반 정산','normal':'정상 요금 정산','amount3':'흥정/바가지 ±3'}


def load(variant,suffix,count):
    x=json.loads((ASSETS/f'goblin-card-tune-{variant}-{suffix}.json').read_text())
    assert len(x['experiments'])==count
    assert x['variant']==asdict(PROFILES[variant])
    for name,sha in x['sources'].items():assert hashlib.sha256((ROOT/'scripts'/name).read_bytes()).hexdigest()==sha
    return x


def main():
    training={v:load(v,'train',6) for v in PROFILES}
    screens={v:load(v,'screen',2) for v in PROFILES}
    controls={v:load(v,'confirm',2) for v in ('baseline','half')}
    for v in screens:assert screens[v]['models']==training[v]['models']
    for v in controls:assert controls[v]['models']==training[v]['models']
    jobs=[('half','hw-cw'),('half','hm-hw'),('half','cm-hm'),('half','cw-cm'),('settle1','hw-cw'),('baseline','hw-cw')]
    confirms=[(v,tag,load(v,tag,2)) for v,tag in jobs]
    z=NormalDist().inv_cdf(1-.05/(2*12))
    rows=[]
    for v,tag,x in confirms:
        assert x['models']==training[v]['models']
        for r in x['experiments']:
            sid=r['roster'][0];w=r['wins'][sid]
            rows.append({'variant':v,'tag':tag,'players':r['players'],'challenger':sid,'resident':r['resident'],
                         'win':w,'interval':[w['mean']-z*w['se'],w['mean']+z*w['se']]})
    reg=json.loads((ASSETS/'goblin-card-adjust-regression.json').read_text())
    assert len(reg['experiments'])==6 and reg['variant']=='half'
    assert {(r['players'],r['policy']) for r in reg['experiments']}=={(n,s) for n in (3,4) for s in ('D_CWHM','D_HMWC','S_roles')}
    ratios={}
    for n in (3,4):
        a=next(r for r in controls['baseline']['experiments'] if r['players']==n)
        b=next(r for r in controls['half']['experiments'] if r['players']==n)
        ratios[n]=(b['metrics'].get('swaps',0)/b['runs'])/(a['metrics'].get('swaps',0)/a['runs'])
    key=next(r for r in rows if (r['variant'],r['tag'],r['players'])==('half','hw-cw',4))
    other=next(r for r in rows if (r['variant'],r['tag'],r['players'])==('half','cm-hm',4))
    recommend=(key['interval'][0]>.25 and other['interval'][0]>.25 and min(ratios.values())>=.7
               and all(r['seatGap']['simultaneous95'][1]<=.05 and r['starterGap']['simultaneous95'][1]<=.05 for r in reg['experiments']))
    summary={'date':'2026-10-27','recommendation':'half' if recommend else 'pending','fullyBalanced':False,
             'counterChecks':rows,'swapRetention':ratios,'regression':reg['experiments'],'leagues':{},
             'verdict':'절반 정산을 다음 사람 플레이테스트 후보로 권고' if recommend else '권고 보류'}
    lines=['<!-- RESULTS -->','','## 권고: 둔갑 성공 시 요금 절반 정산','',
           '**둔갑 계약 한 장의 성공 정산만 바꾸는 안을 권고한다. 흥정·바가지·부적의 수치와 덱 구성은 유지한다.** 이것은 다음 플레이테스트 후보에 대한 권고이며 카드 전략 전체의 균형 완성 판정은 아니다.','',
           '> **둔갑 계약** — 방문한 가게와 같은 단계인 내 가게 한 채를 맞바꾼다. 성공하면 **교환 직전 점주에게 원래 방문 요금의 절반(올림)**을 정산한다. 부적에 막히면 교환하지 않고 원래 방문 요금을 낸다.','',
           '### 함께 명시할 규칙','',
           '- 정산 기준은 기본 요금 + 업종 독점 + 유행이다. 최대 6엽전으로 제한한다.',
           '- 둔갑이 성공하면 바가지의 추가 요금은 붙지 않으며, 점주가 낸 바가지도 소비된다.',
           '- 부적에 막힌 계약에 절반 정산을 추가로 내지 않는다. 기존의 정상 방문 요금만 한 번 낸다.',
           '- 정산금은 새 소유자가 아니라 교환 직전 점주에게 준다. 은행이 돈을 추가 지급하지 않는다.',
           '- 흥정 −2, 바가지 +2, 부적의 계약 방어, 손패 두 장과 네 종류 각 여섯 장은 유지한다.',
           '- 매 밤 밑천 3에 대해 성공 정산은 최대 3이므로 정상 턴의 성공 정산을 위해 새로운 대출 절차를 만들 필요가 없다. 다른 요금과 마지막 가게 보호는 기존 규칙을 따른다.','',
           '### 요금 4인 가게에서 달라지는 선택','',
           '| 방문객 / 점주 | 바가지 | 부적 |','|---|---|---|',
           '| 둔갑 계약 | 교환 성공, 이전 점주에게 2 지급 | 교환 없음, 4 지급 |',
           '| 흥정 | 교환 없음, 4 지급 | 교환 없음, 2 지급 |','',
           '둔갑은 좋은 가게를 가져오는 선택, 흥정은 내 가게를 유지하면서 현금을 아끼는 선택이 된다. 점주도 요금을 올릴지 소유권을 지킬지 고를 이유가 남는다. 다른 요금·손패·미래 가치에서는 유불리가 달라지므로 이 표만으로 전체 균형을 증명하지 않는다.','',
           '## 후보 비교 결과','',
           '각 후보마다 공개 사용 빈도를 새로 훈련했다. 기준 규칙에도 같은 상황 반응 모형 개선을 적용해 다시 계산했다. 따라서 이전 보고서의 숫자를 그대로 대조군으로 가져오지 않았다. 아래 표는 후보별 3·4인 각 20,000판의 탐색 결과다.','',
           '| 후보 | 3인 성공 교환/판 | 4인 성공 교환/판 | 4인 최고 혼합 리그 승률 |','|---|---:|---:|---:|']
    for v,x in screens.items():
        a,b=x['experiments']
        best=max(y['mean'] for y in b['wins'].values())
        lines.append(f"| {NAMES[v]} | {a['metrics'].get('swaps',0)/a['runs']:.3f} | {b['metrics'].get('swaps',0)/b['runs']:.3f} | {best*100:.2f}% |")
    lines += ['','- 정상 요금을 모두 받는 안은 성공 교환이 기준의 약 3분의 1로 줄어 가게 쟁탈 경험을 약화시켰다.',
              '- ±3은 카드 두 장을 동시에 바꾸고 요금 상한 때문에 바가지의 실효 증가가 흥정과 같지 않다. 한 카드의 정산만 바꾸는 안보다 먼저 선택할 이유가 뚜렷하지 않았다.',
              '- 1엽전 정산은 가장 간단하지만 주요 4인 반격을 확정할 증거가 부족했다. 효과가 없다고 증명한 것은 아니다.',
              '- 절반 정산은 교환 빈도를 유지하면서 기존 둔갑·부적 조합의 강점을 줄였고, 그 대응도 독립 시드에서 확인됐다.','',
              '## 독립 확인: 기준과 절반 정산의 혼합 리그','',
              '각 규칙·인원 조건당 100,000경기, 총 400,000실행이다. 같은 투자 정책에서 44개의 보유 방식을 섞었다. 전략별 노출은 그중 일부이며 전략 하나당 10만 판이 아니다.','',
              '| 인원 | 규칙 | 둔갑·부적 우선 승률 | 성공 교환/판 |','|---|---|---:|---:|']
    for n in (3,4):
        summary['leagues'][n]={}
        for v in ('baseline','half'):
            r=next(y for y in controls[v]['experiments'] if y['players']==n)
            w=r['wins']['D_CWHM'];freq=r['metrics']['swaps']/r['runs']
            leaders=sorted(r['wins'].items(),key=lambda kv:kv[1]['mean'],reverse=True)[:5]
            summary['leagues'][n][v]={'cw':w,'swapsPerGame':freq,'leaders':[{'id':k,**val} for k,val in leaders]}
            lines.append(f"| {n}인 | {NAMES[v]} | {w['mean']*100:.2f}% | {freq:.3f} |")
    lines += ['',f"절반 정산의 성공 교환 빈도는 기준 대비 3인 {ratios[3]*100:.2f}%, 4인 {ratios[4]*100:.2f}%였다. 카드 조합을 다르게 고를 이유를 늘리면서 교환 자체는 유지하는 쪽이다.",'',
              '## 독립 확인: 주요 반격','',
              '한 명이 도전 전략을 쓰고 나머지는 상대 전략을 쓴다. 아래 12조건은 각각 50,000판이며, 구간은 12조건을 Bonferroni 보정한 정규 근사다. 균등 기준은 도전자 한 명의 3인 33.33%, 4인 25%다. 조건 간 공통 시드를 쓰는 비교도 있으므로 실행 합계를 모두 독립 외생 시나리오 수로 해석하지 않는다.','',
              '| 규칙 | 인원 | 도전 → 나머지 | 도전자 승률 | 보정 95% 구간 |','|---|---|---|---:|---:|']
    labels={'hw-cw':'흥정·부적 → 둔갑·부적','hm-hw':'흥정·바가지 → 흥정·부적',
            'cm-hm':'둔갑·바가지 → 흥정·바가지','cw-cm':'둔갑·부적 → 둔갑·바가지'}
    for r in rows:
        lo,hi=r['interval']
        lines.append(f"| {NAMES[r['variant']]} | {r['players']}인 | {labels[r['tag']]} | {r['win']['mean']*100:.3f}% | {lo*100:.3f}–{hi*100:.3f}% |")
    lines += ['','절반 정산에서 4인 흥정·부적의 기존 조합 반격과, 둔갑·바가지의 흥정·바가지 반격은 기준선을 넘었다. 기존 조합과 새 상위 조합 각각에 대응을 선택할 이유가 확인됐다. 다만 마지막 순환인 둔갑·부적 → 둔갑·바가지는 4인에서 확실한 우위를 확인하지 못했다. **모든 순환 상성이나 모든 최적 반응을 증명한 것은 아니다.**','',
              '## 순서·시작 가게와 재기 규칙 재검사','',
              '둔갑·부적, 흥정·바가지, 상황 반응 보유 방식 각각을 같은 방식끼리 3·4인 조건당 50,000판 비교했다. 아래는 각 조건 안의 동시 95% 격차 상한이다. 모든 실험 조건 전체의 공동 95% 보장으로 표현하지 않는다.','',
              '| 인원 | 방식 | 순서 격차 상한 | 시작 가게 격차 상한 |','|---|---|---:|---:|']
    for r in reg['experiments']:
        lines.append(f"| {r['players']}인 | {r['policy']} | {r['seatGap']['simultaneous95'][1]*100:.2f}%p | {r['starterGap']['simultaneous95'][1]*100:.2f}%p |")
    lines += ['','이 여섯 조건은 기존 진단선 5%p 아래였다. 가게 수를 늘리는 매입, 양쪽 가게 수를 유지하는 교환, 마지막 한 채를 남기는 매각 규칙은 유지되므로 정상 경기에서 가게 0채가 되는 전이는 추가되지 않는다. 자산/카드 보존도 후보별로 검사했다. 새 정산은 은행 유입이 아니라 플레이어 간 이전이다.','',
              '## 권고 범위와 다음 확인','',
              '**다음 사람 플레이테스트에는 절반 정산안을 우선 권고한다.** playtest-2의 카드 효과를 이번 분석에서 자동으로 확정 변경한 것은 아니다. 설명·실제 시간·억울함·협상·집중 견제·담합과 모든 사람 전략까지 통과한 최종 룰이라는 뜻도 아니다.','',
              '다음 사람 검증에서는 가게를 바꿀 가치가 있었는지, 원래 점주에게 반액을 내는 규칙이 자연스러운지, 흥정/바가지/부적을 보유하는 판단이 실제로 다양해지는지를 확인한다. 자동 혼합 리그에도 상위 전략 차이는 남아 있으며, 약한 판단까지 같은 승률로 만드는 것을 목표로 삼지 않는다.','',
              '## 원시 자료와 재현','',
              '- `assets/goblin-card-tune-*-train.json`: 후보별 재학습. 인원별 3회, 회당 10,000판.',
              '- `assets/goblin-card-tune-*-screen.json`: 다섯 후보의 탐색.',
              '- `assets/goblin-card-tune-baseline-confirm.json`, `goblin-card-tune-half-confirm.json`: 독립 혼합 리그.',
              '- `assets/goblin-card-tune-{half,settle1,baseline}-*.json`: 독립 반격 확인.',
              '- [회귀 결과](./assets/goblin-card-adjust-regression.json), [요약](./assets/goblin-card-adjust-summary.json).','',
              '```bash',
              "PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p test_goblin_card_tuning.py -v",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_tuning.py --variant half --stage train --runs 10000 --seed 70100000 --output docs/plans/assets/goblin-card-tune-half-train.json",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_tuning.py --variant half --stage league --runs 100000 --seed 85100000 --model docs/plans/assets/goblin-card-tune-half-train.json --output docs/plans/assets/goblin-card-tune-half-confirm.json",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_adjust_regression.py",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_adjust_report.py",'```','',
              '카드 판정은 후보 프로세스 안에서만 교체했고 기존 엔진/원시 자료 파일은 보존했다. 후보마다 판정 함수와 상태 반응 보유 평가를 함께 적용했으며 기준에도 같은 평가법을 사용했다. 비밀 손패·미공개 선택을 읽지 않는 기존 관측 경계를 유지한다.','']
    path=ROOT/'docs/plans/goblin-night-market-card-adjustment.md'
    prefix=path.read_text().split('<!-- RESULTS -->')[0].rstrip().replace('상태: 후보 비교 중','상태: 절반 정산을 다음 플레이테스트 후보로 권고')
    path.write_text(prefix+'\n\n'+'\n'.join(lines))
    (ASSETS/'goblin-card-adjust-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'recommend':recommend,'swapRetention':ratios,
                      'counter4':key['win']['mean'],'regressionConditions':len(reg['experiments'])},ensure_ascii=False))
    if not recommend:raise SystemExit('The declared recommendation checks failed.')


if __name__=='__main__':main()
