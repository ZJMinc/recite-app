// 内容一致性审计：找「近似重复」的卡片与「同一知识点散落多处」的情况。
//
//   node scripts/audit-content.mjs            # 默认阈值 0.72
//   node scripts/audit-content.mjs 0.6        # 自定义阈值
//
// 与 validate-content 的分工：
//   validate-content 只看「完全相同的题干」（精确重复）
//   audit-content    看「换了说法但其实是同一题」（近似重复）与知识点聚合
//
// 近似重复不等于错误：同一考点从不同角度出题是合理的。
// 它要暴露的是「同一个问题的两种表述」，那会让学生以为要记两套答案。

import { SEED_CARDS } from './lib/all-cards.mjs'

const threshold = Number(process.argv[2] ?? 0.72)

/** 归一化：去标点、空白、括号，英文小写 */
function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[，,。、；;：:！!？?（）()「」“”"'《》<>…—\-·]/g, '')
}

/** 字符二元组集合，用于 Jaccard 相似度（比 LCS 快，适合全量两两比较） */
function bigrams(text) {
  const t = norm(text)
  const set = new Set()
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2))
  if (t.length === 1) set.add(t)
  return set
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const g of small) if (large.has(g)) inter += 1
  return inter / (a.size + b.size - inter)
}

const items = SEED_CARDS.map((c) => ({
  id: c.id,
  chapter: c.chapterId,
  type: c.type,
  front: c.front ?? '',
  kp: c.kp ?? '',
  grams: bigrams(c.front ?? ''),
}))

// ---- 1. 近似重复的题干 ----
const nearDupes = []
for (let i = 0; i < items.length; i += 1) {
  for (let j = i + 1; j < items.length; j += 1) {
    // 题干太短（如纯知识点名）不参与比较，噪声太大
    if (norm(items[i].front).length < 10 || norm(items[j].front).length < 10) continue
    const sim = jaccard(items[i].grams, items[j].grams)
    if (sim >= threshold) {
      nearDupes.push({ a: items[i], b: items[j], sim })
    }
  }
}
nearDupes.sort((x, y) => y.sim - x.sim)

console.log(`检查 ${items.length} 张卡片，阈值 ${threshold}`)
console.log(`\n【近似重复题干】${nearDupes.length} 对`)
for (const d of nearDupes.slice(0, 40)) {
  console.log(`\n  ${(d.sim * 100).toFixed(0)}%  ${d.a.id} (${d.a.chapter}) ↔ ${d.b.id} (${d.b.chapter})`)
  console.log(`     A: ${d.a.front}`)
  console.log(`     B: ${d.b.front}`)
}
if (nearDupes.length > 40) console.log(`\n  …还有 ${nearDupes.length - 40} 对未显示`)

// ---- 2. 同一知识点散落多处 ----
const byKp = new Map()
for (const it of items) {
  const key = norm(it.kp)
  if (!key) continue
  if (!byKp.has(key)) byKp.set(key, [])
  byKp.get(key).push(it)
}
const multiKp = [...byKp.entries()]
  .filter(([, list]) => list.length > 1)
  .sort((a, b) => b[1].length - a[1].length)

console.log(`\n【同一知识点出现多次】${multiKp.length} 组`)
for (const [kp, list] of multiKp.slice(0, 25)) {
  const ids = list.map((x) => `${x.id}(${x.type[0]})`).join(', ')
  console.log(`  ${list[0].kp} → ${ids}`)
}
if (multiKp.length > 25) console.log(`  …还有 ${multiKp.length - 25} 组未显示`)

// ---- 3. 摘要 ----
const chapterCount = {}
for (const it of items) chapterCount[it.chapter] = (chapterCount[it.chapter] ?? 0) + 1
console.log(`\n覆盖章节 ${Object.keys(chapterCount).length} 个`)
console.log(`近似重复 ${nearDupes.length} 对（其中 ≥90% 的 ${nearDupes.filter((d) => d.sim >= 0.9).length} 对）`)
