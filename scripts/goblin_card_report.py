"""Produce a bounded card-strategy conclusion, including failed counters."""
import hashlib
import json
from pathlib import Path
from statistics import NormalDist

from goblin_card_audit import SPECS, SHORT
from goblin_market_v2 import resolve

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'docs/plans/assets'
TAGS=('hw-vs-cw','hm-vs-hw','cm-vs-hm','cw-vs-cm','roles-vs-cw','hwm-vs-cw','cwm-vs-roles')
NAMES={'D_CWHM':'둔갑·부적 / 흥정 우선 후순위','D_CWMH':'둔갑·부적 / 바가지 우선 후순위',
       'D_HWCM':'흥정·부적 / 둔갑 우선 후순위','D_HWMC':'흥정·부적 / 바가지 우선 후순위',
       'D_HMCW':'흥정·바가지 / 둔갑 우선 후순위','D_CMHW':'둔갑·바가지 / 흥정 우선 후순위',
       'S_roles':'방문·점주 기회에 따른 보유'}
CARD_NAMES=dict(zip(('contract','haggle','markup','ward'),('둔갑 계약','흥정','바가지','부적')))


def read(name,count=None):
    x=json.loads((ASSETS/name).read_text())
    if count is not None: assert len(x['experiments'])==count, name
    return x


def label(sid):
    if sid in NAMES:return NAMES[sid]
    spec=SPECS[sid]
    if spec.priority:
        return ('고정 ' if spec.family=='priority' else '중복 회피 ')+'>'.join(SHORT[c] for c in spec.priority)
    return {'L_balanced':'기존 상황 판단 보유','L_ward_keeper':'기존 부적 우선 보유',
            'L_adaptive':'기존 공개행동 반응 보유','L_trend':'기존 유행 활용 보유','L_skeptic':'기존 부적 경계 보유',
            'S_counter':'상대 카드 빈도에 따른 보유','S_endgame':'남은 역할 기회에 따른 보유'}[sid]


def main():
    training=read('goblin-card-training.json',6)
    league=read('goblin-card-league.json',2)
    heuristic=read('goblin-card-heuristic.json',2)
    probes=[read('goblin-card-resident-cw.json',2),read('goblin-card-resident-roles.json',2)]
    confirmed=[read('goblin-card-confirm-'+tag+'.json',2) for tag in TAGS]
    sensitivity=read('goblin-card-sensitivity.json',16)
    prediction=read('goblin-card-prediction.json')
    bayes=read('goblin-card-bayes.json')
    source=hashlib.sha256((ROOT/'scripts/goblin_card_audit.py').read_bytes()).hexdigest()
    game=hashlib.sha256((ROOT/'scripts/goblin_market_v2.py').read_bytes()).hexdigest()
    for x in [training,league,heuristic,*probes,*confirmed]:
        assert x['sourceSha256']==source and x['gameSha256']==game
    for x in [league,*probes,*confirmed]:
        assert x['models']==training['models']
    assert len(bayes['cases'])==1890 and max(c['gap'] for c in bayes['cases'])<=.005
    assert bayes['sourceSha256']==hashlib.sha256((ROOT/'scripts/goblin_card_bayes.py').read_bytes()).hexdigest()
    prior_sha=hashlib.sha256((ASSETS/'goblin-card-training.json').read_bytes()).hexdigest()
    assert sensitivity['modelSha256']==prediction['modelSha256']==prior_sha
    assert len(SPECS)==44
    z=NormalDist().inv_cdf(1-.05/(2*14))
    matches=[]
    for tag,x in zip(TAGS,confirmed):
        for r in x['experiments']:
            assert r['runs']==50000 and len(r['roster'])==1
            challenger=r['roster'][0]; v=r['wins'][challenger]
            lo,hi=v['mean']-z*v['se'],v['mean']+z*v['se']
            benchmark=1/r['players']
            matches.append({'tag':tag,'players':r['players'],'challenger':challenger,'resident':r['resident'],
                            'win':v,'simultaneous95':[lo,hi],'benchmark':benchmark,
                            'status':'유리' if lo>benchmark else '불리' if hi<benchmark else '불확실'})
    summary={'date':'2026-10-27','verdict':'카드 전략 전체 통과 보류','strategyCount':44,
             'retentionSpace':{'strictOrders':24,'distinctDiverseOrders':12,'allStaticDiscardMaps':331776},
             'leagueGames':200000,'confirmGames':700000,'matches':matches,'sourceSha256':source,'gameSha256':game,
             'leaders':[],'prediction':prediction['rows'],'bayesMaxGap':max(c['gap'] for c in bayes['cases']),
             'payoffs':{str(f):[[{'paid':resolve(f,a,b)[0],'swap':resolve(f,a,b)[1]} for b in (None,'markup','ward')]
                              for a in (None,'contract','haggle')] for f in range(2,7)}}
    for r in league['experiments']:
        leaders=sorted(r['wins'].items(),key=lambda kv:kv[1]['mean'],reverse=True)
        summary['leaders'].append({'players':r['players'],'top':[{'id':sid,'name':label(sid),**v} for sid,v in leaders[:5]]})
    lines=['<!-- RESULTS -->','','## 결과: 카드 전략 전체 통과 보류','',
           '**한 번의 대결에서 네 카드의 상성은 작동한다. 전체 경기에서는 중복을 피하면서 둔갑 계약·부적을 우선 보유하는 조합이 강했고, 4인에서 이를 확실히 이기는 대응책을 이번 후보군에서 확인하지 못했다.** 3인에서 확인한 반격을 4인에도 그대로 적용하거나, 작은 대결표의 순환 상성만으로 전체 균형을 통과시키면 안 된다.','',
           '[44전략 혼합 리그](./assets/goblin-card-league.json) · [공통 사전확률 비교](./assets/goblin-card-heuristic.json) · [훈련](./assets/goblin-card-training.json) · [전체 요약](./assets/goblin-card-summary.json) · [한 대결의 베이지안 계산](./assets/goblin-card-bayes.json) · [예측 검증](./assets/goblin-card-prediction.json)','',
           '## 1. 무엇을 검증했는가','',
           '- 개별 카드의 즉시 효과와 교환 가능/불가, 손패 중복, 손패 0/1/2장을 점검했다.',
           '- 고정 우선순위 24개, 중복 회피 12개, 상황 반응 3개, 기존 보유 규칙 5개를 합친 44정책을 같은 투자 정책 아래 비교했다. 고정 우선순위의 24가지 순열은 전부 포함했다.',
           '- 각 전략이 10만 판씩 참여한 것은 아니다. 3인·4인 각각 100,000경기에서 매 경기 44정책 중 인원수만큼 중복 없이 추출했고, 표에 실제 전략별 노출 경기수를 적었다.',
           '- 혼합 리그에서 강했던 두 스타일을 상대로 다른 43개 스타일을 투입하는 탐색을 인원별/상대별 86,000판씩 했다. 탐색에서 고른 대응과 이론상 대응을 별도 시드의 조건당 50,000판으로 확인했다.',
           '- 전체 확인은 7대결 × 2인원 = 14조건, 총 700,000실행이다. 노출 경기 안의 공동우승 기여는 1/공동우승자 수로 나누었다.',
           '- 상대 행동 사전확률은 별도 3회 훈련(각 인원·회당 20,000판)에서 얻었다. 상대 스타일 표식에 과거의 공개 사용 빈도를 연결하므로, 반복 대전으로 스타일을 아는 상황에 가깝다. 현재 비밀 손패·교환 대상·미래 주사위를 읽지 않는다.',
           '- 카드 사용 판단은 공통 예상가치 휴리스틱이다. 교환 후 위치 가치를 근사하고 카드의 미래 기회비용을 둔다. 전체 게임을 푸는 최적 에이전트가 아니므로, 44정책 밖의 더 강한 대응이 없다는 증명은 아니다.',
           '- 331,776개의 모든 정적 버림 결정표, 모든 공개 상태에 반응하는 정책, 담합·킹메이킹까지 전수 검색한 것은 아니다. 이번 결과는 수치 검증 범위를 명시한 판정이다.','',
           '## 2. 혼합 리그의 상위 보유 방식','',
           '| 인원 | 방식 | 승률 기여 | 실제 노출 경기 |','|---|---|---:|---:|']
    for entry in summary['leaders']:
        for s in entry['top'][:3]:
            lines.append(f"| {entry['players']}인 | {s['name']} | {s['mean']*100:.2f}% | {s['n']:,} |")
    lines += ['','이 수치는 44정책이 균등 추출된 특정 혼합 환경의 결과다. 약한 정책을 포함한 평균에서 높게 나온 사실만으로 지배 전략이라고 결론 내리지 않았다. 또한 좋은 판단과 나쁜 판단의 승률을 억지로 같게 만드는 것을 균형의 목표로 삼지 않는다.','',
              '중복 회피형은 같은 카드를 두 장 들기보다 서로 다른 종류를 우선 남긴다. 둔갑·부적 조합은 방문객일 때 요금 회피/교환, 점주일 때 계약 방어를 함께 제공한다. 다만 중복 부적이 여러 방문을 막을 수 있는 상태도 있으므로 중복 회피가 모든 상태에서 우월하다는 뜻은 아니다.','',
              '## 3. 독립 시드에서 대응책을 확인한 결과','',
              '한 명만 도전 전략을 쓰고 나머지 N−1명은 상대 전략을 쓴다. 기준선은 도전자의 균등 승률 3인 33.33%, 4인 25%다. 상대 진영 전체의 합산 승률과 도전자 한 명을 비교하지 않았다. 아래 구간은 14조건의 평균에 Bonferroni 보정한 보수적 동시 구간(정규 근사)이며, 이 분석 전체 모든 수치의 공동 95% 보장을 뜻하지 않는다.','',
              '| 인원 | 도전 전략 → 나머지의 전략 | 도전자 승률 | 14조건 보정 95% 구간 | 기준 대비 |','|---|---|---:|---:|---|']
    for m in matches:
        lo,hi=m['simultaneous95']
        lines.append(f"| {m['players']}인 | {label(m['challenger'])} → {label(m['resident'])} | {m['win']['mean']*100:.3f}% | {lo*100:.3f}–{hi*100:.3f}% | {m['status']} |")
    lines += ['','### 해석','',
              '- 3인에서는 흥정·부적 보유로 둔갑·부적 중심 상대를 견제하는 반격이 확인됐다. 후순위 카드 순서를 바꾼 두 변형에서도 관찰했다.',
              '- 4인에서는 같은 반격이 기준 25%보다 낮았다. 역할에 반응하는 보유 방식도 같은 상대에게 확실한 우위를 만들지 못했다.',
              '- 작은 대결표에서 예상한 `둔갑·부적 → 흥정·부적 → 흥정·바가지 → 둔갑·바가지 → 둔갑·부적`의 완전한 순환이 실제 경기에서 그대로 확인된 것은 아니다. 특히 흥정·바가지로 흥정·부적을 견제한다는 가설은 확인 수준에 못 미쳤고 4인에서는 불리했다.',
              '- 따라서 “네 카드가 서로 한 번씩 이기니 전체 균형도 완성됐다”는 결론을 배제한다. 현재 증거는 4인 둔갑·부적 조합에 대한 추가 조정/더 강한 대응 탐색이 필요하다는 쪽이다.','',
              '## 4. 봇의 대응 부족만으로 설명되는가','',
              '같은 검증 경기의 공개된 선택을 대상으로 공통 보유확률 추정과 학습한 스타일별 추정의 Brier 오차를 비교했다. 게임마다 먼저 평균해 불확실성을 계산했다. 낮을수록 예측이 좋다. 스타일 정보를 사용하는 학습 모형에 더 많은 사전 정보가 있다는 점을 함께 해석해야 한다.','',
              '| 인원 | 공통 추정 오차 | 학습 추정 오차 | 실제 비교한 공개 선택 |','|---|---:|---:|---:|']
    for r in prediction['rows']:
        lines.append(f"| {r['players']}인 | {r['heuristic']['mean']:.3f} | {r['learned']['mean']:.3f} | {r['revealedActions']:,} |")
    lines += ['','예측 오차를 줄인 조건에서도 혼합 리그의 둔갑·부적 중심 강점은 남았다. 초기 강점의 일부에는 단순 보유확률 가정의 영향이 있지만, 그것만으로 설명하고 끝낼 근거는 부족하다. 이 비교가 봇이 최적 반격에 도달했다는 뜻은 아니다.','',
              '## 5. 한 대결의 계산과 실제 경기의 차이','',
              f"한 대결의 1,890조건에서 최선 대응 상·하한 차이의 최댓값은 {summary['bayesMaxGap']:.8f}였다. 이는 고정된 작은 게임의 예상효용 계산 오차이며 통계적 95% 구간이나 전체 경기 최적성 오차가 아니다.",'',
              '두 사람이 각각 계약·흥정 / 바가지·부적을 가지고, 이 사실을 서로 알고, 교환 위치의 추가 가치와 다음 기회비용이 0인 작은 게임의 혼합해는 다음과 같다.','',
              '| 요금 | 방문객 계약 비율 | 방문객 흥정 비율 | 점주 바가지 비율 | 점주 부적 비율 |','|---|---:|---:|---:|---:|']
    for c in bayes['knownHandsExamples']:
        lines.append(f"| {c['fee']} | {c['visitor'][1]*100:.2f}% | {c['visitor'][2]*100:.2f}% | {c['owner'][1]*100:.2f}% | {c['owner'][2]*100:.2f}% |")
    lines += ['','이것은 전체 게임의 권장 사용률이 아니다. 카드 네 장을 같은 빈도로 쓰는 것이 균형의 조건도 아니다. 실제 경기에는 카드가 소모되는 순서, 여러 점주/방문객, 보유 제한과 재순환, 교환 후 가게 수입이 함께 작동한다.','',
              '## 6. 카드별 실제 사용과 즉시 효과','',
              '| 카드 | 3인 사용/판 | 3인 판정 변화율 | 4인 사용/판 | 4인 판정 변화율 |','|---|---:|---:|---:|---:|']
    a,b=league['experiments']
    for card in CARD_NAMES:
        x,y=a['cards'][card],b['cards'][card]
        lines.append(f"| {CARD_NAMES[card]} | {x['used']/a['runs']:.3f} | {x['effective']/max(1,x['used'])*100:.2f}% | {y['used']/b['runs']:.3f} | {y['effective']/max(1,y['used'])*100:.2f}% |")
    lines += ['','판정 변화율은 상대가 이미 고른 행동을 그대로 두고 내 카드만 패스로 바꿀 때 요금 또는 교환 여부가 바뀌는 비율이다. 카드가 상대의 행동을 억제하는 효과와 교환의 미래 위치 가치는 이 수치에 들어 있지 않다. 따라서 바가지가 무효가 된 횟수만으로 카드가 쓸모없다고 단정하지 않는다. 요금 상한이 6이어도 흥정과 바가지를 함께 계산하면 할인 2가 상쇄되므로, 높은 요금에서 바가지가 항상 무효인 것도 아니다.','',
              '## 7. 투자/미래가치 가정을 바꾼 보조 실험','',
              '기존 학습 사전확률을 고정하고 여유금 없이 증축하는 경제 전략, 미래 교환 가치/카드 기회비용을 0으로 보는 조건을 각각 5,000판씩 비교했다. 이 조건에 맞춰 모델을 새로 학습한 실험은 아니며 아래 수치는 정밀 확인 판정과 합치지 않는다.','',
              '| 조건 | 인원 | 도전 → 상대 | 승률 |','|---|---|---|---:|']
    for r in sensitivity['experiments']:
        c=r['roster'][0]
        lines.append(f"| {r['context']} | {r['players']}인 | {label(c)} → {label(r['resident'])} | {r['wins'][c]['mean']*100:.2f}% |")
    lines += ['','3인 흥정·부적 반격도 공격적 증축 조건에서는 이점이 뚜렷하지 않았다. 카드 전략의 평가는 투자·요금·보유 제한과 분리해서 확정할 수 없다.','',
              '## 8. 다음 조정 대상으로 볼 부분','',
              '우선 **둔갑 계약의 “소유권 교환 + 이번 요금 전액 회피” 결합**을 검토할 필요가 있다. 부적은 그 결합을 막는 유일한 점주 카드이고, 흥정/바가지는 ±2의 고정 효과다. 부적만 약화하면 둔갑 계약을 더 강하게 만들 수 있으므로 두 효과의 연결을 함께 봐야 한다. 이 문단은 결과에서 도출한 설계 추론이며 원인을 완전히 분해한 인과 실험은 아니다.','',
              '다음 후보로는 계약 성공 시 기존 점주에게 방문 요금 일부를 정산하는 방식, 흥정/바가지의 상대 가치를 바꾸는 방식을 비교할 수 있다. 아직 검증하지 않았으므로 playtest-2 카드 효과는 이번 점검에서 변경하지 않았다. 변경한다면 카드 상성뿐 아니라 이미 통과한 순서·시작 가게·재기 기준도 다시 검사해야 한다.','',
              '## 전체 44정책 결과','',
              'C=둔갑 계약, H=흥정, M=바가지, W=부적. 고정형은 앞의 카드부터 남긴다. 중복 회피형은 가능한 경우 같은 카드 두 장보다 서로 다른 종류를 먼저 남긴 뒤 우선순위를 적용한다. 기존형은 해당 봇의 **보유/버림 규칙**을 재사용했고, 투자/사용 전술은 실험 안에서 공통으로 맞췄다.','',
              '| 정책 | 3인 승률 | 3인 노출 | 4인 승률 | 4인 노출 |','|---|---:|---:|---:|---:|']
    for sid in SPECS:
        x,y=a['wins'][sid],b['wins'][sid]
        lines.append(f"| {sid}: {label(sid)} | {x['mean']*100:.2f}% | {x['n']:,} | {y['mean']*100:.2f}% | {y['n']:,} |")
    lines += ['','## 재현과 무결성','',
              '원시 JSON에 인원·시드·전술·투자 정책·학습 모형·소스 지문을 기록했다. 훈련/리그/대응 탐색/확인은 서로 다른 시드 범위를 썼다. 여러 비교에서 같은 모형을 사용하는 것은 독립 학습 모형을 여러 개 만들었다는 뜻이 아니다.','',
              '```bash',
              "PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p test_goblin_card_audit.py -v",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_audit.py --stage train --runs 20000 --seed 10100000 --output docs/plans/assets/goblin-card-training.json",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_audit.py --stage league --runs 100000 --seed 15100000 --model docs/plans/assets/goblin-card-training.json --output docs/plans/assets/goblin-card-league.json",
              "# 나머지 확인 조건은 원시 파일의 roster/resident/seed/mode/economy 입력을 사용한다.",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_card_report.py",'```','',
              '전체 실행 명령은 [재현 목록](./assets/goblin-card-reproduction.json)에 순서대로 기록했다. 베이지안 계산과 그 검사는 NumPy가 있는 번들 Python에서 `scripts/goblin_card_bayes.py`, `test_goblin_card_bayes.py`로 재현한다. 알려진 2×2 혼합해, 비복원 추출 확률, 192개씩의 사적 손패별 순수 대응 열거와 계산 상·하한의 일치를 검사했다. 카드 전체 경기 어댑터는 기존 playtest-2 경기 재현, 44종 보유 방식의 카드/자산 보존, 비밀 손패·미래 정보 비노출을 검사했다. 기존 회귀를 포함한 자동 검사 31개가 통과했다.','',
              '게임 UI·서버·실제 사람의 블러핑/학습·담합/집중 견제는 이 자동 점검에 포함되지 않는다. 기존 순서·시작 가게 기준의 통과와 이번 카드 전략 전체 통과 보류는 서로 다른 판정이다.','',
              f'카드 감사 소스 SHA-256: `{source}`. playtest-2 엔진 SHA-256: `{game}`.','']
    path=ROOT/'docs/plans/goblin-night-market-card-balance.md'
    prefix=path.read_text().split('<!-- RESULTS -->')[0].rstrip()
    prefix=prefix.replace('상태: 분석 중','상태: 카드 전략 전체 통과 보류')
    prefix=prefix.replace('이전 봇의 전술과, 독립된 학습 경기에서 상대 스타일별 공개 사용 빈도를 배운 전술을 비교한다.',
                          '공통 전술에 기존식 보유확률 추정을 넣은 조건과, 독립된 학습 경기에서 상대 스타일별 공개 사용 빈도를 배운 조건을 비교한다.')
    path.write_text(prefix+'\n\n'+'\n'.join(lines))
    (ASSETS/'goblin-card-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    commands=[
        'python3 scripts/goblin_card_audit.py --stage train --runs 20000 --seed 10100000 --output docs/plans/assets/goblin-card-training.json',
        'python3 scripts/goblin_card_audit.py --stage league --runs 100000 --seed 15100000 --model docs/plans/assets/goblin-card-training.json --output docs/plans/assets/goblin-card-league.json',
        'python3 scripts/goblin_card_audit.py --stage league --runs 40000 --seed 17100000 --mode heuristic --output docs/plans/assets/goblin-card-heuristic.json']
    for resident,tag,seed in [('D_CWHM','cw',20100000),('S_roles','roles',22100000)]:
        commands.append(f'python3 scripts/goblin_card_audit.py --stage duel --runs 86000 --seed {seed} --resident {resident} --model docs/plans/assets/goblin-card-training.json --output docs/plans/assets/goblin-card-resident-{tag}.json')
    for tag,x in zip(TAGS,confirmed):
        r=x['experiments'][0]
        seed=r['seed']-r['players']*1000000
        commands.append(f"python3 scripts/goblin_card_audit.py --stage duel --runs 50000 --seed {seed} --resident {r['resident']} --roster {r['roster'][0]} --model docs/plans/assets/goblin-card-training.json --output docs/plans/assets/goblin-card-confirm-{tag}.json")
    commands += ['python3 scripts/goblin_card_sensitivity.py','python3 scripts/goblin_card_prediction.py',
                 '/Users/hyoungmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/goblin_card_bayes.py',
                 'python3 scripts/goblin_card_report.py']
    (ASSETS/'goblin-card-reproduction.json').write_text(json.dumps({'workingDirectory':str(ROOT),'commands':commands,
        'gameSha256':game,'sourceSha256':source,'note':'Run in order. Bayesian step needs NumPy; bundled Python is listed.'},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'strategies':44,'confirmedConditions':len(matches),'bayesConditions':1890,'verdict':summary['verdict']},ensure_ascii=False))


if __name__=='__main__':
    main()
