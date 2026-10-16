# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 赛博斗蛐蛐 —— 战斗引擎（v2.1 全参数化）

上游：data/characters.json（单一数据源；v2.1 起所有技能/被动数值一律从 params 读取，
     修复 v2.0 之前"json 调参、引擎写死、实际未生效"的根本性 bug）

骨架（继承官方「电子斗蛐蛐」）：
    先手 = 速度高者（相同按位次Ⅰ~ⅩⅢ）
    普攻伤害 = max(1, 攻 − 防)；全局演出浮动 ±15%
    无视防御（pierce）绕过防御；半防穿透（half_pierce）无视目标 50% 防御；两者都先扣护盾
    能量：普攻命中 +25 / 受击 +15；满 100 自动放主动并清空
    胜负：生命归零即败；120 回合上限双方存活 = 平局（v2.4 废除血量百分比判胜）

语义细则（引擎级裁定）：
    · 封印：目标被动全部失效（含免死/减伤/闪避/成长/骰）；不影响主动技能与状态灼烧
    · 灼烧：印记持有者回合开始，每层 MARK_BURN(=4) 点无视防御，先扣护盾，受科斯魔减伤；层数 −1
    · 眩晕：跳过行动，回合开始的被动与灼烧照常结算
    · 闪避（樱/华）：攻击方普攻未命中 → 攻击方不加能量；樱闪避后反击（不给樱回能）
    · 减速：速度按技能参数下降，按回合衰减，影响先手判定
"""
import json
import os
import random

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENERGY_MAX = 100
MAX_TURN = 120
CRIT_CHANCE = 0.32   # 全局会心概率
CRIT_MULT = 2.5      # 全局会心倍率
MARK_BURN = 4.0     # 星之印记每层灼烧量兜底值；实际以施加方 params.burn_per_layer 为准


def load_heroes(path=None):
    path = path or os.path.join(BASE, "data", "characters.json")
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    return doc["heroes"], doc["meta"]["battle_rules"], doc["meta"]["status_effects"]


def ap(h, *keys, default=None):
    """按路径读 hero.params，带默认值兜底"""
    d = h
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


class Fighter:
    __slots__ = ("h", "hp", "perm_atk", "perm_dfn", "energy", "shield", "marks",
                 "qi", "stun", "slow", "seal", "dodge2", "revive_used", "eden_hits",
                 "pardo_atk_bonus", "pardo_dfn_bonus", "slow_turns", "mark_burn")

    def __init__(self, h):
        self.h = h
        self.hp = float(h["stats"]["hp"])
        self.perm_atk = 0.0
        self.perm_dfn = 0.0
        self.energy = 0.0
        self.shield = 0.0
        self.marks = 0.0
        self.qi = 0
        self.stun = 0
        self.slow = 0
        self.slow_turns = 0
        self.seal = 0
        self.dodge2 = 0
        self.revive_used = False
        self.eden_hits = 0
        self.pardo_atk_bonus = 0.0
        self.pardo_dfn_bonus = 0.0
        self.mark_burn = MARK_BURN

    @property
    def alive(self):
        return self.hp > 0

    @property
    def sealed(self):
        return self.seal > 0


class Battle:
    def __init__(self, ha, hb, rng: random.Random, verbose=False):
        self.a, self.b = Fighter(ha), Fighter(hb)
        self.rng = rng
        self.verbose = verbose
        self.log = []

    def lg(self, s):
        if self.verbose:
            self.log.append(s)

    def foe_of(self, x):
        return self.b if x is self.a else self.a

    # ---------- 动态属性 ----------
    def cur_atk(self, x):
        v = float(x.h["stats"]["atk"]) + x.perm_atk + x.pardo_atk_bonus
        if not x.sealed:
            k = x.h["key"]
            if k == "kevin" and x.hp < float(x.h["stats"]["hp"]) * ap(x.h, "passive", "params", "threshold", default=0.5):
                v += ap(x.h, "passive", "params", "atk_bonus", default=3)
            elif k == "qianjie":
                step = ap(x.h, "passive", "params", "hp_lost_step", default=12)
                bonus = ap(x.h, "passive", "params", "atk_bonus_per_10hp_lost", default=2)
                lost = float(x.h["stats"]["hp"]) - x.hp
                v += (lost // step) * bonus
        return v

    def cur_dfn(self, x):
        v = float(x.h["stats"]["dfn"]) + x.perm_dfn + x.pardo_dfn_bonus
        if not x.sealed and x.h["key"] == "kevin" and x.hp < float(x.h["stats"]["hp"]) * ap(x.h, "passive", "params", "threshold", default=0.5):
            v += ap(x.h, "passive", "params", "dfn_bonus", default=2)
        return v

    def cur_spd(self, x):
        v = float(x.h["stats"]["spd"])
        if x.slow > 0:
            v -= ap(x.h, "active", "params", "slow", default=4)
        return v

    # ---------- 伤害结算 ----------
    def deal(self, src, dst, raw, *, pierce=False, half_pierce=False, tag="普攻",
             crit=False, crit_mult=1.8, give_hit_energy=True, ignore_shield=False):
        if pierce:
            dmg = raw
        elif half_pierce:
            dmg = max(1.0, raw - self.cur_dfn(dst) * 0.5)
        else:
            dmg = max(1.0, raw - self.cur_dfn(dst))
        dmg *= self.rng.uniform(0.80, 1.20)            # 全局演出浮动 ±20%
        # 会心一击（v5.1）：全局 12% 概率 ×2.5 伤害。
        # 设计目的：给每场对局注入"少数高方差事件"，使结果不再由系统性差距单方面决定
        # （四组对照实验证明：压缩属性/机制强度无法产生六四开，只有加大偶然性才行）
        if self.rng.random() < CRIT_CHANCE:
            dmg *= CRIT_MULT
            self.lg("  ✦ 会心一击！")
        if crit:
            dmg *= crit_mult
        # 受击方被动：旭光减伤 / 螺旋骰（封印时失效）
        if not dst.sealed:
            k = dst.h["key"]
            if k == "kosma":
                dmg *= (1.0 - ap(dst.h, "passive", "params", "dmg_reduction", default=0.08))
            elif k == "villv":
                hc = ap(dst.h, "passive", "params", "halve_chance", default=0.40)
                amp = ap(dst.h, "passive", "params", "amplify", default=1.2)
                dmg *= 0.5 if self.rng.random() < hc else amp
        # 护盾吸收（无视护盾的真实伤害跳过此步）
        if dst.shield > 0 and not ignore_shield:
            ab = min(dst.shield, dmg)
            dst.shield -= ab
            dmg -= ab
            if dst.shield <= 0 and not dst.sealed and dst.h["key"] == "kosma":
                self.lg("  ↳ 旭光护盾破碎，守望反击")
                self.deal(dst, src,
                          ap(dst.h, "passive", "params", "shield_break_dmg", default=8.0),
                          pierce=True, tag="破盾反击")
        dst.hp -= dmg
        self.lg(f"{src.h['name']}({max(0.0, src.hp):.0f}) {tag} {dst.h['name']}({max(0.0, dst.hp):.0f})"
                f" → {dmg:.1f}" + ("〔暴击〕" if crit else ""))
        # 真我免死（封印时失效）
        if dst.hp <= 0 and not dst.sealed and dst.h["key"] == "elysia" and not dst.revive_used:
            dst.revive_used = True
            dst.hp = float(ap(dst.h, "passive", "params", "revive_keep_hp", default=1))
            self.lg(f"  ↳ 【真我】{dst.h['name']} 无法被真正杀死，保留 {dst.hp:.0f} HP")
        # 受击回能
        if give_hit_energy:
            gain = ap(dst.h, "passive", "params", "hit_energy_gain", default=15.0)
            dst.energy = min(ENERGY_MAX, dst.energy + float(gain))
        return dmg

    # ---------- 普攻 ----------
    def basic(self, x):
        y = self.foe_of(x)
        k = x.h["key"]

        if not y.sealed and y.h["key"] == "sakura" and self.rng.random() < ap(y.h, "passive", "params", "dodge_chance", default=0.25):
            self.lg(f"  ↳ {y.h['name']}【转瞬即逝】闪避")
            cm = ap(y.h, "passive", "params", "counter_mult", default=0.7)
            self.deal(y, x, self.cur_atk(y) * cm, tag="闪避反击")
            return
        if y.dodge2 > 0 and not y.sealed and self.rng.random() < ap(y.h, "active", "params", "dodge_chance", default=0.15):
            self.lg(f"  ↳ {y.h['name']} 浮生闪避")
            return

        atk = self.cur_atk(x)
        crit = False
        cm = 1.0
        if not x.sealed and k == "su" and self.rng.random() < ap(x.h, "passive", "params", "crit_chance", default=0.25):
            crit = True
            cm = ap(x.h, "passive", "params", "crit_mult", default=1.8)
        self.deal(x, y, atk, tag="普攻", crit=crit, crit_mult=cm)

        if not x.sealed:
            if k == "griseo":
                cap = ap(x.h, "passive", "params", "mark_cap", default=4)
                y.mark_burn = ap(x.h, "passive", "params", "burn_per_layer", default=MARK_BURN)
                if y.marks < cap:
                    y.marks += 1
                    self.lg(f"  ↳ 绘世之卷：{y.h['name']} 印记 {y.marks:.0f} 层")
            elif k == "hua":
                x.qi += 1
                cap = ap(x.h, "passive", "params", "qi_cap", default=3)
                if x.qi >= cap:
                    x.qi = 0
                    bm = ap(x.h, "passive", "params", "bonus_mult", default=1.5)
                    self.deal(x, y, self.cur_atk(x) * bm, pierce=True, tag="太虚之握·气劲爆发")
            elif k == "eden":
                cap = ap(x.h, "passive", "params", "atk_up_cap", default=6)
                up = ap(x.h, "passive", "params", "atk_up_per_hit", default=1)
                if x.eden_hits < cap:
                    x.eden_hits += up
                    x.perm_atk += up
        x.energy = min(ENERGY_MAX, x.energy + 25)

    # ---------- 主动技能 ----------
    def skill(self, x):
        y = self.foe_of(x)
        k = x.h["key"]
        a = self.cur_atk(x)
        x.energy = 0.0
        self.lg(f"◆ {x.h['name']} 释放主动【{x.h['active']['name']}】")
        if k == "kevin":
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.5), tag="天火圣裁")
            st = ap(x.h, "active", "params", "slow_turns", default=2)
            y.slow = st
            self.lg(f"  ↳ 冰封：{y.h['name']} 速度 -{ap(x.h, 'active', 'params', 'slow', default=4)}（{st} 回合）")
        elif k == "elysia":
            heal = ap(x.h, "active", "params", "heal", default=12)
            x.hp = min(float(x.h["stats"]["hp"]), x.hp + heal)
            self.lg(f"  ↳ 妖精水晶回复 {heal}（{x.hp:.0f}）")
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.3), tag="妖精水晶箭")
            tdm = float(ap(x.h, "active", "params", "true_dmg", default=0))
            if tdm > 0:
                self.deal(x, y, tdm, pierce=True, ignore_shield=True, tag="星辰穿透")
        elif k == "aponia":
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.6), tag="戒律之锁")
            y.seal = ap(x.h, "active", "params", "seal_turns", default=3)
            self.lg(f"  ↳ 以戒律之名：{y.h['name']} 被动封印 {y.seal} 回合")
        elif k == "eden":
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.4), tag="黄金之歌")
            x.perm_atk += ap(x.h, "active", "params", "atk_up_per_cast", default=2)
        elif k == "villv":
            lo = ap(x.h, "active", "params", "dmg_mult_min", default=1.2)
            hi = ap(x.h, "active", "params", "dmg_mult_max", default=2.6)
            m = self.rng.uniform(lo, hi)
            self.deal(x, y, a * m, tag=f"螺旋之戏×{m:.2f}")
        elif k == "qianjie":
            cost = ap(x.h, "active", "params", "self_cost", default=12)
            x.hp -= cost
            self.lg(f"  ↳ 狂王不惜己身（自身 -{cost} → {max(0.0, x.hp):.0f}）")
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.5), tag="狂王之怒")
        elif k == "su":
            m = ap(x.h, "active", "params", "dmg_mult", default=1.3)
            if self.rng.random() < ap(x.h, "active", "params", "crit_chance", default=0.75):
                self.deal(x, y, a * m * ap(x.h, "active", "params", "crit_mult", default=1.8),
                          pierce=True, tag="天慧之瞳·洞见要害")
            else:
                self.deal(x, y, a * m, pierce=True, tag="天慧之瞳")
        elif k == "sakura":
            hits = ap(x.h, "active", "params", "hits", default=3)
            m = ap(x.h, "active", "params", "dmg_mult_per_hit", default=0.8)
            for i in range(hits):
                self.deal(x, y, a * m, half_pierce=True, tag=f"樱吹雪#{i + 1}")
        elif k == "kosma":
            x.shield = min(ap(x.h, "active", "params", "shield_cap", default=25),
                           x.shield + ap(x.h, "active", "params", "shield_gain", default=10))
            self.lg(f"  ↳ 黎明之哨：护盾 {x.shield:.0f}")
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.0), tag="旭光壁击")
        elif k == "mobius":
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=1.2), tag="噬界之蛇")
            x.perm_atk += ap(x.h, "active", "params", "atk_up_per_cast", default=3)
        elif k == "griseo":
            cap = ap(x.h, "passive", "params", "mark_cap", default=4)
            add = ap(x.h, "active", "params", "mark_layers", default=3)
            y.mark_burn = ap(x.h, "passive", "params", "burn_per_layer", default=MARK_BURN)
            y.marks = min(cap, y.marks + add)
            self.lg(f"  ↳ 繁星之绘：{y.h['name']} 印记 {y.marks:.0f} 层")
            self.deal(x, y, a * ap(x.h, "active", "params", "dmg_mult", default=0.9), tag="画笔轻点")
        elif k == "hua":
            hits = ap(x.h, "active", "params", "hits", default=2)
            m = ap(x.h, "active", "params", "dmg_mult_per_hit", default=1.0)
            for i in range(hits):
                self.deal(x, y, a * m, tag=f"浮生之刃#{i + 1}")
            x.dodge2 = ap(x.h, "active", "params", "dodge_turns", default=2)
        elif k == "pardo":
            roll = ap(x.h, "active", "params", "roll", default=[])
            r = self.rng.random()
            acc = 0.0
            choice = roll[-1] if roll else None
            for item in roll:
                acc += float(item.get("weight", 0))
                if r < acc:
                    choice = item
                    break
            if choice is None:
                choice = {"dmg_mult": 0.8}
            if "heal" in choice:
                x.hp = min(float(x.h["stats"]["hp"]), x.hp + float(choice["heal"]))
                self.lg(f"  ↳ 空梦·大回复 +{choice['heal']}")
            elif "energy_gain" in choice:
                x.energy = min(ENERGY_MAX, x.energy + float(choice["energy_gain"]))
                self.lg("  ↳ 空梦·充能")
            else:
                m = float(choice.get("dmg_mult", 0.8))
                self.deal(x, y, a * m, pierce=bool(choice.get("pierce")), tag="空梦之愿")
                if choice.get("stun_turns"):
                    y.stun = int(choice["stun_turns"])
                    self.lg(f"  ↳ {y.h['name']} 被眩晕 {choice['stun_turns']} 回合")

    # ---------- 回合开始 ----------
    def turn_start(self, x):
        k = x.h["key"]
        if x.marks > 0:
            burn = x.marks * float(x.mark_burn)
            if not x.sealed and k == "kosma":
                burn *= (1.0 - ap(x.h, "passive", "params", "dmg_reduction", default=0.08))
            if x.shield > 0:
                ab = min(x.shield, burn)
                x.shield -= ab
                burn -= ab
            x.hp -= burn
            x.marks = max(0.0, x.marks - 0.5)   # 每 2 回合衰减 1 层（v3.3：修正"刚画上就烧尽"）
            self.lg(f"  ↳ 星之印记灼烧 {x.h['name']} -{burn:.0f}（余 {x.marks:.1f} 层）")
        if not x.sealed:
            if k == "elysia":
                x.hp = min(float(x.h["stats"]["hp"]), x.hp + ap(x.h, "passive", "params", "regen", default=1))
            elif k == "mobius":
                x.perm_atk += ap(x.h, "passive", "params", "atk_up_per_turn", default=3)
            elif k == "aponia":
                if self.foe_of(x).seal > 0:
                    x.hp = min(float(x.h["stats"]["hp"]),
                               x.hp + ap(x.h, "passive", "params", "heal_per_seal_turn", default=5))
            elif k == "pardo":
                roll = ap(x.h, "passive", "params", "roll", default=[])
                r = self.rng.random()
                idx = int(r * len(roll)) % max(1, len(roll))
                pick = roll[idx] if roll else "heal5"
                if pick == "atk+2":
                    x.pardo_atk_bonus += 2
                elif pick == "dfn+2":
                    x.pardo_dfn_bonus += 2
                elif pick == "heal5":
                    x.hp = min(float(x.h["stats"]["hp"]), x.hp + 5)
                else:
                    x.energy = min(ENERGY_MAX, x.energy + 10)

    # ---------- 主循环 ----------
    def run(self):
        turn = 0
        while self.a.alive and self.b.alive and turn < MAX_TURN:
            turn += 1
            order = sorted((self.a, self.b), key=lambda f: (-self.cur_spd(f), f.h["rank"]))
            for x in order:
                if not (self.a.alive and self.b.alive):
                    break
                self.turn_start(x)
                if not x.alive:
                    break
                if x.seal > 0:
                    x.seal -= 1
                if x.slow > 0:
                    x.slow -= 1
                if x.dodge2 > 0:
                    x.dodge2 -= 1
                if x.stun > 0:
                    x.stun -= 1
                    self.lg(f"  {x.h['name']} 眩晕，跳过行动")
                    continue
                if x.energy >= ENERGY_MAX:
                    self.skill(x)
                else:
                    self.basic(x)
        if not self.a.alive and not self.b.alive:
            return None, turn
        if not self.b.alive:
            return self.a.h["key"], turn
        if not self.a.alive:
            return self.b.h["key"], turn
        # 超时规则（v2.4）：120 回合双方存活 = 平局（押注退本金）。
        # 旧规则"血量百分比高者胜"会让低攻磨血型角色结构性判负（科斯魔 0.1% 事件），废除。
        return None, turn


def fight(ha, hb, seed, verbose=False):
    rng = random.Random(seed)
    b = Battle(ha, hb, rng, verbose=verbose)
    winner, turns = b.run()
    if verbose:
        return winner, turns, b.log
    return winner, turns
