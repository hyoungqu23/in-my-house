"""Search candidates without changing the frozen v1 audit or raw results."""
import argparse
from dataclasses import replace, asdict
import hashlib
import json
from pathlib import Path
import time

from goblin_market_v2 import Rules, experiment
from goblin_market_report import simultaneous_gap


def bonuses(name, n):
    if name == "linear":
        return tuple(range(n))
    if name == "mild":
        return (0, 1, 1) if n == 3 else (0, 1, 1, 2)
    if name == "half":
        return tuple(p // 2 for p in range(n))
    if name == "double":
        return tuple(p * 2 for p in range(n))
    return ()


def candidates(n):
    settings = [("rotate", b, False) for b in ("none", "half", "mild", "linear", "double")]
    settings += [(o, b, grace) for o in ("snake", "shuffle") for b in ("none", "linear") for grace in (False, True)]
    settings += [("rotate", b, True) for b in ("none", "mild", "linear")]
    for order, bonus, grace in settings:
        for premium in (0, 1):
            for cashback in (0, 1):
                name = f"{order}-{bonus}-grace{int(grace)}-premium{premium}-cashback{cashback}"
                yield name, replace(Rules(), order_mode=order, seat_bonus=bonuses(bonus, n),
                                    opening_grace=grace, quiet_premium=premium, starter_quiet_bonus=cashback,
                                    protect_last=True, batch_draw=True, market_fallback=True)
    yield "shuffle-four-gates-grace1-flat", replace(Rules(), order_mode="shuffle", start_mode="four_gates",
        opening_grace=True, protect_last=True, batch_draw=True, market_fallback=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--stage", choices=("screen", "refine", "holdout"), required=True)
    p.add_argument("--runs", type=int, default=1000)
    p.add_argument("--ids", default="")
    p.add_argument("--policies", default="balanced")
    p.add_argument("--seed", type=int)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    root = Path(__file__).resolve().parents[1]
    paths = [Path(__file__), root / "scripts/goblin_market_v2.py"]
    out = {"stage": args.stage, "date": "2026-10-26", "engineSha256": hashlib.sha256(paths[1].read_bytes()).hexdigest(),
           "runnerSha256": hashlib.sha256(paths[0].read_bytes()).hexdigest(), "experiments": []}
    started = time.monotonic()
    ids = set(args.ids.split(",")) if args.ids else None
    for n in (3, 4):
        for name, rules in candidates(n):
            if ids and name not in ids:
                continue
            for policy in args.policies.split(","):
                if policy.startswith("invade:"):
                    _, challenger, resident = policy.split(":")
                    cohort = [challenger] + [resident] * (n - 1)
                else:
                    cohort = policy.split("+")
                seed = args.seed if args.seed is not None else {"screen": 3100000, "refine": 4200000, "holdout": 5700000}[args.stage]
                r = experiment(name + "/" + policy + f"/{n}", n, args.runs, seed + n * 100000, cohort, rules)
                r["candidateId"] = name
                r["seatGap"] = simultaneous_gap(r["seatWin"])
                r["starterGap"] = simultaneous_gap(list(r["starterWin"].values()))
                out["experiments"].append(r)
                out["elapsedSeconds"] = time.monotonic() - started
                Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
                print(json.dumps({"id": name, "n": n, "policy": policy,
                                  "seatGap": round(r["seatGap"]["gap"] * 100, 2),
                                  "starterGap": round(r["starterGap"]["gap"] * 100, 2),
                                  "seconds": round(out["elapsedSeconds"], 1)}), flush=True)


if __name__ == "__main__":
    main()
