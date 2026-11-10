"""Render the completed balance audit into reproducible JSON and Korean notes."""
import hashlib
import json
from pathlib import Path
from statistics import NormalDist

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/plans/assets/goblin-market-confirm.json"
CARD_NAMES = {"contract": "둔갑 계약", "haggle": "흥정", "markup": "바가지", "ward": "부적"}
POLICY_NAMES = {"balanced": "현금 6 유지·상황 판단", "builder": "공격적 매입·증축", "collector": "매입 우선·증축 안 함",
                "cash": "현금 보유·신규 투자 안 함", "cautious": "현금 10 유지", "ward_keeper": "부적 우선 보유", "random": "무작위 합법 선택"}
TILE_NAMES = {0: "장터 입구", 1: "달토끼 떡집", 2: "구미호 주막", 3: "소문 골목", 4: "도깨비 대장간",
              5: "만물장터", 6: "둔갑 의상실", 7: "불도깨비 꼬치집", 8: "소문 골목", 9: "달그림자 점집",
              10: "도깨비 지름길", 11: "꿈 수선소", 12: "만물 보따리", 13: "소문 골목", 14: "귀신 사진관",
              15: "낮잠 정자", 16: "도깨비 씨름장", 17: "부적 공방", 18: "소문 골목", 19: "그림자 극장"}
SHOPS = (1, 2, 4, 6, 7, 9, 11, 12, 14, 16, 17, 19)


def pct(x):
    return f"{100 * x:.2f}%"


def simultaneous_gap(rows):
    # Bonferroni intervals jointly cover the finite seat/starter means of this
    # one experiment. No claim of joint coverage over the entire audit suite.
    z = NormalDist().inv_cdf(1 - .05 / (2 * len(rows)))
    intervals = [(v["mean"] - z * (v["ci95"][1] - v["mean"]) / 1.96,
                  v["mean"] + z * (v["ci95"][1] - v["mean"]) / 1.96) for v in rows]
    return {"gap": max(v["mean"] for v in rows) - min(v["mean"] for v in rows),
            "simultaneous95": [max(0, max(a for a, b in intervals) - min(b for a, b in intervals)),
                               max(b for a, b in intervals) - min(a for a, b in intervals)]}


def main():
    d = json.loads(SOURCE.read_text())
    assert len(d["experiments"]) == 48, "Refuse to report a partial run"
    assert d["engineSha256"] == hashlib.sha256((ROOT / "scripts/goblin_market.py").read_bytes()).hexdigest()
    by_label = {r["label"]: r for r in d["experiments"]}
    summary = {"date": d["date"], "games": sum(r["runs"] for r in d["experiments"]),
               "conditions": len(d["experiments"]), "engineSha256": d["engineSha256"], "players": [],
               "recoveryStress": d["recoveryStress"]}
    lines = ["# 도깨비 야시장 · 밸런스 점검", "", "작성: 2026-10-26 · 판정: **현재 초안 그대로의 밸런스 통과 보류**", "",
             "[원안](./goblin-night-market.md) · [확인 실험 원시 결과](./assets/goblin-market-confirm.json) · [요약 데이터](./assets/goblin-market-summary.json)", "",
             "## 결론", "",
             "현재 초안은 돈·카드 정산에서 명백한 무한 이득을 보이지 않았지만, 시작 순서에 따른 승률 차이와 가게를 모두 잃은 뒤의 재기 경로에 문제가 있다. 같은 가격의 가게들도 위치 가치가 같지 않다. 장난 카드들은 서로 대응하지만, 카드 보유 전략에 따라 유불리와 실제 가게 교환 빈도가 크게 달라진다. 전체 균형이 잡혔다고 판정하지 않는다.", "",
             "## 범위와 방법", "",
             f"- 3인·4인, 48조건 × 각 10,000판 = **{summary['games']:,}판**. 조정 후보와 카드 효과 제거 실험을 포함한 합계다. 원안 한 조건을 48만 판 실행했다는 뜻은 아니다.",
             "- 별도 인위적 중반 상태 스트레스 3인·4인 각 200판. 정상 경기에서 그 상태가 발생하는 빈도를 추정하는 표본은 아니다.",
             "- 20칸 전부, 12개 가게의 시작 배정, 네 업종, 3·4인 모든 상대적 좌석, 네 장난 카드, 현금·증축·환매·유행·종료를 모델링했다. 캐릭터는 원안에 능력 차이가 없으므로 외형 자체의 수치 차이는 없다.",
             "- 주사위 36개 결과와 이동 확률을 정확 계산하고, 요금 2–6 × 방문객 3선택 × 점주 3선택 = 45가지 대결 결과를 열거했다. 작은 이동 사례는 별도 주사위 전수 열거와 대조했다.",
             "- 같은 전략끼리의 좌석 비교, 서로 다른 전략의 혼합 경기, 한 전략을 다른 전략 테이블에 투입하는 실험을 분리했다. 약한 전략과 강한 전략의 승률을 억지로 같게 만드는 것을 목표로 삼지 않는다.",
             "- 봇은 자기 손패·공개 현금/소유권/말·공개 버림 더미·상대 손패 장수·공개된 유행만 받는다. 상대 손패·상대가 고른 교환 대상·미래 주사위·미공개 유행은 받지 않는다.",
             "- 투자와 교환의 미래 가치는 중립적인 지름길 이동 DP로 근사한다. 상대 카드 보유 확률도 공개 정보의 균등 풀로 근사한다. 학습된 최적 전략, 전체 게임의 내시 균형, 모든 인간 전략의 전수 검증이 아니다.",
             "- 미래 가치 평가는 유행 보너스를 평균 0.25로 근사한다. 다음 유행에 집중 투자하는 전략, 상대의 카드 보유 성향을 학습하는 전략, 담합·고의 패배 유도·모든 입력 타임아웃 전략은 별도 검증하지 않았다.",
             "- 독립 시드 구간으로 확인했다. 초기 탐색 파일은 별도 보관하며 엔진 해시가 다른 탐색·확인 표본을 합치지 않는다. 주사위·시작 가게·유행·입구·덱·정책 난수는 분리했다.",
             "- 3인은 시드 2220000–2229999, 4인은 2320000–2329999다. 조건 간에는 같은 시드를 재사용해 비교하므로, 48만 번의 실행이 48만 개의 독립 외생 시나리오를 뜻하지 않는다. 각 조건의 1만 경기는 서로 다른 시드다.",
             "- 공동우승은 1/공동우승자 수로 나눠 승률에 더한다. 전략별 불확실성은 한 경기 안의 같은 전략 선수들을 먼저 평균한 뒤 경기 단위로 계산한다.",
             "- 표의 개별 95% 구간은 정규 근사다. 아래 좌석/시작 가게 격차 구간은 각 조건 안의 유한 평균들을 Bonferroni 보정한 보수적 동시 구간이다. 48조건 전체의 공동 95% 보장을 주장하지 않는다.",
             "- 진단용으로 같은 전략의 좌석 격차 5%p를 점검선으로 사용한다. 이는 사용자와 합의한 제품 요구나 사전 등록된 연구 기준이 아니다.", "",
             "### 원안에서 정하지 않은 조건", "",
             "매 밤 카드를 뽑고 초과 손패를 버리는 순서가 원안에 없다. 기준 모델은 그 밤의 장사 순서대로 한 명씩 뽑고 정리한다. 고정 좌석 순서도 별도 비교했다. 이 가정과 봇의 판단 방식이 달라지면 수치는 달라질 수 있다. 실제 엔진은 아직 없으므로 production reducer와의 동등성 검증도 불가능하다.", "",
             "## 1. 모든 플레이어와 시작 순서", ""]
    for n in (3, 4):
        r = by_label[f"homogeneous/balanced/{n}"]
        tiles = [{"id": s, "name": TILE_NAMES[s], "shop": s in SHOPS,
                  "visitsPerPlayer": r["tileVisits"][s] / r["runs"] / n,
                  "paidPerGame": r["tilePaid"][s] / r["runs"],
                  "starterWin": r["starterWin"].get(str(s)),
                  "referenceVisits": d["exact"]["uniformPortalVisits"][s]} for s in range(20)]
        gap = simultaneous_gap(r["seatWin"])
        starter_gap = simultaneous_gap(list(r["starterWin"].values()))
        cards = [{"id": c, "name": CARD_NAMES[c], **v,
                  "usesPerGame": v["used"] / r["runs"],
                  "effectiveRate": v["effective"] / v["used"] if v["used"] else 0,
                  "meanRentDelta": v["rentDelta"] / v["used"] if v["used"] else 0}
                 for c, v in r["cards"].items()]
        summary["players"].append({"count": n, "tiles": tiles, "seats": r["seatWin"], "seatGap": gap,
                                   "starterGap": starter_gap, "cards": cards, "metrics": r["metrics"],
                                   "duels": r["duels"], "swaps": r["swaps"]})
        lines += [f"### {n}인 · 같은 상황 판단 전략 10,000판", "", "좌석은 첫 밤의 상대적 순서다. 실제 닉네임/캐릭터의 차이가 아니다.", "",
                  "| 첫 밤 순서 | 승률 기여 | 개별 95% 구간 |", "|---|---:|---:|"]
        for p, v in enumerate(r["seatWin"]):
            lines.append(f"| {p+1}번째 | {pct(v['mean'])} | {pct(v['ci95'][0])}–{pct(v['ci95'][1])} |")
        lines += ["", f"최대–최소 차이 **{gap['gap']*100:.2f}%p**, 이 조건 내 동시 95% 격차 구간 {gap['simultaneous95'][0]*100:.2f}–{gap['simultaneous95'][1]*100:.2f}%p. 세부 정책이 같은데도 첫 순서의 차이가 남는다.", ""]
    lines += ["매 밤 선두 회전이 첫 밤의 매입·증축과 이후 수입 차이를 모두 없애지는 않는다. 다만 이 분석은 그 원인의 각 기여도를 분해한 인과 실험은 아니다. 첫 밤 개업 단계 분리, 순서 방식 변경, 후순위 시작금 보정 등을 새 후보로 검증할 필요가 있다.", "",
              "## 2. 모든 칸과 업종", "",
              "아래 실제 방문은 지름길 입구와 이후 도착 가게를 각각 센다. 따라서 합은 1인 여덟 턴보다 크다. 요금은 가게 소유자에게 실제로 지급된 경기당 합계이며, 가게가 얼마나 오래 누구 소유였는지와 장난 전략의 영향도 포함한다. 요금만으로 칸의 고유 가치를 판정하지 않는다.", "",
              "| 칸 | 이름 | 3인: 1인당 방문 | 4인: 1인당 방문 | 3인: 지급 요금/판 | 4인: 지급 요금/판 |", "|---|---|---:|---:|---:|---:|"]
    for a, b in zip(summary["players"][0]["tiles"], summary["players"][1]["tiles"]):
        lines.append(f"| {a['id']:02} | {a['name']} | {a['visitsPerPlayer']:.3f} | {b['visitsPerPlayer']:.3f} | {a['paidPerGame']:.3f} | {b['paidPerGame']:.3f} |")
    ref = d["exact"]["noPortalVisits"]
    lo, hi = min(SHOPS, key=lambda s: ref[s]), max(SHOPS, key=lambda s: ref[s])
    lines += ["", f"지름길을 사용하지 않는 별도 정확 계산에서도 {hi}번 가게의 1인당 여덟 턴 누적 방문은 {ref[hi]:.6f}, {lo}번은 {ref[lo]:.6f}로 **{ref[hi]/ref[lo]:.3f}배**다. 첫 주사위 합 7은 6/36, 1은 0/36이므로 출발점 부근이 처음부터 대칭이 아니다. 실제 봇 경기의 이동은 지름길 목적지 선택도 반영하므로 이 참고값과 구분한다.", "",
              "| 업종 | 칸 | 지름길 없이 1인당 누적 방문 | 중립 지름길 포함 참고값 |", "|---|---|---:|---:|"]
    for name, g in zip(("먹거리", "잡화", "점술", "놀거리"), d["exact"]["groups"]):
        lines.append(f"| {name} | {g['slots']} | {g['noPortalVisits']:.3f} | {g['uniformPortalVisits']:.3f} |")
    lines += ["", "같은 업종이 정확히 두 번 유행하고 가격이 같다는 사실만으로 업종/가게의 가치는 같아지지 않는다. 위 표는 위치 차이를 보여주는 참고 모델이며, 유행 가치의 전수 인과 추정은 아니다.", "",
              "### 무작위 시작 가게의 조건부 승률", "", "| 시작 가게 | 3인 승률 기여 | 4인 승률 기여 |", "|---|---:|---:|"]
    for s in SHOPS:
        lines.append(f"| {s:02} {TILE_NAMES[s]} | {pct(by_label['homogeneous/balanced/3']['starterWin'][str(s)]['mean'])} | {pct(by_label['homogeneous/balanced/4']['starterWin'][str(s)]['mean'])} |")
    lines += ["", "시작 가게는 정책·주사위와 독립적으로 무작위 배정했다. 특정 가게 소유로 조건화하면 상대가 받을 수 있는 가게 풀도 바뀌므로, 이 값은 다른 모든 배정을 고정한 단일 가게의 순수 가치가 아니다. 그래도 무료 무작위 배정에서 생기는 유불리를 진단하는 데 유용하다.", "",
              "### 특수 칸별 점검", "",
              "- 입구 0: 실제 주사위 이동으로 통과/도착 시 보너스 한 번. 지름길 이동은 보너스 제외. 계산상 중복 지급 없음.",
              "- 소문 3/8/13/18: 효과는 같지만 위치별 노출이 다름. 손패 두 장과 강제 정리 때문에 카드 공급이 선택 피로로 이어지는지는 사람 검증 필요.",
              "- 만물장터 5: 빈 가게가 없으면 선택 자체가 사라짐. 전체 매입이 끝난 뒤의 대체 효과가 원안에 없음.",
              "- 지름길 10: 원하는 가게에 도착하므로 매입 선택과 통행료 회피 모두 제공. 다른 특수 칸과 같은 현금 가치라고 볼 수 없음. 타임아웃 목적지 1번은 문서에만 있고 능동 봇은 목적지를 직접 고른다.",
              "- 정자 15: 2엽전을 확정 지급. 방문 횟수 차이 외 무작위 효과 없음.", "",
              "## 3. 장난 네 종류와 모든 대결 조합", "",
              "| 카드 | 3인 사용/판 | 3인 판정 변동률 | 4인 사용/판 | 4인 판정 변동률 |", "|---|---:|---:|---:|---:|"]
    for a, b in zip(summary["players"][0]["cards"], summary["players"][1]["cards"]):
        lines.append(f"| {a['name']} | {a['usesPerGame']:.3f} | {pct(a['effectiveRate'])} | {b['usesPerGame']:.3f} | {pct(b['effectiveRate'])} |")
    lines += ["", "판정 변동률은 같은 공개 상대 행동에 대해 내 카드만 패스로 바꾸었을 때 즉시 요금 또는 교환 여부가 달라지는 비율이다. 미래 위치 가치·블러핑의 억제 효과·사람 만족도는 측정하지 않는다. 실패한 바가지나 부적이 곧 나쁜 설계라는 뜻은 아니다.", "",
              "### 대표 요금의 정확한 대결표", "", "각 셀은 요금 2 / 4 / 6일 때 방문객이 내는 금액이다. 교환 성공은 `교환·0`으로 표시한다. 교환 가능한 자기 가게가 있는 상태를 전제한다.", "",
              "| 방문객 | 점주 패스 | 점주 바가지 | 점주 부적 |", "|---|---|---|---|"]
    from goblin_market import resolve
    for card in (None, "haggle", "contract"):
        cells = []
        for other in (None, "markup", "ward"):
            cells.append(" / ".join("교환·0" if resolve(b, card, other)[1] else str(resolve(b, card, other)[0]) for b in (2, 4, 6)))
        lines.append("| " + (CARD_NAMES[card] if card else "패스") + " | " + " | ".join(cells) + " |")
    lines += ["", "요금 3·5까지 포함한 45행 전체는 원시 JSON의 `exact.combat`에 있다. 상한은 바가지와 흥정을 모두 더한 마지막에 적용한다. 교환 가능한 자기 가게가 없으면 둔갑 계약은 선택 불가이며, 이 상태에서 부적은 어떤 합법 방문객 행동도 막지 못한다.", "",
              "## 4. 전략이 섞이면 어떻게 달라지는가", "",
              "다음은 같은 상황 판단 봇 N−1명 사이에 해당 전략 한 명을 넣은 결과다. 전략 하나의 승률이며, 남은 사람 전체의 승률과 비교하지 않는다.", "",
              "| 투입한 전략 | 3인 | 4인 |", "|---|---:|---:|"]
    for p in ("builder", "collector", "cash", "cautious", "ward_keeper", "random"):
        a, b = (by_label[f"challenger/{p}/{n}"]["policyWin"][p]["mean"] for n in (3, 4))
        lines.append(f"| {POLICY_NAMES[p]} | {pct(a)} | {pct(b)} |")
    lines += ["", "부적을 우선 보유하는 전략은 상황 판단/증축 중심 봇의 둔갑 계약을 잘 억제했다. 부적이 약하다는 초기 의심만으로 보너스를 추가하면 안 된다. 역방향 침투와 혼합 테이블에서도 확인했지만, 상대 선택 빈도를 학습하는 최적 반응 모델은 아니므로 부적 보유가 모든 인간 전략을 지배한다고 결론 내리지 않는다.", "",
              "| 침투/혼합 조건 | 3인 해당 전략 승률 | 4인 해당 전략 승률 |", "|---|---:|---:|"]
    for label, policy, name in (("invasion/ward_keeper_vs_builder", "ward_keeper", "증축 중심 테이블의 부적 보유자"),
                                ("invasion/balanced_vs_ward_keeper", "balanced", "부적 중심 테이블의 상황 판단자"),
                                ("invasion/builder_vs_ward_keeper", "builder", "부적 중심 테이블의 공격적 증축자"),
                                ("mixed_counterplay", "ward_keeper", "상황 판단·증축·부적 혼합의 부적 보유자")):
        lines.append(f"| {name} | {pct(by_label[label+'/3']['policyWin'][policy]['mean'])} | {pct(by_label[label+'/4']['policyWin'][policy]['mean'])} |")
    lines += ["", "매입만 하고 증축하지 않는 봇은 계약 가능한 동급 가게 수가 줄어드는 영향도 받는다. 현금만 쌓는 봇의 낮은 승률은 신규 투자를 하지 않은 비용이며, 모든 고정 전략을 같은 승률로 맞춰야 한다는 근거는 아니다. 반면 초보자가 증축하지 않으면 핵심 장난 기회까지 잃는 구조는 설명·튜토리얼 검증이 필요하다.", "",
              "## 5. 회복과 경제", ""]
    for n in (3, 4):
        r = by_label[f"homogeneous/balanced/{n}"]
        lines.append(f"- {n}인 기준 모델: 강제 매각 {r['metrics'].get('forced_sales', 0):,}건, 가게 0채 상태 진입 {r['metrics'].get('zero_asset_episodes', 0):,}건 / 10,000판. 표본에 회복 사건이 없으면 회복 규칙을 통과로 처리할 수 없다.")
    lines += ["", "중반에 A가 가게 0채·현금 0, 상대들이 12채를 모두 소유하고 충분한 현금을 가진 상태를 따로 구성했다. 남은 네 밤 동안 밑천을 받아도 A는 빈 가게가 없어 매입할 수 없고, 자기 가게가 없어 둔갑 계약도 할 수 없다. 상대의 강제 매각 같은 외부 변화 없이는 소유권을 되찾을 경로가 없다. 3인·4인 각 200개 난수 시나리오에서도 재매입과 우승은 모두 0이었다. **이는 조건부 막힘의 검증이며 정상 경기에서 0% 회복한다는 통계가 아니다.**", "",
              "돈·자산 합계는 `초기 자산 + 밑천/입구/정자의 은행 유입 − 강제 매각의 자산 손실`과 대조했다. 180개 검증 경기와 400개 회복 스트레스는 매 턴, 48만 실행은 경기 종료 시에 자산·카드 보존을 검사했다. 개인 간 요금 이전과 동급 교환은 전체 자산을 만들어내지 않는다. 매입 6과 증축 4는 최종 가게 자산가와 같아서 마지막 턴의 단순 매입/증축으로 점수를 무한 생성할 수 없다. 현금 부족에 따른 환매 손실은 실제로 남는다.", "",
              "## 6. 간단한 조정 후보는 충분한가", "",
              "각 후보도 별도 조건당 10,000판이다. 원안은 수정하지 않았다. 아래는 같은 전략끼리의 좌석 승률 최대–최소 차이다.", "",
              "| 후보 | 3인 격차 | 4인 격차 |", "|---|---:|---:|"]
    for key, name in (("four_gates", "네 출입구 중 무작위 공동 출발"), ("hand3", "손패 상한 3장"),
                      ("rounds12", "열두 밤"), ("fixed_draw", "고정 좌석 순서로 카드 뽑기"), ("ward_rebate2", "부적 방어 성공 시 은행 보너스 2")):
        gaps = [simultaneous_gap(by_label[f"candidate/{key}/{n}"]["seatWin"])["gap"] * 100 for n in (3, 4)]
        lines.append(f"| {name} | {gaps[0]:.2f}%p | {gaps[1]:.2f}%p |")
    lines += ["", "출발 위치 변경·손패 확대·턴 연장 같은 단독 변경으로는 시작 순서 문제를 해결했다고 보기 어렵다. 특히 부적은 이미 유용한 반격 수단이어서 단순 보너스 상향을 추천하지 않는다. 카드 효과 제거 조건도 원시 결과의 `ablation`에 모두 보관했다. 이는 카드 하나를 무효화한 전체 시스템의 민감도이며, 다른 모든 상황을 고정한 카드 한 장의 순수 인과 가치가 아니다.", "",
              "## 7. 남은 검증과 다음 수정 순서", "",
              "1. **개업 순서**: 첫 밤 개업을 별도 단계로 분리하거나 후순위 시작 자금을 보정하는 후보를 새로 비교한다. 첫 밤 장사 순서·카드 뽑기/정리 순서도 문서에 확정해야 한다.",
              "2. **시작 가게와 가격**: 위치별 가격/요금 차등 또는 시작 가게 선택·현금 보정을 비교한다. 가게의 방문 확률만 같게 만들기보다 가격과 전략적 선택으로 유불리를 보상하는 방향도 가능하다.",
              "3. **재기 보장**: 마지막 가게의 보호/휴업 후 재개 또는 장터가 꽉 차도 가능한 재기 수단을 설계한다. 악용 가능한 무료 소유권·통행료 면제 고착이 생기지 않는지도 함께 검증한다.",
              "4. **카드와 전략**: 부적을 무조건 상향하지 않는다. 상대가 부적을 챙길 때의 블러핑과 카드 정리 판단을 사람에게 확인하고, 동급 교환 조건 때문에 장난을 못 하는 상황의 빈도를 본다.",
              "5. **사람 플레이**: 설명 5분, 실제 20–30분, 억울함·복수 의사·킹메이킹·상대 견제의 재미는 자동 수치로 통과시킬 수 없다. 현재 금액과 룰을 완성품으로 고정하지 않는다.", "",
              "5–6인, 신규 캐릭터 능력, 자유 거래, 대출·경매·추가 장난은 현재 초안의 범위 밖이다. 이 분석은 출시된 게임의 모든 상태를 증명한 것이 아니며, 명세에서 만든 독립 분석 모델의 수치 점검이다.", "",
              "## 재현과 검증", "", "```bash", "python3 -m unittest discover -s scripts -p test_goblin_market.py -v",
              "python3 scripts/goblin_market.py --suite confirm --runs 10000 --output docs/plans/assets/goblin-market-confirm.json",
              "python3 scripts/goblin_market_report.py", "```", "",
              "자동 검증 10개 통과: 보드 20칸 완전성, 주사위 전수 분포/2턴 전수 열거 대조, 문서의 대결 사례와 상한 계산, 대결 조합, 강제 매각/미지급, 후보 간 주사위·유행·초기 손패 일치, 관측의 비밀 비노출, 180경기의 매 턴 자산·카드 보존. UI/서버는 변경하지 않아 Next 빌드나 E2E를 이 분석의 검증 근거로 제시하지 않는다.", "",
              "점검표는 DOM 환경에서 40개 칸 버튼·카드 네 행·두 차트·칸 선택 갱신·선택 상태와 데이터 연결을 확인했다. 로컬 Chromium 실행은 OS 샌드박스에서 차단됐고 파일 URL의 브라우저 미리보기는 브라우저 보안 정책에서 차단됐다. 따라서 실제 브라우저의 시각적 배치·모바일 넘침 검사는 완료했다고 주장하지 않는다.", "",
              f"엔진 SHA-256: `{d['engineSha256']}`. 정수 시드 범위와 조건별 입력은 원시 JSON에 포함한다.", ""]
    (ROOT / "docs/plans/goblin-night-market-balance.md").write_text("\n".join(lines))
    (ROOT / "docs/plans/assets/goblin-market-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"games": summary["games"], "conditions": summary["conditions"],
                      "report": "docs/plans/goblin-night-market-balance.md"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
