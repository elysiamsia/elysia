# tools/snapshot_diff.py — 比对两次快照，列出差异（本地工具，不部署）
#
#   python tools/snapshot_diff.py baseline after-task3
#
# 有差异时退出码 1（可直接用于 CI 或链式命令）
# 数值等价归一化：0.85 与 .85、0px 与 0、rgba(0,0,0,0) 与 transparent 视为相同
#
# ⚠ 归一化只处理**写法差异**，不掩盖真差异：1.3rem 与 1.25rem 仍然是差异。
#   唯一被整段忽略的是 IGNORE_PROPS 里那几个天生会抖的属性。
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAP = ROOT / 'screenshots' / 'snap'

# ⚠ 这里原本是 {'transform'}，2026-09-16 拿掉了。理由：
#   原注释写的是「transform 天生会因渲染时机不同而抖动」——那是**旧快照工具**的问题，
#   当时无限动画停在随机相位，transform 自然每次都不同。
#   钉死无限动画之后实测：807 个采样点里 transform **全部相同，0 处差异**。
#   既然它已经稳定，继续忽略就等于白白丢掉一层检测能力——
#   而 transform 恰恰是 CSS 重构最容易动坏的东西（.timeline-node 的 translateY、
#   card-rotate、hero-float 全在它身上）。
#
#   若将来它又开始抖，**不要重新忽略**——那说明有动画逃出了钉死（多半是在
#   getAnimations() 之后才创建），该修的是快照工具，不是比对工具。
IGNORE_PROPS = set()


def norm(v: str) -> str:
    v = (v or '').strip().lower()
    # 前导零：0.5 -> .5
    v = re.sub(r'(?<![\d.])0\.(\d)', r'.\1', v)
    v = v.replace('rgba(0, 0, 0, 0)', 'transparent')
    v = re.sub(r'\s+', ' ', v)
    # 纯数值属性去掉单位与多余空格
    v = re.sub(r'(?<=[\d.])px\b', '', v)
    return v.strip()


def load(label):
    d = SNAP / label
    if not d.exists():
        raise SystemExit(f'找不到快照：{d}\n先跑 python tools/snapshot.py {label}')
    out = {}
    for f in sorted(d.glob('*.json')):
        out[f.stem] = json.loads(f.read_text(encoding='utf-8'))
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit('用法: python tools/snapshot_diff.py <旧label> <新label>')
    a, b = load(sys.argv[1]), load(sys.argv[2])

    keys = sorted(set(a) | set(b))
    diffs = []
    for k in keys:
        if k not in a:
            diffs.append(f'[新增快照] {k}')
            continue
        if k not in b:
            diffs.append(f'[丢失快照] {k}')
            continue
        for sel in sorted(set(a[k]) | set(b[k])):
            ra, rb = a[k].get(sel), b[k].get(sel)
            if ra is None:
                diffs.append(f'{k}  {sel}  [选择器新增]')
                continue
            if rb is None:
                diffs.append(f'{k}  {sel}  [选择器消失]')
                continue
            for prop in sorted(set(ra) | set(rb)):
                if prop in IGNORE_PROPS:
                    continue
                va, vb = norm(ra.get(prop, '')), norm(rb.get(prop, ''))
                if va != vb:
                    diffs.append(f'{k}  {sel}  {prop}\n     旧: {va}\n     新: {vb}')

    if not diffs:
        print(f'✅ 无差异：{sys.argv[1]} == {sys.argv[2]}')
        return 0

    print(f'❌ 发现 {len(diffs)} 处差异（{sys.argv[1]} -> {sys.argv[2]}）：\n')
    for d in diffs:
        print('  ' + d)
    return 1


if __name__ == '__main__':
    sys.exit(main())
