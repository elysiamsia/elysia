# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 赛博斗蛐蛐 —— 赛程生成与校验器（阶段 3 交付）

产出：
  data/schedule.csv   91 场赛程（D1~D22 每天 4 场 + D23 3 场）
  02_赛程表.md        人类可读版（含校验结果）

硬约束（全部自动校验，见文末 CHECKS）：
  C1 总场次 = 91（= 22 天 × 4 场 + 第 23 天 3 场）
  C2 每人出场 = 14 战（= 与其他 12 人各交手 1 场 + 2 场复赛）
  C3 同一天内同一人不得出现两次
  C4 D1~D22 每天 4 场，D23 3 场
  C5 任意对阵最多出现 2 次；恰好 13 对出现 2 次（复赛）
  C6 末日三场为羁绊战：伊甸vs梅比乌斯 / 千劫vs帕朵 / 爱莉希雅vs凯文（首战须在 D1~D22 内）

结构设计：
  · 首循环 78 场：13 人轮转法（circle method），每轮 6 场、1 人轮空
  · 复赛 13 场：13 人构成"每节点度=2"的图 = 3 条羁绊边 + 3 条配对边 + 7 人环
  · 装填：均匀贪心（优先安排累计出场次数少的人），失败自动重启换种子
  · 可复现：固定基础种子 20261015，成功种子写进输出

运行：python sim/gen_schedule.py
"""
import csv
import io
import json
import os
import random
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

# ---------------------------------------------------------------- 角色
HEROES = [
    ("kevin",    "凯文·卡斯兰娜", 1),
    ("elysia",   "爱莉希雅",     2),
    ("aponia",   "阿波尼亚",     3),
    ("eden",     "伊甸",         4),
    ("villv",    "维尔薇",       5),
    ("qianjie",  "千劫",         6),
    ("su",       "苏",           7),
    ("sakura",   "樱",           8),
    ("kosma",    "科斯魔",       9),
    ("mobius",   "梅比乌斯",    10),
    ("griseo",   "格蕾修",      11),
    ("hua",      "华",          12),
    ("pardo",    "帕朵菲莉丝",  13),
]
KEYS  = [h[0] for h in HEROES]
NAME  = {h[0]: h[1] for h in HEROES}
RANK  = {h[0]: h[2] for h in HEROES}
ROMAN = {1:"Ⅰ",2:"Ⅱ",3:"Ⅲ",4:"Ⅳ",5:"Ⅴ",6:"Ⅵ",7:"Ⅶ",8:"Ⅷ",9:"Ⅸ",10:"Ⅹ",11:"Ⅺ",12:"Ⅻ",13:"ⅩⅢ"}

# ---------------------------------------------------------------- 羁绊标签
TAGS = {
    frozenset({"elysia", "kevin"}):   "真我×救世 · 逐火双柱",
    frozenset({"eden", "mobius"}):    "黄金庭院 · 主人之战",
    frozenset({"qianjie", "pardo"}):  "挚友之战",
    frozenset({"aponia", "pardo"}):   "戒食之约",
    frozenset({"elysia", "qianjie"}): "真我×鏖灭",
    frozenset({"su", "kosma"}):       "洞观×守望",
    frozenset({"eden", "kevin"}):     "黄金×救世",
    frozenset({"mobius", "pardo"}):   "噬界之蛇与猫",
}

# ---------------------------------------------------------------- 首循环：轮转法 78 场
def first_cycle():
    """13 人 + 1 个轮空位 = 14 槽 circle method → 13 轮 × 6 场 = 78 场"""
    arr = KEYS[:] + [None]           # 14 槽
    rounds = []
    for _ in range(13):
        pairs = []
        for i in range(7):
            a, b = arr[i], arr[13 - i]
            if a is not None and b is not None:
                pairs.append(tuple(sorted((a, b), key=lambda k: RANK[k])))
        rounds.append(pairs)
        arr = [arr[0]] + arr[-1:] + arr[1:-1]   # 固定首位，其余轮转
    flat = [m for rnd in rounds for m in rnd]
    assert len(flat) == 78, f"首循环应为 78 场，实际 {len(flat)}"
    return flat

# ---------------------------------------------------------------- 复赛：13 场（每节点度=2）
FINAL_DAY = [frozenset({"eden", "mobius"}),
             frozenset({"qianjie", "pardo"}),
             frozenset({"elysia", "kevin"})]
REMATCH_EXTRA = [frozenset({"eden", "kevin"}),
                 frozenset({"mobius", "pardo"}),
                 frozenset({"qianjie", "elysia"})]
REMATCH_RING7 = [frozenset({"aponia", "villv"}), frozenset({"villv", "su"}),
                 frozenset({"su", "sakura"}),     frozenset({"sakura", "kosma"}),
                 frozenset({"kosma", "griseo"}),  frozenset({"griseo", "hua"}),
                 frozenset({"hua", "aponia"})]

def build_rematches():
    edges = FINAL_DAY + REMATCH_EXTRA + REMATCH_RING7
    assert len(edges) == 13, f"复赛应为 13 场，实际 {len(edges)}"
    deg = {k: 0 for k in KEYS}
    for e in edges:
        for k in e:
            deg[k] += 1
    assert all(d == 2 for d in deg.values()), f"每人复赛度应为 2：{deg}"
    return edges

# ---------------------------------------------------------------- 装填：22 天 × 4 场
SLOTS4 = ["12:00", "14:00", "17:00", "20:00"]
SLOTS3 = ["14:00", "17:00", "20:00"]   # D23：戏剧性递增，压轴 20:00

def fs_pair(a, b):
    return frozenset((a, b))

def load_fill(first, rematch, seed):
    """随机交错装填：每天从随机池顺序挑互不冲突的 4 场。
    （注：不能用"出场次数最少优先"的均匀贪心——它会把 7 人组的场次提前耗尽，
    末期只剩羁绊组 6 人的内部对阵，6 人每天最多凑 3 场 < 4 场，必然死锁。）"""
    rng = random.Random(seed)
    # 装填池 = 78 场首循环 + 复赛中"非末日"的 10 场 = 88 场，恰好装满 22 天 × 4
    # （末日 3 场固定保留给 D23，绝不进入装填池——否则 91 场塞 88 个位置必然死锁）
    rematch_pool = [e for e in rematch if e not in FINAL_DAY]
    remaining = [fs_pair(a, b) for (a, b) in first] + rematch_pool
    assert len(remaining) == 88, f"装填池应为 88 场，实际 {len(remaining)}"
    days = {}
    for day in range(1, 23):
        used = set()
        picks = []
        pool = remaining[:]
        rng.shuffle(pool)
        for cand in pool:
            if len(picks) == 4:
                break
            if cand & used:
                continue
            picks.append(cand)
            used |= cand
        if len(picks) < 4:
            return None
        for p in picks:
            remaining.remove(p)
        days[day] = picks
    if remaining:                       # 88 场应恰好装满 22 天
        return None
    days[23] = FINAL_DAY[:]            # 末日三场（顺序固定：递进压轴）
    return days

def build(seed_base=20261015, max_try=2000):
    first = first_cycle()
    rematch = build_rematches()
    for attempt in range(max_try):
        days = load_fill(first, rematch, seed_base + attempt)
        if days:
            return days, seed_base + attempt
    raise RuntimeError("装填失败：请增大 max_try 或检查约束")

# ---------------------------------------------------------------- 输出
def flatten(days):
    rows = []
    mid = 0
    for day in range(1, 24):
        slots = SLOTS4 if day <= 22 else SLOTS3
        for slot, pair in zip(slots, days[day]):
            a, b = sorted(pair, key=lambda k: RANK[k])   # 位次小者在左
            mid += 1
            rows.append({
                "match_id": mid, "day": day, "time": slot,
                "left": a, "right": b,
                "left_name": NAME[a], "right_name": NAME[b],
                "tag": TAGS.get(pair, ""),
            })
    return rows

def check(rows):
    """六条硬约束校验，返回 (是否全过, 消息列表)"""
    msgs = []
    ok = True
    def fail(c, msg):
        nonlocal ok
        ok = False
        msgs.append(f"❌ {c} {msg}")
    def pass_(c, msg):
        msgs.append(f"✅ {c} {msg}")

    if len(rows) == 91:
        pass_("C1", f"总场次 = {len(rows)}")
    else:
        fail("C1", f"总场次 {len(rows)} ≠ 91")

    cnt = {k: 0 for k in KEYS}
    for r in rows:
        cnt[r["left"]] += 1
        cnt[r["right"]] += 1
    if all(c == 14 for c in cnt.values()):
        pass_("C2", "每人出场 = 14 战（全员一致）")
    else:
        fail("C2", f"出场数异常：{ {NAME[k]: v for k, v in cnt.items() if v != 14} }")

    byday = {}
    for r in rows:
        byday.setdefault(r["day"], []).append(r)
    bad = []
    for d, rs in byday.items():
        seen = [x for r in rs for x in (r["left"], r["right"])]
        if len(seen) != len(set(seen)):
            bad.append(d)
    if not bad:
        pass_("C3", "同一天内无人重复出场（23 天全检）")
    else:
        fail("C3", f"重复日：{bad}")

    shape_ok = all(len(byday.get(d, [])) == 4 for d in range(1, 23)) and len(byday.get(23, [])) == 3
    if shape_ok:
        pass_("C4", "D1~D22 每天 4 场，D23 3 场")
    else:
        fail("C4", "每日场次形状不对")

    from collections import Counter
    pc = Counter(frozenset((r["left"], r["right"])) for r in rows)
    if max(pc.values()) == 2 and sum(1 for v in pc.values() if v == 2) == 13 and len(pc) == 78:
        pass_("C5", f"78 种对阵全出现；恰好 {sum(1 for v in pc.values() if v == 2)} 对二番战，无三番")
    else:
        fail("C5", f"对阵分布异常：{dict(pc)}")

    d23 = [frozenset((r["left"], r["right"])) for r in byday.get(23, [])]
    d23_first_seen = []
    for p in FINAL_DAY:
        first_day = next((r["day"] for r in rows
                         if frozenset((r["left"], r["right"])) == p and r["day"] != 23), None)
        d23_first_seen.append(first_day)
    if all(p in d23 for p in FINAL_DAY) and all(fd and fd <= 22 for fd in d23_first_seen):
        pass_("C6", "末日三场 = 羁绊战，且三对首战均在 D1~D22 完成（末日为二番战）")
    else:
        fail("C6", f"末日对阵或首战排布异常：{d23_first_seen}")
    return ok, msgs

def write_csv(rows):
    p = os.path.join(DATA, "schedule.csv")
    with io.open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["match_id", "day", "time", "left", "right", "left_name", "right_name", "tag"])
        for r in rows:
            w.writerow([r["match_id"], r["day"], r["time"], r["left"], r["right"],
                        r["left_name"], r["right_name"], r["tag"]])
    return p

def write_md(rows, ok, msgs, seed):
    byday = {}
    for r in rows:
        byday.setdefault(r["day"], []).append(r)
    L = []
    L.append("# 逐火十三英桀 · 赛博斗蛐蛐 —— 赛程表")
    L.append("")
    L.append("> 阶段 3 交付。生成器：`sim/gen_schedule.py`（种子 %d，可复现）。上游：`00_需求与工作计划.md`。" % seed)
    L.append("> 日期为「第 N 天」相对编排（23 天一轮回，起始日期由运营方锚定）；时段参考官方活动口径（每天 12:00 / 14:00 / 17:00 / 20:00）。")
    L.append("")
    L.append("## 结构")
    L.append("")
    L.append("- **91 场** = 首循环 78 场（13 人轮转法，每人与其他 12 人各交手 1 次）+ **复赛 13 场**（每人再加 2 战 → 每人合计 **14 战**）")
    L.append("- **D1~D22 每天 4 场**（当天出场 8 人、5 人轮空），**D23 压轴 3 场**")
    L.append("- 复赛图 = 3 条羁绊边（末日）+ 3 条配对边 + 7 人环，恰好构成每人度 2")
    L.append("- 对阵左侧 = 位次小者（展示习惯）；**战斗先手由速度决定**（见 `01_角色设计.md` 骨架），与左右无关")
    L.append("")
    L.append("## 校验结果")
    L.append("")
    L.append("```")
    L.extend(msgs)
    L.append("```")
    L.append("")
    L.append("## 逐日赛程")
    L.append("")
    for day in range(1, 24):
        rs = byday[day]
        head = "### 第 23 天 · 压轴日（3 场）" if day == 23 else f"### 第 {day} 天"
        L.append(f"\n{head}\n")
        L.append("| # | 时段 | 对阵 | 看点 |")
        L.append("|---|---|---|---|")
        for r in rs:
            vs = f"{r['left_name']}({ROMAN[RANK[r['left']]]}) vs {r['right_name']}({ROMAN[RANK[r['right']]]})"
            tag = r["tag"] if r["tag"] else ""
            if day == 23:
                tag = ("⭐ " + tag) if tag else ""
            L.append(f"| {r['match_id']:02d} | {r['time']} | {vs} | {tag} |")
    L.append("")
    L.append("## 复赛（二番战）清单")
    L.append("")
    L.append("| 组 | 复赛对阵 | 说明 |")
    L.append("|---|---|---|")
    L.append("| 末日羁绊 | 伊甸 vs 梅比乌斯 / 千劫 vs 帕朵菲莉丝 / 爱莉希雅 vs 凯文 | 压轴三连 |")
    L.append("| 配对 | 伊甸 vs 凯文 / 梅比乌斯 vs 帕朵菲莉丝 / 千劫 vs 爱莉希雅 | 与羁绊边互补 |")
    L.append("| 七人环 | 阿波尼亚→维尔薇→苏→樱→科斯魔→格蕾修→华→阿波尼亚 | 每人两场 |")
    L.append("")
    p = os.path.join(BASE, "02_赛程表.md")
    with io.open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    return p

def main():
    days, seed = build()
    rows = flatten(days)
    ok, msgs = check(rows)
    csv_p = write_csv(rows)
    md_p = write_md(rows, ok, msgs, seed)
    print("SEED:", seed)
    print("ROWS:", len(rows))
    print("CSV :", csv_p)
    print("MD  :", md_p)
    print("CHECKS:", "ALL PASSED" if ok else "FAILED")
    if not ok:
        for m in msgs:
            print(" ", m)
        sys.exit(1)

if __name__ == "__main__":
    main()
