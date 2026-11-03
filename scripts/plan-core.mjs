// 学习计划倒推的纯逻辑测试。
//
//   node scripts/plan-core.mjs

import assert from 'node:assert/strict'
import { computePlan, todayTarget } from '../src/lib/plan.ts'

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error.message })
  }
}

const daysFromNow = (n) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test('没有考试日期时给出提示，不算每日任务量', () => {
  const plan = computePlan({ totalCards: 203, learnedCards: 50, dailyNewLimit: 20 })
  assert.equal(plan.status, 'no-exam')
  assert.equal(plan.daysLeft, null)
  assert.equal(plan.perDayNeeded, null)
  assert.equal(plan.remainingNew, 153)
  assert.match(plan.message, /设置考试日期/)
})

test('新卡全部学过时状态为 done', () => {
  const plan = computePlan({
    examDate: daysFromNow(30),
    totalCards: 203,
    learnedCards: 203,
    dailyNewLimit: 20,
  })
  assert.equal(plan.status, 'done')
  assert.equal(plan.perDayNeeded, 0)
  assert.equal(plan.remainingNew, 0)
})

test('时间充裕时状态为 comfortable，并按天数摊平取整', () => {
  const plan = computePlan({
    examDate: daysFromNow(100),
    totalCards: 203,
    learnedCards: 3,
    dailyNewLimit: 20,
  })
  assert.equal(plan.status, 'comfortable')
  assert.equal(plan.daysLeft, 100)
  assert.equal(plan.perDayNeeded, 2) // ceil(200 / 100)
  assert.match(plan.message, /每天 2 张/)
})

test('刚好卡在每日上限附近（含 20% 余量）仍算 comfortable', () => {
  const plan = computePlan({
    examDate: daysFromNow(10),
    totalCards: 203,
    learnedCards: 3,
    dailyNewLimit: 20,
  })
  assert.equal(plan.perDayNeeded, 20) // ceil(200 / 10)
  // 20 <= floor(20 * 1.2) = 24，有缓冲，不告警
  assert.equal(plan.status, 'comfortable')
})

test('明显跟不上的场景应判为 tight', () => {
  const plan = computePlan({
    examDate: daysFromNow(5),
    totalCards: 203,
    learnedCards: 3,
    dailyNewLimit: 10,
  })
  assert.equal(plan.status, 'tight')
  assert.equal(plan.perDayNeeded, 40)
  assert.match(plan.message, /每天 40 张/)
})

test('考试日期已过时状态为 overdue', () => {
  const plan = computePlan({
    examDate: daysFromNow(-3),
    totalCards: 203,
    learnedCards: 100,
    dailyNewLimit: 20,
  })
  assert.equal(plan.status, 'overdue')
  assert.equal(plan.perDayNeeded, null)
  assert.match(plan.message, /考试日期已过/)
})

test('已学数超过总数时剩余按 0 处理，不出现负数', () => {
  const plan = computePlan({
    examDate: daysFromNow(30),
    totalCards: 100,
    learnedCards: 120,
    dailyNewLimit: 20,
  })
  assert.equal(plan.remainingNew, 0)
  assert.equal(plan.status, 'done')
})

test('每日目标 = 到期复习 + 计划新卡', () => {
  assert.equal(todayTarget(12, 8), 20)
  assert.equal(todayTarget(0, 0), 0)
  assert.equal(todayTarget(-1, 5), 5)
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
