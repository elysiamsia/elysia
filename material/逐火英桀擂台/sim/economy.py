# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 赛博斗蛐蛐 —— 经济与赔率赛季模拟器（阶段 6 核心验证）

用法：
    python sim/economy.py [--players 200] [--seed 20261015]

它做什么：
    1. 读 characters.json / schedule.csv / rates.json / economy.json
    2. 造 N 名风格不同的模拟玩家（追热门/搏冷门/随机/价值派/骑墙派）
    3. 按赛程跑完 23 天 91 场：每日签到 → 下注 → **用真实战斗引擎打这一场** → 按池式结算
    4. 输出：每日金币总量 / 抽水销毁 / 签到产出 / 破产人数 / 场均池规模

验证目标（阶段 6 验收线）：
    · 金币不会恶性通胀（总量增长可解释、抽水确实在销毁）
    · 玩家不会集体破产（大多数玩家能撑满赛季）
    · 池式计算正确：每场的派彩总额 = 池 × (1 − 抽水)，系统永远不亏空

产出：
    data/economy_sim.csv    每日经济指标
    （控制台打印摘要）
"""
import argparse
import csv
import io
import json
import os
import math
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import battle

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_all():
    heroes, _, _ = battle.load_heroes()
    by = {h["name"]: h for h in heroes}
    sched = list(csv.DictReader(io.open(os.path.join(BASE, "data", "schedule.csv"), encoding="utf-8-sig")))
    rates = json.load(io.open(os.path.join(BASE, "data", "rates.json"), encoding="utf-8"))
    econ = json.load(io.open(os.path.join(BASE, "data", "economy.json"), encoding="utf-8"))
    return by, sched, rates, econ


def rake_for(pool, econ):
    for tier in econ["rake"]["schedule"]:
        if tier["pool_lt"] is None or pool < tier["pool_lt"]:
            return tier["rate"]
    return econ["rake"]["schedule"][-1]["rate"]


class Player:
    """模拟玩家：策略决定下注方向与仓位"""
    STRATS = ("favorite", "underdog", "random", "value", "balanced")

    def __init__(self, pid, strat, rng):
        self.id = pid
        self.strat = strat
        self.rng = rng
        self.coins = 0
        self.streak = 0
        self.bet_vol = 0
        self.won = 0
        self.lost = 0
        self.matches = 0          # 参与场次（上榜资格）
        self.exp_wins = 0.0       # 期望命中次数（按各场所押方向的市场胜率累加）
        self.var_sum = 0.0        # Σp(1−p)，用于算显著性
        self.signin_total = 0     # 累计签到所得（用于算净收益）

    def sign_in(self, econ):
        c = econ["coin"]
        self.streak += 1
        bonus = c["streak_bonus_per_day"] * min(self.streak, c["streak_bonus_cap_days"])
        got = c["signin_base"] + bonus
        self.coins += got
        self.signin_total += got
        return got

    def pick_side(self, left, right, p_left, odds_left, odds_right):
        """返回 'left' / 'right' / None（不下注）"""
        s = self.strat
        if s == "favorite":
            return "left" if p_left >= 0.5 else "right"
        if s == "underdog":
            return "left" if p_left < 0.5 else "right"
        if s == "random":
            return self.rng.choice(("left", "right"))
        if s == "value":
            ev_l = p_left * odds_left
            ev_r = (1 - p_left) * odds_right
            if max(ev_l, ev_r) < 1.02:
                return None                      # 无价值就不下
            return "left" if ev_l >= ev_r else "right"
        # balanced：追逐更高的基础赔率（但要有一点点胜率兜底）
        return "left" if odds_left >= odds_right else "right"

    def stake(self, econ):
        """仓位：按金币的固定比例，向下取整到百位，且不低于下限"""
        lo = econ["bet"]["min"]
        if self.coins < lo:
            return 0
        frac = {"favorite": 0.15, "underdog": 0.08, "random": 0.10,
                "value": 0.20, "balanced": 0.12}[self.strat]
        s = int(self.coins * frac // 100 * 100)
        s = max(lo, min(s, int(self.coins // 100 * 100)))
        return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20261015)
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    by, sched, rates, econ = load_all()
    pairs = rates["pairs"]
    rng = random.Random(args.seed)

    # 造玩家：五种风格平均分布
    players = []
    for i in range(args.players):
        players.append(Player(i, Player.STRATS[i % len(Player.STRATS)], random.Random(args.seed + i)))

    by_day = {}
    for m in sched:
        by_day.setdefault(int(m["day"]), []).append(m)

    daily = []
    total_rake = 0.0
    total_created = 0.0
    total_staked = 0.0
    total_paid = 0.0
    total_unclaimed = 0.0
    total_destroyed = 0.0
    draws = 0

    for day in range(1, 24):
        created = sum(p.sign_in(econ) for p in players)
        total_created += created
        day_stake = 0.0
        day_rake = 0.0

        for m in by_day.get(day, []):
            L, R = m["left_name"], m["right_name"]
            key = f"{L}|{R}" if f"{L}|{R}" in pairs else f"{R}|{L}"
            pr = pairs[key]
            same = (pr["a"] == L)
            p_left = pr["p_a"] if same else pr["p_b"]
            odds_left = pr["odds_a"] if same else pr["odds_b"]
            odds_right = pr["odds_b"] if same else pr["odds_a"]

            # 下注
            bets = {"left": [], "right": []}
            for p in players:
                side = p.pick_side(L, R, p_left, odds_left, odds_right)
                if side is None:
                    continue
                s = p.stake(econ)
                if s <= 0:
                    continue
                p.coins -= s
                p.matches += 1
                bets[side].append((p, s))
            pool_l = sum(s for _, s in bets["left"])
            pool_r = sum(s for _, s in bets["right"])
            pool = pool_l + pool_r
            day_stake += pool
            if pool == 0:
                continue

            # 战斗（真实引擎）
            w, _turns = battle.fight(by[L], by[R], seed=args.seed * 1000 + int(m["match_id"]))
            rate = rake_for(pool, econ)

            if w is None:                        # 平局 → 全额退本金（不抽水）
                draws += 1
                for side in ("left", "right"):
                    for p, s in bets[side]:
                        p.coins += s
                continue

            for _p, _s in bets["left"]:
                _p.exp_wins += p_left
                _p.var_sum += p_left * (1 - p_left)
            for _p, _s in bets["right"]:
                _p.exp_wins += (1 - p_left)
                _p.var_sum += p_left * (1 - p_left)
            win_side = "left" if w == by[L]["key"] else "right"
            win_pool = pool_l if win_side == "left" else pool_r
            lose_pool = pool_r if win_side == "left" else pool_l
            if win_pool > 0:
                per_coin = pool * (1 - rate) / win_pool
                paid = 0.0
                for p, s in bets[win_side]:
                    payout = s * per_coin
                    p.coins += payout
                    paid += payout
                    p.won += 1
                total_paid += paid
                total_destroyed += (pool - paid)      # 实际销毁：池 − 派彩
                day_rake += pool * rate               # 抽水（按池规模档位）
                # 输方
                for p, _s in bets["left" if win_side == "right" else "right"]:
                    p.lost += 1
            else:
                # 无人押中：全池无人领取 → 全额销毁
                total_unclaimed += pool
                total_destroyed += pool

        total_rake += day_rake
        total_staked += day_stake
        supply = sum(p.coins for p in players)
        broke = sum(1 for p in players if p.coins < econ["bet"]["min"])
        daily.append({
            "day": day, "created": round(created, 1), "supply": round(supply, 1),
            "staked": round(day_stake, 1), "rake": round(day_rake, 1),
            "rake_rate": round(day_rake / day_stake, 4) if day_stake else 0,
            "broke": broke,
        })

    out = io.open(os.path.join(BASE, "data", "economy_sim.csv"), "w", encoding="utf-8-sig", newline="")
    w = csv.DictWriter(out, fieldnames=list(daily[0].keys()))
    w.writeheader()
    for row in daily:
        w.writerow(row)
    out.close()

    # ================= 金币持有排行榜 =================
    lb = econ["sinks"]["leaderboard"]
    min_m = lb["qualify"]["min_matches"]
    top_n = lb["top_n"]

    def winrate(p):
        tot = p.won + p.lost
        return (p.won / tot) if tot else 0.0

    qualified = [p for p in players if p.matches >= min_m]
    qualified.sort(key=lambda p: (-p.coins, -p.matches, -winrate(p), p.id))

    lb_out = io.open(os.path.join(BASE, "data", "leaderboard.csv"), "w", encoding="utf-8-sig", newline="")
    lw = csv.writer(lb_out)
    lw.writerow(["rank", "player", "strategy", "coins", "matches", "win_rate", "net_profit"])
    for i, p in enumerate(qualified[:top_n], 1):
        lw.writerow([i, f"{p.strat}#{p.id:03d}", p.strat, round(p.coins, 1), p.matches,
                     f"{winrate(p)*100:.1f}%", round(p.coins - p.signin_total, 1)])
    lb_out.close()

    # 反向对照：纯挂机者（只签到、一注不下）能拿多少
    c = econ["coin"]
    saver_balance = sum(c["signin_base"] + c["streak_bonus_per_day"] * min(d, c["streak_bonus_cap_days"])
                        for d in range(1, 24))
    saver_rank = 1 + sum(1 for p in qualified if p.coins > saver_balance)

    print("")
    print("=" * 62)
    print(f"【金币持有排行榜】资格线：参与场次 ≥ {min_m}    达标 {len(qualified)} / {args.players} 人")
    print(f"  纯挂机者（只签到不下注）余额 = {saver_balance:,.0f}   →  若送上榜将排第 {saver_rank} 名")
    print(f"  榜首 = {qualified[0].strat}#{qualified[0].id:03d}  {qualified[0].coins:,.0f} 金币"
          f"（参与 {qualified[0].matches} 场，命中率 {winrate(qualified[0])*100:.1f}%）")
    print(f"  末位（达标者）= {qualified[-1].coins:,.0f} 金币")
    print(f"  达标者人均 = {sum(p.coins for p in qualified)/len(qualified):,.0f}")
    print("  前 10：")
    for i, p in enumerate(qualified[:10], 1):
        print(f"    {i:>2}. {p.strat:<9s}#{p.id:03d}  {p.coins:>10,.0f} 金币   {p.matches:>3} 场   "
              f"命中 {winrate(p)*100:>5.1f}%   净收益 {p.coins - p.signin_total:>+10,.0f}")
    print(f"  分策略上榜数：" + "  ".join(
        f"{st}={sum(1 for p in qualified if p.strat == st)}" for st in Player.STRATS))
    print("=" * 62)

    # ================= 眼力榜：超额命中显著性 =================
    # 核心指标：你押中的次数，比"市场给你的期望"多多少
    #   z = (实际命中 − 期望命中) / √Σp(1−p)
    # 押 35% 的冷门却赢了一半 → z 显著为正（有眼光）
    # 一路押 60% 的热门赢 61%     → z ≈ 0（只是跟着市场走）
    ab = lb["boards"]["accuracy_board"]
    min_dec = ab["qualify"]["min_decided"]

    def z_of(p):
        if p.var_sum <= 0:
            return 0.0
        return (p.won - p.exp_wins) / math.sqrt(p.var_sum)

    acc = [p for p in players if (p.won + p.lost) >= min_dec]
    acc.sort(key=lambda p: (-z_of(p), -p.coins, p.id))

    acc_out = io.open(os.path.join(BASE, "data", "leaderboard_accuracy.csv"), "w", encoding="utf-8-sig", newline="")
    aw = csv.writer(acc_out)
    aw.writerow(["rank", "player", "strategy", "decided", "wins", "expected_wins",
                 "hit_rate", "expected_rate", "excess_pt", "z_score", "coins", "net_profit"])
    for i, p in enumerate(acc[:top_n], 1):
        n = p.won + p.lost
        aw.writerow([i, f"{p.strat}#{p.id:03d}", p.strat, n, p.won, round(p.exp_wins, 2),
                     f"{p.won/n*100:.1f}%", f"{p.exp_wins/n*100:.1f}%",
                     f"{(p.won-p.exp_wins)/n*100:+.2f}", f"{z_of(p):+.2f}",
                     round(p.coins, 1), round(p.coins - p.signin_total, 1)])
    acc_out.close()

    zs = sorted(z_of(p) for p in acc)
    print("")
    print("=" * 62)
    print(f"【眼力榜】资格：分出胜负 ≥ {min_dec} 场    达标 {len(acc)} / {args.players} 人")
    print("  指标 = 超额命中显著性 z =(实际命中−期望命中)/√Σp(1−p)")
    print(f"  全体 z 分布：中位 {zs[len(zs)//2]:+.2f}   最小 {zs[0]:+.2f}   最大 {zs[-1]:+.2f}")
    print(f"  |z|>1.96 的（统计显著）共 {sum(1 for x in zs if abs(x) > 1.96)} 人"
          f"（纯运气下期望约 {len(zs)*0.05:.0f} 人 → 超出部分才算真眼力）")
    for i, p in enumerate(acc[:10], 1):
        n = p.won + p.lost
        print(f"    {i:>2}. {p.strat:<9s}#{p.id:03d}  实际 {p.won/n*100:>5.1f}% / 期望 {p.exp_wins/n*100:>5.1f}%"
              f"  超额 {(p.won-p.exp_wins)/n*100:>+6.2f}pt   z {z_of(p):>+5.2f}")
    print(f"  分策略上榜数：" + "  ".join(
        f"{st}={sum(1 for p in acc if p.strat == st)}" for st in Player.STRATS))
    print("=" * 62)

    final_supply = sum(p.coins for p in players)
    print(f"PLAYERS={args.players} DAYS=23 MATCHES={len(sched)} DRAWS={draws}")
    print(f"签到产出总计 = {total_created:,.0f}")
    print(f"投注总额     = {total_staked:,.0f}")
    print(f"抽水销毁总计 = {total_rake:,.0f}  （占投注额 {total_rake/total_staked*100:.2f}%）")
    print(f"派彩总计     = {total_paid:,.0f}")
    print(f"赛季末金币总量 = {final_supply:,.0f}")
    print(f"实际销毁总计 = {total_destroyed:,.0f}（抽水 {total_rake:,.0f} + 无人押中 {total_unclaimed:,.0f}）")
    print(f"守恒校验: 期末 {final_supply:,.0f} + 销毁 {total_destroyed:,.0f} − 产出 {total_created:,.0f} = {final_supply + total_destroyed - total_created:,.0f}  ← 应为 0")
    print(f"破产玩家（<下限 200）= {sum(1 for p in players if p.coins < econ['bet']['min'])} / {args.players}")
    print(f"人均金币 = {final_supply / args.players:,.0f}")
    print("前 5 天 / 后 5 天：")
    for r in daily[:5] + daily[-5:]:
        print(f"  D{r['day']:>2} 产出{r['created']:>9,.0f} 总量{r['supply']:>12,.0f} 投注{r['staked']:>10,.0f} 抽水{r['rake']:>8,.0f} 破产{r['broke']}")


if __name__ == "__main__":
    main()
