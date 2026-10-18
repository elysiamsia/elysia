
# -*- coding: utf-8 -*-
"""给已有 Spine rig 追加战斗动画（不动机画、不改骨骼，只加动画）
用法: python tools/spine_chibi/add_battle.py <源json> <输出json>
按 bone 名映射：主躯干/头/右手/左手/头发
"""
import json, sys, copy

anim_bones = {
    'torso': '核心骨架',
    'hip':   '腰',
    'head':  '头',
    'armR':  '手R',
    'armL':  '手L',
    'hair':  ['头发','前发_呆毛','后发1','后发2','后发3'],
}

def build(src, dst):
    j = json.load(open(src, encoding='utf-8'))
    A = j.setdefault('animations', {})
    names = {b['name'] for b in j['bones']}
    def has(n): return n in names
    T = anim_bones['torso']; H = anim_bones['head']; R = anim_bones['armR']; L = anim_bones['armL']
    hairs = [h for h in anim_bones['hair'] if has(h)]

    def rot(deg_keys): return {'rotate': [{'time': t, 'value': v} for t, v in deg_keys]}
    def tr(xy_keys):   return {'translate': [{'time': t, 'x': x, 'y': y} for t, x, y in xy_keys]}
    def sc(xy_keys):   return {'scale': [{'time': t, 'x': x, 'y': y} for t, x, y in xy_keys]}

    A['battle_idle'] = {'bones': {
        T: {**rot([(0,0),(1.2,-1.2),(2.4,0)]), **tr([(0,0,0),(1.2,0,6),(2.4,0,0)])},
        H: rot([(0,0),(0.9,1.5),(1.8,-1.2),(2.4,0)]),
        **{h: rot([(0,0),(1.2, 2.0 if i%2==0 else -2.0),(2.4,0)]) for i,h in enumerate(hairs)},
    }}
    A['battle_attack'] = {'bones': {
        T: {**rot([(0,0),(0.10,-7),(0.22,9),(0.38,4),(0.60,0)]), **tr([(0,0,0),(0.10,-20,0),(0.22,44,10),(0.40,20,0),(0.60,0,0)])},
        H: rot([(0,0),(0.10,-6),(0.22,7),(0.40,2),(0.60,0)]),
        R: rot([(0,0),(0.10,-45),(0.22,60),(0.38,25),(0.60,0)]),
        L: rot([(0,0),(0.10,20),(0.22,-24),(0.60,0)]),
        **{h: rot([(0,0),(0.22, 4.0 if i%2==0 else -4.0),(0.45,0)]) for i,h in enumerate(hairs)},
    }}
    A['battle_hit'] = {'bones': {
        T: {**rot([(0,0),(0.06,-9),(0.18,-4),(0.34,0)]), **tr([(0,0,0),(0.06,-26,-6),(0.18,-10,0),(0.34,0,0)])},
        H: rot([(0,0),(0.06,-12),(0.18,-5),(0.34,0)]),
        **{h: rot([(0,0),(0.10, 5.0 if i%2==0 else -5.0),(0.30,0)]) for i,h in enumerate(hairs)},
    }}
    A['battle_ko'] = {'bones': {
        T: {**rot([(0,0),(0.20,-12),(0.55,-55),(0.80,-70)]), **tr([(0,0,0),(0.55,-30,-20),(0.80,-46,-34)])},
        H: rot([(0,0),(0.30,-10),(0.80,-18)]),
        R: rot([(0,0),(0.5,20)]),
        L: rot([(0,0),(0.5,-20)]),
    }}
    A['battle_cast'] = {'bones': {
        T: {**rot([(0,0),(0.20,4),(0.45,-6),(0.70,-3),(0.95,0)]), **tr([(0,0,0),(0.20,0,-12),(0.45,0,60),(0.70,0,52),(0.95,0,0)])},
        H: rot([(0,0),(0.20,5),(0.45,-8),(0.70,-4),(0.95,0)]),
        R: rot([(0,0),(0.20,-30),(0.45,55),(0.70,45),(0.95,0)]),
        L: rot([(0,0),(0.20,30),(0.45,-55),(0.70,-45),(0.95,0)]),
    }}
    A['battle_win'] = {'bones': {
        T: {**rot([(0,0),(0.2,-3),(0.4,3),(0.6,-2),(0.8,0)]), **tr([(0,0,0),(0.2,0,34),(0.4,0,0),(0.6,0,22),(0.8,0,0)])},
        H: rot([(0,0),(0.2,4),(0.5,-3),(0.8,0)]),
        R: rot([(0,0),(0.2,-60),(0.6,-50),(0.8,0)]),
        L: rot([(0,0),(0.2,40),(0.6,30),(0.8,0)]),
    }}
    # 受击表情：闭眼 + 汗
    for slot, att, times in [('眼_闭眼','眼_闭眼',[(0.0,None),(0.05,'眼_闭眼'),(0.5,None)]),
                             ('表情_汗','表情_汗',[(0.0,None),(0.08,'表情_汗'),(0.6,None)])]:
        if slot in [s['name'] for s in j['slots']]:
            A['battle_hit'].setdefault('slots', {})[slot] = {'attachment': [{'time':t, 'name':n} for t,n in times]}
    json.dump(j, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
    print('written', dst, 'anims', list(A.keys()))

if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
