// 批量导入卡片。
//
//   node scripts/import-content.mjs cards.json           # 只校验并打印将要写入的 TS
//   node scripts/import-content.mjs cards.json --write   # 真正追加到 src/data/seed.ts
//
// JSON 形如 [{ ...一张卡... }, ...] 或 { "cards": [...] }。
// 校验规则与 scripts/validate-content.mjs 完全一致（共用 scripts/lib/content-rules.mjs）。
//
// 追加而不是覆盖：已有卡片按 id 去重，重复 id 直接报错，不会悄悄改老数据。

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SEED_CARDS, SUBJECT_FILES } from './lib/all-cards.mjs'
import { checkCard, frontKey, renderCard } from './lib/content-rules.mjs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const write = args.includes('--write')

if (!file) {
  console.error('用法: node scripts/import-content.mjs <cards.json> [--write]')
  process.exit(2)
}

let payload
try {
  payload = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`读取/解析 JSON 失败: ${error.message}`)
  process.exit(2)
}

const incoming = Array.isArray(payload) ? payload : payload?.cards
if (!Array.isArray(incoming) || incoming.length === 0) {
  console.error('JSON 里没有卡片数组（期望 [...] 或 { "cards": [...] }）')
  process.exit(2)
}

const existingIds = new Set(SEED_CARDS.map((c) => c.id))
const existingFronts = new Map(SEED_CARDS.map((c) => [frontKey(c), c.id]))

const errors = []
const warnings = []
const accepted = []
const batchIds = new Set()
const batchFronts = new Map()

for (const [index, card] of incoming.entries()) {
  const result = checkCard(card)
  errors.push(...result.errors)
  warnings.push(...result.warnings)

  // 与已有内容 / 本批次内的去重
  if (card?.id) {
    if (existingIds.has(card.id)) errors.push(`${card.id}: id 与已有卡片重复`)
    if (batchIds.has(card.id)) errors.push(`${card.id}: id 在本批次内重复`)
    batchIds.add(card.id)
  }
  const key = frontKey(card)
  if (key.length > 8) {
    const prev = existingFronts.get(key) ?? batchFronts.get(key)
    if (prev) warnings.push(`${card.id}: 题干与 ${prev} 重复`)
    else batchFronts.set(key, card.id)
  }

  if (result.errors.length === 0 && !existingIds.has(card?.id)) accepted.push(card)
  void index
}

console.log(`读入 ${incoming.length} 张，可用 ${accepted.length} 张`)

if (warnings.length > 0) {
  console.log(`\n警告 ${warnings.length} 条:`)
  for (const w of warnings) console.log(`  · ${w}`)
}

if (errors.length > 0) {
  console.log(`\n❌ 错误 ${errors.length} 条，本次不写入:`)
  for (const e of errors) console.log(`  · ${e}`)
  process.exit(1)
}

const block = accepted.map(renderCard).join('\n')

if (!write) {
  console.log('\n（dry-run）将按科目追加到 src/data/cards/<科目>.ts:\n')
  console.log(block)
  console.log('\n确认无误后加 --write 真正写入。')
  process.exit(0)
}

const written = {}
for (const card of accepted) {
  const rel = SUBJECT_FILES[card.subjectId]
  if (!rel) {
    console.error(`未知科目 ${card.subjectId}，跳过 ${card.id}`)
    continue
  }
  const filePath = path.resolve(rel)
  const source = readFileSync(filePath, 'utf8')
  const insertAt = source.trimEnd().lastIndexOf('\n]')
  if (insertAt < 0) {
    console.error(`${rel} 里找不到 CARDS 数组结尾`)
    process.exit(2)
  }
  const block = renderCard(card)
  writeFileSync(filePath, `${source.slice(0, insertAt)}\n${block}\n]\n`, 'utf8')
  written[card.subjectId] = (written[card.subjectId] ?? 0) + 1
}

// 同步 seed.ts 里的总数常量，避免「关于」页显示旧数字
const seedPath = path.resolve('src/data/seed.ts')
const seedSource = readFileSync(seedPath, 'utf8')
const total = SEED_CARDS.length + Object.values(written).reduce((a, b) => a + b, 0)
const bumped = seedSource.replace(
  /export const BUILTIN_CARD_COUNT = \d+/,
  `export const BUILTIN_CARD_COUNT = ${total}`,
)
if (bumped === seedSource) {
  console.warn('⚠ 未能更新 BUILTIN_CARD_COUNT，请手动检查 src/data/seed.ts')
} else {
  writeFileSync(seedPath, bumped, 'utf8')
}

const totalWritten = accepted.length
console.log(`\n✅ 已写入 ${totalWritten} 张卡片：`, written)
console.log(`   BUILTIN_CARD_COUNT → ${total}`)
console.log('   建议接着运行: node scripts/validate-content.mjs')
