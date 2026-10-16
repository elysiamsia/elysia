# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 对局失衡分布报告器（B 方案专用）

用法：python sim/gap_report.py

读取 data/win_matrix.csv，输出：
  · 78 组唯一对局的「低方胜率」分布（40~60 / 30~40 / 20~30 / 10~20 / <10）
  · B 方案目标达成度：≥60 组落入 40~60，全部 ≥30
  · 最失衡的 15 组清单

B 方案目标（主人 2026-10-15 拍板）：
  消除碾压局、保留机制个性 —— 尽可能多的对局落入 40~60%，最差不超过 30/70。
"""
import csv
import io
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_pairs():
    p = os.path.join(BASE, "data", "win_matrix.csv")
    rows = list(csv.reader(io.open(p, encoding="utf-8-sig")))
    names = rows[0][1:14]
    m = {}
    for r in rows[1:]:
        a = r[0]
        for i, c in enumerate(r[1:14]):
            if c != "—":
                m[(a, names[i])] = float(c)
    pairs = []
    seen = set()
    for a in names:
        for b in names:
            if a == b or (b, a) in seen:
                continue
            seen.add((a, b))
            lo, hi = sorted((m[(a, b)], m[(b, a)]))
            pairs.append((lo, hi, a, b))
    return pairs


def main():
    pairs = load_pairs()
    n = len(pairs)
    bands = {"40~60（达标）": 0, "30~40（轻度）": 0, "20~30（中度）": 0,
             "10~20（硬克制）": 0, "<10（碾压）": 0}
    for lo, hi, a, b in pairs:
        if lo >= 40:
            bands["40~60（达标）"] += 1
        elif lo >= 30:
            bands["30~40（轻度）"] += 1
        elif lo >= 20:
            bands["20~30（中度）"] += 1
        elif lo >= 10:
            bands["10~20（硬克制）"] += 1
        else:
            bands["<10（碾压）"] += 1

    ok = bands["40~60（达标）"]
    print(f"唯一对局 {n} 组")
    for k, v in bands.items():
        bar = "█" * v
        print(f"  {k:14s} {v:3d}  {bar}")
    print()
    print(f"B 方案目标：≥60 组落入 40~60    实际 {ok} 组    {'✅ 达成' if ok >= 60 else '❌ 未达成'}")
    worst = min(lo for lo, _, _, _ in pairs)
    print(f"最差对局下限：≥30%（无 30/70 以上失衡）  实际 {worst:.1f}%   {'✅ 达成' if worst >= 30 else '❌ 未达成'}")
    print()
    print("最失衡 15 组：")
    for lo, hi, a, b in sorted(pairs)[:15]:
        print(f"  {a:12s} vs {b:12s}  {hi:5.1f}% : {lo:5.1f}%")


if __name__ == "__main__":
    main()
