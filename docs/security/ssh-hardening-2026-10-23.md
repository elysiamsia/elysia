# SSH 加固记录（2026-10-23）

## 触发

腾讯云控制台报 **24 条异常登录**（`ubuntu` 用户、美国 IP）。排查结论：**全部是失败的爆破尝试，没有一次成功登录**。

## 排查证据

| 检查 | 结果 |
|---|---|
| `Accepted password` 记录 | **无** ✅ |
| `Failed password` 次数 | 484 次（`43.163.7.211` 138 次居首，多为腾讯云自家肉鸡） |
| 登录用户 | 只有 `ubuntu`(1000, sudo) 与 `lighthouse`(1001, 密码已锁 `L`) |
| `authorized_keys` | 仅 `/home/ubuntu/.ssh/authorized_keys` 一把部署密钥 ✅ |
| root | 无 `authorized_keys` ✅ |
| 监听端口 | 80 / 22 / 127.0.0.1:8787 / systemd-resolved ✅ 无异常 |
| 定时任务 | 只有腾讯 stargate ✅ |
| 进程 | 无矿机（node 0.0%）✅ |

**结论：未被入侵。** 但配置是危险默认值。

## 加固内容

| 项 | 加固前 | 加固后 |
|---|---|---|
| `PasswordAuthentication` | **yes** | **no**（只剩密钥） |
| `PermitRootLogin` | **yes** | `prohibit-password`（root 无密钥 ⇒ 等于禁） |
| `MaxAuthTries` | 6 | **3** |
| `LoginGraceTime` | 120 | **20** |
| `KbdInteractiveAuthentication` | no | no（保持） |
| fail2ban | 未装 | **已装并启用**（sshd jail：5 次/10 分钟 → 封 1 小时） |
| cloud-init | 每次开机写回 `PasswordAuthentication yes` | `ssh_pwauth: false` ✅ |

## ⚠ 踩到的坑（很重要）

**OpenSSH 的规则是「先取到的值赢」，不是后写覆盖。**

`/etc/ssh/sshd_config` 第 24 行 `Include /etc/ssh/sshd_config.d/*.conf` 会先加载 `50-cloud-init.conf` 里的 `PasswordAuthentication yes`，
所以我后来在 drop-in（99-）和主配置末尾各写了一遍 `no`，`sshd -T` 依然报 `yes` —— 白折腾两轮。

**正解**：改 `50-cloud-init.conf` 本身（并关掉 cloud-init 的 `ssh_pwauth`，否则重启被写回）。

## 验收

```
sshd -T | grep passwordauthentication        → no
无密钥尝试登录                                → Permission denied (publickey).   ← 括号里只剩 publickey
带密钥登录                                    → ok，首页 200
fail2ban-client status sshd                   → 已封禁，Total failed 持续增长
```

## 若以后需要通过密码进（例如控制台 VNC 失效）

```
sudo sed -i "s/^PasswordAuthentication no/PasswordAuthentication yes/" /etc/ssh/sshd_config.d/50-cloud-init.conf
sudo systemctl reload ssh
```

⚠ 用完记得改回 `no`。