# 其他社区来源（raw_community）

> 覆盖：TapTap、崩坏3官网、NGA、贴吧、虎扑、gamekee、Bing/DDG 搜索引擎、Wayback Machine。

---

## 1. TapTap（【确认】）

### 官方公告转载
- URL：<https://www.taptap.cn/moment/847554239180832774>
- 标题：【公告】火力全开！银河梦幻擂台！丨参与竞猜获取水晶等奖励 - 崩坏3公告 - TapTap 崩坏3论坛
- 作者：**乌酱**（<https://www.taptap.cn/user/532896>）
- `datePublished`: **2026-09-14T02:15:00+00:00**
- `dateModified`: 2026-09-14T02:15:00+00:00
- 封面图：<https://img2-tc.tapimg.com/moment/etag/FjIZ_msCWZWCXTJ4VcW1A8MyVZ-5_20260911191620.png/_tap_ugc.jpg>
- 抓取结果：HTTP 200，233,950 字节；HTML 内 `银河`/`擂台`/`火力全开` 各出现 21 次，`竞猜券` 出现 33 次
- 内容与米游社官方帖 <https://www.miyoushe.com/bh3/article/78157203> **完全一致**（同一份官方公告），无额外信息
- 正文在 SSR HTML 中以 `<meta name="description">` + JSON-LD 形式给出首段：
  > 亲爱的观众，万众瞩目的「火力全开！银河梦幻擂台！」就要开始了~那是最充满期待的假期，在一堆水费电费燃气费的账单里，一张比赛的宣传单格外醒目……

**结论**：TapTap 只提供公告转载，**没有角色数值/赔率/赛程数据**。

---

## 2. 崩坏3 官网（【确认，无活动数据】）

- 官网：<https://bh3.mihoyo.com/>、移动端 <https://bh3.mihoyo.com/m/>
- 活动页本身：`https://act.mihoyo.com/bh3/event/e20260914bet-brjp02/index.html`（HTTP 200，但为 JS 空壳，见 `raw_api.md`）
- 官网新闻页未检索到「银河梦幻擂台」专门攻略页（活动为网页活动，官方主要靠游戏内公告 + 米游社/TapTap 发帖）

---

## 3. Wayback Machine / 网页存档（【未找到】）

全部探测**无任何存档**：

| 探测 | 结果 |
|---|---|
| `http://archive.org/wayback/available?url=act.mihoyo.com/bh3/event/e20260914bet-brjp02/index.html` | curl 返回空体（无快照） |
| `http://web.archive.org/cdx/search/cdx?url=api-takumi.mihoyo.com/event/e20260914bet*&output=text&limit=100&collapse=urlkey` | 空（无存档） |
| `http://web.archive.org/cdx/search/cdx?url=act.mihoyo.com/bh3/event/e20260914bet*&output=text&limit=100&collapse=urlkey` | 空（无存档） |

→ **无法通过存档恢复官方接口返回的原始 JSON**。这是本次挖掘最大的遗憾：若能找到任一 `/index` 响应存档，即可一次性拿到全部 12 名角色的官方数值与技能。

---

## 4. 搜索引擎结果（【确认，价值低】）

由于活动是**中文社区 + 网页活动 + 已下线**，通用搜索引擎（默认 Bing zh-CN 市场）几乎无有效结果。

实际检索关键词与结果：
- `崩坏3 银河梦幻擂台 角色 属性 技能 攻略`
- `银河梦幻擂台 赔率 竞猜 冠军 寻梦者`
- `崩坏3 火力全开 银河梦幻擂台 奖励 兑换`

返回结果以**无关内容**为主（《崩坏：星穹铁道》官网、吉利银河汽车官网、百度百科「银河」词条等），未命中活动页面或攻略。

**结论**：此类活动的数据**只存在于米游社/B站**，通用搜索引擎索引不到（米游社正文 JS 渲染 + B站正文在视频/评论里）。→ 建议后续直接打米游社 API，不要浪费配额在通用搜索上。

---

## 5. 虎扑 / NGA / 贴吧 / gamekee / 网易云游戏（【未找到】）

- **NGA**（bbs.nga.cn）：未检索到「银河梦幻擂台」相关帖子。NGA 对未登录用户有反爬与搜索限制。
- **百度贴吧**（崩坏三吧）：未检索到有效活动数据帖（贴吧搜索页需登录）。
- **虎扑**（bbs.hupu.com）：未检索到。
- **gamekee wiki**（bh3.gamekee.com）：未检索到该活动的角色数据页（活动为限时网页活动，wiki 通常不收录）。
- **网易云游戏**（cg.163.com）：未检索到。
- **3DM / 游民星空 / 17173**：未检索到。

**结论**：本活动属于「短期网页活动 + 社区自嗨」类型，除**米游社**与 **B站**外，其他中文游戏媒体**完全没有覆盖**。

---

## 6. 有效数据源优先级总结

| 优先级 | 来源 | 能拿到什么 | 备注 |
|---|---|---|---|
| ★★★★★ | **米游社 `getPostFull` + `getTopicPostList`（话题 2491）** | 角色面板/技能全套截图、赔率、赛程对阵图、胜负皇冠截图、奖励兑换表、任务表、成就全表、娱乐新闻截图、玩家模拟 | **唯一可结构化的来源**；无需登录；需控频 |
| ★★★★ | **B站 `x/web-interface/view`** | 21 场分 P 标题（完整时间线）、剧情章节名、视频简介 | 稳定可用 |
| ★★★ | **B站 `x/v2/reply`（仅首页）** | 关键结果印证、社区梗 | 风控严；需 cookie 才能翻页 |
| ★★ | TapTap | 官方公告转载 | 与米游社重复 |
| ★ | 通用搜索引擎 / WA / NGA / 贴吧 | 无 | 不值得再投入 |

---

## 7. 图片资源清单（本地已下载）

| 目录 | 数量 | 内容 |
|---|---|---|
| `tmp/lm/imgs/` | 77 张 | 9 场对阵的赔率截图 + 角色面板截图 + 玩家模拟截图 + YYGQ 帖全部配图 |
| `tmp/lm/imgs2/` | 94 张 | 奖励/成就/任务表、赛程对阵图、投票记录、娱乐新闻、12 连胜战绩、决胜局面板 |

清单文件：`tmp/lm/imgs_manifest.txt`、`tmp/lm/imgs2_manifest.txt`
