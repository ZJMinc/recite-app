# 多端同步（可选后端）

> 目标：多台设备共用一个学习进度，**离线仍然完整可用**。
> 后端不参与背卡决策，只当合并点。

## 为什么后端可以这么小

看 `src/db.ts` 的写入路径就会发现：`reviews` 是**只追加的日志**（`cardId / at / rating / prevState`），而 `cards` 上的 FSRS 状态是这份日志的确定性函数（`ts-fsrs` 按 `at` 重放即可）。于是：

- 复习日志之间**永不冲突** —— 取并集、按 `(cardId, at, rating)` 去重就够了；
- 每张卡只需要一个"最新状态"，按 `last_review` 做 last-write-wins；
- 当日聚合（`daily`）可以从日志重算，不需要同步。

所以服务端只有四个集合，没有消息队列、没有 CRDT、没有实时通道。

## 数据模型

| 集合 | 角色 | 冲突策略 |
|---|---|---|
| `cards` | 内容，服务端权威 | 客户端只读；按 `content_ver` 增量下发 |
| `reviews` | 复习日志，只增不改 | 取并集；唯一索引 `(card_id, at, rating)` 保证重推幂等 |
| `states` | 每卡 FSRS 状态 | `last_review` 大者胜 |
| `settings` | 单条设置 | `updated` 大者胜 |

迁移脚本：`pb_migrations/1761000000_init_sync.js`（已针对 PocketBase **v0.40.6** 实测）。

索引要点：

```sql
CREATE UNIQUE INDEX idx_reviews_dedupe ON reviews (card_id, at, rating);
CREATE UNIQUE INDEX idx_states_card_id ON states (card_id);
CREATE UNIQUE INDEX idx_cards_card_id  ON cards  (card_id);
```

三条唯一索引是整个方案"可以随便重试"的根基 —— 客户端不需要 outbox 状态机，失败重推就行。

## 客户端结构

```
src/sync/
├─ merge.ts    纯函数：并集、LWW 判定、当日聚合重算（可单测，无 IO）
├─ client.ts   PocketBase REST 客户端（无 SDK 依赖，6 个端点）
├─ engine.ts   同步编排：拉内容 → 推日志 → 推状态 → 拉状态 → 拉日志 → 设置
├─ config.ts   配置与 token（localStorage）
└─ useSync.tsx 后台节奏：启动 / 回前台 / 重连 / 每 5 分钟
```

游标都是水位线，存在 IndexedDB 的 `syncMeta` 表：

| 游标 | 含义 |
|---|---|
| `cursor.content.pull` | 已拉到的最新 `content_ver` |
| `cursor.review.push` | 已推上去的最后一条本地 `reviews.id` |
| `cursor.review.pull` | 已拉下来的最新 `reviews.at` |
| `cursor.state.push` / `.pull` | 状态推送/拉取的时间水位 |
| `cursor.settings.updated` | 设置的 LWW 时间戳 |

`SyncRuntime` 已挂在 `Layout` 里；**没配置后端时是彻底的 no-op**，不影响现有单机行为。

## 配置（当前无 UI，用控制台一行搞定）

```js
localStorage.setItem('jiaojibei:sync-config', JSON.stringify({
  baseUrl: 'https://nas.<your-tailnet>.ts.net',
  email: 'you@example.com',
  password: '你的密码',
}))
// 刷新页面后自动开始同步
```

> 注意：密码存在 localStorage 里。单人自用设备可以接受；如果以后要给他人用，应改成「登录一次 → 只存 token」。

清空：

```js
localStorage.removeItem('jiaojibei:sync-config')
localStorage.removeItem('jiaojibei:sync-token')
```

## 飞牛OS 部署

### 1. PocketBase 容器

```yaml
# /vol1/1000/apps/recite/docker-compose.yml
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:0.40.6
    restart: unless-stopped
    ports:
      - "127.0.0.1:8090:8090"     # 只绑回环，绝不直接映射到 LAN/公网
    volumes:
      - ./pb_data:/pb_data
      - ./pb_migrations:/pb_migrations
```

`pb_migrations/` 从本仓库复制过去，容器启动时会自动执行。

### 2. Tailscale 组网（替代端口映射）

```sh
# 飞牛OS SSH 内
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale status          # 确认拿到 nas.<tailnet>.ts.net
```

在 Tailscale 管理后台的 **DNS** 页确认已启用 **HTTPS Certificates**，然后：

```sh
# 方式 A：让 tailscale 直接代理本地端口（推荐，自动签证书）
sudo tailscale serve --bg 8090
tailscale serve status    # 打印 https://nas.<tailnet>.ts.net

# 方式 B：只签证书，交给飞牛反代/Caddy
sudo tailscale cert nas.<tailnet>.ts.net
```

好处是**路由器不需要任何入站放行**：NAS 主动出站建隧道，IPv6 防火墙可以保持全开。手机装 Tailscale 登录同一账号即可访问。

> 为什么不用 IPv6 直连：本机网络是「光猫拨号 + 荣耀路由4 二次 NAT」，IPv6 出站正常但入站被路由防火墙拦；且 `240e:0390:9486:4801::/64` 是 PD 前缀，重拨会变。见 `docs/PLAN.md` 的部署备注。

### 3. 建账号

浏览器打开 `https://nas.<tailnet>.ts.net/_/`：

1. 首次进入创建 superuser（管理后台账号）；
2. 在 `users` 集合里手动建**一个**应用账号（邮箱 + 密码）—— 公开注册已被迁移脚本关掉；
3. 把这个邮箱密码填进前端 `sync-config`。

### 4. 备份

`pb_data/` 是单目录，飞牛定时快照直接覆盖。也可用 PocketBase 自带备份：

```sh
curl -X POST https://nas.<tailnet>.ts.net/api/backups \
  -H "Authorization: <superuser-token>"
```

## 验证

```sh
# 纯逻辑（不需要后端、不需要浏览器）
node scripts/sync-merge.mjs

# 类型检查
node node_modules/typescript/bin/tsc -b
```

端到端自测（手工）：两台设备分别配置同一个后端 → 各自离线背几张 → 联网 → 看两边 `统计` 页的复习数是否一致、`知识树` 的掌握度是否收敛。

## 已知限制（刻意留的，不是 bug）

1. **同卡双端离线各背一次**：日志会两条都保留，但 `states` 只有后复习的那条生效——中间那次调度被覆盖。可以用日志重放修复，属于后续优化（M3 之后）。
2. **`seconds` 无法跨端合并**：只保留本地值（日志里没有时长信息）。要准确就在 `reviews` 加一列。
3. **设置用推送时间戳**：双端同时改设置有极小概率互相覆盖。
4. **内容删除**用 `deleted` 软删标记，不做物理同步。
5. **未做实时推送**：靠 5 分钟轮询 + 回前台/重连触发，单人场景足够。

## 还没做

- 设置页里的「同步」UI（配置、状态、立即同步按钮）——目前靠控制台写 localStorage
- 冲突的日志重放修复
- 内容批量导入（从 `src/data/seed.ts` 灌进 `cards` 集合的脚本）
