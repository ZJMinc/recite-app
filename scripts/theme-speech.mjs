// 主题解析与朗读文本清理的纯函数测试。
//
//   node scripts/theme-speech.mjs

import assert from 'node:assert/strict'
import { resolveTheme } from '../src/lib/theme.ts'
import { stripForSpeech } from '../src/lib/speech.ts'

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error.message })
  }
}

// ---------------- 主题解析 ----------------
test('强制深色不受系统影响', () => {
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('dark', true), 'dark')
})

test('强制浅色不受系统影响', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('light', false), 'light')
})

test('auto 跟随系统', () => {
  assert.equal(resolveTheme('auto', true), 'dark')
  assert.equal(resolveTheme('auto', false), 'light')
})

test('老数据没有 theme 字段时按 auto 处理', () => {
  assert.equal(resolveTheme(undefined, true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
})

// ---------------- 朗读文本清理 ----------------
test('挖空标记读出来是答案本身，不会被念成「大括号」', () => {
  assert.equal(stripForSpeech('启发性原则要求调动学生的{{主动性}}。'), '启发性原则要求调动学生的主动性。')
})

test('去掉 markdown 符号', () => {
  assert.equal(stripForSpeech('## 标题\n**重点** `代码`'), '标题\n重点 代码')
})

test('压缩多余空白但不吞掉换行', () => {
  assert.equal(stripForSpeech('第一行   有点空\n第二行'), '第一行 有点空\n第二行')
})

test('连续空行折叠成一个', () => {
  assert.equal(stripForSpeech('甲\n\n\n乙'), '甲\n乙')
})

test('首尾空白被清掉', () => {
  assert.equal(stripForSpeech('  教育目的  '), '教育目的')
})

test('空字符串安全返回空串', () => {
  assert.equal(stripForSpeech(''), '')
  assert.equal(stripForSpeech('   \n  '), '')
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
