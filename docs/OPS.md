# 运维手册（自建同步后端）

记录这套自建同步后端的**实际部署形态**：怎么查、怎么修、怎么备份、怎么升级。
设计取舍见 [`SYNC.md`](SYNC.md)，第一次部署的步骤见 [`../deploy/README.md`](../deploy/README.md)。

> 本文只写**位置和命令，不写密码**。密码请放密码管理器。

## 一、当前实例

| 项 | 值 |
|---|---|
| 宿主机 | 飞牛OS（Debian 12），内网 `192.168.3.63`，SSH 用户 `Minc` |
| 应用目录 | `/vol1/1000/apps/recite/` |
| 容器 | `recite-pocketbase`（`ghcr.io/muchobien/pocketbase:0.40.6`） |
| 监听 | `127.0.0.1:8090`（**只绑回环**，局域网和公网都直连不到） |
| 对外地址 | `https://recite-nas.tailcdf6cb.ts.net`（Tailscale MagicDNS + Let's Encrypt） |
| Tailscale | 机器名 `recite-nas`，IP `100.88.101.67` |
| 反向代理 | `tailscale serve` 443 → `127.0.0.1:8090` |
| 管理后台 | `https://recite-nas.tailcdf6cb.ts.net/_/` |
| 数据量（2026-11） | `reviews` 22 / `states` 20 / `settings` 1 / `users` 1 |

两个账号，别混：

| 角色 | 用途 |
|---|---|
| superuser（`admin@recite.local`） | 进 `/_/` 管理后台、建用户、看/改数据、还原备份 |
| 应用账号（`users` 集合里那一个） | App 里「多端同步」填的邮箱密码，只能读写自己的进度 |

## 二、日常检查（30 秒）

```sh
# 1. 服务活着吗
curl -s https://recite-nas.tailcdf6cb.ts.net/api/health
# 期望: {"message":"API is healthy.","code":200,"data":{}}

# 2. 数据在长吗（登录后台后看，或直接用 API）
#    登录后台 → Collections → reviews，看条数是否随你背卡增长
```

在 NAS 上：

```sh
ssh Minc@192.168.3.63
cd /vol1/1000/apps/recite
sudo docker compose ps                    # 应该 Up (healthy)
sudo docker compose logs --tail=50        # 有异常看这里
systemctl list-timers recite-backup-sync.timer   # 备份定时器

df -h /vol1 /vol2                          # 磁盘余量
du -sh pb_data                             # 数据目录体积
```

## 三、备份与还原

### 结构

| 层 | 内容 | 位置 | 频率 / 保留 |
|---|---|---|---|
| ① PocketBase 自带 | 一致性快照 zip（`data.db` + `auxiliary.db`） | `/vol1/1000/apps/recite/pb_data/backups/` | 每天 **03:30**，留 **7** 份 |
| ② 跨盘副本 | 把 ① 的 zip 复制到另一块物理盘 | `/vol2/1000/backups/recite/` | 每天 **04:10**，留 **14** 份 |

`/vol1` 与 `/vol2` 是两块独立磁盘，单盘损坏不会同时丢数据和备份。两层都在同一台 NAS 上，
整机故障仍会一起丢 —— 要覆盖这个风险，可在后台 Backups 里配 S3 兼容存储。

### 配置在哪

- ①：PocketBase 后台 → Settings → Backups（`cron` 与 `cronMaxKeep`）
- ②：`/vol1/1000/apps/recite/backup-sync.sh` + `/etc/systemd/system/recite-backup-sync.{service,timer}`

定时器带 `Persistent=true`：若计划时间点 NAS 在关机，下次开机会补跑。

### 手动打一份备份

```sh
TOK=$(curl -s -X POST https://recite-nas.tailcdf6cb.ts.net/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin@recite.local","password":"<superuser 密码>"}' | jq -r .token)

# 注意：body 传 {}，不要自定义 name（自定义名会因命名规则被拒 400）
curl -X POST https://recite-nas.tailcdf6cb.ts.net/api/backups \
  -H "Authorization: $TOK" -H "Content-Type: application/json" -d '{}'
```

然后立刻同步到跨盘目录：

```sh
ssh Minc@192.168.3.63 'sudo systemctl start recite-backup-sync.service && ls -lh /vol2/1000/backups/recite/'
```

### 还原

管理后台 → **Settings → Backups** → 选中目标 zip → **Restore**。
这是最稳的还原路径（PocketBase 自己处理 SQLite 一致性）。

还原前建议先手动打一份当前备份，避免还原错了没法回退。

### 校验备份可用性

```sh
unzip -l /vol2/1000/backups/recite/*.zip | head
# 应看到 data.db、auxiliary.db、types.d.ts
```

## 四、故障排查

### 1. 浏览器打开根域名返回 `{"message":"File not found.","status":404}`

**正常。** PocketBase 根路径没有页面：

| 路径 | 用途 |
|---|---|
| `/` | 404，无页面（设计如此） |
| `/_/` | 管理后台 |
| `/api/health` | 健康检查 |

App 的「地址」栏仍然只填 `https://recite-nas.tailcdf6cb.ts.net`（不带路径），
它会自己拼 `/api/...`。

### 2. 从外面连不上 NAS，但 `tailscale ping` 能通

**已遇到过的真实故障。** `tailscaled` 认为有 tailnet IP，但内核接口上没写入，
所有进 NAS 的 tailnet 包都被丢弃。检查：

```sh
ip -br addr show tailscale0
# 正常: tailscale0  UNKNOWN  100.88.101.67/32 fd7a:.../128 fe80::.../64
# 异常: 只有 fe80::（缺少 100.x 地址）
```

修复：

```sh
sudo systemctl restart tailscaled
sleep 5 && ip -br addr show tailscale0   # 确认 100.x 已出现
```

排查时先排除 iptables：`sudo iptables -S INPUT` 只有 `-P INPUT ACCEPT` 就说明防火墙没参与。

### 3. App 里连接失败：`HTTP 401`

邮箱或密码不对。核对 `users` 集合里那个应用账号（不是 superuser）。

### 4. App 里连接失败：`HTTP 404 /api/...`

「地址」栏填多了路径。只填协议 + 域名，不加 `/api`、`/_/`、端口、结尾路径。

### 5. App 里连接失败：网络不可达

- 设备上的 Tailscale 是否在连接状态（手机端要开着 App）
- `tailscale serve` 是否还在：`tailscale serve status`，丢了就重跑 `sudo tailscale serve --bg 8090`

### 6. 容器起不来

```sh
cd /vol1/1000/apps/recite
sudo docker compose logs --tail=100
```

迁移失败会在这里报出具体 SQL/JS 错误。

### 7. 备份没按预期生成

```sh
# ① 层：看后台 Backups 列表，或
curl -s -H "Authorization: $TOK" https://recite-nas.tailcdf6cb.ts.net/api/backups
# ② 层
systemctl status recite-backup-sync.service --no-pager -l
journalctl -u recite-backup-sync.service -n 30 --no-pager
```

## 五、升级与回滚

### 升级 PocketBase

```sh
cd /vol1/1000/apps/recite
cp -r pb_data /vol2/1000/backups/recite/pre-upgrade-$(date +%Y%m%d)   # 先留一份原始数据
sed -i 's/pocketbase:0.40.6/pocketbase:<新版本>/' docker-compose.yml
sudo docker compose up -d
sudo docker compose logs --tail=50      # 看迁移是否顺利
```

升级失败就改回旧 tag 再 `up -d`，并用上一步的原始数据目录回滚。

### 回滚前端

```sh
git revert <commit> && git push     # GitHub Pages 会自动重新部署
```

### 更新后端集合定义

改 `pb_migrations/` 后需要把新迁移文件传到 NAS 并重启容器：

```sh
scp -r pb_migrations Minc@192.168.3.63:/vol1/1000/apps/recite/
ssh Minc@192.168.3.63 'cd /vol1/1000/apps/recite && sudo docker compose restart'
```

> 迁移只能向前追加，不要改已经应用过的迁移文件。

## 六、凭据与安全

- 密码放密码管理器：superuser、应用账号、NAS 登录、Tailscale 账号
- **不要把密码写进仓库**。前端预填值走 `.env.local`（已被 `.gitignore` 里的 `*.local` 覆盖）
- `~/.git-credentials` 若用 `store` helper 会存**明文**口令；建议换 `osxkeychain`：
  `git config --global credential.helper osxkeychain`
- 建议定期：改 NAS 登录密码 → 改 superuser 密码 → 重新在 App 里连一次（会重签 token）

## 七、这套东西的边界（别误用）

- **单人单账号**：`users` 只有一个，公开注册已关闭；多人用需要另设计隔离
- **不做实时推送**：App 每 5 分钟 + 回前台 + 重连时同步，不是即时协同
- **离线优先**：IndexedDB 是真相源，服务端只是合并点；后端挂了不影响背卡
- **同卡双端离线各背一次**：日志两条都在，但 `states` 按 `last_review` 覆盖，中间那次调度会丢（可后续用日志重放修复）
