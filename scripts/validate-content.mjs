// 内容校验：扩题之前的第一道闸门。
//
//   node scripts/validate-content.mjs
//
// 规则见 scripts/lib/content-rules.mjs（与批量导入共用同一套判定）。
// 统计信息（题量、题型、章节分布）即使全部通过也会打印。

import { SEED_CARDS } from '../src/data/seed.ts'
import { CHAPTER_MAP, SUBJECTS } from '../src/data/curriculum.ts'
import { checkCard, frontKey } from './lib/content-rules.mjs'

const errors = []
const warnings = []

const seenIds = new Set()
const seenFronts = new Map()

for (const card of SEED_CARDS) {
  const result = checkCard(card)
  errors.push(...result.errors)
  warnings.push(...result.warnings)

  if (card?.id) {
    if (seenIds.has(card.id)) errors.push(`${card.id}: id 重复`)
    else seenIds.add(card.id)
  }

  const key = frontKey(card)
  if (key.length > 8) {
    const prev = seenFronts.get(key)
    if (prev) warnings.push(`${card.id}: 题干与 ${prev} 完全重复`)
    else seenFronts.set(key, card.id)
  }
}

// ---- 统计 ----
const byType = {}
const bySubject = {}
const byChapter = {}
for (const card of SEED_CARDS) {
  byType[card.type] = (byType[card.type] ?? 0) + 1
  bySubject[card.subjectId] = (bySubject[card.subjectId] ?? 0) + 1
  byChapter[card.chapterId] = (byChapter[card.chapterId] ?? 0) + 1
}

const objectiveOf = (chapterId) =>
  SEED_CARDS.filter(
    (x) => x.chapterId === chapterId && (x.type === 'choice' || x.type === 'judge'),
  ).length

console.log(`卡片总数: ${SEED_CARDS.length}`)
console.log(
  '题型分布: ' +
    Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · '),
)
console.log(
  '科目分布: ' + SUBJECTS.map((s) => `${s.short} ${bySubject[s.id] ?? 0}`).join(' · '),
)
const objective = (byType.choice ?? 0) + (byType.judge ?? 0)
console.log(`客观题（可刷题）: ${objective} 道`)

const emptyChapters = [...CHAPTER_MAP.values()].filter((c) => !byChapter[c.id])
if (emptyChapters.length > 0) {
  console.log(
    `\n⚠ 还没有任何卡片的章节: ${emptyChapters.map((c) => `${c.id}(${c.title})`).join('、')}`,
  )
}

const unquizzable = [...CHAPTER_MAP.values()].filter(
  (c) => byChapter[c.id] > 0 && objectiveOf(c.id) === 0,
)
if (unquizzable.length > 0) {
  console.log(`⚠ 有卡片但无法组卷（0 道客观题）的章节: ${unquizzable.map((c) => c.id).join('、')}`)
}

const thinChapters = [...CHAPTER_MAP.values()].filter((c) => objectiveOf(c.id) === 1)
if (thinChapters.length > 0) {
  console.log(`⚠ 客观题只有 1 道的章节: ${thinChapters.map((x) => x.id).join('、')}`)
}

if (warnings.length > 0) {
  console.log(`\n警告 ${warnings.length} 条:`)
  for (const w of warnings) console.log(`  · ${w}`)
}

if (errors.length > 0) {
  console.log(`\n❌ 错误 ${errors.length} 条:`)
  for (const e of errors) console.log(`  · ${e}`)
  process.exitCode = 1
} else {
  console.log('\n✅ 校验通过')
}
