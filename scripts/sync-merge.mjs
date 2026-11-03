// 双设备合并的纯逻辑验证。不需要浏览器，也不需要后端。
//
//   node scripts/sync-merge.mjs
//
// 用 Node 22 的类型擦除直接 import src/sync/merge.ts，所以这里测的就是
// 生产代码里那个文件，而不是它的副本。

import assert from 'node:assert/strict'
import {
  localDateKey,
  pickSettings,
  recomputeDaily,
  reviewKey,
  shouldTakeRemoteState,
  unionReviews,
} from '../src/sync/merge.ts'

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error.message })
  }
}

const T0 = new Date(2026, 9, 29, 9, 0, 0).getTime()

// ---------------- 1. 复习日志取并集 ----------------
test('两个设备各背一半，日志取并集后一条不丢', () => {
  const deviceA = [
    { cardId: 'p1-1', at: T0, rating: 3, prevState: 0 },
    { cardId: 'p1-2', at: T0 + 1000, rating: 2, prevState: 0 },
  ]
  const deviceB = [
    { cardId: 'p1-3', at: T0 + 2000, rating: 4, prevState: 0 },
    { cardId: 'p1-4', at: T0 + 3000, rating: 1, prevState: 0 },
  ]
  const merged = unionReviews(deviceA, deviceB)
  assert.equal(merged.length, 4)
  assert.deepEqual(
    merged.map((r) => r.cardId),
    ['p1-1', 'p1-2', 'p1-3', 'p1-4'],
  )
})

test('同一条日志被重复推送（重试 / 双端并发）不会重复计入', () => {
  const local = [{ cardId: 'p1-1', at: T0, rating: 3, prevState: 0 }]
  const duplicated = [
    { cardId: 'p1-1', at: T0, rating: 3, prevState: 0 },
    { cardId: 'p1-1', at: T0, rating: 3, prevState: 0 },
  ]
  const merged = unionReviews(local, duplicated)
  assert.equal(merged.length, 1)
})

test('同一毫秒同一张卡但评分不同，视为两条独立记录', () => {
  const a = { cardId: 'p1-1', at: T0, rating: 3, prevState: 0 }
  const b = { cardId: 'p1-1', at: T0, rating: 4, prevState: 0 }
  assert.notEqual(reviewKey(a), reviewKey(b))
  assert.equal(unionReviews([a], [b]).length, 2)
})

test('两端交替合并多次仍然收敛（幂等）', () => {
  const a = [{ cardId: 'x', at: T0, rating: 1, prevState: 0 }]
  const b = [{ cardId: 'y', at: T0 + 1, rating: 2, prevState: 0 }]
  let left = a
  let right = b
  for (let i = 0; i < 3; i += 1) {
    left = unionReviews(left, right)
    right = unionReviews(right, left)
  }
  assert.equal(left.length, 2)
  assert.equal(right.length, 2)
})

// ---------------- 2. 状态 last-write-wins ----------------
test('本地更新，远端更旧的 state 不覆盖', () => {
  const local = { last_review: T0 + 5000 }
  assert.equal(shouldTakeRemoteState(local, T0 + 1000), false)
})

test('远端更新，本地更旧的 state 被覆盖', () => {
  const local = { last_review: T0 + 1000 }
  assert.equal(shouldTakeRemoteState(local, T0 + 5000), true)
})

test('本地从未复习过（last_review 为空），远端状态直接采纳', () => {
  assert.equal(shouldTakeRemoteState({ last_review: undefined }, T0), true)
})

test('时间戳完全相同时不覆盖，避免无意义的写入抖动', () => {
  const local = { last_review: T0 }
  assert.equal(shouldTakeRemoteState(local, T0), false)
})

// ---------------- 3. 当日聚合可由日志重算 ----------------
test('从合并后的日志重算当日聚合', () => {
  const reviews = [
    { cardId: 'a', at: T0, rating: 3, prevState: 0 }, // 新卡
    { cardId: 'b', at: T0 + 1, rating: 1, prevState: 0 }, // 新卡 + 忘记
    { cardId: 'c', at: T0 + 2, rating: 2, prevState: 2 }, // 复习
    { cardId: 'd', at: T0 + 3, rating: 1, prevState: 1 }, // 复习 + 忘记
  ]
  const day = recomputeDaily(reviews, localDateKey(T0), 42)
  assert.deepEqual(day, {
    date: localDateKey(T0),
    newCount: 2,
    reviewCount: 2,
    againCount: 2,
    seconds: 42, // 秒数无法从日志推导，沿用本地
  })
})

test('日期键按本地时区，跨零点不会错位', () => {
  const lateNight = new Date(2026, 9, 29, 23, 59, 0).getTime()
  assert.equal(localDateKey(lateNight), '2026-10-29')
  const nextDay = new Date(2026, 9, 30, 0, 1, 0).getTime()
  assert.equal(localDateKey(nextDay), '2026-10-30')
})

// ---------------- 4. 设置 LWW ----------------
test('设置按 updated 取新，缺一侧时用另一侧', () => {
  const values = { dailyNewLimit: 20, targetRetention: 0.9 }
  assert.equal(pickSettings(null, { values, updated: 1 }), 'remote')
  assert.equal(pickSettings({ values, updated: 1 }, null), 'local')
  assert.equal(
    pickSettings({ values, updated: 9 }, { values, updated: 3 }),
    'local',
  )
  assert.equal(
    pickSettings({ values, updated: 3 }, { values, updated: 9 }),
    'remote',
  )
  assert.equal(
    pickSettings({ values, updated: 5 }, { values, updated: 5 }),
    'tie',
  )
})

// ---------------- 5. 端到端：两台设备各自离线学习后合并 ----------------
test('双设备离线各背 20 张，合并后日志 40 条、无重复、顺序稳定', () => {
  const make = (offset, count) =>
    Array.from({ length: count }, (_, i) => ({
      cardId: `card-${offset + i}`,
      at: T0 + (offset + i) * 1000,
      rating: ((i % 4) + 1),
      prevState: 0,
    }))
  const deviceA = make(0, 20)
  const deviceB = make(20, 20)

  // 第一次同步：A 推 20，B 拉 A 的 20
  let server = unionReviews([], deviceA)
  let serverForB = unionReviews(server, deviceB)
  assert.equal(serverForB.length, 40)

  // B 把自己的 20 推上去，A 再拉
  server = unionReviews(server, deviceB)
  const mergedForA = unionReviews(deviceA, server)
  assert.equal(server.length, 40)
  assert.equal(mergedForA.length, 40)
  assert.deepEqual(
    [...mergedForA].map((r) => r.at).sort((x, y) => x - y),
    [...mergedForA].map((r) => r.at),
  )
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
