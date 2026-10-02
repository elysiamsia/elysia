# -*- coding: utf-8 -*-
"""
tools/check_timeline_lore.py — 首页名片档案（`data/timeline-data.js` 的 `lore`）体检

**为什么需要这个：**

`lore` 里那 13 段档案，是从一份长文档里**复制粘贴**出来的。2026-10-02 体检发现：
**13 段里有 12 段是「同一段话写了两遍」** —— 一遍断行错乱 / 标点缺失 / 带 OCR 坏字，
一遍是修好的；`data/timeline-data.js` 里还夹着**孤立的姓名行**（「阿波尼亚」「维尔薇」）
与**孤立的标点行**（一个「。」）。**点开首页名片就能看到。**

这类问题**没有任何现成工具能发现**：
  · 快照采的是**计算样式**，不含文本内容 → 它报「✅ 无差异」
  · aria / 减动 / 探索系统那三个断言都不看这段文本
  · 它是**静态数据**，没有 DOM 事件可测
所以单开这一个：**纯文本检查，秒级，不需要浏览器。**

判据（同一段 `lore` 内）：
  ① 不许有**两行完全相同**（≥8 字）
  ② 不许有**两行互为前缀**（≥8 字）—— 「已修版」与「断行版」常常只差几个字
  ③ 不许出现已知的 OCR 坏词（下表）
  ④ 13 段一段不少、每段都有 `lore:` 赋值

⚠ ③ 那张表是**已知的**那几个，不是全部 —— 「抓马 / 守难口 / 无限了」是同一句被 OCR
  弄坏的样子。**新增坏词要手工加进来**；真正的通用防线是 ①②（重复段）。

跑法：  PYTHONIOENCODING=utf-8 python tools/check_timeline_lore.py
退出码：0 = 通过；1 = 有问题
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'timeline-data.js')

MIN_LEN = 8

# ⚠ 已知的 OCR 坏词 → 正确写法。**不是全部**，是 2026-10-02 那一次抓到的。
BAD_WORDS = {
    u'凶笼': u'囚笼',
    u'抓马': u'（「最后的孤岛」被 OCR 弄坏）',
    u'守难口': u'（「灾难已席卷了全境」被 OCR 弄坏）',
    u'无限了': u'（「吞噬了」被 OCR 弄坏）',
}


def main():
    if not os.path.exists(SRC):
        print(u'❌ 找不到 %s' % SRC)
        return 1
    L = io.open(SRC, encoding='utf-8').read().split('\n')

    # 切段：`lore: \`` 开头 → 到带 `\` }` 的那一行
    blocks, i = [], 0
    while i < len(L):
        if u'lore: `' in L[i]:
            j = i
            while j < len(L) and not re.search(u'`\\s*\\}', L[j]):
                j += 1
            name = u'?'
            for k in range(i, max(0, i - 4), -1):
                m = re.search(u"name: '([^']+)'", L[k])
                if m:
                    name = m.group(1)
                    break
            blocks.append((name, i, j))
            i = j
        i += 1

    fails = []

    # ④ 段数与赋值
    if len(blocks) != 13:
        fails.append(u'④ 只切出 %d 段 lore（应有 13 段）—— 解析器坏了，还是漏了一段？'
                     % len(blocks))

    for name, a, b in blocks:
        body = [x.strip() for x in L[a + 1:b] if x.strip()]
        # ①② 重复 / 前缀
        long = [(k, t) for k, t in enumerate(body) if len(t) >= MIN_LEN]
        for k, t in long:
            for k2, t2 in long:
                if k2 <= k:
                    continue
                if t == t2:
                    fails.append(u'① [%s] 第 %d 与第 %d 行**完全相同**：%s…'
                                 % (name, a + 2 + k, a + 2 + k2, t[:34]))
                elif t2.startswith(t) or t.startswith(t2):
                    fails.append(u'② [%s] 第 %d 与第 %d 行**互为前缀**（多半是「修好的那份」'
                                 u'与「断行的那份」并存）：%s…'
                                 % (name, a + 2 + k, a + 2 + k2, t[:34]))
        # ③ 坏词
        for w, hint in BAD_WORDS.items():
            for k, t in enumerate(body):
                if w in t:
                    fails.append(u'③ [%s] 第 %d 行有坏词「%s」（应为 %s）：%s…'
                                 % (name, a + 2 + k, w, hint, t[:34]))

    print(u'🔍 首页名片档案体检 —— data/timeline-data.js')
    print(u'   共 %d 段 lore' % len(blocks))
    print()
    if fails:
        for f in fails:
            print(u'  ✗ ' + f)
        print()
        print(u'❌ %d 处问题' % len(fails))
        print(u'⚠ 这 13 段是**站点门面上**的文字，改之前先把改动摊给需求方看。')
        return 1
    print(u'✅ 通过：13 段都没有重复段 / 前缀行，也没有已知的 OCR 坏词')
    return 0


if __name__ == '__main__':
    sys.exit(main())
