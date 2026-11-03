// 内容规则与 TS 渲染的单元测试。
//
//   node scripts/content-rules.mjs
//
// 重点回归：多行答案（qa 卡）渲染成 TS 源码时，换行必须变成转义序列，
// 否则会把 seed.ts 写坏（曾经发生过）。

import assert from 'node:assert/strict'
import {
  checkCard,
  frontKey,
  quote,
  renderCard,
} from './lib/content-rules.mjs'

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error.message })
  }
}

const base = {
  subjectId: 'pedagogy',
  chapterId: 'p1',
  kp: '测试',
  type: 'qa',
  front: '题干',
  back: '答案',
  importance: 3,
}

// ---------------- 校验规则 ----------------
test('合法卡片无错误', () => {
  const r = checkCard({ ...base, id: 'p1-q1' })
  assert.deepEqual(r.errors, [])
})

test('选择题答案越界被发现', () => {
  const r = checkCard({
    ...base,
    id: 'p1-c1',
    type: 'choice',
    options: ['A', 'B'],
    answer: 5,
  })
  assert.ok(r.errors.some((e) => e.includes('超出选项范围')))
})

test('判断题结论与答案矛盾被发现', () => {
  const r = checkCard({
    ...base,
    id: 'p1-j1',
    type: 'judge',
    back: '正确',
    answer: false,
  })
  assert.ok(r.errors.some((e) => e.includes('矛盾')))
})

test('章节与科目不匹配被发现', () => {
  const r = checkCard({ ...base, id: 'x1', subjectId: 'law', chapterId: 'p1' })
  assert.ok(r.errors.some((e) => e.includes('不一致')))
})

test('id 前缀与章节不一致被发现', () => {
  const r = checkCard({ ...base, id: 'p2-q1', chapterId: 'p3' })
  assert.ok(r.errors.some((e) => e.includes('id 前缀应与章节')))
})

test('id 前缀与章节一致时不报错', () => {
  const r = checkCard({ ...base, id: 'p3-q1', chapterId: 'p3' })
  assert.deepEqual(r.errors, [])
})

// ---------------- TS 渲染 ----------------
test('单引号被转义', () => {
  assert.equal(quote("学生's"), "'学生\\'s'")
})

test('反斜杠被转义', () => {
  assert.equal(quote('a\\b'), "'a\\\\b'")
})

test('换行渲染为转义序列而不是真实换行', () => {
  const out = quote('甲\n乙')
  assert.equal(out, "'甲\\n乙'")
  assert.ok(!out.includes('\n'), '不应包含真实换行')
})

test('Windows 换行统一成 \\n', () => {
  assert.equal(quote('甲\r\n乙'), "'甲\\n乙'")
})

test('制表符被转义', () => {
  assert.equal(quote('甲\t乙'), "'甲\\t乙'")
})

test('多行答案渲染后不含裸换行（回归：曾写坏 seed.ts）', () => {
  const rendered = renderCard({
    ...base,
    id: 'p1-q9',
    back: '① 要点一\n② 要点二\n③ 要点三',
  })
  const backLine = rendered
    .split('\n')
    .find((line) => line.trimStart().startsWith('back:'))
  assert.ok(backLine, '应渲染出 back 行')
  assert.ok(backLine.includes('\\n'), '应包含转义后的 \\n')
  assert.ok(!/[^\n]*'[^']*\n.*'/.test(backLine), 'back 行不应被裸换行拆开')
})

test('渲染字段顺序固定，便于 diff', () => {
  const rendered = renderCard({ ...base, id: 'p1-t1', analysis: '解析' })
  const order = ['id', 'subjectId', 'chapterId', 'kp', 'type', 'front', 'back', 'analysis', 'importance']
  const positions = order.map((field) => rendered.indexOf(`${field}:`))
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    '字段顺序应与 FIELD_ORDER 一致',
  )
})

test('空数组字段不渲染', () => {
  const rendered = renderCard({ ...base, id: 'p1-t2', tags: [] })
  assert.ok(!rendered.includes('tags:'))
})

// ---------------- 题干归一化 ----------------
test('题干归一化去掉空白与空括号', () => {
  assert.equal(frontKey({ front: '教育是（　）的　活动' }), '教育是的活动')
})

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.name}`)
  else {
    failed += 1
    console.log(`  ✗ ${r.name}\n    ${r.message}`)
  }
}
console.log(`\n${results.length - failed}/${results.length} 通过`)
if (failed > 0) process.exitCode = 1
