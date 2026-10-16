# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 赛博斗蛐蛐 —— 回放数据导出器

用法：python sim/gen_replays.py [--seed-base 20261015]

产出 data/replays.json：全部 91 场的完整战斗脚本（原始日志行 + 结构化事件），
前端直接消费，**无需集成 Python 引擎**。

★ 种子约定（与 sim/economy.py 完全一致）：
      match_seed = SEED_BASE * 1000 + match_id      （SEED_BASE 默认 20261015）
  网站结算用的胜者必须与 replays.json 的 winner 一致——
  若网站另行演算，必须用同一约定，否则"回放"与"结算"会对不上（致命 bug）。
"""
import argparse
import csv
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RE_CAST = re.compile(r"^◆ (.+?) 释放主动【(.+?)】$")
RE_HIT = re.compile(r"^([^()]+?)\(([\d.]+)\)\s+(\S+)\s+([^()]+?)\(([\d.]+)\)\s*→\s*([\d.]+)(〔暴击〕)?$")
RE_EFFECT = re.compile(r"^  ↳ (.+)$")
RE_CRIT = re.compile(r"^  ✦ 会心一击！$")
RE_STUN = re.compile(r"^  (.+?) 眩晕，跳过行动$")


def parse_line(ln):
    """把一条战斗日志行解析为结构化事件（解析失败则回退为纯文本事件）"""
    m = RE_CAST.match(ln)
    if m:
        return {"type": "cast", "actor": m.group(1), "skill": m.group(2), "line": ln}
    m = RE_HIT.match(ln)
    if m:
        return {"type": "hit", "actor": m.group(1), "actor_hp": float(m.group(2)),
                "action": m.group(3), "target": m.group(4), "target_hp": float(m.group(5)),
                "damage": float(m.group(6)),
                "crit": (m.group(7) is not None),        # 苏的被动暴击带〔暴击〕后缀
                "line": ln}
    if RE_CRIT.match(ln):
        return {"type": "crit", "line": ln}
    m = RE_EFFECT.match(ln)
    if m:
        return {"type": "effect", "text": m.group(1), "line": ln}
    m = RE_STUN.match(ln)
    if m:
        return {"type": "stun", "actor": m.group(1), "line": ln}
    return {"type": "text", "line": ln}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-base", type=int, default=20261015)
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    heroes, _, _ = battle.load_heroes()
    by_key = {h["key"]: h for h in heroes}
    by_name = {h["name"]: h for h in heroes}
    sched = list(csv.DictReader(io.open(os.path.join(BASE, "data", "schedule.csv"), encoding="utf-8-sig")))
    rates = json.load(io.open(os.path.join(BASE, "data", "rates.json"), encoding="utf-8"))["pairs"]

    matches = []
    for m in sched:
        L, R = m["left"], m["right"]           # key
        ln_, rn_ = m["left_name"], m["right_name"]
        seed = args.seed_base * 1000 + int(m["match_id"])
        w, turns, log = battle.fight(by_key[L], by_key[R], seed=seed, verbose=True)

        # 结构化事件；全局会心标记（✦）出现在命中行**之前**，前向回填到下一个 hit
        events = [parse_line(x) for x in log]
        pend = False
        for e in events:
            if e["type"] == "crit":
                pend = True
                continue
            if e["type"] == "hit" and pend:
                e["crit"] = True
                pend = False

        # 基础赔率（rates.json 的 key 顺序不可假设，两种顺序都查）
        pr = rates.get(f"{ln_}|{rn_}") or rates.get(f"{rn_}|{ln_}")
        same = pr["a"] == ln_

        matches.append({
            "match_id": int(m["match_id"]),
            "day": int(m["day"]),
            "time": m["time"],
            "tag": m["tag"],
            "left": {"key": L, "name": ln_},
            "right": {"key": R, "name": rn_},
            "winner": (by_key[w]["name"] if w else None),
            "draw": w is None,
            "turns": turns,
            "p_left": pr["p_a"] if same else pr["p_b"],
            "p_right": pr["p_b"] if same else pr["p_a"],
            "left_odds": pr["odds_a"] if same else pr["odds_b"],
            "right_odds": pr["odds_b"] if same else pr["odds_a"],
            "log": log,
            "events": events,
        })

    out = {
        "meta": {
            "version": "v1.0",
            "seed_base": args.seed_base,
            "seed_formula": "match_seed = seed_base * 1000 + match_id",
            "warning": "网站结算使用的胜者必须与本文件 winner 一致（同种子约定）；"
                       "结算赔付只按投注池公式，与本文件的 odds（基础赔率）无关",
            "source": "sim/battle.py（v6.7 平衡终版引擎）",
        },
        "matches": matches,
    }
    path = os.path.join(BASE, "data", "replays.json")
    io.open(path, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
    draws = sum(1 for x in matches if x["draw"])
    n_ev = sum(len(x["events"]) for x in matches)
    unparsed = sum(1 for x in matches for e in x["events"] if e["type"] == "text")
    print(f"REPLAYS=91 DRAWS={draws} EVENTS={n_ev} 未解析行={unparsed}（应为 0）")
    print(f"输出: {path}  ({os.path.getsize(path)/1024:.0f} KB)")
    print("样例事件（第 1 场前 6 条）:")
    for e in matches[0]["events"][:6]:
        print("  ", json.dumps(e, ensure_ascii=False)[:110])


if __name__ == "__main__":
    main()
