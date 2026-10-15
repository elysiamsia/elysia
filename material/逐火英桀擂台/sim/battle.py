# -*- coding: utf-8 -*-
"""
逐火十三英桀 · 赛博斗蛐蛐 —— 战斗引擎 v2

基线（继承官方「电子斗蛐蛐」活动）：
  回合制 · 速度定先手 · 普攻伤害 = 攻击 − 防御（最低1）· 生命归零即败

增强层：
  能量条  普攻 +25，受伤 +15，满 100 释放主动技能
  连击    多段技能逐段独立结算
  元素    生物 → 异能 → 机械 → 生物；克制 ×1.3，被克 ×0.8
"""
import random
from dataclasses import dataclass, field
from typing import Callable

ELEMENTS = ("生物", "异能", "机械")
COUNTER = {"生物": "异能", "异能": "机械", "机械": "生物"}
ADV, DIS = 1.30, 0.80
ENERGY_MAX = 100
MAX_TURN = 120


def elem_mult(a: str, d: str) -> float:
    if COUNTER.get(a) == d:
        return ADV
    if COUNTER.get(d) == a:
        return DIS
    return 1.0


@dataclass
class Hero:
    key: str; name: str; signet: str; role: str; elem: str
    hp: int; atk: int; dfn: int; spd: int
    active_name: str = ""; passive_name: str = ""
    desc_active: str = ""; desc_passive: str = ""


@dataclass
class F:
    """战斗中的角色实例"""
    h: Hero
    hp: float = 0; atk: float = 0; dfn: float = 0; spd: float = 0
    energy: float = 0
    shield: float = 0          # 旭光护盾
    marks: float = 0           # 格蕾修印记（施加在对手身上）
    qi: int = 0                # 华的气
    stun: int = 0              # 眩晕剩余回合
    seal: int = 0              # 戒律封印（禁用被动）剩余回合
    dodge2: int = 0            # 华：临时闪避
    revive: bool = False       # 爱莉希雅免死是否已用
    gold: int = 0              # 伊甸累积命中
    hit_taken: float = 0

    def __post_init__(self):
        self.hp = float(self.h.hp); self.atk = float(self.h.atk)
        self.dfn = float(self.h.dfn); self.spd = float(self.h.spd)

    @property
    def alive(self) -> bool:
        return self.hp > 0


class Battle:
    def __init__(self, ha: Hero, hb: Hero, rng: random.Random, verbose=False):
        self.a, self.b = F(ha), F(hb)
        self.rng = rng
        self.verbose = verbose
        self.log: list[str] = []

    # ---------- 基础 ----------
    def lg(self, s):
        if self.verbose:
            self.log.append(s)

    def foe_of(self, x: F) -> F:
        return self.b if x is self.a else self.a

    def deal(self, src: F, dst: F, raw: float, *, pierce=False, tag="普攻",
             crit=False) -> None:
        """raw 为技能的“攻击力倍数×攻击力”或普攻的 atk（未减防御）"""
        dmg = raw if pierce else max(1.0, raw - dst.dfn)
        dmg *= elem_mult(src.h.elem, dst.h.elem)

        # 受击方被动（未被封印时生效）
        if dst.seal <= 0:
            p = dst.h.key
            if p == "kosma":                       # 旭光：减伤 20%
                dmg *= 0.80
            if p == "villv" and self.rng.random() < 0.35:   # 螺旋：35% 减半
                dmg *= 0.5
            elif p == "villv":
                dmg *= 1.20

        # 护盾吸收
        if dst.shield > 0:
            ab = min(dst.shield, dmg)
            dst.shield -= ab
            dmg -= ab
            if dst.shield <= 0 and dst.h.key == "kosma" and dst.seal <= 0:
                self.lg(f"  ↳ 旭光护盾破碎反击")
                self.deal(dst, src, 15.0, pierce=True, tag="盾碎反击")

        dst.hp -= dmg
        dst.hit_taken += dmg
        self.lg(f"{src.h.name}({src.hp:.0f}) 对 {dst.h.name}({dst.hp:.0f}) {tag} 造成 {dmg:.1f}"
                + ("〔暴击〕" if crit else "") + f"〔{elem_mult(src.h.elem, dst.h.elem):.1f}倍元素〕")

        # 爱莉希雅：每场一次免死
        if dst.hp <= 0 and dst.h.key == "elysia" and not dst.revive and dst.seal <= 0:
            dst.revive = True
            dst.hp = 1.0
            self.lg("  ↳ 【无暇的爱心】免死，保留 1 HP")

        # 受伤回能
        dst.energy = min(ENERGY_MAX, dst.energy + 15)

    # ---------- 普攻 ----------
    def basic(self, x: F) -> None:
        y = self.foe_of(x)
        k = x.h.key

        # 樱：20% 闪避 + 反击
        if y.h.key == "sakura" and y.seal <= 0 and self.rng.random() < 0.20:
            self.lg(f"  ↳ {y.h.name}【转瞬即逝】闪避")
            self.deal(y, x, y.atk * 0.6, tag="闪避反击")
            x.energy = min(ENERGY_MAX, x.energy + 25)
            return
        # 华：临时闪避
        if y.dodge2 > 0 and self.rng.random() < 0.15:
            self.lg(f"  ↳ {y.h.name} 闪避")
            x.energy = min(ENERGY_MAX, x.energy + 25)
            return

        atk = x.atk
        crit = False
        # 苏：25% 暴击 ×1.8
        if k == "su" and x.seal <= 0 and self.rng.random() < 0.25:
            crit = True; atk *= 1.8
        # 千劫：血越少攻越高
        if k == "qianjie" and x.seal <= 0:
            lost = x.h.hp - x.hp
            atk = x.atk + (lost / 10.0) * 2.0

        # 格蕾修：普攻叠印记
        if k == "griseo" and x.seal <= 0:
            y.marks += 1
            if y.marks >= 5:
                y.marks = 0
                self.deal(x, y, 25.0, pierce=True, tag="印记引爆")

        self.deal(x, y, atk, tag="普攻", crit=crit)

        # 华：气 3 层额外一击
        if k == "hua" and x.seal <= 0:
            x.qi += 1
            if x.qi >= 3:
                x.qi = 0
                self.deal(x, y, x.atk * 1.5, pierce=True, tag="太虚之握")

        # 伊甸：命中永久加攻（上限 +6）
        if k == "eden" and x.seal <= 0 and x.gold < 6:
            x.gold += 1; x.atk += 1

        x.energy = min(ENERGY_MAX, x.energy + 25)

    # ---------- 主动技能 ----------
    def skill(self, x: F) -> None:
        y = self.foe_of(x); k = x.h.key
        x.energy = 0.0
        self.lg(f"◆ {x.h.name} 释放主动【{x.h.active_name}】")
        if k == "kevin":
            self.deal(x, y, x.atk * 1.6, tag="救世之冰")
            y.spd = max(4.0, y.spd - 4); y.stun = 0
        elif k == "elysia":
            heal = 25.0
            x.hp = min(float(x.h.hp), x.hp + heal)
            self.lg(f"  ↳ 回复 {heal:.0f} HP")
            self.deal(x, y, x.atk * 1.2, tag="真我之光")
        elif k == "aponia":
            self.deal(x, y, x.atk * 1.3, tag="戒律之锁")
            y.seal = 2
        elif k == "eden":
            self.deal(x, y, x.atk * 1.4, tag="黄金之杯")
            x.atk += 2
        elif k == "villv":
            m = self.rng.uniform(0.8, 2.2)
            self.deal(x, y, x.atk * m, tag=f"螺旋之戏×{m:.2f}")
        elif k == "qianjie":
            x.hp -= 10
            self.deal(x, y, x.atk * 1.5, tag="鏖灭之焰")
        elif k == "su":
            if self.rng.random() < 0.75:
                self.deal(x, y, x.atk * 1.3 * 1.8, pierce=True, tag="天慧之叶·暴击")
            else:
                self.deal(x, y, x.atk * 1.3, pierce=True, tag="天慧之叶")
        elif k == "sakura":
            for i in range(3):
                self.deal(x, y, x.atk * 0.7, tag=f"刹那之樱#{i+1}")
        elif k == "kosma":
            x.shield = min(50.0, x.shield + 30.0)
            self.lg(f"  ↳ 获得护盾，当前 {x.shield:.0f}")
            self.deal(x, y, x.atk * 1.0, tag="旭光之壁")
        elif k == "mobius":
            self.deal(x, y, x.atk * 1.2, tag="无限之触")
            x.atk += 2
        elif k == "griseo":
            y.marks += 3
            self.deal(x, y, x.atk * 0.8, tag="繁星之绘")
        elif k == "hua":
            for i in range(2):
                self.deal(x, y, x.atk * 1.0, tag=f"浮生之刃#{i+1}")
            x.dodge2 = 2
        elif k == "pardo":
            r = self.rng.random()
            if r < 0.35:
                self.deal(x, y, x.atk * 2.0, pierce=True, tag="空梦·大伤害")
            elif r < 0.60:
                x.hp = min(float(x.h.hp), x.hp + 30); self.lg("  ↳ 空梦·大回复")
            elif r < 0.80:
                x.energy = min(ENERGY_MAX, x.energy + 50); self.lg("  ↳ 空梦·充能")
            else:
                self.deal(x, y, x.atk * 0.8, tag="空梦·眩晕")
                y.stun = 2

    # ---------- 回合开始 ----------
    def turn_start(self, x: F) -> None:
        k = x.h.key
        if x.seal <= 0:
            if k == "elysia":
                x.hp = min(float(x.h.hp), x.hp + 4)
            elif k == "mobius":
                x.atk += 1
            elif k == "pardo":
                r = self.rng.random()
                if r < 0.25: x.atk += 2
                elif r < 0.50: x.dfn += 2
                elif r < 0.75: x.hp = min(float(x.h.hp), x.hp + 5)
                else: x.energy = min(ENERGY_MAX, x.energy + 10)
            elif k == "kevin":
                if x.hp < x.h.hp * 0.5:
                    x.atk = x.h.atk + 4; x.dfn = x.h.dfn + 3
                else:
                    x.atk = x.h.atk; x.dfn = x.h.dfn
        # 印记灼烧（不属于格蕾修自身时生效）
        if x.marks > 0:
            burn = x.marks * 8.0
            x.marks -= 1
            x.hp -= burn
            self.lg(f"  ↳ 印记灼烧 {burn:.0f}")

    # ---------- 主循环 ----------
    def run(self):
        turn = 0
        while self.a.alive and self.b.alive and turn < MAX_TURN:
            turn += 1
            order = sorted([self.a, self.b], key=lambda f: -f.spd)
            for x in order:
                if not (self.a.alive and self.b.alive):
                    break
                self.turn_start(x)
                if not x.alive:
                    break
                if x.stun > 0:
                    x.stun -= 1
                    self.lg(f"  {x.h.name} 眩晕中，跳过")
                    continue
                if x.energy >= ENERGY_MAX:
                    self.skill(x)
                else:
                    self.basic(x)
                if x.seal > 0:
                    x.seal -= 1
                if x.dodge2 > 0:
                    x.dodge2 -= 1

        if not self.a.alive and not self.b.alive:
            return None, turn
        if not self.b.alive:
            return self.a.h.key, turn
        if not self.a.alive:
            return self.b.h.key, turn
        ra, rb = self.a.hp / self.a.h.hp, self.b.hp / self.b.h.hp
        if abs(ra - rb) < 1e-9:
            return None, turn
        return (self.a.h.key if ra > rb else self.b.h.key), turn
