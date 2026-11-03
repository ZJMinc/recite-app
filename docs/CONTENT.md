# 内容工作流（加卡 / 批量导入）

卡片的唯一数据源是 [`src/data/seed.ts`](../src/data/seed.ts)，章节树在
[`src/data/curriculum.ts`](../src/data/curriculum.ts)。改完刷新页面即可，`initDB()`
按 id 补齐缺失卡片，**不会覆盖已有学习进度**。

写卡原则（一张卡只考一个点、挖空只挖关键词、能编口诀就编）见
[README「内容怎么加」](../README.md#内容怎么加)。

## 一、一条命令的质量闸门

```sh
pnpm test          # = 内容校验 + 同步合并测试 + 刷题逻辑测试
```

只跑内容校验：

```sh
node scripts/validate-content.mjs
```

它会检查：

| 检查 | 拦下的问题 |
|---|---|
| id 唯一 | 复制粘贴出来的重复卡 |
| `chapterId` 存在、`subjectId` 与章节一致 | 刷题时组到错误章节 |
| **id 前缀与章节一致** | 不同章节撞用同一编号（人工编号必撞） |
| 题型合法、`importance` 在 1..5 | 脏数据 |
| 选择题：≥2 选项、无空选项、`answer` 不越界 | 判分永远错 |
| 判断题：`answer` 是布尔、`back` 与之一致 | 写了「正确」却是 `false` |
| 挖空卡：`{{ }}` 成对且非空 | 渲染穿帮 |
| 问答卡：`front`/`back` 非空 | 空白卡 |
| 题干完全重复 | 同题多份 |
| 章节是否「有卡片但 0 道客观题」 | 某章刷题整章空白 |

并输出题型 / 科目 / 章节分布，以及**客观题只有 1 道的章节**（组卷会很单薄）。

## 二、批量导入

适合一次补几十张（例如按章节整理好的一批题）。格式是 JSON 数组：

```json
[
  {
    "id": "p5-c3",
    "subjectId": "pedagogy",
    "chapterId": "p5",
    "kp": "课程类型的划分",
    "type": "choice",
    "front": "按课程内容的组织方式，课程可分为（　）。",
    "options": ["学科课程与活动课程", "必修课程与选修课程", "显性课程与隐性课程", "国家课程与地方课程"],
    "answer": 0,
    "back": "学科课程与活动课程",
    "analysis": "按内容组织方式分学科课程与活动课程；按实施要求分必修与选修；按呈现方式分显性与此隐性。",
    "importance": 4
  }
]
```

也可以包一层：`{ "cards": [ ... ] }`。

先 dry-run 看会写进去什么：

```sh
node scripts/import-content.mjs cards.json
```

确认无误再落盘：

```sh
node scripts/import-content.mjs cards.json --write
node scripts/validate-content.mjs
```

行为约定：

- **只追加，不覆盖**：id 与已有卡片重复会直接报错，不会悄悄改老数据
- 任一卡片校验失败 → **整批不写入**，退出码 1（避免半批数据进库）
- 题干与已有卡片重复只警告（不同章节确实可能有相似题干）
- 写入的字段顺序固定，便于 git diff

## 三、手工加卡

直接在 `src/data/seed.ts` 里追加对象即可，字段含义：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 唯一，建议「章节-序号」，如 `p5-c3` |
| `subjectId` | ✓ | 必须与章节所属科目一致 |
| `chapterId` | ✓ | 见 `curriculum.ts` |
| `kp` | ✓ | 知识点名称，卡片标题 |
| `type` | ✓ | `cloze` / `qa` / `choice` / `judge` |
| `front` | ✓* | 题干；挖空卡可留空 |
| `back` | ✓ | 答案；挖空卡用 `{{答案}}` 标记；判断题写「正确」或「错误」 |
| `options` / `answer` | 选择/判断 | 选择题 `answer` 是选项下标；判断题是布尔值 |
| `analysis` | 建议 | 解析 |
| `mnemonic` | 可选 | 口诀 |
| `confusables` | 可选 | 易混提醒 |
| `importance` | ✓ | 1–5，决定新卡顺序与组卷优先级 |
| `tags` | 可选 | 标签数组 |

## 四、内容上云（尚未实现）

目前卡片打包进 App，改内容必须重新构建部署。服务端的 `cards` 集合已建好但为空。
后续计划：把 seed 导入 PocketBase，客户端按 `content_ver` 增量拉取 —— 这样改内容不用重新发版。

## 五、容量与体积（扩容时必须留意）

卡片打包进 JS，随数量线性增长。实测：

| 卡片数 | JS 体积（gzip） |
|---|---|
| 203 | 168 KB |
| 294 | 183 KB |
| 355 | 190 KB |
| 438 | 201 KB |
| 468 | 207 KB |

按这个斜率，扩到 1500 张时 bundle 约 600–700 KB（gzip 200 KB 出头），首屏仍可接受，
但到 3000 张就该拆分了。届时两个方向：

1. **按科目动态 import**：`import('./cards/pedagogy')`，只在需要时加载该科目
2. **内容上云**：把 seed 导入 PocketBase 的 `cards` 集合，客户端按 `content_ver` 增量拉取
   （集合已建好，缺导入脚本与拉取逻辑）

在触发之前，继续按章节批量补卡即可。
