"""Render a bounded expansion recommendation from complete, fingerprinted runs."""
import hashlib
import json
import platform
from pathlib import Path
from statistics import NormalDist

from goblin_market_expansion import BOARD20, BOARD28, movement, schema_hashes
from goblin_card_tuning import PROFILES, resolve_profile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'docs/plans/assets'
NAMES = {'mvp20-8': '현재 20칸·8밤', 'long20-12': '20칸·12밤 연장',
    'expanded28-12': '28칸·16가게·12밤', 'expanded28-12-income2': '확장 + 밑천 2', 'expanded28-12-set3': '확장 + 세 채 업종 보너스'}
POLICIES = {'S_roles': '상황별 역할 판단', 'D_CWHM': '둔갑·부적 보유', 'D_HMWC': '흥정·바가지 보유'}
CARDS = {'contract': '둔갑 계약', 'haggle': '흥정', 'markup': '바가지', 'ward': '부적'}


def read(name, count=None, verify=True):
    obj = json.loads((ASSETS / name).read_text())
    if count is not None: assert len(obj['experiments']) == count, (name, 'Incomplete run')
    if verify: assert obj['sources'] == schema_hashes(), name
    return obj


def main():
    screen = read('goblin-expansion-screen.json', 30)
    training = read('goblin-expansion-training.json', 12)
    league = read('goblin-expansion-league.json', 4)
    regression = read('goblin-expansion-regression-trained.json', 6)
    uniform = read('goblin-expansion-regression.json', 6)
    economy = read('goblin-expansion-economy.json', 12)
    budget = read('goblin-expansion-time-budget.json', 2, False)
    precision = read('goblin-expansion-precision.json')
    probe = read('goblin-expansion-probe.json', 86)
    assert len(probe['confirmations']) == 2
    assert len(precision['experiments']) == len(precision['selected'])
    assert precision['selectionFileSha256'] == hashlib.sha256((ASSETS / 'goblin-expansion-regression-trained.json').read_bytes()).hexdigest()
    model_sha = hashlib.sha256((ASSETS / 'goblin-expansion-training.json').read_bytes()).hexdigest()
    assert precision['modelSha256'] == probe['trainingSha256'] == economy['trainingSha256'] == model_sha
    tags = ['hw-cw', 'hm-hw', 'cm-hm', 'cm-roles', 'hm-roles']
    counters = [read(f'goblin-expansion-counter-{tag}.json', 2) for tag in tags]
    counter_rows = [(tag, row) for tag, obj in zip(tags, counters) for row in obj['experiments']]
    counter_rows += [('probe-confirm', row) for row in probe['confirmations']]
    z = NormalDist().inv_cdf(1 - .05 / (2 * len(counter_rows)))
    matches = []
    for tag, row in counter_rows:
        sid = row['roster'][0]; win = row['wins'][sid]
        lo, hi = win['mean'] - z * win['se'], win['mean'] + z * win['se']
        matches.append({'tag': tag, 'players': row['players'], 'challenger': sid, 'resident': row['resident'],
            'runs': row['runs'], 'win': win, 'simultaneous95': [lo, hi],
            'status': '우위' if lo > 1 / row['players'] else '열위' if hi < 1 / row['players'] else '불확실'})
    replacements = {(r['players'], tuple(r['roster'])): r for r in precision['experiments']}
    fairness = []
    for original in regression['experiments']:
        key = (original['players'], tuple(original['roster']))
        row = replacements.get(key, original)
        fairness.append({'players': row['players'], 'policy': row['roster'][0], 'runs': row['runs'],
            'source': 'independent-precision' if key in replacements else 'initial-holdout',
            'seatGap': row['seatGap'], 'starterGap': row['starterGap'],
            'withinDiagnostic': max(row['seatGap']['simultaneous95'][1], row['starterGap']['simultaneous95'][1]) <= .05})
    fairness_ok = all(row['withinDiagnostic'] for row in fairness)
    role_ok = all(row['status'] == '우위' for row in matches if row['tag'] in tags[:3])
    exact = {'sources': schema_hashes(), 'kind': 'exact-neutral-portal-movement-and-local-fees', 'boards': [], 'fees': []}
    for board, turns in ((BOARD20, 8), (BOARD20, 12), (BOARD28, 12)):
        exact['boards'].append({'board': board.id, 'turns': turns,
            'arrivalsPerPlayer': [sum(movement(board, turns, start)[slot] for start in board.gates) / len(board.gates) for slot in range(board.size)]})
    for fee in range(2, 7):
        for visitor in (None, 'contract', 'haggle'):
            for owner in (None, 'markup', 'ward'):
                due, swapped = resolve_profile(PROFILES['half'], fee, visitor, owner)
                exact['fees'].append({'original': fee, 'visitor': visitor, 'owner': owner, 'due': due, 'swapped': swapped})
    (ASSETS / 'goblin-expansion-exact.json').write_text(json.dumps(exact, ensure_ascii=False, indent=2) + '\n')
    files = sorted(ASSETS.glob('goblin-expansion-*.json'))
    sources = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.name != 'goblin-expansion-summary.json'}
    executions = sum(r['runs'] for obj in (screen, training, league, regression, uniform, economy, budget, precision, probe, *counters)
                     for r in obj['experiments']) + sum(r['runs'] for r in probe['confirmations'])
    summary = {'date': '2026-10-30', 'fullyBalanced': False, 'applicationUpdated': False,
        'remainingFindings': ['사람의 실제 진행 시간과 재미 미측정',
            '공통 사전확률 민감도의 일부 시작 가게 상한은 진단선 경계',
            '상황판단형 S_roles에 대한 유한 보유 방식의 명확한 독립 반격 미확인'],
        'recommendation': '28칸·16가게·12밤을 다음 사람 플레이테스트에 권고' if fairness_ok and role_ok else '확장 방향은 유망하지만 조건별 보완 필요',
        'sameRuleFairnessDiagnosticPass': fairness_ok, 'testedCardRoleCountersPass': role_ok,
        'nominalTimersNeedReview': True, 'executions': executions, 'uniqueIndependentScenarios': None,
        'sources': schema_hashes(), 'rawFileSha256': sources,
        'fairness': fairness, 'matches': matches, 'leagues': league['experiments'],
        'screens': screen['experiments'], 'timeBudget': budget['experiments'],
        'uniformPriorSensitivity': uniform['experiments'], 'economy': economy['experiments'],
        'recommendedThinkingSeconds': budget['roomySeconds'], 'python': platform.python_version()}
    # Raw runs stay separate; this small summary omits response-training observations.
    for collection in ('leagues', 'screens', 'uniformPriorSensitivity'):
        for row in summary[collection]: row.pop('observations', None)
    (ASSETS / 'goblin-expansion-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')

    lines = ['## 점검 결론', '', f"**{summary['recommendation']}한다. 다만 현행 선택 시간을 그대로 두면 길이 문제를 충분히 해결한다고 말하기 어렵다.**", '',
        '확장안은 같은 턴당 대결 밀도를 대체로 유지하면서 전체 교환과 후반 투자 선택을 늘렸다. 밑천 3·기존 가격·카드 효과는 유지하는 쪽을 권고한다. 실제 사람 검증 전의 다음 후보이며 앱의 현재 규칙을 자동 변경하지 않았다.', '',
        '## 실행과 검증', '',
        f"- 총 {executions:,}회 경기 실행. 후보·정책·규칙 사이에 공통 시드를 쓰므로 서로 다른 독립 외생 상황 수라고 표현하지 않는다.",
        '- 탐색: 다섯 규칙 × 3·4인 × 세 보유 방식 × 1,000판 = 30,000회.',
        '- 공개 행동 빈도 재학습: 기준·확장 각각 3·4인, 세 차례 각 3,000판 = 36,000회. 두 규칙의 모델을 별도로 훈련했다.',
        '- 44개 보유 방식의 독립 혼합 리그: 두 규칙 × 3·4인 × 50,000판 = 200,000회. 각 보유 방식이 5만 판씩 출전했다는 뜻이 아니다.',
        '- 순서·시작 가게: 학습 모델 세 보유 방식 × 3·4인 × 50,000판. 별도 공통 사전확률 민감도도 같은 규모로 확인했다.',
        f"- 첫 진단선 상한이 5%p 이상인 {len(precision['selected'])}개 조건은 새 독립 시드에서 조건당 100,000판을 한 번 더 확인했다. 기존 표본과 합치지 않았으며 통과할 때까지 재시도하지 않았다.",
        '- 주요 반격 열 조건은 각각 25,000판. 상황형 상대에 대한 나머지 43개 보유 방식은 각 인원·방식당 1,000판 탐색한 뒤, 4인 탐색 최고 대응을 새 시드에서 3·4인 각 25,000판 확인했다.',
        '- 현금 보유·즉시 투자·현금 10 유지의 경제 성향을 같은 카드 판단 정책에서 비교했고, 시간 기한 합계는 별도 3·4인 각 1,000판으로 계산했다.',
        '- 자동 검사 47개 통과. 새 어댑터의 기존 판 결과 일치, 주사위 이동 전수 대조, 칸 완전성, 숨긴 정보 비노출, 자산/카드 보존과 마지막 가게 보호를 포함한다. 모든 실행에서 최종 보존을 확인하고 일부 검사 경기는 매 턴도 확인했다.', '',
        '## 독립 혼합 리그에서의 진행', '',
        '| 인원 | 규칙 | 대결/판 | 성공 교환/판 | 턴당 대결 | 마지막 구간 투자 선택 단계 | 현금/인 |',
        '|---|---|---:|---:|---:|---:|---:|']
    for row in league['experiments']:
        m = row['samples']; nights = 8 if row['variant'] == 'mvp20-8' else 12
        lines.append(f"| {row['players']}인 | {NAMES[row['variant']]} | {m['duels']['mean']:.2f} | {m['swaps']['mean']:.2f} | {m['duels']['mean'] / (row['players'] * nights) * 100:.1f}% | {m['lateInvestmentWindows']['mean']:.2f} | {m['cashPerPlayer']['mean']:.2f} |")
    lines += ['', '마지막 구간은 각 규칙의 마지막 3분의 1(8밤은 6–8밤, 12밤은 9–12밤)이다. 길이가 다르므로 선택 단계의 절대 횟수만으로 재미를 증명하지 않는다. 선택 단계는 합법적인 매입/증축 선택지가 있던 경우이며 모든 선택이 유리하거나 재미있다는 판정이 아니다.', '',
        '## 단순 연장과 확장을 같은 탐색 조건에서 비교', '',
        '| 인원 | 규칙 | 최종 가게 점유 | 최종 증축 | 마지막 구간 투자 선택 없음 | 선택 기한 합계 |',
        '|---|---|---:|---:|---:|---:|']
    for row in screen['experiments']:
        if row['roster'] != ['S_roles']: continue
        m = row['samples']; stock = 12 if row['variant'] in ('mvp20-8', 'long20-12') else 16
        lines.append(f"| {row['players']}인 | {NAMES[row['variant']]} | {m['occupied']['mean']:.2f}/{stock} | {m['upgraded']['mean']:.2f}/{stock} | {m['lateNoInvestment']['mean']*100:.1f}% | {m['choiceBudgetMinutes']['mean']:.1f}분 |")
    lines += ['', '위 표는 방식당 1,000판의 공통 전술 탐색이다. 단순 연장은 후반 매입·증축이 끝나고 돈만 오가는 구간을 늘린다. 확장은 그 구간에도 가게 선택을 남긴다. 밑천 2는 특히 3인에서 가게 매입을 줄였고, 세 채 업종 보너스는 진행의 뚜렷한 개선을 보이지 않았다. 따라서 둘을 추가 변경할 근거가 약하다.', '',
        '## 순서·시작 가게', '', '| 인원 | 보유 방식 | 새 확인 판수 | 순서 격차 상한 | 시작 가게 격차 상한 | 진단 |', '|---|---|---:|---:|---:|---|']
    for row in fairness:
        lines.append(f"| {row['players']}인 | {POLICIES[row['policy']]} | {row['runs']:,} | {row['seatGap']['simultaneous95'][1]*100:.3f}%p | {row['starterGap']['simultaneous95'][1]*100:.3f}%p | {'기준 안' if row['withinDiagnostic'] else '보완 필요'} |")
    lines += ['', '표의 상한은 조건 안의 여러 좌석/시작 가게 평균을 보정한 진단이다. 모든 조건을 합친 공동 95% 보장이나 정확히 같은 승률의 증명은 아니다.', '',
        '공통 사전확률 민감도에서는 일부 시작 가게 상한이 5%p를 조금 넘었다. 이는 큰 편향이 확인됐다는 뜻도, 그 조건이 통과했다는 뜻도 아니다. 아래에 점 추정과 상한을 함께 남긴다. 이 불확실성 때문에 전체 균형 완성으로 판정하지 않는다.', '',
        '| 인원 | 방식 | 시작 가게 격차 추정 | 동시 상한 |', '|---|---|---:|---:|']
    for row in uniform['experiments']:
        lines.append(f"| {row['players']}인 | {POLICIES[row['roster'][0]]} | {row['starterGap']['gap']*100:.3f}%p | {row['starterGap']['simultaneous95'][1]*100:.3f}%p |")
    lines += ['', '## 카드 보유 방식과 반격', '',
        '24개 엄격 우선순위·12개 중복 회피·기존 습관 5개·상황 판단 3개를 비교했다. 331,776가지의 모든 정적 버리기 규칙이나 모든 전체 경기 전략을 전수 평가한 것은 아니다. 약한 판단까지 같은 승률로 만드는 것이 목표는 아니다.', '',
        '| 인원 | 도전 → 나머지 | 도전자 승률 | 12조건 보정 구간 | 판정 |', '|---|---|---:|---:|---|']
    for row in matches:
        lo, hi = row['simultaneous95']
        lines.append(f"| {row['players']}인 | {row['challenger']} → {row['resident']} | {row['win']['mean']*100:.3f}% | {lo*100:.3f}–{hi*100:.3f}% | {row['status']} |")
    lines += ['', '균등 기준은 3인 33.33%, 4인 25%다. 앞의 여섯 조건은 둔갑·부적 → 흥정·부적 → 흥정·바가지 → 둔갑·바가지 사이의 대응을 확인한다. 이후 조건은 상황형 상위 방식에 대한 실제 반격 여부를 확인한다. 마지막 두 행은 43개 대응의 탐색 최고 방식을 새 시드에서 확인한 별도 결과다.', '',
        '**상황판단형 S_roles에 대한 명확한 반격은 이번 유한 탐색에서 확인하지 못했다.** 고정 카드쌍의 상성은 살아 있지만 전체 전략 균형 완성은 보류한다. 상황을 읽는 판단이 고정 보유보다 강한 신호와, 특정 카드쌍 자체가 무조건 강한 문제를 구분해야 한다. 실패하거나 불확실한 반격도 그대로 기록했다. 반격을 못 찾았다고 최적 균형이나 무조건적 지배를 증명한 것은 아니다.', '',
        '## 생각할 시간과 실제 경기 시간', '', '| 인원 | 현행 선택 기한 합계 | 넉넉한 선택 기한 합계 |', '|---|---:|---:|']
    for row in budget['experiments']:
        lines.append(f"| {row['players']}인 | {row['defaultBudget']:.1f}분 | {row['roomyBudget']:.1f}분 |")
    lines += ['', '넉넉한 안은 주사위 5초 유지, 매입/지름길/대결/강제 매각 15초, 증축 10초, 손패 정리 8초다. 타이머는 생각할 수 있는 상한이며 강제로 기다리는 시간이 아니다. 합계는 실제 사람의 경기 시간 예측이 아니다. 새 시간으로 실제 타임아웃 빈도와 진행 시간을 측정해야 한다.', '',
        '## 현금과 투자 성향', '', '| 인원 | 규칙 | 현금만 보유 | 즉시 매입·증축 | 현금 10 유지 |', '|---|---|---:|---:|---:|']
    for n in (3, 4):
        for key in ('mvp20-8', 'expanded28-12'):
            rows = {r['challenger']: r for r in economy['experiments'] if r['players'] == n and r['variant'] == key}
            lines.append(f"| {n}인 | {NAMES[key]} | {rows['cash']['win']['mean']*100:.2f}% | {rows['builder']['win']['mean']*100:.2f}% | {rows['cautious']['win']['mean']*100:.2f}% |")
    lines += ['', '한 명만 경제 성향을 바꾸고 나머지는 현금 6을 유지하는 상황 판단 투자다. 모두 같은 카드 보유 방식을 사용한다. 현금만 쌓는 것이 정답이 되는 신호는 보이지 않았고, 공격적 투자에는 보상과 더 많은 강제 매각이 함께 있었다. 위 승률은 5,000판 민감도 점검이며 모든 투자 최적화나 고의 손해 전략의 검증은 아니다.', '',
        '## 다음 판의 권고 범위', '',
        '- 28칸·16가게·12밤을 사람 검증 후보로 삼는다. 밑천 3, 매입 6, 증축 4, 둔갑 절반 정산과 다른 카드 수치는 유지한다.',
        '- 네 채 업종 완성 조건은 희소성과 이해도를 사람에게 확인한다. 탐색만으로 업종 보너스를 추가로 바꿀 근거는 충분하지 않았다.',
        '- 생각할 시간은 위의 넉넉한 안으로 시험하되 실제 경기 시간·자동 패스·설명 이해·뒤처진 사람의 선택·집중 견제를 기록한다.',
        '- 이 검토는 앱의 20칸·8밤 규칙을 바꾼 것이 아니다. 새 보드의 구현과 실제 기기 검증은 별도 작업이다.', '',
        '## 원시 자료와 재현', '',
        f"- [요약 데이터](./assets/goblin-expansion-summary.json): 정확한 수치, 실행 수, 소스/원시 자료 SHA-256. 실행 Python {summary['python']}.",
        '- [탐색](./assets/goblin-expansion-screen.json) · [재학습](./assets/goblin-expansion-training.json) · [독립 혼합 리그](./assets/goblin-expansion-league.json).',
        '- [학습 모델 회귀](./assets/goblin-expansion-regression-trained.json) · [고정 추가 정밀 확인](./assets/goblin-expansion-precision.json) · [공통 사전확률 민감도](./assets/goblin-expansion-regression.json).',
        '- [43개 대응 탐색과 독립 확인](./assets/goblin-expansion-probe.json) · [경제 성향](./assets/goblin-expansion-economy.json) · [선택 기한 합계](./assets/goblin-expansion-time-budget.json).',
        '- [모든 칸의 중립 지름길 이동 확률과 대결 45가지](./assets/goblin-expansion-exact.json). 실제 지름길 목적지 선택은 전략에 따라 달라진다.', '', '```bash',
        "PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_goblin_market_expansion.py' -v",
        "# 전체 47개 검사는 NumPy가 있는 번들 Python에서 실행",
        "PYTHONDONTWRITEBYTECODE=1 /Users/hyoungmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s scripts -p 'test_goblin*.py' -v",
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_expansion.py --stage screen --variants mvp20-8,long20-12,expanded28-12,expanded28-12-income2,expanded28-12-set3 --runs 1000 --seed 231000000 --output docs/plans/assets/goblin-expansion-screen.json',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_expansion.py --stage train --variants mvp20-8,expanded28-12 --runs 3000 --seed 241000000 --output docs/plans/assets/goblin-expansion-training.json',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_expansion.py --stage league --variants mvp20-8,expanded28-12 --runs 50000 --seed 261000000 --model docs/plans/assets/goblin-expansion-training.json --output docs/plans/assets/goblin-expansion-league.json',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_expansion.py --stage regression --variants expanded28-12 --runs 50000 --seed 271000000 --model docs/plans/assets/goblin-expansion-training.json --output docs/plans/assets/goblin-expansion-regression-trained.json',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_expansion_precision.py',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_expansion_probe.py',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_expansion_economy.py 5000',
        'PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_expansion_report.py', '```', '',
        '주요 반격 파일은 `goblin_market_expansion.py --stage counter`로 만들었다. 각 파일에 인원·판수·시드·도전/상대 방식이 기록되어 있다. 공통 사전확률 회귀는 위 회귀 명령에서 `--model`을 빼고 시드 251000000을 쓴다. 선택 기한 합계는 결과의 `windowMeans`와 두 기한 사전으로 다시 계산할 수 있다.', '']
    path = ROOT / 'docs/plans/goblin-night-market-expansion-check.md'
    prefix = path.read_text().split('<!-- RESULTS -->')[0].replace('상태: 비교 실험 중', '상태: 비교 실험 완료')
    path.write_text(prefix.rstrip() + '\n\n<!-- RESULTS -->\n\n' + '\n'.join(lines))
    print(json.dumps({'recommendation': summary['recommendation'], 'executions': executions, 'fairness': fairness_ok,
        'roleCounters': role_ok, 'precisionConditions': len(precision['selected']), 'fullyBalanced': False}, ensure_ascii=False))


if __name__ == '__main__': main()
