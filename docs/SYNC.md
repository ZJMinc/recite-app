# 多端同步（可选后端）

> 目标：多台设备共用一个学习进度，**离线仍然完整可用**。
> 后端不参与背卡决策，只当合并点。
>
> 已部署实例的**备份、还原、排障、升级**见 [`OPS.md`](OPS.md)；首次部署步骤见
> [`../deploy/README.md`](../deploy/README.md)。

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

## 配置

在 App 里 **设置 → 多端同步** 填三栏并点「连接并同步」即可：

| 栏位 | 填什么 |
|---|---|
| 地址 | 只填协议 + 域名，例如 `https://nas.<your-tailnet>.ts.net`（**不要带 `/api`、`/_/` 或端口**） |
| 邮箱 | `users` 集合里那个应用账号 |
| 密码 | 同上 |

预填值走构建期环境变量，本地放 `.env.local`（已被 `.gitignore` 覆盖），
这样公开仓库里不会出现个人地址：

```sh
# .env.local
VITE_SYNC_BASE_URL=https://nas.<your-tailnet>.ts.net
VITE_SYNC_EMAIL=you@example.com
```

> 没有环境变量时输入框留空，纯手工填。密码只存在于浏览器 `localStorage`，
> 不写进代码。单人自用设备可以接受；要与他人共用，应改成「登录一次 → 只存 token」。

断开同步：设置页点「断开」，或清空浏览器存储：

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

生产上用的是两层：PocketBase 每日自动备份 + systemd 定时器把 zip 复制到另一块物理盘。
具体路径、命令与还原步骤见 [`OPS.md` 的备份章节](OPS.md#三备份与还原)。

要点：**直接复制 `pb_data/*.db` 是不安全的**（可能拷到半写状态），
要复制 PocketBase 通过 `/api/backups` 生成的一致性快照 zip。

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
6. **卡片内容仍是打包进 App 的**：服务端 `cards` 集合目前为空，内容更新仍需重新构建部署。

## 还没做

- 冲突的日志重放修复（上面限制 1）
- 内容批量导入（`src/data/seed.ts` → `cards` 集合的脚本），做完后改内容就不用重新部署
- 离线时长（`seconds`）纳入同步
