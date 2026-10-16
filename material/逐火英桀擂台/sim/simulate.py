# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 赛博斗蛐蛐 —— 蒙特卡洛胜率矩阵（阶段 5）

用法：
  python sim/simulate.py [--games N] [--tag NAME] [--quick]

  --games N   每对对局数（默认 2000 快扫；验收轮用 100000）
  --tag NAME  输出标签（写入 04_平衡报告.md 的轮次名，默认 quick）
  --quick     等价 --games 2000 --tag quick

产出：
  data/win_matrix.csv      13×13 胜率矩阵（行视角 = 行角色对列角色的胜率，%）
  04_平衡报告.md           追加一轮记录（总胜率排行 + 违带清单 + 调参建议）

平衡验收线（01_角色设计.md 第五节）：
  每人总胜率 40%~60%；不存在 <15% 或 >85% 的单线
种子固定：BASE_SEED + pair_index × 1_000_000（可复现）
"""
import argparse
import io
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_SEED = 20261015


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=2000)
    ap.add_argument("--tag", type=str, default=None)
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()
    if args.quick:
        args.games, args.tag = 2000, "quick"
    if args.tag is None:
        args.tag = f"n{args.games}"
    N = args.games

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    heroes, _, _ = battle.load_heroes()
    keys = [h["key"] for h in heroes]
    name = {h["key"]: h["name"] for h in heroes}
    rank = {h["key"]: h["rank"] for h in heroes}
    by = {h["key"]: h for h in heroes}

    pairs = []
    for i in range(13):
        for j in range(i + 1, 13):
            pairs.append((keys[i], keys[j]))

    t0 = time.time()
    # win[a][b] = a 对 b 胜局数（含平局 0.5）
    win = {a: {b: 0.0 for b in keys} for a in keys}
    total = {a: {b: 0 for b in keys} for a in keys}
    draws = 0
    for pi, (a, b) in enumerate(pairs):
        seed0 = BASE_SEED + pi * 1_000_000
        for g in range(N):
            # 交替左右位（消除任何位置偏差）
            if (g % 2) == 0:
                ha, hb = by[a], by[b]
            else:
                ha, hb = by[b], by[a]
            w, _t = battle.fight(ha, hb, seed=seed0 + g)
            total[a][b] += 1
            total[b][a] += 1
            if w is None:
                win[a][b] += 0.5
                win[b][a] += 0.5
                draws += 1
            elif w == a:
                win[a][b] += 1
            else:
                win[b][a] += 1
    dt = time.time() - t0

    # 矩阵 CSV
    mp = os.path.join(BASE, "data", "win_matrix.csv")
    with io.open(mp, "w", encoding="utf-8-sig", newline="") as f:
        f.write("\ufeff" if False else "")
        f.write("attacker,")
        f.write(",".join(name[k] for k in keys) + ",总胜率%\n")
        for a in keys:
            row = [f"{100.0 * win[a][b] / total[a][b]:.1f}" if a != b else "—" for b in keys]
            agg = sum(win[a][b] for b in keys if b != a) / (N * 12)
            row.append(f"{100.0 * agg:.1f}")
            f.write(name[a] + "," + ",".join(row) + "\n")

    # 总胜率与违带
    agg = {a: sum(win[a][b] for b in keys if b != a) / (N * 12) for a in keys}
    order = sorted(keys, key=lambda a: -agg[a])
    band_bad = [a for a in keys if not (0.40 <= agg[a] <= 0.60)]
    line_bad = []
    for a in keys:
        for b in keys:
            if a == b:
                continue
            r = win[a][b] / total[a][b]
            if r < 0.15 or r > 0.85:
                line_bad.append((a, b, r))

    # 报告追加
    rp = os.path.join(BASE, "04_平衡报告.md")
    if not os.path.exists(rp):
        with io.open(rp, "w", encoding="utf-8") as f:
            f.write("# 逐火十三英桀 · 赛博斗蛐蜩 —— 平衡报告\n\n"
                    "> 阶段 5 交付。每轮 = 一次蒙特卡洛（78 对 × N 局）+ 违带分析 + 调参记录。\n"
                    "> 验收线：每人总胜率 40%~60%；无 <15%/>85% 单线（`01_角色设计.md` 第五节）。\n\n")
    with io.open(rp, "a", encoding="utf-8") as f:
        f.write(f"\n---\n\n## 轮次：{args.tag}（{N:,} 局/对 · 78 对 · 共 {78 * N:,} 局 · {dt:.0f}s · 平局 {draws}）\n\n")
        f.write("### 总胜率排行\n\n| # | 角色 | 位次 | 总胜率 | 带内? |\n|---|---|---|---|---|\n")
        for i, a in enumerate(order, 1):
            ok = "✅" if 0.40 <= agg[a] <= 0.60 else "❌"
            f.write(f"| {i} | {name[a]} | {rank[a]} | {100.0 * agg[a]:.1f}% | {ok} |\n")
        f.write(f"\n### 违带总览\n\n- 出带角色（{len(band_bad)} 个）："
                + ("、".join(f"{name[a]} {100.0 * agg[a]:.1f}%" for a in band_bad) if band_bad else "**无** ✅")
                + "\n- 极端单线（<15% 或 >85%，共 " + str(len(line_bad)) + " 条）："
                + ("、".join(f"{name[a]}→{name[b]} {100.0 * r:.0f}%" for a, b, r in line_bad[:20]) if line_bad else "**无** ✅")
                + "\n\n")
        f.write("### 13×13 胜率矩阵（行视角，%）\n\n")
        f.write("| 攻\\守 | " + " | ".join(name[k] for k in keys) + " | 总 |\n")
        f.write("|" + "---|" * 15 + "\n")
        for a in keys:
            cells = ["—" if a == b else f"{100.0 * win[a][b] / total[a][b]:.0f}" for b in keys]
            f.write(f"| **{name[a]}** | " + " | ".join(cells) + f" | **{100.0 * agg[a]:.1f}** |\n")

    print(f"GAMES={N} PAIRS=78 TOTAL={78 * N} TIME={dt:.0f}s DRAWS={draws}")
    print("BAND_BAD=" + (",".join(name[a] for a in band_bad) if band_bad else "NONE"))
    print("LINE_BAD=" + (",".join(f"{a}>{b}" for a, b, _ in line_bad[:10]) if line_bad else "NONE"))
    for a in order:
        print(f"  {name[a]}: {100.0 * agg[a]:.1f}%")


if __name__ == "__main__":
    main()
