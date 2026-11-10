"""Report fixed holdouts; never pick rows or lower thresholds after seeing data."""
import hashlib
import json
from dataclasses import asdict
from pathlib import Path

from goblin_market_tune import candidates


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/plans/assets"
NAMES = {"balanced": "상황 판단", "builder": "공격적 증축", "ward_keeper": "부적 우선",
         "adaptive": "공개 행동 학습", "trend": "다음 유행 활용", "skeptic": "부적 경계·흥정 우선"}
SELECTED = "shuffle-four-gates-grace1-flat"


def load(name, expected):
    obj = json.loads((ASSETS / name).read_text())
    assert len(obj["experiments"]) == expected, f"Incomplete experiment: {name}"
    assert all(r["candidateId"] == SELECTED for r in obj["experiments"])
    return obj


def main():
    primary = load("goblin-market-v2-holdout.json", 6)
    precision = load("goblin-market-v2-precision.json", 8)
    counter = load("goblin-market-v2-counterplay.json", 12)
    stress = json.loads((ASSETS / "goblin-market-v2-stress.json").read_text())
    old = json.loads((ASSETS / "goblin-market-confirm.json").read_text())
    sha = hashlib.sha256((ROOT / "scripts/goblin_market_v2.py").read_bytes()).hexdigest()
    assert all(x["engineSha256"] == sha for x in (primary, precision, counter, stress))
    assert old["engineSha256"] == hashlib.sha256((ROOT / "scripts/goblin_market.py").read_bytes()).hexdigest()
    rows = primary["experiments"] + precision["experiments"]
    assert all(r["runs"] == 50000 for r in rows)
    assert {(r["players"], r["label"].split("/")[1]) for r in primary["experiments"]} == {
        (n, p) for n in (3, 4) for p in ("balanced", "builder", "ward_keeper")}
    assert len({r["label"] for r in rows}) == 14
    for r in rows:
        expected = asdict(dict(candidates(r["players"]))[SELECTED])
        assert r["rules"] == json.loads(json.dumps(expected))
    base = {r["label"]: r for r in old["experiments"]}
    chosen = {r["players"]: r for r in primary["experiments"] if r["cohort"] == ["balanced"]}
    protected = [r for r in stress["rows"] if r["protection"]]
    retention = {n: chosen[n]["swaps"]["mean"] / base[f"homogeneous/balanced/{n}"]["swaps"]["mean"] for n in (3, 4)}
    all_pass = (all(r["seatGap"]["simultaneous95"][1] <= .05 and r["starterGap"]["simultaneous95"][1] <= .05 for r in rows)
                and all(x >= .7 for x in retention.values())
                and all(r["finishWithZeroShops"] == 0 for r in protected)
                and all(r["metrics"].get("zero_asset_episodes", 0) == 0 for r in rows))
    summary = {"date": "2026-10-27", "version": "playtest-2", "candidateId": SELECTED, "accepted": all_pass,
               "engineSha256": sha, "rules": primary["experiments"][0]["rules"],
               "holdoutGames": sum(r["runs"] for r in rows), "holdoutConditions": len(rows),
               "counterplayGames": sum(r["runs"] for r in counter["experiments"]),
               "worstSeatGap": max(r["seatGap"]["gap"] for r in rows),
               "worstSeatUpper": max(r["seatGap"]["simultaneous95"][1] for r in rows),
               "worstStarterGap": max(r["starterGap"]["gap"] for r in rows),
               "worstStarterUpper": max(r["starterGap"]["simultaneous95"][1] for r in rows),
               "retention": retention, "players": [], "stress": stress["rows"]}
    lines = ["<!-- RESULTS -->", "", "## 채택 결과", "",
             "채택 검토: 2026-10-27. 탐색과 원시 실험의 시작일은 각 파일의 메타데이터를 따른다.", "",
             "**playtest-2 채택 · 아래 수치 기준 통과 · 사람 플레이 검증 대기**" if all_pass else "**미통과 · 이 후보를 최종 규칙으로 채택하지 않는다.**", "",
             "최종 후보는 가게 가격·요금·시작금·장난 카드 수치 변경을 사용하지 않는다. 첫 밤 개업 유예, 네 모퉁이 공동 출발, 매 밤 순서 추첨, 마지막 가게 보호, 카드 배분/정리 순서와 완판 장터의 대체 효과를 함께 적용한다.", "",
             "[현재 규칙 전문](./goblin-night-market-v2.md) · [기본 전략 홀드아웃](./assets/goblin-market-v2-holdout.json) · [적응/혼합 전략 정밀 확인](./assets/goblin-market-v2-precision.json) · [공격·방어 대응 실험](./assets/goblin-market-v2-counterplay.json) · [보호 스트레스](./assets/goblin-market-v2-stress.json) · [요약](./assets/goblin-market-v2-summary.json)", "",
             "### 변경한 규칙", "",
             "1. 첫 밤은 개업 준비로 두고 상대 가게의 요금/장난 대결을 생략한다. 매입·증축·특수 칸·은행 보너스는 유지한다.",
             "2. 모두 0·5·10·15번 중 균등 추첨한 같은 칸에서 출발한다. 초기 배치 효과는 없고, 이후 0번 통과 보너스는 그대로다.",
             "3. 매 밤 장사 순서를 새로 균등 추첨한다. 그 밤만 공개하며 미래 순서는 비공개다.",
             "4. 부족한 요금을 내기 위해 다른 가게를 팔아도 마지막 한 채는 남긴다. 그때 현금까지만 지급하며 미지급액은 은행이 대신 주지 않는다.",
             "5. 둘째 밤부터 전원이 새 카드를 받은 후 그 밤 순서대로 초과 손패를 버린다. 새로 버린 카드가 같은 배분 중 다시 뽑히지 않는다.",
             "6. 만물장터가 완판이면 장난 한 장을 받는다. 빈 가게가 있는데 사지 않는 경우에는 받지 않는다.", "",
             "시작금 16, 밑천 3, 매입 6, 증축 4, 요금 2/4, 상한 6, 손패 2, 카드 네 종류 각 6장, 여덟 밤과 최종 자산 계산은 유지한다.", "",
             "### 원안 대비 변화: 같은 상황 판단 전략", "",
             "| 인원 | 항목 | v1 원안 | playtest-2 |", "|---|---|---:|---:|"]
    for n in (3, 4):
        before, after = base[f"homogeneous/balanced/{n}"], chosen[n]
        old_seats = [r["mean"] for r in before["seatWin"]]
        old_starters = [r["mean"] for r in before["starterWin"].values()]
        summary["players"].append({"count": n, "oldSeatGap": max(old_seats) - min(old_seats),
                                   "newSeatGap": after["seatGap"], "oldStarterGap": max(old_starters) - min(old_starters),
                                   "newStarterGap": after["starterGap"], "oldSeats": before["seatWin"], "newSeats": after["seatWin"],
                                   "oldSwaps": before["swaps"], "newSwaps": after["swaps"]})
        lines += [f"| {n}인 | 순서 승률 최대–최소 | {(max(old_seats)-min(old_seats))*100:.2f}%p | {after['seatGap']['gap']*100:.2f}%p |",
                  f"| {n}인 | 시작 가게 승률 최대–최소 | {(max(old_starters)-min(old_starters))*100:.2f}%p | {after['starterGap']['gap']*100:.2f}%p |",
                  f"| {n}인 | 성공 교환/판 | {before['swaps']['mean']:.3f} | {after['swaps']['mean']:.3f} |"]
    lines += ["", "v1은 조건당 10,000판, v2는 50,000판이며 서로 다른 시드다. v2 모델의 기본 설정이 v1과 완전히 일치하는 경기 회귀 검사도 유지했다. 이 표는 규칙 묶음 전후의 비교이며 개별 변경 하나의 순수 인과 기여도를 분리한 실험은 아니다.", "",
              "### 최종 독립 확인: 인원과 전략별 전 조건", "",
              f"**14조건 × 각 50,000판 = {summary['holdoutGames']:,}회**. 세 기본 전략을 먼저 확인한 뒤, 20,000판의 보조 실험에서 불확실성이 컸던 적응/혼합 전략은 새 독립 시드의 고정 50,000판으로 추가 확인했다. 앞의 20,000판을 합치거나 유리한 행만 고르지 않았다.", "",
              "| 인원 | 전략 | 순서 격차 | 순서 동시 95% 상한 | 시작 가게 격차 | 시작 가게 동시 95% 상한 |", "|---|---|---:|---:|---:|---:|"]
    for r in rows:
        policy = r["label"].split("/")[1]
        name = NAMES.get(policy, "6전략 혼합")
        lines.append(f"| {r['players']}인 | {name} | {r['seatGap']['gap']*100:.2f}%p | {r['seatGap']['simultaneous95'][1]*100:.2f}%p | {r['starterGap']['gap']*100:.2f}%p | {r['starterGap']['simultaneous95'][1]*100:.2f}%p |")
    lines += ["", "동시 구간은 각 인원×전략 조건 안의 좌석 또는 시작 가게 평균들을 Bonferroni 보정한 정규 근사다. 14조건 전체의 공동 95% 보장이나 모든 사람 전략의 균형 증명이 아니다. 기존의 회전 순서와 무작위 한 가게 배정에서 생기던 차이를 이 모델의 여러 전략에서 줄였다는 뜻이다.", "",
              "매 밤 순서 추첨은 개별 경기에서 모든 사람이 같은 횟수만큼 먼저 행동하도록 보장하지 않는다. 추첨과 주사위의 판내 운은 남아 있고, 여기서 확인한 것은 많은 경기에서의 순서·시작 가게 조건부 승률 편향이다.", "",
              "### 마지막 가게 보호", "",
              "가게 한 채로 시작하고, 매입은 가게 수를 늘리며, 동급 교환은 양쪽 가게 수를 유지하고, 강제 매각은 두 채 이상일 때만 진행한다. 따라서 이 규칙을 지키는 정상 시작 경기에서 가게 수가 0이 되는 전이는 없다. 초기 현금 0으로 가게가 전부 남의 소유인 기존 막힘 상태를 정상 경기의 도달 상태에서 제거한다.", "",
              "별도로 내 가게 한 채·현금 0·장터 완판·상대 현금 충분·네 밤 남음 상태를 만들었다. 시작 가게 12종, 기본/증축, 상대 가게의 단계 분포 두 가지, 공격적 증축/적응 전략을 섞어 보호 유무를 같은 난수로 비교했다. 아래 비율은 인위적 충격 조건의 결과이며 정상 경기의 발생률이 아니다.", "",
              "| 인원 | 보호 | 구성 상태 수 | 종료 시 가게 0채 | 보호가 실제 발동한 상태 |", "|---|---|---:|---:|---:|"]
    for r in stress["rows"]:
        lines.append(f"| {r['players']}인 | {'적용' if r['protection'] else '제거'} | {r['cases']:,} | {r['finishWithZeroShops']:,} | {r['protectionTriggeredCases']:,} |")
    lines += ["", "보호는 현금이나 추가 가게를 만들어 주지 않는다. 반복해서 낼 수 없는 요금을 청구해도 점주에게 미지급액이 생기지 않는 작은 사례와 다른 가게를 먼저 매각하는 사례를 검사했다. 보호가 고의 부도/담합의 모든 형태에 안전하다거나 반드시 두 턴 안에 선두를 따라잡게 한다는 증명은 아니다. 여유금 없이 투자하는 전략과 혼합 테이블을 별도로 확인하되 사람의 고의 행동은 추가 검증 대상으로 남긴다.", "",
              "### 카드와 전략 다양성의 해석", "",
              "부적을 우선 보유하는 봇은 이번에도 일부 혼합 경기에서 우세했다. 부적 경계·흥정 우선 봇을 넣는 것만으로 그 우위를 완전히 없애지는 못했다. 상대의 공개 행동을 학습하거나 다음 유행을 활용하는 봇도 추가했지만 이들은 최적 학습 에이전트가 아니다. 따라서 모든 장난/보유 전략의 균형이 완성됐다고 표현하지 않는다. 카드 효과는 그대로 두고, 실제 사람의 블러핑·카드 정리 판단을 다음 검증의 핵심으로 둔다.", "",
              "가격을 올리거나 시작금 보상을 추가한 후보는 시작 가게/순서 편향을 악화시키는 경우가 있어 채택하지 않았다. 준비 밤과 순서 추첨의 결합이 유망했고, 네 출발점까지 결합한 후보를 최종 확인했다. 위치별 방문 빈도 자체를 같게 만든 것은 아니며, 유리한 가게를 노리는 선택은 여전히 남는다.", "",
              "## 재현과 범위", "", "```bash",
              "PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_goblin_market*.py' -v",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_tune.py --stage holdout --runs 50000 --ids shuffle-four-gates-grace1-flat --policies balanced,builder,ward_keeper --output docs/plans/assets/goblin-market-v2-holdout.json",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_tune.py --stage holdout --runs 50000 --ids shuffle-four-gates-grace1-flat --policies adaptive,trend,skeptic,balanced+builder+ward_keeper+adaptive+trend+skeptic --seed 7600000 --output docs/plans/assets/goblin-market-v2-precision.json",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_tune.py --stage holdout --runs 20000 --ids shuffle-four-gates-grace1-flat --policies adaptive,trend,skeptic,balanced+builder+ward_keeper+adaptive+trend+skeptic,invade:skeptic:ward_keeper,invade:ward_keeper:skeptic --output docs/plans/assets/goblin-market-v2-counterplay.json",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_v2_stress.py",
              "PYTHONDONTWRITEBYTECODE=1 python3 scripts/goblin_market_v2_report.py", "```", "",
              "기본 홀드아웃 시드는 3인 6000000–6049999 / 4인 6100000–6149999, 추가 정밀 시드는 3인 7900000–7949999 / 4인 8000000–8049999다. 조건 간 공통 시드를 사용하므로 실행 횟수를 모두 독립 시나리오 수로 해석하지 않는다.", "",
              "20개 자동 검사 통과: v1 기본 설정 경기 재현, 카드·자산 보존, 보호/미지급/매각 순서, 시작금 보정 장부, 가게 요금 조합, 카드 배분, 각 밤의 모든 좌석 한 번씩 진행, 적응 전략의 비밀 비노출 등. 대량 실험은 경기 종료 시 장부·카드를 검사하고, 작은 회귀 경기와 보호 스트레스는 매 턴 검사한다.", "",
              "UI/서버/게임 카탈로그에는 구현하지 않았다. 5–6인, 실제 20–30분, 설명 5분, 재미·억울함·킹메이킹·담합·타임아웃/재접속은 이 자동 수치 검증으로 통과시키지 않는다.", "",
              f"v2 엔진 SHA-256: `{sha}`. v1 엔진과 원시 결과는 변경하지 않았다.", ""]
    report = ROOT / "docs/plans/goblin-night-market-balance-v2.md"
    before = report.read_text().split("<!-- RESULTS -->")[0].rstrip()
    status = "playtest-2 채택 · 사람 검증 대기" if all_pass else "미통과 · 추가 조정 필요"
    before = before.replace("상태: 후보 탐색 중", "상태: " + status)
    report.write_text(before + "\n\n" + "\n".join(lines))
    (ASSETS / "goblin-market-v2-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"accepted": all_pass, "holdoutGames": summary["holdoutGames"],
                      "worstSeatUpper": summary["worstSeatUpper"], "worstStarterUpper": summary["worstStarterUpper"]}))
    if not all_pass:
        raise SystemExit("Fixed criteria failed; do not adopt this rule set.")


if __name__ == "__main__":
    main()
