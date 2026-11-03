// 内容规则：校验与批量导入共用同一套判定，避免两处标准漂移。
//
// 纯函数，不读写文件；调用方负责打印与退出码。

import { CHAPTER_MAP } from '../../src/data/curriculum.ts'

export const TYPES = new Set(['cloze', 'qa', 'choice', 'judge'])

export const FIELD_ORDER = [
  'id',
  'subjectId',
  'chapterId',
  'kp',
  'type',
  'front',
  'back',
  'options',
  'answer',
  'analysis',
  'mnemonic',
  'confusables',
  'importance',
  'tags',
]

/**
 * 校验单张卡片，返回错误信息数组（空数组 = 合法）。
 * warnings 单独返回，因为它们是「可疑但可接受」的情况。
 */
export function checkCard(card) {
  const errors = []
  const warnings = []
  const id = card?.id ?? '(无 id)'

  if (!card || typeof card !== 'object') {
    return { errors: ['不是对象'], warnings }
  }

  if (!card.id || typeof card.id !== 'string') errors.push(`${id}: 缺少 id`)
  if (!card.kp || !String(card.kp).trim()) errors.push(`${id}: kp（知识点）为空`)
  if (!TYPES.has(card.type)) errors.push(`${id}: 未知题型 "${card.type}"`)

  const chapter = CHAPTER_MAP.get(card.chapterId)
  if (!chapter) {
    errors.push(`${id}: chapterId "${card.chapterId}" 不在 curriculum 中`)
  } else if (chapter.subjectId !== card.subjectId) {
    errors.push(
      `${id}: subjectId "${card.subjectId}" 与章节 ${chapter.id} 所属 "${chapter.subjectId}" 不一致`,
    )
  }

  const importance = card.importance
  if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
    errors.push(`${id}: importance 必须是 1..5 的整数，实际 ${importance}`)
  }

  if (card.type === 'choice') {
    const options = Array.isArray(card.options) ? card.options : []
    if (options.length < 2) errors.push(`${id}: 选择题至少要有 2 个选项`)
    if (options.some((o) => !o || !String(o).trim())) errors.push(`${id}: 存在空选项`)
    if (!card.front || !String(card.front).trim()) errors.push(`${id}: 选择题 front（题干）为空`)
    if (typeof card.answer !== 'number') {
      errors.push(`${id}: 选择题 answer 应为数字下标，实际 ${typeof card.answer}`)
    } else if (!Number.isInteger(card.answer) || card.answer < 0 || card.answer >= options.length) {
      errors.push(`${id}: answer=${card.answer} 超出选项范围 0..${options.length - 1}`)
    }
    if (new Set(options).size !== options.length) warnings.push(`${id}: 选项有重复项`)
  } else if (card.type === 'judge') {
    if (!card.front || !String(card.front).trim()) errors.push(`${id}: 判断题 front（题干）为空`)
    if (typeof card.answer !== 'boolean') {
      errors.push(`${id}: 判断题 answer 应为布尔值，实际 ${typeof card.answer}`)
    }
    if (card.back !== '正确' && card.back !== '错误') {
      errors.push(`${id}: 判断题 back 应为「正确」或「错误」，实际 "${card.back}"`)
    } else if (typeof card.answer === 'boolean') {
      const expected = card.answer ? '正确' : '错误'
      if (card.back !== expected) {
        errors.push(`${id}: 判断题 back="${card.back}" 与 answer=${card.answer} 矛盾（应为「${expected}」）`)
      }
    }
  } else if (card.type === 'cloze') {
    const back = String(card.back ?? '')
    const blanks = [...back.matchAll(/\{\{([\s\S]*?)\}\}/g)]
    if (blanks.length === 0) errors.push(`${id}: 挖空卡 back 缺少 {{答案}} 标记`)
    if (blanks.some((m) => !m[1].trim())) errors.push(`${id}: 存在空的 {{}} 挖空`)
    if (back.includes('{{') !== back.includes('}}')) errors.push(`${id}: 挖空标记 {{ }} 不成对`)
  } else if (card.type === 'qa') {
    if (!card.front || !String(card.front).trim()) errors.push(`${id}: 问答卡 front 为空`)
    if (!card.back || !String(card.back).trim()) errors.push(`${id}: 问答卡 back 为空`)
  }

  return { errors, warnings }
}

/** 题干归一化，用于重复检测 */
export function frontKey(card) {
  return String(card.front ?? '')
    .replace(/\s+/g, '')
    .replace(/[（(]\s*[）)]/g, '')
}

/** 把卡片对象渲染成 seed.ts 里的 TS 源码（字段顺序固定，便于 diff） */
export function renderCard(card) {
  const lines = ['  {']
  for (const field of FIELD_ORDER) {
    const value = card[field]
    if (value === undefined) continue
    if (field === 'options' || field === 'tags') {
      if (Array.isArray(value) && value.length === 0) continue
      const items = Array.isArray(value) ? value : []
      lines.push(
        `    ${field}: [${items
          .map((v) => (typeof v === 'string' ? quote(v) : String(v)))
          .join(', ')}],`,
      )
    } else if (typeof value === 'string') {
      lines.push(`    ${field}: ${quote(value)},`)
    } else {
      lines.push(`    ${field}: ${String(value)},`)
    }
  }
  lines.push('  },')
  return lines.join('\n')
}

/**
 * 用单引号包裹字符串。
 * 必须把换行/回车/制表转成转义序列：qa 卡的多行答案是真实换行符，
 * 直接塞进单引号字符串会把 TS 源码写坏（曾因此产出无法解析的 seed.ts）。
 */
export function quote(text) {
  const escaped = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\t/g, '\\t')
  return `'${escaped}'`
}
