# 教基背诵 · 教育基础知识

教师招聘《教育基础知识》的间隔重复背诵工具。手机浏览器打开即可用，可添加到主屏离线背诵。

**核心思路**：把知识点拆成「能独立回忆的最小单元」，用主动回忆 + FSRS 间隔重复 + 挖空/口诀/易混辨析把它焊进长期记忆。

## 快速开始

```bash
pnpm install
pnpm dev        # 本地开发 http://localhost:5173
pnpm build      # 产出 dist/
pnpm preview    # 预览生产构建
```

纯静态站点，`dist/` 丢到任意静态托管（Vercel / Netlify / Cloudflare Pages）即可，无需后端。路由用 hash（`/#/stats`），不需要服务器 rewrite 配置。

## 已实现（M1）

| 模块 | 说明 |
|---|---|
| 今日 | 待复习/新卡统计、连续打卡、全库进度、考试倒计时、今日章节安排 |
| 背诵 | 一屏一卡，主动回忆 → 翻面 → 四档自评（忘记/模糊/记住/简单）；答错自动重新入队；键盘 空格 + 1~4 |
| 算法 | FSRS（ts-fsrs），按目标记忆率 85/90/95% 调度，四档按钮实时显示「下次间隔」 |
| 题型 | 挖空（`{{答案}}`）、问答、单选、判断；支持解析、口诀、易混提醒 |
| 知识树 | 6 大板块 / 46 个章节 / 146 张卡片，按章节展示掌握度，支持全文搜索与卡片详情 |
| 统计 | 近 13 周打卡热力图、记得率、章节掌握度 |
| 设置 | 每日新卡量、考试日期、目标记忆率、JSON 备份导入导出、重置进度 |
| PWA | 离线可用、可安装到桌面/主屏、图标齐全 |

数据全部存在浏览器 IndexedDB（库名 `jiaojibei`），不上传任何服务器。

## 内容怎么加

所有卡片在 [`src/data/seed.ts`](src/data/seed.ts)，章节树在 [`src/data/curriculum.ts`](src/data/curriculum.ts)。

```ts
{
  id: 'p6-11',              // 唯一 id，按「章节-序号」命名
  subjectId: 'pedagogy',    // pedagogy | psychology | edupsy | law | ethics | newcur
  chapterId: 'p6',          // 对应 curriculum.ts 里的章节
  kp: '教学原则',            // 知识点名称（卡片标题）
  type: 'cloze',            // cloze | qa | choice | judge
  front: '',                // 挖空卡的提示语，可留空
  back: '启发性原则要求调动学生学习的{{主动性}}。',  // 挖空处用 {{}}
  mnemonic: '直启循巩，因理科量',   // 可选：口诀
  confusables: '…',         // 可选：易混提醒
  analysis: '…',            // 可选：解析
  importance: 5,            // 1~5，决定新卡优先顺序
}
```

写卡原则：

1. **一张卡只考一个点**，超过 3 个要点就拆开；
2. 挖空只挖「关键词」，不要整句挖空；
3. 能编口诀的尽量编，口诀是最省力的记忆钩子；
4. 易混的成对概念，用 `confusables` 明确写出区别。

加卡后刷新页面即可，`initDB()` 会按 id 补齐缺失卡片，**不会覆盖已有学习进度**。

## 目录

```
src/
├─ data/          curriculum.ts 章节树 / seed.ts 卡片内容
├─ pages/         Today / Review / Browse / Stats / Settings
├─ components/    Layout、CardBody、RatingBar、Icon
├─ lib/           stats.ts 统计与掌握度计算
├─ store/         settings.ts（zustand + localStorage）
├─ db.ts          Dexie 表结构、评审事务、备份重置
├─ scheduler.ts   FSRS 封装（评分、间隔预览）
└─ types.ts       数据模型
scripts/          端到端冒烟测试（playwright）
```

## 测试

```bash
pnpm preview --port 4173 &     # 先起预览服务
node scripts/smoke.mjs         # 首页 → 背 20 张 → 各页面截图
node scripts/flow.mjs          # 到期复习、选择题、离线
node scripts/backup.mjs        # 导出 / 重置 / 导入
```

## 路线图

- [x] M1 背诵闭环（FSRS + 挖空 + 统计 + 本地存储 + PWA）
- [ ] M2 刷题模式：按章节组卷、错题本、连对移出
- [ ] M3 输出式记忆：简答默写、要点覆盖率打分、学习计划倒推
- [ ] M4 打磨：暗色模式、TTS 听背、内容批量导入
- [ ] M5 扩内容：目标 1500–3000 张
