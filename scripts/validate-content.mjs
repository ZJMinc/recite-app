// 内容校验：扩题之前的第一道闸门。
//
//   node scripts/validate-content.mjs
//
// 检查项（任一失败即退出码 1）：
//   1. id 唯一
//   2. chapterId 存在，且 subjectId 与该章节所属科目一致
//   3. type 合法；importance 在 1..5
//   4. choice：至少 2 个选项、answer 是合法下标、front 非空
//   5. judge：answer 是布尔值、back 与 answer 一致（正确/错误）、front 非空
//   6. cloze：back 里至少有一个 {{...}} 且内容非空
//   7. qa：front 与 back 都非空
//   8. 题干完全重复（同一句话出两道题，通常是复制粘贴事故）
//
// 统计信息（题量、题型、章节分布）即使全部通过也会打印。

import { SEED_CARDS } from '../src/data/seed.ts'
import { CHAPTER_MAP, SUBJECTS } from '../src/data/curriculum.ts'

const TYPES = new Set(['cloze', 'qa', 'choice', 'judge'])
const errors = []
const warnings = []

const seenIds = new Set()
const seenFronts = new Map()

function err(card, message) {
  errors.push(`${card?.id ?? '(无 id)'}: ${message}`)
}

for (const card of SEED_CARDS) {
  // 1. id
  if (!card.id) {
    err(card, '缺少 id')
  } else if (seenIds.has(card.id)) {
    err(card, `id 重复`)
  } else {
    seenIds.add(card.id)
  }

  // 2. 章节归属
  const chapter = CHAPTER_MAP.get(card.chapterId)
  if (!chapter) {
    err(card, `chapterId "${card.chapterId}" 不在 curriculum 中`)
  } else if (chapter.subjectId !== card.subjectId) {
    err(card, `subjectId "${card.subjectId}" 与章节 ${chapter.id} 所属 "${chapter.subjectId}" 不一致`)
  }

  // 3. 类型与重要度
  if (!TYPES.has(card.type)) err(card, `未知题型 "${card.type}"`)
  if (!Number.isInteger(card.importance) || card.importance < 1 || card.importance > 5) {
    err(card, `importance 必须是 1..5 的整数，实际 ${card.importance}`)
  }
  if (!card.kp || !card.kp.trim()) err(card, 'kp（知识点）为空')

  // 4~7. 按题型校验
  if (card.type === 'choice') {
    const options = card.options ?? []
    if (options.length < 2) err(card, '选择题至少要有 2 个选项')
    if (options.some((o) => !o || !o.trim())) err(card, '存在空选项')
    if (!card.front || !card.front.trim()) err(card, '选择题 front（题干）为空')
    if (typeof card.answer !== 'number') {
      err(card, `选择题 answer 应为数字下标，实际 ${typeof card.answer}`)
    } else if (!Number.isInteger(card.answer) || card.answer < 0 || card.answer >= options.length) {
      err(card, `answer=${card.answer} 超出选项范围 0..${options.length - 1}`)
    }
    if (new Set(options).size !== options.length) warnings.push(`${card.id}: 选项有重复项`)
  } else if (card.type === 'judge') {
    if (!card.front || !card.front.trim()) err(card, '判断题 front（题干）为空')
    if (typeof card.answer !== 'boolean') {
      err(card, `判断题 answer 应为布尔值，实际 ${typeof card.answer}`)
    }
    if (card.back !== '正确' && card.back !== '错误') {
      err(card, `判断题 back 应为「正确」或「错误」，实际 "${card.back}"`)
    } else if (typeof card.answer === 'boolean') {
      const expected = card.answer ? '正确' : '错误'
      if (card.back !== expected) {
        err(card, `判断题 back="${card.back}" 与 answer=${card.answer} 矛盾（应为「${expected}」）`)
      }
    }
  } else if (card.type === 'cloze') {
    const blanks = [...(card.back ?? '').matchAll(/\{\{([\s\S]*?)\}\}/g)]
    if (blanks.length === 0) err(card, '挖空卡 back 缺少 {{答案}} 标记')
    if (blanks.some((m) => !m[1].trim())) err(card, '存在空的 {{}} 挖空')
    if ((card.back ?? '').includes('{{') !== (card.back ?? '').includes('}}')) {
      err(card, '挖空标记 {{ }} 不成对')
    }
  } else if (card.type === 'qa') {
    if (!card.front || !card.front.trim()) err(card, '问答卡 front 为空')
    if (!card.back || !card.back.trim()) err(card, '问答卡 back 为空')
  }

  // 8. 重复题干
  const frontKey = (card.front ?? '').replace(/\s+/g, '').replace(/[（(]\s*[）)]/g, '')
  if (frontKey.length > 8) {
    const prev = seenFronts.get(frontKey)
    if (prev) warnings.push(`${card.id}: 题干与 ${prev} 完全重复`)
    else seenFronts.set(frontKey, card.id)
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

console.log(`卡片总数: ${SEED_CARDS.length}`)
console.log(
  '题型分布: ' +
    Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · '),
)
console.log(
  '科目分布: ' +
    SUBJECTS.map((s) => `${s.short} ${bySubject[s.id] ?? 0}`).join(' · '),
)
const objective = (byType.choice ?? 0) + (byType.judge ?? 0)
console.log(`客观题（可刷题）: ${objective} 道`)

const emptyChapters = [...CHAPTER_MAP.values()].filter((c) => !byChapter[c.id])
if (emptyChapters.length > 0) {
  console.log(
    `\n⚠ 还没有任何卡片的章节: ${emptyChapters.map((c) => `${c.id}(${c.title})`).join('、')}`,
  )
}

// 完全没有客观题的章节无法在刷题模式里组卷
const unquizzable = [...CHAPTER_MAP.values()].filter(
  (c) =>
    SEED_CARDS.filter(
      (x) => x.chapterId === c.id && (x.type === 'choice' || x.type === 'judge'),
    ).length === 0 &&
    SEED_CARDS.some((x) => x.chapterId === c.id),
)
if (unquizzable.length > 0) {
  console.log(
    `⚠ 有卡片但无法组卷（0 道客观题）的章节: ${unquizzable.map((c) => c.id).join('、')}`,
  )
}

// 章节内客观题过少，会直接影响刷题的组卷体验
const thinChapters = [...CHAPTER_MAP.values()]
  .map((c) => ({
    c,
    n: SEED_CARDS.filter((x) => x.chapterId === c.id && (x.type === 'choice' || x.type === 'judge')).length,
  }))
  .filter((x) => x.n > 0 && x.n < 2)
if (thinChapters.length > 0) {
  console.log(
    `⚠ 客观题只有 1 道的章节: ${thinChapters.map((x) => x.c.id).join('、')}`,
  )
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
