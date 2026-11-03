# 部署状态（进行中）

最后更新：2026-10-30 · 状态：**第 1–4 步完成**，待前端接线（第 5 步）

## 已完成（第 1–2 步）

| 步骤 | 内容 | 证据 |
|---|---|---|
| 1 | 文件上传到 `/vol1/1000/apps/recite/` | `docker-compose.yml`、`pb_migrations/`、`pb_data/` |
| 2 | PocketBase 容器运行 | `recite-pocketbase Up`，`/api/health` → 200 |
| 2 | 迁移生效 | 集合 `cards` / `reviews` / `states` / `settings` 均存在 |
| 2 | 管理员已建 | `admin@recite.local`（密码见对话，未写入本文件） |
| 3 | Tailscale 已安装并登录 | `tailscale 1.104.4`，机器名 `recite-nas`，IP `100.88.101.67` |

## 已完成（第 3 步收尾）

- 根因：**`tailscale0` 上没有写入 `100.88.101.67/32`**（tailscaled 认为有、内核接口上没有），
  导致所有进 NAS 的 tailnet 流量被丢。**不是防火墙问题**（`iptables -S INPUT` 只有 `-P INPUT ACCEPT`）。
- 修复：`sudo systemctl restart tailscaled` → 地址重新下发。
- `sudo tailscale serve --bg 8090` → `https://recite-nas.tailcdf6cb.ts.net/` 反代到 `127.0.0.1:8090`。
- 证书：Let's Encrypt 真实签发，`CN=recite-nas.tailcdf6cb.ts.net`，有效至 2027-01-28。
- 持久化已验证：重启 `tailscaled` 后地址与 serve 配置都自动恢复。

## 已完成（第 4 步）

- 应用账号：已建（邮箱与密码见本地记录，未写入仓库）
- 公开注册保持关闭；该账号登录后可直接读写 `reviews` / `states` / `settings`

## 待验证（NAS 整机重启后）

`tailscaled` 重启 OK，但**整机冷启动**未测。若重启后发现不通，先看这一条：

```sh
ip -br addr show tailscale0    # 必须出现 100.88.101.67/32
sudo systemctl restart tailscaled   # 缺失时再重启一次
```

## 恢复步骤

把 Mac 连回 `192.168.3.x` 网段（NAS 所在网络），然后按顺序：

```sh
# 1. 确认容器还在
ssh Minc@192.168.3.63
cd /vol1/1000/apps/recite && sudo docker compose ps

# 2. 判断 tailscaled 模式（关键诊断）
ip -br addr show tailscale0
sudo ss -ltnp | grep -E ':5666|:8090'

# 3. 暴露 PocketBase
sudo tailscale serve --bg 8090
tailscale serve status

# 4. 验证（Mac 或手机，需在 tailnet 内）
curl -s https://recite-nas.tailcdf6cb.ts.net/api/health
# 期望 {"message":"API is healthy.","code":200,"data":{}}
```

## 卡住时的判定表

| `ip -br addr show tailscale0` | 含义 | 处理 |
|---|---|---|
| 有 `100.88.101.67/32` | 正常 tun 模式 | 问题在别处，查 `nft list ruleset` |
| `Device "tailscale0" does not exist` | userspace 模式 | 只能靠 `tailscale serve` 代理，系统服务直连不通 |

## 后续（部署通了之后）

1. 前端配置同步：`localStorage.setItem('jiaojibei:sync-config', ...)`，见 `deploy/README.md` 第 5 步
2. 建应用账号（`users` 集合，一个即可，公开注册已关闭）
3. 飞牛定时快照指向 `/vol1/1000/apps/recite/pb_data`
4. 把 `tailscale serve` 写进 systemd 或开机脚本，避免重启失效

## 安全待办

- NAS 登录密码已在会话中明文出现过，**建议改一次**
- PocketBase 管理员密码请存入密码管理器
