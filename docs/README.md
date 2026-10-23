# 文档索引

> 47 份文档按用途分组。**只想了解现状** → 直接看 [`HANDOVER.md` §2.3](HANDOVER.md)。

## 先读这三份

| 文档 | 什么时候读 |
|---|---|
| [`HANDOVER.md`](HANDOVER.md) | **接手第一份**。§2.3 是 2026-10-23 现状快照；§六 是必读的坑 |
| [`REFACTOR-PLAN.md`](REFACTOR-PLAN.md) | 想知道重构为什么这么设计、红线是什么 |
| [`security/`](security/) | CVE 对账（`2026-10-cve-audit.md`）与 SSH 加固记录 |

## 按主题

### 重构（阶段 0/1 已全部完成）

| 文档 | 内容 |
|---|---|
| [`superpowers/plans/2026-10-18-refactor-phase-0-1.md`](superpowers/plans/2026-10-18-refactor-phase-0-1.md) | 实施计划：11 个 Task、模板契约、验证矩阵、拍板记录 |
| [`refactor/switchover-checklist.md`](refactor/switchover-checklist.md) | 切换清单（已执行；回滚步骤仍有效） |
| [`refactor/theme-inventory.md`](refactor/theme-inventory.md) | 12 页 THEME 盘点（art/verb 白名单、head 差异、游戏实现形态） |
| [`refactor/diff-su.md`](refactor/diff-su.md) | 首个模板页的零差异证明 |
| [`refactor/mobile-after-template.json`](refactor/mobile-after-template.json) | 模板化后 12 页 × 三档手机扫结果 |

### 内容与数据

| 文档 | 内容 |
|---|---|
| [`theme-schema.md`](theme-schema.md) | THEME 数据结构规格（探索/游戏/星屑/语录/打字机） |
| [`ISSUES-AND-FIXES.md`](ISSUES-AND-FIXES.md) | 问题与解法总表（历史 bug 索引） |
| `../content/characters/*.json` | 12 份角色数据（**唯一真源**） |

### 安全

| 文档 | 内容 |
|---|---|
| [`security/2026-10-cve-audit.md`](security/2026-10-cve-audit.md) | 2026-10 公告逐条对账 + Node 升级记录 |
| [`security/ssh-hardening-2026-10-23.md`](security/ssh-hardening-2026-10-23.md) | SSH 爆破排查与加固（含 OpenSSH「先到先得」坑） |

### 历史

| 文档 | 内容 |
|---|---|
| [`archive/handover-rounds.md`](archive/handover-rounds.md) | 34 轮过程记录（2026-10-15 ~ 10-18） |
| [`superpowers/plans/`](superpowers/plans/) | 各阶段原始计划（09-15 起） |