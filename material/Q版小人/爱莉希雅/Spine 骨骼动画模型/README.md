# 爱莉希雅 · Spine 骨骼动画模型（Q版）

> 本目录收集的是**爱莉希雅 Q版（死亡发型/大头身）Spine 模型**，共 **7 套**。
> 来源：B站 **@电獭Official**「把直播爱莉做成了桌宠」（[BV18rhez3ECA](https://www.bilibili.com/video/BV18rhez3ECA/)，2025-08-30）；
> 该作者在简介里标注「模型：米哈游 / 水母；工具：Live2DViewerEX」。
> 同作者的「天命特别教室」系列（芽衣 / 希儿 / 布洛妮娅 / 琪亚娜）用的是**同一套流程**。

---

## 一、7 套模型

| # | 目录 | 说明 | 动画 |
|---|---|---|---|
| 01 | `01_爱神使者_主色` | 爱神使者（粉色原色），桌宠首发款 | 9 段 |
| 02 | `02_爱神蚀者_暗色` | 同骨架换色（紫色「蚀者」版） | 9 段 |
| 03 | `03_女仆` | 女仆装（多一段 `1_idle_hunmi` 困倦待机） | 10 段 |
| 04 | `04_泳装` | 泳装 | 9 段 |
| 05 | `05_机车` | 机车服 | 9 段 |
| 06 | `06_JK` | JK 制服 | 9 段 |
| 07 | `07_功夫` | 功夫装（多一段 `1_idle_cry` 哭哭待机） | 10 段 |

动画名（各套基本一致）：

```
0_left / 0_right          转头
1_idle                    待机（默认播放）
2_walking_default/left/right   走
3_applaud                 鼓掌
4_wavehands               挥手
5_special_ani             专属动作
```

## 二、每套里的文件

| 文件 | 说明 |
|---|---|
| `*.skel` | **Spine 二进制骨骼（4.1.24）**，真正的骨骼+网格+动画数据 |
| `*.atlas` | 图集描述（区域名、坐标、缩放、pma） |
| `*.png` | 图集贴图 |
| `*.config.json` | Live2DViewerEX 的配置（type 9 = Spine，含快捷键/眨眼/鼠标跟随等） |

`_原始安装包/` 保留原始 zip（与桌面 `崩三小人/爱神使者/` 里的一致），方便原样导入 Live2DViewerEX。

## 三、怎么看 / 怎么用

1. **直接看静态截图**：`预览-0.png` ~ `预览-6.png`（由本目录 viewer 无头渲染，600×800）。
2. **交互预览（推荐）**：本目录 `viewer.html` + `spine-webgl.js`（官方 Spine 运行时 4.1.24）。
   因为用 `fetch` 读本地文件，**不能直接双击打开**，要在本目录起一个静态服务：

   ```bash
   cd "material/Q版小人/爱莉希雅/Spine 骨骼动画模型"
   python -m http.server 8777
   # 浏览器打开 http://127.0.0.1:8777/viewer.html
   ```

   支持：模型切换、动画切换、空格暂停、滚轮缩放、拖拽平移。
3. **导入 Live2DViewerEX**：把对应目录里的 4 个文件放进 `live2dviewerex\models\<名字>\`，
   或在软件里「新建 Spine 模型」指向 `*.config.json`。
4. **网页接入**：`viewer.html` 里的加载代码（`TextureAtlas` → `SkeletonBinary` → `Skeleton`）
   可以直接抄到站点里，运行时就是同目录的 `spine-webgl.js`。

## 四、版权与来源备注

- **角色形象版权归 miHoYo（崩坏3）所有**，本目录仅作同人站点素材/学习用途，禁止商用与二次售卖。
- 模型由 B站 **@电獭Official** 发布、原模型标注 **水母**；原始动效参数部分由其脚本自动生成。
- `spine-webgl.js` 为 Esoteric Software 官方运行时（npm `@esotericsoftware/spine-webgl@4.1.24`），
  使用需遵守其 `LicenseRef-LICENSE`（Spine Runtimes 许可）。
