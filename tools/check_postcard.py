# -*- coding: utf-8 -*-
"""
tools/check_postcard.py — 首页「语录明信片」断言

**为什么需要这个：现有四个工具一个都测不到明信片。**

  · `snapshot.py` 采的是**计算样式**：明信片整张画在 `<canvas>` 上，
    画面是像素、没有 DOM，改了版式它**一个字都报不出来**
  · `check_aria_labels.py` / `check_reduced_motion.py` / `check_explore.py`
    分别只看语录卡属性、动画与滚动、探索系统 —— 都不看这一节
  · 而它偏偏是**唯一一个把本站带出去的东西**（存图 → 发到朋友圈/群里），
    坏了不会自己冒烟：画布照样出图，只是**图是错的**（立绘空白、文字压出边框…）

所以单开这一个。**两部分**：
  · **纯文本那几条**（弹幕话术的键与台词对不对得上）—— 不用浏览器，秒级
  · **浏览器那几条**（真点弹幕、真打字、真存图）—— 自带 8501 服务器 + 无头 Edge，
    照 `tools/check_explore.py` 的骨架

⚠ 为什么必须走**真用户路径**（真鼠标事件）：明信片的脚本是 IIFE 包裹的，
  内部函数不是全局的；而且就算调得到，也测不出「弹幕点下去有没有接上」。

跑法：
    PYTHONIOENCODING=utf-8 python tools/check_postcard.py                 # 全跑
    PYTHONIOENCODING=utf-8 python tools/check_postcard.py --only prompt   # 只跑名字含它的

退出码：0 = 全部通过；1 = 有断言失败。
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MAX_CHARS = 200          # spec §七：访客写字的硬上限
PROMPTS_PER_QUOTE = 3    # spec §5.2：每条台词配 3 句

CHECKS = []


def check(fn):
    CHECKS.append(fn)
    return fn


def read(path):
    return io.open(os.path.join(ROOT, path), encoding='utf-8').read()


# ══ 纯文本：弹幕话术的键，必须与台词逐字对得上 ═══════════════════════════
#   ⚠ 这条是本文件**唯一一条不用浏览器的** —— 也正因为如此它才重要：
#     键对不上时页面**一点异常都没有**，只是没有弹幕（静默）。
#     而「改了一个标点」正是最容易发生的那种漂移。

def quotes_daily():
    """从 `data/quotes.js` 抠出 `daily` 那 10 条（逐字，含「」）。"""
    src = read('data/quotes.js')
    i = src.find('daily')
    if i < 0:
        return None
    seg = src[i:src.find(']', i)]
    return re.findall(u"'([^']+)'", seg)


def prompts_map():
    """从 `data/postcard-prompts.js` 抠出 {键: [话术…]}。

    ⚠ 要求**一条占一行**、形如 `'「…」': ['a', 'b', 'c'],` ——
      嵌套数组用正则切不干净，这个格式是人写的、也能机器读。
      （数据文件头部会写明这条约定；换了格式这里就红。）
    """
    src = read('data/postcard-prompts.js')
    out = {}
    for m in re.finditer(u"^\\s*'([^']+)'\\s*:\\s*\\[(.*)\\]\\s*,?\\s*$", src, re.M):
        key = m.group(1)
        vals = re.findall(u"'([^']*)'", m.group(2))
        out[key] = vals
    return out


@check
def check_prompt_keys_match_quotes():
    """弹幕话术的键，必须能在 `quotes.js` 的 daily 里**逐字**找到（且恰好一一对应）。

    ⚠ 反方向也查：daily 的每一条都该有弹幕 —— 否则那条台词点进去是空的。
    """
    daily = quotes_daily()
    if not daily:
        return ([u'从 `data/quotes.js` 里抠不出 daily（解析器坏了？）'], u'—')
    try:
        pm = prompts_map()
    except IOError:
        return ([u'`data/postcard-prompts.js` 还不存在'], u'—')

    fails = []
    if not pm:
        fails.append(u'`data/postcard-prompts.js` 里一条都没解析出来 —— '
                     u'格式要「一条占一行」：`\'「台词」\': [\'a\', \'b\', \'c\'],`')

    for key, vals in sorted(pm.items()):
        if key not in daily:
            near = [q for q in daily if q[:6] == key[:6]]
            fails.append(u'弹幕的键在 daily 里**找不到**：%s%s'
                         % (key, u'（最像的是：%s）' % near[0] if near else u''))
        if len(vals) < PROMPTS_PER_QUOTE:
            fails.append(u'「%s」只配了 %d 句（要 ≥ %d 句）' % (key[:14], len(vals), PROMPTS_PER_QUOTE))

    for q in daily:
        if q not in pm:
            fails.append(u'daily 里的这句没有弹幕：%s' % q[:24])

    return (fails, u'%d 条台词 / %d 组话术，键逐字对得上' % (len(daily), len(pm))
            if not fails else u'键对不上')


# ══ 二维码：必须**真的能解出那个网址** ═════════════════════════════════
#   ⚠ 不许只验证「文件在、尺寸对、看着像二维码」——
#     圆角遮罩、配色、模块形状任何一处做过头，都会让**扫码解不出来**，
#     而那在页面上完全看不出来（它还是张好看的图）。
#     所以这条判据是：**解码器解出来的字符串必须等于**那个 URL。

QR_PATH = 'images/qr-elysiad.png'
QR_URL = 'https://elysiad.top/'
QR_SIZE = 240


@check
def check_qr_decodes():
    """预生成的二维码必须能**解出** `https://elysiad.top/`。"""
    try:
        from PIL import Image
    except ImportError:
        return ([u'没装 Pillow，这条验不了 —— `pip install pillow`'], u'—')
    try:
        import zxingcpp
    except ImportError:
        return ([u'没装解码器，这条验不了 —— `pip install zxing-cpp`（缺了它就没法证明扫得出来）'], u'—')

    p = os.path.join(ROOT, QR_PATH)
    if not os.path.exists(p):
        return ([u'`%s` 还不存在' % QR_PATH], u'—')

    img = Image.open(p)
    fails = []
    if img.size != (QR_SIZE, QR_SIZE):
        fails.append(u'尺寸是 %sx%s，spec 要求 %dx%d' % (img.size[0], img.size[1], QR_SIZE, QR_SIZE))
    if img.mode not in ('RGBA', 'RGB', 'P'):
        fails.append(u'图像模式是 %s，出图恐怕不对' % img.mode)

    got = zxingcpp.read_barcode(img.convert('RGBA'))
    if got is None:
        fails.append(u'**解不出来** —— 扫码会失败（圆角遮罩/配色/模块形状做过头了？）')
    elif got.text != QR_URL:
        fails.append(u'解出来的不是那个网址：%r（应为 %r）' % (got.text, QR_URL))

    return (fails, u'解出来 = %s' % QR_URL if not fails else u'二维码扫不出来')


# ── 主流程 ────────────────────────────────────────────────────────────
def main():
    raw = sys.argv[1:]
    only = None
    if '--only' in raw:
        i = raw.index('--only')
        if i + 1 >= len(raw):
            print(u'--only 后面要跟一个名字片段')
            return 1
        only = raw[i + 1]
        raw = raw[:i] + raw[i + 2:]
    if only and not any(only in f.__name__ for f in CHECKS):
        print(u'❌ 没有哪条断言的名字里含 %r —— 筛口写错了？' % only)
        return 1

    print(u'🔍 明信片断言 —— index.html 的 #postcard 那节')
    if only:
        print(u'   ⚠ **只跑**了名字含 %r 的断言（`--only`）—— 这不是一次全量验收' % only)
    print()

    pool = [f for f in CHECKS if not only or only in f.__name__]
    failures = []
    for i, fn in enumerate(pool):
        fails, summary = fn()
        tag = chr(0x2460 + i) if i < 20 else u'(%d)' % (i + 1)
        print(u'  %s %s %s' % (u'✓' if not fails else u'✗', tag, summary))
        for f in fails:
            print(u'       • ' + f)
        failures.extend(fails)

    print()
    if failures:
        print(u'❌ %d 项断言失败' % len(failures))
        return 1
    if only:
        print(u'✅ 全部通过：%d 组断言（`--only` 筛过的，**不是全量**）' % len(pool))
    else:
        print(u'✅ 全部通过：%d 组断言' % len(pool))
    return 0


if __name__ == '__main__':
    sys.exit(main())
