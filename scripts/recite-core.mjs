// 默写打分的纯逻辑测试。
//
//   node scripts/recite-core.mjs

import assert from 'node:assert/strict'
import {
  extractPoints,
  lcsLength,
  normalize,
  pickReciteCards,
  scoreCoverage,
  similarity,
  suggestRating,
} from '../src/lib/recite-core.ts'

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error.message })
  }
}

// ---------------- 归一化 ----------------
test('归一化去掉标点与空白', () => {
  assert.equal(normalize('教育是 有目的、培养人的活动。'), '教育是有目的培养人的活动')
})

test('归一化把英文转小写', () => {
  assert.equal(normalize('FSRS 算法'), 'fsrs算法')
})

// ---------------- LCS ----------------
test('LCS 对完全相同串给出满长', () => {
  assert.equal(lcsLength('教育目的', '教育目的'), 4)
})

test('LCS 容忍中间插入', () => {
  assert.equal(lcsLength('教育目的', '教育的根本目的'), 4)
})

test('LCS 空串为 0', () => {
  assert.equal(lcsLength('', 'abc'), 0)
})

// ---------------- 要点拆分 ----------------
test('按换行拆点并去掉 ①② 编号', () => {
  const points = extractPoints('① 永恒性：与人类社会共始终\n② 历史性：不同时期性质不同')
  assert.deepEqual(points, ['永恒性：与人类社会共始终', '历史性：不同时期性质不同'])
})

test('按句号再次拆分', () => {
  const points = extractPoints('教育即生活。学校即社会。从做中学。')
  assert.deepEqual(points, ['教育即生活', '学校即社会', '从做中学'])
})

test('去掉数字编号与项目符号', () => {
  assert.deepEqual(extractPoints('1. 第一点\n2、第二点\n- 第三点'), ['第一点', '第二点', '第三点'])
})

test('忽略过短的碎片', () => {
  assert.deepEqual(extractPoints('好\n② 这是一个完整要点'), ['这是一个完整要点'])
})

test('要点数量有上限', () => {
  const many = Array.from({ length: 20 }, (_, i) => `要点${i + 1}`).join('\n')
  assert.equal(extractPoints(many, 5).length, 5)
})

test('真实卡片样例会拆出要点', () => {
  const back = '① 1632 年出版《大教学论》，是近代第一本教育学著作\n② 首次系统论述班级授课制\n③ 提出“泛智教育”'
  assert.equal(extractPoints(back).length, 3)
})

// ---------------- 相似度 ----------------
test('完整复述要点得 1 分', () => {
  assert.equal(similarity('永恒性：与人类社会共始终', '永恒性：与人类社会共始终'), 1)
})

test('漏字给部分分', () => {
  const s = similarity('永恒性 与人类社会共始终', '永恒性：与人类社会共始终')
  assert.ok(s > 0.9, `实际 ${s}`)
})

test('完全无关给 0 分', () => {
  assert.equal(similarity('完全不相干的内容', '永恒性：与人类社会共始终'), 0)
})

test('空答案得 0 分', () => {
  assert.equal(similarity('', '永恒性'), 0)
})

// ---------------- 覆盖率 ----------------
test('全部命中 coverage = 1', () => {
  const points = ['教育即生活', '学校即社会']
  const r = scoreCoverage('教育即生活，学校即社会', points)
  assert.equal(r.coverage, 1)
  assert.equal(r.hits.length, 2)
  assert.equal(r.misses.length, 0)
})

test('命中一半 coverage = 0.5', () => {
  const points = ['教育即生活', '学校即社会']
  const r = scoreCoverage('教育即生活', points)
  assert.equal(r.coverage, 0.5)
  assert.deepEqual(r.misses, ['学校即社会'])
})

test('没有要点时 coverage = 0，不会除零', () => {
  const r = scoreCoverage('随便写点', [])
  assert.equal(r.coverage, 0)
  assert.equal(r.total, 0)
})

test('details 逐条给出命中情况', () => {
  const r = scoreCoverage('教育即生活', ['教育即生活', '学校即社会'])
  assert.equal(r.details.length, 2)
  assert.equal(r.details[0].hit, true)
  assert.equal(r.details[1].hit, false)
  assert.ok(r.details[0].score > r.details[1].score)
})

// ---------------- 评分建议 ----------------
test('覆盖率映射到四档自评', () => {
  assert.equal(suggestRating(1), 4)
  assert.equal(suggestRating(0.85), 4)
  assert.equal(suggestRating(0.7), 3)
  assert.equal(suggestRating(0.4), 2)
  assert.equal(suggestRating(0), 1)
})

// ---------------- 选题 ----------------
const qaCard = (id, importance = 3, chapterId = 'p1') => ({
  id,
  subjectId: 'pedagogy',
  chapterId,
  kp: 'k',
  type: 'qa',
  front: '问题',
  back: '① 要点一\n② 要点二',
  due: 0,
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  importance,
  tags: [],
})

test('默写只取问答卡', () => {
  const mix = [
    qaCard('q1'),
    { ...qaCard('c1'), type: 'choice', options: ['A', 'B'], answer: 0 },
    { ...qaCard('j1'), type: 'judge', answer: true },
    { ...qaCard('z1'), type: 'cloze', back: '教育{{目的}}' },
  ]
  assert.deepEqual(pickReciteCards(mix).map((c) => c.id), ['q1'])
})

test('默写按重要度排序并可截断', () => {
  const pool = pickReciteCards(
    [qaCard('q2', 3), qaCard('q1', 5), qaCard('q3', 4)],
    { size: 2 },
  )
  assert.deepEqual(pool.map((c) => c.id), ['q1', 'q3'])
})

test('没有问答卡时返回空数组', () => {
  assert.deepEqual(pickReciteCards([{ ...qaCard('z1'), type: 'cloze' }]), [])
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
