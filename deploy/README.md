# 部署速查（飞牛OS + Tailscale）

完整设计见 [`docs/SYNC.md`](../docs/SYNC.md)。这里只列命令。

## 0. 前置

- 飞牛OS 已开启 SSH（设置 → 系统 → 终端与 SSH）
- 手机与 NAS 都装 Tailscale，登录同一账号

## 1. 把文件放到 NAS

在**这台 Mac** 上执行（替换成你的 NAS 地址和用户名）：

```sh
NAS=你的用户名@192.168.3.x
DEST=/vol1/1000/apps/recite

ssh "$NAS" "mkdir -p $DEST"
scp -r deploy/docker-compose.yml pb_migrations "$NAS:$DEST/"
ssh "$NAS" "mkdir -p $DEST/pb_data && ls -la $DEST"
```

## 2. 起容器

```sh
ssh "$NAS" "cd /vol1/1000/apps/recite && docker compose up -d && docker compose logs -f --tail=20"
```

日志里应看到迁移被执行（首次启动）。然后校验：

```sh
ssh "$NAS" "curl -s http://127.0.0.1:8090/api/health"
# {"code":200,"message":"API is healthy.","data":{}}
```

> 拉不动 `ghcr.io` 时：先在飞牛 Docker 设置里配镜像加速，或改用
> `docker.m.daocloud.io/ghcr.io/muchobien/pocketbase:0.40.6`（第三方镜像，用前自行确认 digest）。

## 3. Tailscale 组网

```sh
ssh "$NAS" "curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up"
ssh "$NAS" "tailscale status"
```

拿到 `nas.<your-tailnet>.ts.net` 之后，在 Tailscale 管理后台 **DNS** 页确认已启用
**HTTPS Certificates**，再：

```sh
ssh "$NAS" "sudo tailscale serve --bg 8090 && tailscale serve status"
```

## 4. 建账号

浏览器打开 `https://nas.<your-tailnet>.ts.net/_/`：

1. 创建 superuser（管理后台用）
2. `users` 集合里手动建一个应用账号 → 记下邮箱密码

## 5. 前端接上

在**手机或电脑的浏览器**控制台（同一域下打开的 recite-app）执行：

```js
localStorage.setItem('jiaojibei:sync-config', JSON.stringify({
  baseUrl: 'https://nas.<your-tailnet>.ts.net',
  email: '第 4 步的邮箱',
  password: '第 4 步的密码',
}))
location.reload()
```

## 6. 验收

```js
// 控制台里手动触发一次，看结果
await import('/src/sync/engine.ts').then(m => m.syncNow())
```

或在两台设备各背几张卡 → 联网 → 对比 `统计` 页的复习条数与 `知识树` 掌握度是否一致。

## 7. 备份

`pb_data/` 是全部数据（单个 SQLite 文件 + 日志）。飞牛「备份」里加一条定时快照指向
`/vol1/1000/apps/recite/pb_data` 即可；或让 PocketBase 自己打包：

```sh
curl -X POST "https://nas.<your-tailnet>.ts.net/api/backups" \
  -H "Authorization: <superuser token>"
```
