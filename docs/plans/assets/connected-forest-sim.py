"""이어지는 숲길 · 콘텐츠 전수 검증 + 밸런스 시뮬레이터.

docs/plans/connected-forest.md 의 규칙을 그대로 옮긴 설계 검증 도구다.
게임 reducer 가 아니라 Delivery Gate 1 이전에 보상 수치를 확인하기 위한 도구다.

    python3 docs/plans/assets/connected-forest-sim.py

밸런스는 반드시 혼합 테이블 승률로 본다. 전원이 같은 정책을 쓰는 판끼리
평균 점수를 비교하면 대칭 보상이 실제보다 좋아 보이는 함정이 있다.

그리고 승률은 반드시 발신자 모델을 바꿔 가며 본다. 이 게임의 균형을
지배하는 변수는 보상표가 아니라 `발신자가 두 이웃 중 누구에게 보내는가`다.
한 발신자 모델에서만 균형인 보상 구성은 채택하지 않는다. --grid 참고.
"""
from __future__ import annotations

import argparse
import json
import random
import unicodedata
from collections import Counter, defaultdict
from itertools import product

# ---------------------------------------------------------------- 보드

HEX_LIST = [
    (0, 0), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0),
    (-2, 0), (-2, 1), (-2, 2), (-1, -1), (-1, 2), (0, -2), (0, 2),
    (1, -2), (1, 1), (2, -2), (2, -1), (2, 0),
]
HEX_ID = {c: f"h{i:02d}" for i, c in enumerate(HEX_LIST)}
BOARD = set(HEX_LIST)
CENTER = (0, 0)
SORT_INDEX = {c: i for i, c in enumerate(HEX_LIST)}

DIRS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def neighbors(c):
    return [(c[0] + d[0], c[1] + d[1]) for d in DIRS]


def dist_from_center(c):
    q, r = c
    return (abs(q) + abs(r) + abs(q + r)) // 2


def rot(c):
    """axial 60도 회전."""
    q, r = c
    return (-r, q + r)


def rot_n(c, n):
    for _ in range(n % 6):
        c = rot(c)
    return c


# ---------------------------------------------------------------- 콘텐츠

TERRAINS = ["TREE", "WATER", "FLOWER", "ROCK", "MUSHROOM"]
KO = {"TREE": "나무", "WATER": "물", "FLOWER": "꽃", "ROCK": "바위", "MUSHROOM": "버섯"}

TEMPLATES = {
    "line3": ([((0, 0), "A"), ((1, 0), "B"), ((2, 0), "A")], 3),
    "bend3": ([((0, 0), "A"), ((1, 0), "B"), ((0, 1), "C")], 3),
    "nest4": ([((0, 0), "A"), ((1, 0), "B"), ((0, 1), "C"), ((1, -1), "A")], 5),
    "trail4": ([((0, 0), "A"), ((1, 0), "B"), ((1, -1), "C"), ((2, -1), "B")], 5),
}

SPECIES = [
    ("squirrel", "다람쥐", "TREE", "MUSHROOM", "ROCK", "TREE"),
    ("otter", "수달", "WATER", "ROCK", "FLOWER", "WATER"),
    ("rabbit", "토끼", "FLOWER", "TREE", "MUSHROOM", "FLOWER"),
    ("hedgehog", "고슴도치", "MUSHROOM", "TREE", "ROCK", "MUSHROOM"),
    ("frog", "개구리", "WATER", "FLOWER", "MUSHROOM", "WATER"),
    ("fox", "여우", "ROCK", "TREE", "FLOWER", "ROCK"),
    ("owl", "부엉이", "TREE", "ROCK", "MUSHROOM", "TREE"),
    ("beaver", "비버", "WATER", "TREE", "ROCK", "WATER"),
    ("deer", "사슴", "FLOWER", "TREE", "WATER", "FLOWER"),
    ("mole", "두더지", "ROCK", "MUSHROOM", "TREE", "ROCK"),
    ("duck", "오리", "WATER", "FLOWER", "TREE", "WATER"),
    ("tanuki", "너구리", "MUSHROOM", "FLOWER", "TREE", "MUSHROOM"),
]


class AnimalCard:
    __slots__ = ("id", "species", "name", "cells", "hearts", "visitor")

    def __init__(self, sid, name, a, b, c, visitor, tid):
        offsets, hearts = TEMPLATES[tid]
        var = {"A": a, "B": b, "C": c}
        self.id = f"{sid}-{tid}"
        self.species = sid
        self.name = name
        self.cells = tuple((off, var[v]) for off, v in offsets)
        self.hearts = hearts
        self.visitor = visitor

    def placements(self):
        """(origin, rotation) -> 보드에 들어가는 (좌표, 지형) 튜플."""
        out = []
        for origin, r in product(HEX_LIST, range(6)):
            cells = []
            ok = True
            for off, terr in self.cells:
                ro = rot_n(off, r)
                cell = (origin[0] + ro[0], origin[1] + ro[1])
                if cell not in BOARD:
                    ok = False
                    break
                cells.append((cell, terr))
            if ok and len({c for c, _ in cells}) == len(cells):
                out.append((origin, r, tuple(cells)))
        return out


ANIMALS = [
    AnimalCard(sid, name, a, b, c, v, tid)
    for (sid, name, a, b, c, v) in SPECIES
    for tid in TEMPLATES
]

# 배치 후보를 미리 계산해 둔다.
PLACEMENTS = {card.id: card.placements() for card in ANIMALS}


# ---------------------------------------------------------------- 콘텐츠 검증

def validate_content():
    errs, notes = [], []

    if len(HEX_LIST) != 19 or len(BOARD) != 19:
        errs.append(f"보드 칸 수 {len(BOARD)} != 19")
    for c in HEX_LIST:
        if dist_from_center(c) > 2:
            errs.append(f"반지름 초과 {c}")

    ids = [a.id for a in ANIMALS]
    if len(ids) != 48:
        errs.append(f"동물 카드 {len(ids)}장 != 48")
    dup = [k for k, v in Counter(ids).items() if v > 1]
    if dup:
        errs.append(f"중복 카드 ID {dup}")

    # 모든 패턴이 보드 안에 놓일 수 있어야 한다.
    worst = min((len(PLACEMENTS[a.id]), a.id) for a in ANIMALS)
    for a in ANIMALS:
        if not PLACEMENTS[a.id]:
            errs.append(f"보드에 놓을 수 없는 패턴 {a.id}")
    notes.append(f"패턴별 배치 후보 최소 {worst[0]}개 ({worst[1]})")

    # 각 템플릿의 회전 축퇴 (반전 금지가 실제 제약인지)
    for tid, (offsets, _) in TEMPLATES.items():
        shapes = set()
        for r in range(6):
            shapes.add(tuple(sorted((rot_n(o, r), v) for o, v in offsets)))
        mirrored = tuple(sorted(((o[0] + o[1], -o[1]), v) for o, v in offsets))
        mirror_in_rotations = any(
            mirrored == tuple(sorted(((rot_n(o, r)), v) for o, v in offsets)) for r in range(6)
        )
        notes.append(
            f"{tid}: 고유 회전 {len(shapes)}개, 반전이 회전에 포함 = {mirror_in_rotations}"
        )

    # 지형 카드 분포
    for n in (4, 5, 6):
        per = 3 * n
        total = per * 5
        if total != 15 * n:
            errs.append(f"{n}인 지형 카드 총합 {total} != {15*n}")
        if per > 18:
            errs.append(f"{n}인 지형별 {per}장 > 보유 18장")
    notes.append("지형 카드: 4인 60 / 5인 75 / 6인 90장, 각 지형 균등")

    # 동물 덱 여유
    draw6 = 12 + 6 * 4 + 6
    notes.append(f"6인 최대 draw {draw6}장 / 48장, 여유 {48 - draw6}장")
    if draw6 > 48:
        errs.append("동물 덱 부족")

    return errs, notes


# 배치 점수 계산을 위한 역인덱스: (카드, 칸, 지형) -> 그 칸을 쓰는 배치들
BY_CELL = defaultdict(list)
for _card in ANIMALS:
    for _o, _r, _cells in PLACEMENTS[_card.id]:
        for _c, _t in _cells:
            BY_CELL[(_card.id, _c, _t)].append(_cells)


# ---------------------------------------------------------------- 게임

class Cfg:
    """보상 설정."""
    # 기본값이 채택안이다. STAY 2하트/발신 1잎, WALK 수신 3잎/발신 1잎,
    # 3칸 완성 시 양쪽 3잎, 숲길 상한 3.
    def __init__(self, stay_self=2, stay_sender=1, walk_self=3, walk_sender=1,
                 bonus_self=3, bonus_sender=3, cap=3, name="채택안"):
        self.stay_self = stay_self
        self.stay_sender = stay_sender
        self.walk_self = walk_self
        self.walk_sender = walk_sender
        self.bonus_self = bonus_self
        self.bonus_sender = bonus_sender
        self.cap = cap
        self.name = name

    def __str__(self):
        return (f"STAY {self.stay_self}/{self.stay_sender} · "
                f"WALK {self.walk_self}/{self.walk_sender} · "
                f"완성 {self.bonus_self}/{self.bonus_sender} · 상한 {self.cap}")


class P:
    __slots__ = ("seat", "terrain", "figure", "hand", "active", "residents",
                 "sent", "hosted", "leaves", "lp", "welcomed")

    def __init__(self, seat):
        self.seat = seat
        self.terrain = {}
        self.figure = set()
        self.hand = []
        self.active = []
        self.residents = []
        self.sent = set()
        self.hosted = 0
        self.leaves = 0
        self.lp = 0
        self.welcomed = False

    def legal(self, first):
        if first or not self.terrain:
            return [CENTER]
        return [c for c in HEX_LIST
                if c not in self.terrain and any(n in self.terrain for n in neighbors(c))]

    def complete(self, card, extra=None, et=None):
        terr = self.terrain
        for origin, r, cells in PLACEMENTS[card.id]:
            ok = True
            for c, t in cells:
                cur = et if (extra is not None and c == extra) else terr.get(c)
                if cur != t:
                    ok = False
                    break
            if ok:
                free = [c for c, _ in cells if c not in self.figure]
                if free:
                    return min(free, key=lambda c: SORT_INDEX[c])
        return None

    def score(self, cfg):
        res = sum(a.hearts for a, _ in self.residents)
        vis = self.hosted * cfg.stay_self
        cnt = Counter(self.terrain.values())
        bal = 5 if all(cnt.get(t, 0) >= 2 for t in TERRAINS) else 0
        return res + vis + self.leaves + bal


def pick_move(p, first):
    cells = p.legal(first)
    cnt = Counter(p.terrain.values())
    best, bkey = None, None
    for ci, ct in enumerate(p.hand):
        for cell in cells:
            sc = 0.0
            if not p.welcomed:
                for a in p.active:
                    if p.complete(a, cell, ct):
                        sc += 1000 + a.hearts * 10
                        break
            prog = 0
            for a in p.active:
                for cells_t in BY_CELL.get((a.id, cell, ct), ()):
                    m = 0
                    bad = False
                    for c, t in cells_t:
                        cur = ct if c == cell else p.terrain.get(c)
                        if cur == t:
                            m += 1
                        elif cur is not None:
                            bad = True
                            break
                    if not bad and m > prog:
                        prog = m
            sc += prog * 12
            if cnt.get(ct, 0) < 2:
                sc += 14
            sc -= dist_from_center(cell)
            key = (sc, -SORT_INDEX[cell], -ci)
            if bkey is None or key > bkey:
                bkey, best = key, (ci, cell)
    return best


def decide(policy, path_len, season, cap):
    if policy == "STAY":
        return "STAY"
    if policy == "WALK":
        return "WALK"
    if path_len == cap - 1:
        return "WALK"
    return "WALK" if (4 - season) >= 2 else "STAY"


# ---------------------------------------------------------------- 발신자 모델
#
# 수신자 정책(STAY/WALK/MIXED)만 바꿔서는 균형을 판정할 수 없다. 누가 누구에게
# 보내는가가 승률을 더 크게 흔든다. 아래 세 모델을 모두 통과해야 채택 가능하다.


def _pair(a, b):
    """공동 숲길 키. 항상 (작은 좌석, 큰 좌석)."""
    return (a, b) if a < b else (b, a)


def send_shortest(seat, cands, paths, cfg, rng):
    """A. 공동 숲길이 가장 짧은 이웃.

    게임 규칙이 아니라 마감 때 서버가 쓰는 자동 선택 규칙이다. 여기에는 음의
    되먹임이 있다. 내가 WALK 를 하면 내 숲길이 길어지고, 그러면 이웃의 발신이
    나를 피해 흘러 내가 받는 방문 자체가 줄어든다. 이 되먹임이 WALK 의 산술적
    우위를 상쇄하므로, 이 모델로만 측정하면 보상표가 실제보다 균형 잡혀 보인다.
    """
    return min(cands, key=lambda s: (paths[_pair(seat, s)], s))


def send_random(seat, cands, paths, cfg, rng):
    """B. 무작위 이웃. 되먹임이 전혀 없는 대조군."""
    return rng.choice(cands)


def send_nearly_done(seat, cands, paths, cfg, rng):
    """C. 완성에 가장 가까운 숲길 우선. 아직 상한 미만인 쪽을 먼저 본다.

    connected-forest.md 의 `발신자도 파트너를 원한다` 절이 예측하는 행동이다.
    한 파트너와 숲길을 3칸까지 밀어 완성 보너스를 받으려는 플레이다.
    """
    return max(cands, key=lambda s: (paths[_pair(seat, s)] < cfg.cap,
                                     paths[_pair(seat, s)], -s))


SENDERS = {
    "A최단": send_shortest,
    "B무작위": send_random,
    "C완성임박": send_nearly_done,
}
DEFAULT_SENDER = "A최단"


def play(n, assign, seed, cfg, sender=DEFAULT_SENDER, trace=None):
    """한 판을 끝까지 돌린다.

    sender 는 SENDERS 의 키이거나 같은 시그니처의 함수다. rng 는 덱 셔플 이후
    발신 대상 선택에만 쓰이므로, 발신자 모델을 바꿔도 같은 seed 면 보드 전개와
    카드 배분은 완전히 동일하다. 즉 발신 규칙만 격리해 비교할 수 있다.
    """
    pick_target = SENDERS[sender] if isinstance(sender, str) else sender
    rng = random.Random(seed)
    players = [P(i) for i in range(n)]
    deck = [t for t in TERRAINS for _ in range(3 * n)]
    rng.shuffle(deck)
    adeck = list(ANIMALS)
    rng.shuffle(adeck)
    if trace is not None:
        draw_kinds = list(reversed(deck))
        copies = Counter()
        terrain_draw_order = []
        for kind in draw_kinds:
            copies[kind] += 1
            terrain_draw_order.append({
                "id": f"terrain-{kind.lower()}-{copies[kind]:02d}",
                "kind": kind,
            })
        trace["terrainDeck"] = terrain_draw_order
        trace["animalDeck"] = [animal.id for animal in reversed(adeck)]
        trace["senderTargets"] = []
        trace["placementChoices"] = []
    for p in players:
        p.active = [adeck.pop(), adeck.pop()]
    paths = {(i, (i + 1) % n) if i < (i + 1) % n else ((i + 1) % n, i): 0 for i in range(n)}
    stats = Counter()

    for season in range(5):
        for p in players:
            p.welcomed = False
            p.hand = [deck.pop() for _ in range(3)]
        direction = -1 if season % 2 == 0 else 1
        for pick in range(3):
            moves = [pick_move(p, season == 0 and pick == 0) for p in players]
            if trace is not None:
                for p, (ci, cell) in zip(players, moves):
                    choice = {
                        "seasonIndex": season,
                        "pickIndex": pick,
                        "seat": p.seat + 1,
                        "handIndex": ci,
                        "hexId": HEX_ID[cell],
                    }
                    if not p.welcomed:
                        for animal in p.active:
                            anchor = p.complete(animal, cell, p.hand[ci])
                            if anchor:
                                choice["welcomeAnimalCardId"] = animal.id
                                choice["residentHexId"] = HEX_ID[anchor]
                                break
                    trace["placementChoices"].append(choice)
            for p, (ci, cell) in zip(players, moves):
                ct = p.hand.pop(ci)
                p.terrain[cell] = ct
                if not p.welcomed:
                    for a in list(p.active):
                        anchor = p.complete(a)
                        if anchor:
                            p.residents.append((a, anchor))
                            p.figure.add(anchor)
                            p.active.remove(a)
                            p.welcomed = True
                            if season < 4 and adeck:
                                p.active.append(adeck.pop())
                            break
            if pick < 2:
                hands = [p.hand for p in players]
                for idx, p in enumerate(players):
                    p.hand = hands[(idx - direction) % n]

        queues = defaultdict(list)
        for p in players:
            avail = [i for i, (a, _) in enumerate(p.residents) if a.id not in p.sent]
            if not avail:
                continue
            i = min(avail, key=lambda i: p.residents[i][0].id)
            p.sent.add(p.residents[i][0].id)
            cands = sorted({(p.seat - 1) % n, (p.seat + 1) % n})
            tgt = pick_target(p.seat, cands, paths, cfg, rng)
            if trace is not None:
                trace["senderTargets"].append({
                    "sourceSeat": p.seat + 1,
                    "targetSeat": tgt + 1,
                })
            queues[tgt].append((p.seat, p.residents[i][0]))

        for tgt in sorted(queues):
            recv = players[tgt]
            for src_seat, card in sorted(queues[tgt]):
                key = (min(src_seat, tgt), max(src_seat, tgt))
                src = players[src_seat]
                stay_cells = [c for c, t in recv.terrain.items()
                              if t == card.visitor and c not in recv.figure]
                can_stay = bool(stay_cells)
                can_walk = paths[key] < cfg.cap
                if not can_stay and not can_walk:
                    recv.leaves += 1
                    src.leaves += 1
                    stats["waved"] += 1
                    continue
                # 강제와 자유를 구분해 센다. 전체 방문을 분모로 한 WALK 선택률은
                # 강제 상황을 포함해 보상표를 바꿔도 거의 움직이지 않으므로
                # 지표로 쓸 수 없다. 판단이 실제로 일어난 방문만 따로 집계한다.
                if can_stay and not can_walk:
                    ch = "STAY"
                    stats["forced_stay"] += 1
                elif can_walk and not can_stay:
                    ch = "WALK"
                    stats["forced_walk"] += 1
                else:
                    ch = decide(assign[tgt], paths[key], season, cfg.cap)
                    stats["free"] += 1
                    if ch == "WALK":
                        stats["free_walk"] += 1
                if ch == "STAY":
                    cell = max(stay_cells, key=lambda c: (dist_from_center(c), -SORT_INDEX[c]))
                    recv.figure.add(cell)
                    recv.hosted += 1
                    src.leaves += cfg.stay_sender
                    stats["stay"] += 1
                else:
                    paths[key] += 1
                    done = paths[key] == cfg.cap
                    recv.leaves += cfg.walk_self + (cfg.bonus_self if done else 0)
                    recv.lp += cfg.walk_self + (cfg.bonus_self if done else 0)
                    src.leaves += cfg.walk_sender + (cfg.bonus_sender if done else 0)
                    src.lp += cfg.walk_sender + (cfg.bonus_sender if done else 0)
                    stats["walk"] += 1
                    if done:
                        stats["done"] += 1
    if trace is not None:
        trace["scores"] = [player.score(cfg) for player in players]
        trace["stats"] = dict(stats)
        trace["winnerSeats"] = [seat + 1 for seat in winner_seats(players, cfg)]
    return players, stats


def winner_seats(players, cfg):
    """총점 → 방문객 수 → 주민 수. 세 값이 모두 같을 때만 공동 승리."""
    ranks = [(p.score(cfg), p.hosted, len(p.residents)) for p in players]
    best = max(ranks)
    return [p.seat for p, rank in zip(players, ranks) if rank == best]


def policy_schedule(n, runs, seed_base=70000):
    """덱과 별도 스트림. 세 판마다 모든 좌석이 세 정책을 한 번씩 사용한다."""
    rng = random.Random(seed_base ^ 0x85EBCA6B)
    policies = ("STAY", "WALK", "MIXED")
    schedule = []
    while len(schedule) < runs:
        labels = [seat % 3 for seat in range(n)]
        rng.shuffle(labels)
        offset = rng.randrange(3)
        for rotation in range(3):
            if len(schedule) == runs:
                break
            schedule.append([policies[(label + offset + rotation) % 3] for label in labels])
    return schedule


def evaluate(cfg, runs=500, sizes=(4, 5, 6), sender=DEFAULT_SENDER, seed_base=70000):
    out = {}
    for n in sizes:
        wins = Counter()
        seen = Counter()
        st = Counter()
        shares = []
        for s, assign in enumerate(policy_schedule(n, runs, seed_base)):
            players, stats = play(n, assign, seed_base + s, cfg, sender)
            st += stats
            totals = [p.score(cfg) for p in players]
            winners = winner_seats(players, cfg)
            for pol, p, t in zip(assign, players, totals):
                seen[pol] += 1
                if p.seat in winners:
                    wins[pol] += 1
                if t:
                    shares.append(p.lp / t)
        tot = st["stay"] + st["walk"]
        visits = tot + st["waved"]
        free = st["free"]
        out[n] = {
            "win": {k: wins[k] / max(seen[k], 1) for k in ("STAY", "WALK", "MIXED")},
            # 전체 방문 기준. 강제 선택을 포함하므로 진단용으로만 읽는다.
            "walk_rate": st["walk"] / tot if tot else 0,
            # 두 선택이 모두 합법이었던 방문의 비율과 그 안에서의 WALK 비율.
            # 성공 기준에 쓰는 값은 이 둘이다.
            "free_rate": free / visits if visits else 0,
            "free_walk_rate": st["free_walk"] / free if free else 0,
            "forced_stay": st["forced_stay"] / visits if visits else 0,
            "forced_walk": st["forced_walk"] / visits if visits else 0,
            "waved": st["waved"] / visits if visits else 0,
            "done": st["done"] / runs,
            "share": sum(shares) / len(shares) if shares else 0,
        }
    return out


def spread(res):
    """세 정책 승률의 최대-최소 격차 평균. 낮을수록 균형."""
    vals = []
    for n, r in res.items():
        w = list(r["win"].values())
        vals.append(max(w) - min(w))
    return sum(vals) / len(vals)


def sweep(cfgs, senders=tuple(SENDERS), runs=150, sizes=(4, 5, 6), seed_base=70000):
    """보상 구성 × 발신자 모델 격자.

    판정 기준은 각 구성의 평균이 아니라 **최악값**이다. 한 발신자 모델에서만
    10%p 미만인 구성은 채택하지 않는다. 사람이 실제로 어느 모델에 가깝게
    행동하는지는 Delivery Gate 1 의 종이 프로토타입에서 관찰한다.
    """
    rows = []
    for cfg in cfgs:
        gaps = {snd: spread(evaluate(cfg, runs=runs, sizes=sizes,
                                     sender=snd, seed_base=seed_base))
                for snd in senders}
        rows.append((cfg, gaps, max(gaps.values())))
    return rows




# ---------------------------------------------------------------- 실행

# Delivery Gate 1 까지의 잠정값이다. 확정은 Gate 2 에서, 사람의 실제 발신
# 행동을 관찰해 발신자 모델을 고른 뒤에 한다.
PROVISIONAL = Cfg(name="잠정안 WALK 3/1 · 완성 3/3 · 상한 3")
REJECTED = Cfg(2, 1, 2, 2, 3, 3, 3, name="폐기한 대칭안 WALK 2/2")
STAY3 = Cfg(3, 1, 3, 1, 3, 3, 3, name="대안 STAY 3하트")

# 발신자 격자에 걸어 볼 후보들. 2026-09-02 기준 세 발신자 모델을 모두
# 통과하는 구성은 아직 없다.
GRID = [
    PROVISIONAL,
    STAY3,
    Cfg(2, 1, 3, 1, 3, 3, 2, name="잠정안 · 상한 2"),
    Cfg(3, 1, 3, 1, 3, 3, 2, name="STAY 3하트 · 상한 2"),
    Cfg(3, 1, 2, 1, 3, 3, 3, name="STAY 3 · WALK 2"),
    Cfg(2, 1, 2, 1, 3, 3, 3, name="STAY 2 · WALK 2"),
    Cfg(4, 1, 3, 1, 3, 3, 3, name="STAY 4하트"),
]


def _dw(text):
    """동아시아 문자를 2칸으로 세는 표시 폭."""
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def _pad(text, width):
    """표시 폭 기준 왼쪽 정렬. 표 열이 어긋나지 않게 한다."""
    return text + " " * max(width - _dw(text), 0)


def _rpad(text, width):
    """표시 폭 기준 오른쪽 정렬."""
    return " " * max(width - _dw(text), 0) + text


def parse_args(argv=None):
    ap = argparse.ArgumentParser(
        description="이어지는 숲길 · 콘텐츠 전수 검증 + 밸런스 시뮬레이터",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="예) python3 %(prog)s --grid --sweep-runs 1000   # Gate 2 확정용 판정",
    )
    ap.add_argument("--runs", type=int, default=300,
                    help="기준 실행의 인원수당 판수 (기본 300)")
    ap.add_argument("--sender", default=DEFAULT_SENDER, choices=list(SENDERS),
                    help=f"기준 실행에 쓸 발신자 모델 (기본 {DEFAULT_SENDER})")
    ap.add_argument("--seed", type=int, default=70000,
                    help="시드 기준값. 견고성 확인 때 바꾼다 (기본 70000)")
    ap.add_argument("--sweep-runs", type=int, default=150,
                    help="발신자 격자의 조합당 판수 (기본 150)")
    ap.add_argument("--grid", action="store_true",
                    help="후보 보상 구성 전체를 세 발신자 모델에 건다 (느리다)")
    ap.add_argument("--no-sweep", action="store_true",
                    help="발신자 모델 비교를 건너뛰고 기준 실행만 한다")
    ap.add_argument("--golden-json",
                    help="Python→TypeScript parity용 작은 고정 입력·결과 corpus를 JSON으로 저장")
    return ap.parse_args(argv)


def golden_corpus():
    cases = []
    for n in (4, 5, 6):
        for sender_index, sender in enumerate(SENDERS):
            seed = 73000 + n * 100 + sender_index
            policy_rng = random.Random(seed)
            policies = [policy_rng.choice(["STAY", "WALK", "MIXED"]) for _ in range(n)]
            trace = {
                "name": f"{n}p-{sender}",
                "playerCount": n,
                "seed": seed,
                "senderModel": sender,
                "policies": policies,
            }
            play(n, policies, seed, PROVISIONAL, sender, trace)
            cases.append(trace)
    return {
        "formatVersion": 2,
        "rules": PROVISIONAL.name,
        "note": "덱과 무작위 발신 대상을 공유한다. TypeScript가 Python MT19937을 재구현하지 않는다.",
        "cases": cases,
    }


def main(argv=None):
    args = parse_args(argv)

    if args.golden_json:
        with open(args.golden_json, "w", encoding="utf-8") as target:
            json.dump(golden_corpus(), target, ensure_ascii=False, indent=2)
            target.write("\n")
        print(args.golden_json)
        return

    print("=" * 70)
    print("콘텐츠 전수 검증")
    print("=" * 70)
    errs, notes = validate_content()
    for note in notes:
        print("  ·", note)
    print("  오류:", errs if errs else "없음")

    print()
    print("=" * 70)
    print(f"기준 실행 · 혼합 테이블 승률 · 발신자 모델 {args.sender}")
    print("=" * 70)
    for cfg in (REJECTED, PROVISIONAL):
        res = evaluate(cfg, runs=args.runs, sender=args.sender, seed_base=args.seed)
        print(f"\n{cfg.name}")
        print(f"  {cfg}")
        for n in (4, 5, 6):
            r = res[n]
            w = r["win"]
            print(f"   {n}인 · 승률 STAY {w['STAY']*100:4.1f}% / WALK {w['WALK']*100:4.1f}% / "
                  f"MIXED {w['MIXED']*100:4.1f}% · 3칸 완성 {r['done']:.2f}개/판 · "
                  f"숲길 몫 {r['share']*100:.1f}%")
            print(f"        자유 선택 {r['free_rate']*100:4.1f}% 중 WALK "
                  f"{r['free_walk_rate']*100:4.1f}%  |  강제 STAY {r['forced_stay']*100:4.1f}% · "
                  f"강제 WALK {r['forced_walk']*100:4.1f}% · 배웅 {r['waved']*100:.1f}% · "
                  f"전체 WALK율 {r['walk_rate']*100:.0f}%")
        print(f"   승률 격차 평균 {spread(res)*100:.1f}%p  (0에 가까울수록 균형)")

    print()
    print("주의 1: 전원이 같은 정책을 쓰는 판끼리 평균 점수를 비교하면 결론이 뒤집힌다.")
    print("        대칭 보상은 상대도 같이 올려주므로 그 방식에서만 좋아 보인다.")
    print("주의 2: `전체 WALK율`은 강제 선택을 포함해 보상표를 바꿔도 거의 움직이지")
    print("        않는다. 성공 기준으로 쓸 값은 `자유 선택` 두 수치다.")

    if args.no_sweep:
        return

    cfgs = GRID if args.grid else (PROVISIONAL, STAY3)
    print()
    print("=" * 70)
    print(f"발신자 모델 격자 · 조합당 {args.sweep_runs}판 · 판정은 최악값 기준")
    print("=" * 70)
    print("  이 게임의 균형을 지배하는 변수는 보상표가 아니라 발신 대상 선택이다.")
    print("  A최단은 마감 자동 규칙이라 사람의 행동이 아니고, 문서가 예측하는")
    print("  실제 행동은 C완성임박이다. 세 모델 모두 10%p 미만이어야 채택한다.")
    print()
    names = list(SENDERS)
    width = max(_dw(c.name) for c in cfgs) + 2
    print("  " + _pad("보상 구성", width)
          + "".join(_rpad(k, 10) for k in names) + _rpad("최악", 9))
    print("  " + "-" * (width + 10 * len(names) + 9))
    for cfg, gaps, worst in sweep(cfgs, runs=args.sweep_runs, seed_base=args.seed):
        cells = "".join(f"{gaps[k] * 100:9.1f}p" for k in names)
        mark = "   <= 전 모델 통과" if worst < 0.10 else ""
        print("  " + _pad(cfg.name, width) + cells + f"{worst * 100:8.1f}p" + mark)
    if not args.grid:
        print()
        print("  후보 전체를 보려면 --grid, 확정 판정은 --sweep-runs 1000 이상으로 돌린다.")


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------- 종이 키트

HEX_W, HEX_H = 46, 53          # 카드 패턴용
BOARD_W, BOARD_H = 62, 71      # 플레이어 보드용
CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"


def _pattern_svg(cells, w=HEX_W, h=HEX_H):
    """canonical cells 를 절대 위치 육각으로 그린다."""
    pos = []
    for (q, r), terr in cells:
        pos.append(((q + r / 2) * w, r * h * 0.75, terr))
    minx = min(p[0] for p in pos)
    miny = min(p[1] for p in pos)
    width = max(p[0] for p in pos) - minx + w
    height = max(p[1] for p in pos) - miny + h
    out = [f'<div class="pat" style="width:{width:.0f}px;height:{height:.0f}px">']
    for x, y, terr in pos:
        out.append(
            f'<i style="left:{x-minx:.0f}px;top:{y-miny:.0f}px"><b>{KO[terr]}</b></i>'
        )
    out.append("</div>")
    return "".join(out)


def _board_html():
    rows = {}
    for c in HEX_LIST:
        rows.setdefault(c[1], []).append(c)
    out = ['<div class="pboard">']
    for r in sorted(rows):
        out.append('<div class="prow">')
        for c in sorted(rows[r]):
            out.append(f'<i><span>{HEX_ID[c]}</span></i>')
        out.append("</div>")
    out.append("</div>")
    return "".join(out)


KIT_CSS = f"""
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        color:#111; background:#fff; }}
h1 {{ font-size:20px; margin:0 0 4px; }}
h2 {{ font-size:15px; margin:0 0 10px; padding-bottom:4px; border-bottom:1px solid #999; }}
p  {{ margin:0 0 8px; font-size:12px; line-height:1.5; }}
.page {{ padding:14mm 12mm; page-break-after:always; }}
.page:last-child {{ page-break-after:auto; }}
.grid4 {{ display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }}
.grid2 {{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }}

.acard {{ border:1.5px solid #222; border-radius:8px; padding:8px; height:80mm;
          display:flex; flex-direction:column; }}
.acard .top {{ display:flex; justify-content:space-between; align-items:baseline; }}
.acard .nm {{ font-weight:700; font-size:15px; }}
.acard .ht {{ font-weight:700; font-size:14px; }}
.acard .tid {{ font-size:10px; color:#666; margin-top:1px; }}
.acard .mid {{ flex:1; display:grid; place-items:center; }}
.acard .foot {{ font-size:10px; color:#444; border-top:1px solid #bbb; padding-top:5px; }}

.pat {{ position:relative; }}
.pat i {{ position:absolute; width:{HEX_W}px; height:{HEX_H}px; background:#333;
          clip-path:{CLIP}; display:grid; place-items:center; }}
.pat i b {{ position:relative; z-index:1; font-size:10px; }}
.pat i::before {{ content:""; position:absolute; inset:1.5px; background:#fff; clip-path:{CLIP}; }}

.pboard {{ }}
.prow {{ display:flex; justify-content:center; gap:3px; margin-top:-{BOARD_H*0.25:.0f}px; }}
.prow:first-child {{ margin-top:0; }}
.prow i {{ width:{BOARD_W}px; height:{BOARD_H}px; background:#666; clip-path:{CLIP};
           display:grid; place-items:center; position:relative; }}
.prow i::before {{ content:""; position:absolute; inset:1.5px; background:#fff; clip-path:{CLIP}; }}
.prow i span {{ position:relative; z-index:1; font-size:9px; color:#aaa; }}

.tcards {{ display:grid; grid-template-columns:repeat(10,1fr); gap:3px; }}
.tcard {{ border:1px solid #444; border-radius:4px; text-align:center;
          font-size:11px; padding:9px 0; }}

table {{ border-collapse:collapse; width:100%; font-size:11px; }}
th, td {{ border:1px solid #888; padding:5px 4px; text-align:center; }}
th {{ background:#eee; font-weight:600; }}
td.tall {{ height:26px; }}
.hint {{ font-size:11px; color:#555; line-height:1.6; }}
.rule {{ font-size:11.5px; line-height:1.65; }}
.rule b {{ background:#eee; padding:0 3px; }}
.trk {{ display:flex; gap:5px; align-items:center; font-size:12px; margin:5px 0; }}
.trk u {{ width:22px; height:22px; border:1.5px solid #333; border-radius:50%;
          text-decoration:none; display:inline-block; }}
@media print {{ .page {{ padding:12mm; }} }}
"""


def emit_kit(path="docs/plans/assets/connected-forest-kit.html"):
    front8 = [s[0] for s in SPECIES[:8]]
    cards = [a for a in ANIMALS if a.species in front8]
    cards.sort(key=lambda a: (front8.index(a.species), list(TEMPLATES).index(a.id.split("-")[1])))

    P = []
    P.append(f'<!doctype html><html lang="ko"><head><meta charset="utf-8">'
             f'<title>이어지는 숲길 · 4인 종이 프로토타입 키트</title><style>{KIT_CSS}</style></head><body>')

    # 표지 + 규칙 요약
    P.append('<div class="page"><h1>이어지는 숲길 · 4인 종이 프로토타입 키트</h1>')
    P.append('<p>Delivery Gate 1 용이다. 이 판을 통과하기 전에는 코드도 최종 아트도 만들지 않는다. '
             '설명 7분 이내, 진행 15–25분을 목표로 한다.</p>')
    P.append('<h2>7분 설명용 규칙 요약</h2><div class="rule">')
    P.append('<p><b>목표</b> 하트를 가장 많이 모은다. 탈락도 공격도 없다.</p>')
    P.append('<p><b>보드</b> 각자 19칸 육각 숲. 맨 처음 지형은 중앙 h00에만 놓는다. '
             '그 다음부터는 내가 놓은 지형에 <u>맞닿은 빈칸</u>에만 놓는다.</p>')
    P.append('<p><b>계절</b> 봄 · 초여름 · 한여름 · 가을 · 첫눈 다섯 번. 계절마다 지형 카드 3장을 받는다.</p>')
    P.append('<p><b>드래프트</b> 3장 중 1장을 골라 동시에 놓고 남은 손을 옆으로 넘긴다. 이걸 세 번. '
             '전달 방향은 봄에 왼쪽, 계절마다 반대로 바꾼다.</p>')
    P.append('<p><b>동물</b> 활성 동물 카드 2장을 손에 숨겨 든다. 놓은 지형이 카드 패턴과 맞으면 '
             '그 동물을 맞이해 주민으로 올린다. 회전은 되지만 <u>뒤집기는 안 된다</u>. '
             '한 계절에 한 마리만. 첫눈 전까지는 맞이할 때마다 새 카드를 한 장 보충한다.</p>')
    P.append('<p><b>방문</b> 계절 끝에, 아직 방문을 안 보낸 주민이 있으면 반드시 한 마리를 골라 '
             '좌우 이웃 중 한 명에게 보낸다. 주민은 내 숲에 그대로 있고 같은 종의 방문객만 간다.</p>')
    P.append('<p><b>받은 쪽이 고른다</b> — '
             '<u>우리 숲에 머물기</u>: 카드에 적힌 지형 중 말이 없는 칸에 방문객을 놓는다. '
             '받은 사람 하트 2 (게임 끝에), 보낸 사람 잎 1. / '
             '<u>함께 산책하기</u>: 두 사람 사이 숲길을 1칸 늘린다. '
             '받은 사람 잎 3, 보낸 사람 잎 1. <b>3칸째로 길이 이어지면 양쪽 모두 잎 3을 더 받는다.</b> '
             '숲길은 3칸이 최대다.</p>')
    P.append('<p>둘 다 불가능하면 손 흔들어 배웅한다. 양쪽 잎 1.</p>')
    P.append('<p><b>점수</b> 주민 하트(카드에 적힌 3 또는 5) + 머무는 방문객 2씩 + 잎 1씩 + '
             '다섯 지형을 각각 2개 이상 놓았으면 5. 동점이면 방문객 수, 그 다음 주민 수.</p>')
    P.append('</div>')
    P.append('<h2>준비물</h2><p class="hint">'
             '· 지형 카드 60장 (다섯 지형 각 12장) — 색종이 다섯 색으로 대체해도 된다<br>'
             '· 동물 카드 32장 (앞 8종 × 4패턴)<br>'
             '· 플레이어 보드 4장 · 숲길 트랙 1장 · 기록지 1장<br>'
             '· 주민과 방문객 표시용 작은 말 — 동전이나 클립으로 대신한다<br>'
             '· 타이머 (드래프트 60초 · 방문 선택 30초 · 방문 응답 20초)</p>')
    P.append('</div>')

    # 동물 카드 32장
    for page in range(0, len(cards), 12):
        P.append('<div class="page"><div class="grid4">')
        for a in cards[page:page + 12]:
            tid = a.id.split("-")[1]
            P.append('<div class="acard">')
            P.append(f'<div class="top"><span class="nm">{a.name}</span>'
                     f'<span class="ht">♥ {a.hearts}</span></div>')
            P.append(f'<div class="tid">{a.id}</div>')
            P.append(f'<div class="mid">{_pattern_svg(list(a.cells))}</div>')
            P.append(f'<div class="foot">방문객은 <b>{KO[a.visitor]}</b> 칸에 머뭅니다<br>'
                     f'회전 O · 뒤집기 X</div>')
            P.append("</div>")
        P.append("</div></div>")

    # 플레이어 보드 4장 (2장씩)
    for page in range(2):
        P.append('<div class="page">')
        for i in range(2):
            n = page * 2 + i + 1
            P.append(f'<h2>플레이어 보드 {n} · 19칸</h2>{_board_html()}')
        P.append("</div>")

    # 지형 카드
    P.append('<div class="page"><h2>지형 카드 60장 · 다섯 지형 각 12장</h2>'
             '<p class="hint">색종이 다섯 색으로 대체해도 된다. 4인은 지형마다 정확히 12장이며 '
             '판이 끝나면 한 장도 남지 않는다.</p><div class="tcards">')
    for t in TERRAINS:
        for _ in range(12):
            P.append(f'<div class="tcard">{KO[t]}</div>')
    P.append("</div></div>")

    # 숲길 트랙 + 기록지
    P.append('<div class="page"><h2>공동 숲길 트랙 · 이웃 4쌍</h2>'
             '<p class="hint">4인은 원형이라 이웃 쌍이 4개다. 칸을 채울 때마다 표시한다. '
             '3칸째를 채우면 양쪽 모두 잎 3을 추가로 받는다.</p>')
    for pair in ("1 — 2", "2 — 3", "3 — 4", "4 — 1"):
        P.append(f'<div class="trk"><span style="width:70px">{pair}</span>'
                 '<u></u><u></u><u></u><span class="hint">3칸 완성 → 양쪽 잎 +3</span></div>')

    P.append('<h2 style="margin-top:18px">기록지 · 1순위 측정값</h2>'
             '<p class="hint">계절마다 시작·종료 시각과 그 계절에 나온 방문 선택을 적는다. '
             '목표는 계절당 3–5분, 전체 15–25분이다.</p>')
    P.append('<table><tr><th>계절</th><th>드래프트 3회</th><th>방문 선택</th><th>방문 응답</th>'
             '<th>계절 합계</th><th>머물기 수</th><th>산책 수</th></tr>')
    for s in ("봄", "초여름", "한여름", "가을", "첫눈"):
        P.append(f'<tr><td>{s}</td>' + '<td class="tall"></td>' * 6 + "</tr>")
    P.append('<tr><th>합계</th>' + "<td></td>" * 6 + "</tr></table>")

    P.append('</div><div class="page"><h2>최종 점수</h2>')
    P.append('<table><tr><th>플레이어</th><th>주민 하트</th><th>방문객 ×2</th>'
             '<th>잎</th><th>그중 숲길</th><th>다섯 빛깔 5</th><th>합계</th></tr>')
    for i in range(1, 5):
        P.append(f'<tr><td>{i}</td>' + '<td class="tall"></td>' * 6 + "</tr>")
    P.append("</table>")

    P.append('<h2 style="margin-top:16px">관찰 기록</h2>'
             '<p class="hint">'
             '· 방문 단계에서 실제로 나온 말과 표정을 적는다. 다섯 계절 중 세 번 이상 '
             '남의 숲을 들여다보거나 방문 선택에 반응했는가?<br>'
             '· 한 사람 때문에 나머지가 기다린 구간이 20초를 넘은 적이 있는가?<br>'
             '· 두 번째 pick부터 설명 없이 스스로 골라 놓았는가?<br>'
             '· 머물기와 산책 중 한쪽만 계속 나왔다면 몇 계절째부터였는가?</p>')
    P.append('<div style="border:1px solid #888;height:70mm;margin-top:6px"></div>')
    P.append("</div>")

    P.append("</body></html>")
    html = "".join(P)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path, len(cards)
