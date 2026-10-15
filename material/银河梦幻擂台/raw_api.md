# 官方活动接口与前端 JS 逆向材料（raw_api）

> 采集方式：`curl` 直连官方活动页与接口，下载 9.2MB 主 JS 包后本地静态分析。
> 说明：活动已结束，**所有数据接口均已下线并返回 Go 默认 404**。本文件记录的是「接口路径 / 数据结构 / 前端内嵌常量」，这部分是【确认】事实；对字段语义的解读标【存疑】。

---

## 1. 活动页与静态资源（【确认】）

| 项 | 值 |
|---|---|
| 活动页 URL | `https://act.mihoyo.com/bh3/event/e20260914bet-brjp02/index.html` |
| HTTP 状态 | 200（页面仍在，但是空壳 HTML + JS） |
| 页面标题 | 空（`<title></title>`，由 JS 注入） |
| JS 包 | `https://act.mihoyo.com/bh3/event/e20260914bet-brjp02/index_817e2d65a88868fefa2b.js`（**9,225,379 字节**） |
| CSS | `styles_2b719081819b987324c9.css`（639,086 B）、`styles_82ad8dc878f224844bf6.js`（338,366 B） |
| vendors | `vendors_de29b44f2535d277a46a.js`（3,885,599 B） |
| 公共库 | `https://webstatic.mihoyo.com/dora/lib/vue/2.7.14/vue.runtime.min.js`、sentry、mihoyo-account-sdk、mihoyo-event-login、mihoyo-analysis |

页面 HTML（摘要）：
```html
<meta name="applicable-device" content="mobile">
<meta name="Copyright" content="miHoYo">
<link rel="shortcut icon" href="https://bh3.mihoyo.com/favicon.ico">
<script src="https://webstatic.mihoyo.com/dora/biz/mihoyo-event-sentry-sdk/..."></script>
<script src="https://webstatic.mihoyo.com/dora/biz/mihoyo-event-login/v2/main.js"></script>
<script src="https://webstatic.mihoyo.com/dora/biz/mihoyo-account-sdk/main.js"></script>
<script src="https://webstatic.mihoyo.com/dora/biz/mihoyo-analysis/v2/main.js"></script>
```

---

## 2. 接口基址（【确认】，来自 JS 内 webpack module 59647）

```js
// module 59647
var i = "production",        // cA
    r = false,               // HN
    m = "prd",               // WO
    a = "bh3_cn",            // iG  (game_biz)
    u = "https://api-takumi.mihoyo.com/event/e20260914bet";   // av (API base)
```

Webpack chunk 名：`self.webpackChunke20260914bet`（chunk id `[57]`）。

---

## 3. 接口路径清单（【确认】，来自 JS 内 `j(path, params, method)` 调用）

| 路径 | 方法 | 含义（推断） |
|---|---|---|
| `/index` | GET | 活动首页数据 |
| `/news` | GET | 娱乐新闻 |
| `/schedule` | GET | 赛程表 |
| `/share_info` | GET | 分享信息 |
| `/achievements` | GET | 成就列表 |
| `/token_tasks` | GET | 竞猜券任务列表 |
| `/token` | POST | 领取竞猜券 |
| `/bet` | POST | 下注/投票 |
| `/update_match_stage` | POST | 更新比赛阶段（前端轮询驱动服务端推进） |
| `/finish_guide` | POST | 完成引导 |

**探测结果**：对 `https://api-takumi.mihoyo.com/event/e20260914bet/{index,info,getData,get_data,config,list,share_info,bet,update_match_stage,home,home/index}` 逐一 curl（带 `User-Agent` + `Referer: https://act.mihoyo.com/`），**全部返回 HTTP 404，响应体为 19 字节纯文本 `404 page not found`**（Go http 服务器默认 404），说明活动服务端已下线，非路径写错。

```
index -> 404 : 404 page not found
info -> 404 : 404 page not found
getData -> 404 : 404 page not found
get_data -> 404 : 404 page not found
config -> 404 : 404 page not found
list -> 404 : 404 page not found
share_info -> 404 : 404 page not found
bet -> 404 : 404 page not found
update_match_stage -> 404 : 404 page not found
home -> 404 : 404 page not found
home/index -> 404 : 404 page not found
```

补充探测：Wayback Machine（`archive.org/wayback/available`、CDX API）对 `act.mihoyo.com/bh3/event/e20260914bet*` 与 `api-takumi.mihoyo.com/event/e20260914bet*` **均无任何存档快照**（curl 返回空体）→【未找到】接口存档。

---

## 4. 前端内嵌核心常量（【确认】，JS 原文）

### 4.1 参赛角色英文 key 数组与 ID 映射
```js
// d = 角色 key 数组
d = ["xinchunyayi","xier","shenxina","xunmengzhe","lita","yaya",
     "weita","xinchunqiyana","youyun","kelali","heliya","xiaoyoulandaier"]

// h = key -> spine 资源名
h = { xinchunyayi:"xinchunyayi", xier:"xier", shenxina:"shenxina",
      xunmengzhe:"shenxunmengzhe", lita:"lita", yaya:"daya",
      weita:"weita", xinchunqiyana:"qiyana", youyun:"youyun",
      kelali:"longniang", heliya:"mohuaheliya", xiaoyoulandaier:"youlandaier" }

// g = 角色 id(1..12) -> key
g = { 1:"xinchunyayi", 2:"xier", 3:"shenxina", 4:"xunmengzhe",
      5:"lita", 6:"yaya", 7:"weita", 8:"xinchunqiyana",
      9:"youyun", 10:"kelali", 11:"heliya", 12:"xiaoyoulandaier" }
```

**对应关系表（key ↔ 游戏内显示名）**

| id | JS key | spine 资源名 | 游戏内显示名 | 依据 |
|---|---|---|---|---|
| 1 | xinchunyayi | xinchunyayi | 芽衣（同名，见下） | 【存疑】见备注 |
| 2 | xier | xier | **希儿** | 面板截图一致 |
| 3 | shenxina | shenxina | **希娜狄雅** | 面板截图一致 |
| 4 | xunmengzhe | shenxunmengzhe | **寻梦者** | 面板截图一致 |
| 5 | lita | lita | **丽塔** | 面板截图一致 |
| 6 | yaya | daya | 布洛妮娅？（同名，见下） | 【存疑】见备注 |
| 7 | weita | weita | **薇塔** | 名称直译 |
| 8 | xinchunqiyana | qiyana | **琪亚娜**（新春琪亚娜） | 面板截图显示「琪亚娜」 |
| 9 | youyun | youyun | **游云** | 面板截图一致 |
| 10 | kelali | longniang | **科拉莉**（龙娘科拉莉） | 面板截图显示「科拉莉」 |
| 11 | heliya | mohuaheliya | **赫丽娅**（魔化赫丽娅） | 面板截图显示「赫丽娅」 |
| 12 | xiaoyoulandaier | youlandaier | **幽兰戴尔**（小幽兰戴尔） | 剧情分P标题「幽兰戴尔」 |

> **【存疑】关于 1 / 6 两个 key 的显示名归属**：
> - 游戏内 12 名选手的显示名为：薇塔、希娜狄雅、希儿、寻梦者、丽塔、幽兰戴尔、科拉莉、芽衣、布洛妮娅、赫丽娅、琪亚娜、游云（见 `raw_miyoushe_data.md` 的面板截图与赛程记录）。
> - JS 的 12 个 key 中，`yaya`（spine 名为 **daya**）与 `xinchunyayi` 二者之一对应「芽衣」，另一对应「布洛妮娅」，但前端 bundle 内不含中文显示名（显示名由服务端 `/index` 下发），**因此无法从前端确定二者的一一对应**。
> - 旁证：`yaya` 的 spine 资源名是 `daya`（「大鸭」），中文社区里「鸭鸭」= 布洛妮娅；而 `xinchunyayi`（新春芽衣）字面对应芽衣。此推断仍为【存疑】，不应当作确定事实。

### 4.2 状态效果（Buff/Debuff）完整清单
从 JS 素材图集区域名（`buff_skill_R.png` 等 nebula/spine atlas）中提取，共 24 条：
```
护盾 / 回血 / 眩晕 / 无法行动 / 引爆标记 / 影子+1
混乱状态 / 结束混乱状态
麻痹状态 / 结束麻痹
浮空状态 / 结束浮空
瘫痪状态 / 结束瘫痪
已被支配 / 支配结束
攻击升高 / 攻击降低
防御升高 / 防御降低
速度升高 / 速度降低
命中率升高 / 命中率降低
```
> 相比任务简报里给出的 11 个状态，**多出**：护盾、回血、引爆标记、影子+1、支配（已被支配）、命中率升高/降低。

### 4.3 场景/界面素材线索（用于识别截图出处）
```
入口界面 / 活动主界面 / 对战竞猜界面 / 对战回放
../广场images/、../数据images/、../琥珀images/、../警局images/、./回廊images/
地丰-郊外、地丰-樱花树
```
> 「地丰」= 活动主场景名；樱花树 = 竞猜界面背景（与截图一致）。

### 4.4 其他前端常量
```js
l = { TS_LOCKED:"no-complete", TS_DOING:"no-complete", TS_DONE:"has-get", TS_ACK:"had-get" } // 任务状态 class
_ = { MS_Default:1, MS_ONE:1, MS_TWO:2, MS_THREE:3, MS_FOUR:4, MS_FIVE:5, MS_SIX:6,
      MS_SEVEN_BEFORE:7, MS_SEVEN_AFTER:8, MS_EIGHT:9, MS_NIGHT:10 }
b = { ... MS_SEVEN_AFTER:7 ... MS_NIGHT:9 }   // 两套 match-stage 枚举
k = 9999999     // 某个上限常量
x = { 1:"#FFFFFF", 2:"#FFFFFF", 3:"#FFFFFF" } // 3 种背景对应的文字颜色
```

---

## 5. JS 中文文案提取结果（方法说明）

对 9.2MB 主包做正则提取所有含 CJK 的字符串字面量：
- 总字符串字面量 381,272 条
- 含中文 26,326 条（去重后 2,321 条）
- **其中 95% 以上是美术资源图集区域名**（骨骼名如「胯部」「裙子3」，动画名如「射箭/射箭_00000」）

**结论：该活动的角色中文名、属性数值、技能描述、赔率、奖励文案全部由服务端接口下发，前端 bundle 内不含**。因此角色数值只能从玩家截图/攻略帖获取（见 `raw_miyoushe_data.md`）。

复现脚本：`tmp/lm/extract_cn.py`（用法 `python extract_cn.py <js> <out.txt>`）。

---

## 6. 复现命令

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"
BASE="https://act.mihoyo.com/bh3/event/e20260914bet-brjp02"
curl -s -H "User-Agent: $UA" "$BASE/index.html" -o page.html
curl -s -H "User-Agent: $UA" "$BASE/index_817e2d65a88868fefa2b.js" -o index.js
# 提取中文串
python extract_cn.py index.js js_cn.txt
# 接口探测
for p in index news schedule share_info achievements token_tasks; do
  curl -s -o /dev/null -w "$p %{http_code}\n" -H "User-Agent: $UA" \
    -H "Referer: https://act.mihoyo.com/" \
    "https://api-takumi.mihoyo.com/event/e20260914bet/$p"
done
```
