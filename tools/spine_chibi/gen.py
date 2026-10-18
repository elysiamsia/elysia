
# -*- coding: utf-8 -*-
"""从一张 Q版立绘生成 Spine 4.1 骨骼（单张网格 + 平滑权重 + 战斗动作）
用法: python tools/spine_chibi/gen.py <图片> <输出目录> [名字]
"""
import os, sys, json, math
from PIL import Image

# ---------------- 参数 ----------------
TARGET_H = 1000          # 输出高度（px）
GRID_X, GRID_Y = 18, 26  # 网格顶点数（列, 行）
MAX_W = 1024

def crop_content(im):
    im = im.convert('RGBA')
    a = im.getchannel('A')
    bbox = a.point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox: im = im.crop(bbox)
    w, h = im.size
    scale = TARGET_H / h
    if w * scale > MAX_W: scale = MAX_W / w
    return im.resize((max(1, round(w*scale)), max(1, round(h*scale))), Image.LANCZOS)

def smoothstep(t): return t*t*(3-2*t)

def build(img_path, out_dir, name):
    im = crop_content(Image.open(img_path))
    W, H = im.size
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, name + '.png')
    im.save(png)

    # ---- 骨骼（世界坐标，y 向上，脚在 0，头顶在 H）----
    B = {}
    def bone(nm, parent, x, y):
        B[nm] = {'name': nm, 'parent': parent, 'x': x, 'y': y}
    # 本地坐标 = 世界坐标 - 父骨骼世界坐标
    root_w = (W*0.5, 0)
    hip_w  = (W*0.5, H*0.20)
    tor_w  = (W*0.5, H*0.35)
    head_w = (W*0.5, H*0.47)
    bone('root', None, root_w[0], 0)
    bone('hip',  'root', 0, hip_w[1])
    bone('torso','hip',  0, tor_w[1]-hip_w[1])
    bone('head', 'torso',0, head_w[1]-tor_w[1])
    bone('hairL','head', -W*0.13, -H*0.02)
    bone('hairR','head',  W*0.13, -H*0.02)
    bone('hairB','head',  0, -H*0.06)
    bone('armL', 'torso',-W*0.17, -H*0.06)
    bone('armR', 'torso', W*0.17, -H*0.06)
    bone('legL', 'hip',  -W*0.07, 0)
    bone('legR', 'hip',   W*0.07, 0)

    # 世界坐标表（供权重用）
    world = {}
    def wpos(nm):
        if nm in world: return world[nm]
        b = B[nm]
        if b['parent'] is None: w = (b['x'], b['y'])
        else:
            px, py = wpos(b['parent']); w = (px + b['x'], py + b['y'])
        world[nm] = w; return w
    for nm in B: wpos(nm)

    # ---- 权重场：椭圆高斯，按角色比例布点 ----
    fields = [
        ('head',  (W*0.50, H*0.74), (W*0.34, H*0.24)),
        ('hairL', (W*0.26, H*0.54), (W*0.20, H*0.26)),
        ('hairR', (W*0.74, H*0.54), (W*0.20, H*0.26)),
        ('hairB', (W*0.50, H*0.50), (W*0.26, H*0.22)),
        ('torso', (W*0.50, H*0.40), (W*0.16, H*0.10)),
        ('armL',  (W*0.25, H*0.37), (W*0.10, H*0.12)),
        ('armR',  (W*0.75, H*0.37), (W*0.10, H*0.12)),
        ('hip',   (W*0.50, H*0.24), (W*0.14, H*0.10)),
        ('legL',  (W*0.42, H*0.10), (W*0.10, H*0.14)),
        ('legR',  (W*0.58, H*0.10), (W*0.10, H*0.14)),
    ]
    bones_order = [f[0] for f in fields]

    def weights(px, py):
        import os as _os
        if _os.environ.get('DEBUG_ALL_ROOT'):
            return {'root': 1.0}
        # px,py 为图片坐标（左上原点），转世界
        x, y = px, H - py
        raw = {}
        for nm, (cx, cy), (rx, ry) in fields:
            d = ((x-cx)/rx)**2 + ((y-cy)/ry)**2
            if d < 9: raw[nm] = math.exp(-d*0.9)
        # 区域保护：上半身不让腿/胯抢权重；下半身不让头抢
        if y > H*0.52:
            for nm in ('legL','legR','hip','torso'): raw.pop(nm, None)
        if y < H*0.30:
            for nm in ('head','hairL','hairR','hairB'): raw.pop(nm, None)
        if not raw: raw = {'torso': 1.0}
        s = sum(raw.values())
        return {k: v/s for k, v in raw.items()}

    # ---- 网格顶点 ----
    uvs, verts, vweights = [], [], []
    for j in range(GRID_Y):
        for i in range(GRID_X):
            px = W * i / (GRID_X - 1)
            py = H * j / (GRID_Y - 1)
            uvs += [px / W, py / H]
            w = weights(px, py)
            # 只保留权重前 3
            top = sorted(w.items(), key=lambda kv: -kv[1])[:3]
            top = [(k, v) for k, v in top if v > 0.01]
            s = sum(v for _, v in top)
            top = [(k, v/s) for k, v in top]
            vweights.append((px, H - py, top))

    tris = []
    for j in range(GRID_Y - 1):
        for i in range(GRID_X - 1):
            a = j*GRID_X + i; b = a + 1; c = a + GRID_X; d = c + 1
            tris += [a, b, c, b, d, c]

    # 顶点数据（带权重）：每顶点 = boneCount, (boneIdx, x, y, weight)*N
    skel_bones = ['root','hip','torso','head','hairL','hairR','hairB','armL','armR','legL','legR']
    bidx = {n: k for k, n in enumerate(skel_bones)}
    vdata = []
    for (wx, wy, ws) in vweights:
        vdata.append(len(ws))
        for nm, wv in ws:
            bx, by = world[nm]
            vdata += [bidx[nm], round(wx - bx, 3), round(wy - by, 3), round(wv, 4)]

    # ---- 动画 ----
    def rot(keys): return {'rotate': [{'time': t, 'value': a} for t, a in keys]}
    def tr(keys):  return {'translate': [{'time': t, 'x': x, 'y': y} for t, x, y in keys]}
    def sc(keys):  return {'scale': [{'time': t, 'x': x, 'y': y} for t, x, y in keys]}
    def col(keys): return {'color': [{'time': t, 'color': c} for t, c in keys]}

    A = {}
    # 待机：呼吸 + 摇头 + 头发摆
    A['idle'] = {'bones': {
        'torso': {**sc([(0,1,1),(1.2,1.006,1.018),(2.4,1,1)])},
        'head':  {**rot([(0,0),(0.8,-1.6),(1.6,1.2),(2.4,0)]), **tr([(0,0,0),(1.2,0,2),(2.4,0,0)])},
        'hairL': rot([(0,0),(0.9,-2.2),(1.8,1.8),(2.4,0)]),
        'hairR': rot([(0,0),(0.9,2.0),(1.8,-1.6),(2.4,0)]),
        'hairB': rot([(0,0),(1.2,1.5),(2.4,0)]),
        'armL':  rot([(0,0),(1.2,-2.5),(2.4,0)]),
        'armR':  rot([(0,0),(1.2,2.5),(2.4,0)]),
    }}
    # 普攻：预备 → 冲刺 → 挥击 → 收势
    A['attack'] = {'bones': {
        'root':  tr([(0,0,0),(0.10,-16,0),(0.22,64,26),(0.34,52,0),(0.52,10,0),(0.66,0,0)]),
        'torso': rot([(0,0),(0.12,-8),(0.26,10),(0.42,6),(0.62,0)]),
        'head':  rot([(0,0),(0.12,-6),(0.26,6),(0.42,3),(0.62,0)]),
        'armR':  rot([(0,0),(0.10,-70),(0.24,80),(0.40,30),(0.60,0)]),
        'armL':  rot([(0,0),(0.10,40),(0.24,-40),(0.60,0)]),
        'hairL': rot([(0,0),(0.2,6),(0.4,-4),(0.7,0)]),
        'hairR': rot([(0,0),(0.2,-6),(0.4,4),(0.7,0)]),
    }}
    # 第二段普攻（反手）
    A['attack2'] = {'bones': {
        'root':  tr([(0,0,0),(0.12,-20,0),(0.26,38,8),(0.42,24,0),(0.62,0,0)]),
        'torso': rot([(0,0),(0.12,7),(0.26,-9),(0.62,0)]),
        'head':  rot([(0,0),(0.12,5),(0.26,-6),(0.62,0)]),
        'armL':  rot([(0,0),(0.12,-45),(0.26,50),(0.42,18),(0.62,0)]),
        'armR':  rot([(0,0),(0.12,26),(0.26,-18),(0.62,0)]),
    }}
    # 受击：后仰 + 红闪
    A['hit'] = {'bones': {
        'root':  tr([(0,0,0),(0.06,-18,4),(0.18,-8,0),(0.34,0,0)]),
        'torso': rot([(0,0),(0.06,9),(0.18,4),(0.34,0)]),
        'head':  rot([(0,0),(0.06,11),(0.18,5),(0.34,0)]),
    }, 'slots': {'body': col([(0,'ffffff'),(0.04,'ff8888'),(0.16,'ffffff')])}}
    # 主动技能：蓄力 → 起跳 → 释放
    A['cast'] = {'bones': {
        'root':  tr([(0,0,0),(0.25,0,-6),(0.45,0,46),(0.7,0,40),(0.95,0,0)]),
        'torso': sc([(0,1,1),(0.25,0.97,1.03),(0.45,1.03,0.97),(0.95,1,1)]),
        'head':  rot([(0,0),(0.25,-4),(0.45,5),(0.7,-2),(0.95,0)]),
        'armL':  rot([(0,0),(0.25,55),(0.45,-70),(0.7,-60),(0.95,0)]),
        'armR':  rot([(0,0),(0.25,-55),(0.45,70),(0.7,60),(0.95,0)]),
        'hairL': rot([(0,0),(0.45,-10),(0.7,6),(0.95,0)]),
        'hairR': rot([(0,0),(0.45,10),(0.7,-6),(0.95,0)]),
    }}
    # 眩晕：转圈摇晃
    A['stun'] = {'bones': {
        'head':  rot([(0,0),(0.3,-8),(0.6,8),(0.9,-6),(1.2,0)]),
        'torso': rot([(0,0),(0.3,4),(0.6,-4),(1.2,0)]),
    }}
    # 倒地
    A['ko'] = {'bones': {
        'root':  {**rot([(0,0),(0.25,-14),(0.6,-78),(0.8,-90)]), **tr([(0,0,0),(0.6,-30,-10),(0.8,-46,-22)])},
        'head':  rot([(0,0),(0.4,14),(0.8,22)]),
        'armL':  rot([(0,0),(0.5,30)]),
        'armR':  rot([(0,0),(0.5,-30)]),
    }, 'slots': {'body': col([(0,'ffffff'),(0.8,'c8c8d8')])}}
    # 胜利：跳一下 + 抬手
    A['win'] = {'bones': {
        'root':  tr([(0,0,0),(0.2,0,26),(0.4,0,0),(0.6,0,18),(0.8,0,0)]),
        'torso': sc([(0,1,1),(0.2,1.05,0.95),(0.4,0.97,1.04),(0.8,1,1)]),
        'armR':  rot([(0,0),(0.2,-95),(0.6,-85),(0.8,0)]),
        'armL':  rot([(0,0),(0.2,30),(0.8,0)]),
        'head':  rot([(0,0),(0.2,-5),(0.5,4),(0.8,0)]),
        'hairL': rot([(0,0),(0.3,8),(0.6,-5),(0.8,0)]),
        'hairR': rot([(0,0),(0.3,-8),(0.6,5),(0.8,0)]),
    }}
    # 入场：从上方落下 + 压扁回弹
    A['enter'] = {'bones': {
        'root':  tr([(0,0,0),(0.001,0,320),(0.5,0,0),(0.62,0,0)]),
        'torso': sc([(0,1,1),(0.5,1,1),(0.58,1.12,0.86),(0.75,0.98,1.03),(0.9,1,1)]),
        'head':  rot([(0,0),(0.58,4),(0.75,-2),(0.9,0)]),
    }}

    skel = {
        'skeleton': {'hash': '', 'spine': '4.1.24', 'x': -W/2, 'y': 0, 'width': W, 'height': H, 'images': './'},
        'bones': [B[n] for n in ['root','hip','torso','head','hairL','hairR','hairB','armL','armR','legL','legR']],
        'slots': [{'name': 'body', 'bone': 'root', 'attachment': 'body'}],
        'skins': [{
            'name': 'default',
            'bones': skel_bones,
            'attachments': {'body': {'body': {
                'type': 'mesh', 'width': W, 'height': H,
                'uvs': [round(u, 6) for u in uvs],
                'triangles': tris,
                'vertices': vdata,
                'hull': GRID_X * 2 + (GRID_Y-2) * 2,
            }}},
        }],
        'animations': A,
    }
    json.dump(skel, open(os.path.join(out_dir, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)

    atlas = f"""{name}.png
size: {W},{H}
format: RGBA8888
filter: Linear,Linear
repeat: none
body
  rotate: false
  xy: 0, 0
  size: {W}, {H}
  orig: {W}, {H}
  offset: 0, 0
  index: -1
"""
    open(os.path.join(out_dir, name + '.atlas'), 'w', encoding='utf-8').write(atlas)
    print('OK', out_dir, W, H, 'verts', GRID_X*GRID_Y, 'tris', len(tris)//3)

if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'chibi')
