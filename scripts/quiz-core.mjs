// 刷题核心逻辑的纯函数测试。
//
//   node scripts/quiz-core.mjs
//
// 直接 import 生产代码 src/lib/quiz-core.ts（Node 22 的类型擦除）。

import assert from 'node:assert/strict'
import {
  WRONG_CLEAR_STREAK,
  isCorrect,
  isQuizCard,
  pickQuizCards,
  transitionWrong,
} from '../src/lib/quiz-core.ts'

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
  front: '题干',
  back: '答案',
  due: 0,
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  tags: [],
}

const choice = (id, importance = 3, answer = 0, options = ['A', 'B', 'C']) => ({
  ...base,
  id,
  type: 'choice',
  importance,
  answer,
  options,
})
const judge = (id, importance = 3, answer = true) => ({
  ...base,
  id,
  type: 'judge',
  importance,
  answer,
})
const qa = (id) => ({ ...base, id, type: 'qa', importance: 3 })
const cloze = (id) => ({ ...base, id, type: 'cloze', importance: 3 })

// ---------------- 哪些卡能进刷题 ----------------
test('选择题有至少 2 个选项才算客观题', () => {
  assert.equal(isQuizCard(choice('c1')), true)
  assert.equal(isQuizCard(choice('c2', 3, 0, ['只有一个'])), false)
  assert.equal(isQuizCard({ ...choice('c3'), options: undefined }), false)
})

test('判断题必须有布尔型答案', () => {
  assert.equal(isQuizCard(judge('j1')), true)
  assert.equal(isQuizCard({ ...judge('j2'), answer: undefined }), false)
})

test('问答卡和挖空卡不进刷题', () => {
  assert.equal(isQuizCard(qa('q1')), false)
  assert.equal(isQuizCard(cloze('z1')), false)
})

// ---------------- 判分 ----------------
test('选择题按下标判分', () => {
  const card = choice('c1', 3, 2)
  assert.equal(isCorrect(card, 2), true)
  assert.equal(isCorrect(card, 0), false)
})

test('判断题按真值判分，不会被 0/1 混淆', () => {
  assert.equal(isCorrect(judge('j1', 3, true), true), true)
  assert.equal(isCorrect(judge('j1', 3, true), false), false)
  assert.equal(isCorrect(judge('j2', 3, false), false), true)
})

// ---------------- 组卷 ----------------
test('组卷只取客观题', () => {
  const pool = pickQuizCards([choice('c1'), judge('j1'), qa('q1'), cloze('z1')])
  assert.deepEqual(pool.map((c) => c.id).sort(), ['c1', 'j1'])
})

test('按章节筛选', () => {
  const a = { ...choice('c1'), chapterId: 'p1' }
  const b = { ...choice('c2'), chapterId: 'p2' }
  assert.deepEqual(pickQuizCards([a, b], { chapterId: 'p2' }).map((c) => c.id), ['c2'])
})

test('重要度高的先出，同重要度按 id 稳定排序', () => {
  const pool = pickQuizCards([
    choice('c3', 3),
    choice('c1', 5),
    choice('c2', 3),
  ])
  assert.deepEqual(pool.map((c) => c.id), ['c1', 'c2', 'c3'])
})

test('同样输入永远得到同样顺序（可复现）', () => {
  const cards = [choice('c2', 4), choice('c1', 4), judge('j1', 2)]
  const once = pickQuizCards(cards).map((c) => c.id)
  const twice = pickQuizCards([...cards].reverse()).map((c) => c.id)
  assert.deepEqual(once, twice)
})

test('size 截断题量', () => {
  const cards = Array.from({ length: 10 }, (_, i) => choice(`c${i}`, 5 - (i % 5)))
  assert.equal(pickQuizCards(cards, { size: 3 }).length, 3)
})

test('只看错题时用 onlyCardIds 过滤', () => {
  const cards = [choice('c1'), choice('c2'), judge('j1')]
  const pool = pickQuizCards(cards, { onlyCardIds: new Set(['c2', 'j1']) })
  assert.deepEqual(pool.map((c) => c.id).sort(), ['c2', 'j1'])
})

test('没有客观题时返回空数组', () => {
  assert.deepEqual(pickQuizCards([qa('q1'), cloze('z1')]), [])
})

// ---------------- 错题状态迁移 ----------------
test('第一次答错：进入错题本，计数 1，连对 0', () => {
  const t = transitionWrong(undefined, false, 1000)
  assert.equal(t.kind, 'put')
  assert.equal(t.record.wrongCount, 1)
  assert.equal(t.record.correctStreak, 0)
  assert.equal(t.record.lastWrongAt, 1000)
})

test('再次答错：计数累加，连对清零', () => {
  const existing = {
    cardId: 'c1',
    wrongCount: 2,
    correctStreak: 1,
    lastWrongAt: 500,
    lastAnsweredAt: 600,
  }
  const t = transitionWrong(existing, false, 2000)
  assert.equal(t.kind, 'put')
  assert.equal(t.record.wrongCount, 3)
  assert.equal(t.record.correctStreak, 0)
})

test('答对但本来不在错题本：什么都不做', () => {
  assert.equal(transitionWrong(undefined, true, 1000).kind, 'none')
})

test(`答对一次：连对 +1，还差 ${WRONG_CLEAR_STREAK - 1} 次移出`, () => {
  const existing = {
    cardId: 'c1',
    wrongCount: 1,
    correctStreak: 0,
    lastWrongAt: 500,
    lastAnsweredAt: 500,
  }
  const t = transitionWrong(existing, true, 2000)
  assert.equal(t.kind, 'put')
  assert.equal(t.record.correctStreak, 1)
})

test(`连对达到 ${WRONG_CLEAR_STREAK} 次：删记录（移出错题本）`, () => {
  let record = {
    cardId: 'c1',
    wrongCount: 3,
    correctStreak: 0,
    lastWrongAt: 0,
    lastAnsweredAt: 0,
  }
  let transition = transitionWrong(record, true, 1)
  assert.equal(transition.kind, 'put')
  record = transition.record
  transition = transitionWrong(record, true, 2)
  assert.equal(transition.kind, 'delete')
  assert.equal(transition.wrongCount, 3)
})

test('答错会让连对进度归零，之前的努力不算', () => {
  const existing = {
    cardId: 'c1',
    wrongCount: 1,
    correctStreak: 1,
    lastWrongAt: 0,
    lastAnsweredAt: 0,
  }
  const t = transitionWrong(existing, false, 3000)
  assert.equal(t.record.correctStreak, 0)
  assert.equal(t.record.wrongCount, 2)
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
